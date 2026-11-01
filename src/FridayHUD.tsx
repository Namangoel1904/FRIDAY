import { useEffect, useRef, useState } from 'react';
import './FridayHUD.css';

interface FridayHUDProps {
    status: 'initializing' | 'idle' | 'listening' | 'speaking' | 'processing';
}

export function FridayHUD({ status }: FridayHUDProps) {
    const [audioData, setAudioData] = useState<number[]>(Array(20).fill(0));
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        // Initialize audio visualization when listening
        if (status === 'listening' && !audioContextRef.current) {
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    const audioContext = new AudioContext();
                    const analyser = audioContext.createAnalyser();
                    const source = audioContext.createMediaStreamSource(stream);

                    analyser.fftSize = 64;
                    source.connect(analyser);

                    audioContextRef.current = audioContext;
                    analyserRef.current = analyser;

                    const updateAudioData = () => {
                        if (analyserRef.current) {
                            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                            analyserRef.current.getByteFrequencyData(dataArray);
                            setAudioData(Array.from(dataArray).slice(0, 20));
                        }
                        animationFrameRef.current = requestAnimationFrame(updateAudioData);
                    };
                    updateAudioData();
                })
                .catch(err => console.error('Audio access denied:', err));
        }

        // Cleanup when not listening
        if (status !== 'listening' && audioContextRef.current) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            audioContextRef.current.close();
            audioContextRef.current = null;
            analyserRef.current = null;
            setAudioData(Array(20).fill(0));
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [status]);

    const getStatusText = () => {
        switch (status) {
            case 'initializing': return 'Initializing';
            case 'idle': return 'Sleeping';
            case 'listening': return 'Listening';
            case 'speaking': return 'Speaking';
            case 'processing': return 'Working';
            default: return 'Offline';
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case 'initializing': return '#888';
            case 'idle': return '#4a9eff';
            case 'listening': return '#00d9ff';
            case 'speaking': return '#ff9500';
            case 'processing': return '#a78bfa';
            default: return '#666';
        }
    };

    return (
        <div className="friday-hud">
            <div className="hud-panel">
                {/* Header */}
                <div className="hud-header">
                    <span className="assistant-name">F.R.I.D.A.Y.</span>
                    <div className={`mic-indicator ${status === 'listening' || status === 'speaking' ? 'active' : ''}`}>
                        🎤
                    </div>
                </div>

                {/* Status */}
                <div className="status-section">
                    <div
                        className="status-dot"
                        style={{ backgroundColor: getStatusColor() }}
                    />
                    <span className="status-text">{getStatusText()}</span>
                </div>

                {/* Waveform */}
                {status === 'listening' && (
                    <div className="waveform">
                        {audioData.map((value, i) => {
                            const height = Math.max(2, (value / 255) * 40);
                            return (
                                <div
                                    key={i}
                                    className="wave-bar"
                                    style={{
                                        height: `${height}px`,
                                        backgroundColor: '#00d9ff',
                                        opacity: 0.6 + (value / 255) * 0.4
                                    }}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Optional: Minimal indicator when not listening */}
                {status === 'speaking' && (
                    <div className="speaking-indicator">
                        <div className="pulse-ring"></div>
                        <div className="pulse-ring delay"></div>
                    </div>
                )}
            </div>
        </div>
    );
}
