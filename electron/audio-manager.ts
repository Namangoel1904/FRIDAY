import { spawn, ChildProcess } from 'child_process';
import { Writable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger, LogDomain } from './logger.js';

export class AudioManager {
    private recordingProcess: ChildProcess | null = null;
    private playbackProcess: ChildProcess | null = null;
    private playbackStream: Writable | null = null;
    private playChunkCount = 0;
    private recordChunkCount = 0;
    private ffmpegPath = this.resolveExecutable('ffmpeg', process.env.FFMPEG_PATH);
    private ffplayPath = this.resolveExecutable('ffplay', process.env.FFPLAY_PATH);

    private resolveExecutable(name: 'ffmpeg' | 'ffplay', envPath?: string): string {
        if (envPath && fs.existsSync(envPath)) {
            return envPath;
        }

        const localToolsPath = path.join(os.homedir(), 'Tools', 'ffmpeg', 'bin', `${name}.exe`);
        if (fs.existsSync(localToolsPath)) {
            return localToolsPath;
        }

        return name;
    }

    // Detect Windows Audio Input Device (Microphone) via FFmpeg
    async detectInputDevice(): Promise<string> {
        return new Promise((resolve) => {
            Logger.info(LogDomain.AUDIO, 'Detecting audio input devices...');
            const ffmpeg = spawn(this.ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
            let output = '';

            ffmpeg.stderr.on('data', (data) => {
                output += data.toString();
            });

            ffmpeg.on('close', () => {
                const regex = /"([^"]+)"\s+\(audio\)/g;
                const matches: string[] = [];
                let match;
                while ((match = regex.exec(output)) !== null) {
                    matches.push(match[1]);
                }

                if (matches.length > 0) {
                    const best = matches.find(m => m.toLowerCase().includes('microphone')) || matches[0];
                    Logger.info(LogDomain.AUDIO, `Selected input device: ${best}`);
                    resolve(`audio=${best}`);
                } else {
                    Logger.warn(LogDomain.AUDIO, 'No named devices found. Trying generic default.');
                    resolve('audio=0');
                }
            });
        });
    }

    startRecording(device: string, onData: (chunk: Buffer) => void) {
        if (this.recordingProcess) return;

        const args = [
            '-f', 'dshow',
            '-i', device,
            '-ac', '1',
            '-ar', '16000',
            '-f', 's16le',
            '-acodec', 'pcm_s16le',
            'pipe:1'
        ];

        Logger.info(LogDomain.AUDIO, `Starting recording: ${this.ffmpegPath} ${args.join(' ')}`);
        this.recordingProcess = spawn(this.ffmpegPath, args);

        this.recordingProcess.stdout?.on('data', (chunk: Buffer) => {
            this.recordChunkCount++;
            if (this.recordChunkCount % 50 === 0) {
                Logger.debug(LogDomain.AUDIO, `Recording active (chunk #${this.recordChunkCount})`);
            }
            onData(chunk);
        });

        this.recordingProcess.stderr?.on('data', (data) => {
            // FFmpeg stderr for recording usually noisy, suppress unless error
            const msg = data.toString();
            if (msg.includes('Error') || msg.includes('fail')) {
                Logger.error(LogDomain.AUDIO, `[FFmpeg Rec Error] ${msg}`);
            }
        });

        this.recordingProcess.on('close', (code) => {
            Logger.info(LogDomain.AUDIO, `Recording process exited with code ${code}`);
            this.recordingProcess = null;
        });
    }

    ensurePlaybackActive() {
        if (this.playbackProcess && !this.playbackProcess.killed) return;

        const args = [
            '-nodisp',
            '-probesize', '32',
            '-analyzeduration', '0',
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',
            '-f', 's16le',
            '-ar', '24000',
            '-i', '-'
        ];

        Logger.info(LogDomain.AUDIO, `Spawning FFplay: ${this.ffplayPath} ${args.join(' ')}`);
        this.playbackProcess = spawn(this.ffplayPath, args);
        this.playbackStream = this.playbackProcess.stdin;

        if (this.playbackStream) {
            this.playbackStream.on('error', (err) => {
                Logger.error(LogDomain.AUDIO, 'FFplay stdin error', err);
            });
        }

        this.playbackProcess.stderr?.on('data', (data) => {
            const msg = data.toString();
            // Filter out M-A status lines
            if (msg.includes('M-A') || msg.includes('aq=') || msg.includes('fd=')) {
                return;
            }
            Logger.debug(LogDomain.AUDIO, `[FFplay] ${msg.trim()}`);
        });

        this.playbackProcess.on('close', (code) => {
            Logger.info(LogDomain.AUDIO, `FFplay exited with code ${code}`);
            this.playbackProcess = null;
            this.playbackStream = null;
        });
    }

    playChunk(chunk: Buffer) {
        this.ensurePlaybackActive();

        this.playChunkCount++;
        const shouldLog = this.playChunkCount % 50 === 0;

        try {
            if (this.playbackStream && !this.playbackStream.destroyed && this.playbackStream.writable) {
                if (shouldLog) {
                    Logger.debug(LogDomain.AUDIO, `Playing chunk #${this.playChunkCount} (${chunk.length} bytes)`);
                }
                this.playbackStream.write(chunk, (err) => {
                    if (err) Logger.error(LogDomain.AUDIO, 'Write error', err);
                });
            } else {
                Logger.warn(LogDomain.AUDIO, 'Cannot write to playback stream - not ready');
            }
        } catch (e) {
            Logger.error(LogDomain.AUDIO, 'playChunk exception', e);
        }
    }

    stopPlayback() {
        Logger.info(LogDomain.AUDIO, 'Stopping playback process');
        if (this.playbackProcess) {
            this.playbackProcess.kill();
            this.playbackProcess = null;
            this.playbackStream = null;
        }
    }

    stopAll() {
        this.recordingProcess?.kill();
        this.stopPlayback();
    }
}
