import * as path from 'path';
import * as fs from 'fs';
import electron from 'electron';
import { Needle, Whistle, getModelPath } from 'cactus-needle';
import { ToolRegistry } from './tools/tool-registry.js';
import { EnvironmentContext } from './tools/environment-context.js';
import { Logger, LogDomain } from './logger.js';

const app = (electron as any)?.app || (electron as any)?.default?.app;

export interface NeedleDispatchResult {
    handled: boolean;
    toolName?: string;
    functionName?: string;
    arguments?: Record<string, unknown>;
    confidence?: number;
    result?: unknown;
    error?: string;
}

// Hard blocklist for execute_command — even if Needle reports 1.0 confidence
const DANGEROUS_CMD = /\b(rm|del|rmdir|format|remove-item|shutdown|taskkill|reg|curl|wget|certutil)\b/i;

export class NeedleRouter {
    private needle: any = null;
    private whistle: any = null;
    private isReady = false;
    private isWhistleReady = false;

    // Thresholds
    private readonly safeToolConfidenceThreshold = 0.50;
    private readonly executeConfidenceThreshold = 0.85;

    // Tools exposed to Needle (safe read, app launching, or gated execution)
    private readonly tools = [
        {
            name: 'file_search',
            description: 'Search for files or folders by name.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'File or folder name text to search for' },
                    directory: { type: 'string', description: 'Optional directory path to search within' }
                },
                required: ['query']
            }
        },
        {
            name: 'list_directory',
            description: 'List files and folders in a directory. Accepts folder names like downloads, desktop, documents, current, or directory paths.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Folder name or directory path to list files for' }
                },
                required: ['path']
            }
        },
        {
            name: 'change_directory',
            description: 'Change the current working directory. Accepts folder names like downloads, desktop, documents, or directory paths.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Target folder name or directory path' }
                },
                required: ['path']
            }
        },
        {
            name: 'open_path',
            description: 'Open a local folder or file with the default system application. Accepts folder names like downloads, desktop, documents, or file paths.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Folder name (e.g. downloads, desktop) or file path to open' }
                },
                required: ['path']
            }
        },
        {
            name: 'open_browser',
            description: 'Open a website URL or search the web in the default internet browser.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'Full website URL starting with http or https' },
                    query: { type: 'string', description: 'Search term for web search' }
                }
            }
        },
        {
            name: 'open_gui_app',
            description: 'Launch an installed desktop application by name (e.g. Notepad, Calculator, VS Code, PDFCraft).',
            parameters: {
                type: 'object',
                properties: {
                    appName: { type: 'string', description: 'Name of the desktop application' },
                    route: { type: 'string', description: 'Optional deep-link route' }
                },
                required: ['appName']
            }
        },
        {
            name: 'execute_command',
            description: 'Run a shell command in the terminal.',
            parameters: {
                type: 'object',
                properties: {
                    command: { type: 'string', description: 'The terminal command to execute' }
                },
                required: ['command']
            }
        }
    ];

    private isInitializing = false;

    async initialize(): Promise<boolean> {
        if (this.isReady && this.isWhistleReady) return true;
        if (this.isInitializing) return false;
        this.isInitializing = true;

        try {
            Logger.info(LogDomain.SYSTEM, '[NeedleRouter] Initializing Needle 3 on-device engine...');

            const basePath = app && typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd();
            const modelsDir = path.join(basePath, 'electron', 'models');
            if (!fs.existsSync(modelsDir)) {
                try { fs.mkdirSync(modelsDir, { recursive: true }); } catch {}
            }

            const bundledNeedle = path.join(modelsDir, 'needle3.cact');
            let needleWeights: string | undefined;

            if (fs.existsSync(bundledNeedle)) {
                needleWeights = bundledNeedle;
                Logger.info(LogDomain.SYSTEM, `[NeedleRouter] Using bundled weights: ${needleWeights}`);
            } else {
                try {
                    const cachedNeedle = getModelPath(undefined, 'needle3');
                    if (fs.existsSync(cachedNeedle)) {
                        needleWeights = cachedNeedle;
                        Logger.info(LogDomain.SYSTEM, `[NeedleRouter] Using cached weights: ${needleWeights}`);
                        try {
                            fs.copyFileSync(cachedNeedle, bundledNeedle);
                            needleWeights = bundledNeedle;
                            Logger.info(LogDomain.SYSTEM, `[NeedleRouter] Mirrored Needle 3 weights to ${bundledNeedle}`);
                        } catch {}
                    }
                } catch {
                    // Ignore cache lookup error
                }
            }

            this.needle = needleWeights
                ? new Needle({ weights: needleWeights, download: false })
                : new Needle({ download: true });

            try {
                await this.needle.ready();
                this.isReady = true;
                Logger.info(LogDomain.SYSTEM, '[NeedleRouter] Needle 3 engine ready for fast-path routing.');
            } catch (nErr) {
                Logger.warn(LogDomain.SYSTEM, '[NeedleRouter] Needle 3 ready check failed:', nErr);
                this.isReady = false;
            }

            // Initialize Whistle for native offline Speech-to-Text
            try {
                const bundledWhistle = path.join(modelsDir, 'whistle.cact');
                let whistleWeights: string | undefined;

                if (fs.existsSync(bundledWhistle)) {
                    whistleWeights = bundledWhistle;
                    Logger.info(LogDomain.SYSTEM, `[NeedleRouter] Using bundled Whistle weights: ${whistleWeights}`);
                } else {
                    try {
                        const cachedWhistle = getModelPath(undefined, 'whistle');
                        if (fs.existsSync(cachedWhistle)) {
                            whistleWeights = cachedWhistle;
                            Logger.info(LogDomain.SYSTEM, `[NeedleRouter] Using cached Whistle weights: ${whistleWeights}`);
                            try {
                                fs.copyFileSync(cachedWhistle, bundledWhistle);
                                whistleWeights = bundledWhistle;
                                Logger.info(LogDomain.SYSTEM, `[NeedleRouter] Mirrored Whistle weights to ${bundledWhistle}`);
                            } catch {}
                        }
                    } catch {
                        // Ignore cache lookup error
                    }
                }

                this.whistle = whistleWeights
                    ? new Whistle({ weights: whistleWeights, download: false })
                    : new Whistle({ download: true });

                await this.whistle.ready();
                this.isWhistleReady = true;
                Logger.info(LogDomain.SYSTEM, '[NeedleRouter] Whistle on-device STT engine ready for offline fallback.');
            } catch (wErr) {
                Logger.warn(LogDomain.SYSTEM, '[NeedleRouter] Whistle STT failed to load (offline voice disabled).', wErr);
                this.isWhistleReady = false;
            }

            this.isInitializing = false;
            return this.isReady;
        } catch (error) {
            Logger.warn(LogDomain.SYSTEM, '[NeedleRouter] Failed to initialize Needle 3. Operating in Gemini-only mode.', error);
            this.isReady = false;
            this.isInitializing = false;
            return false;
        }
    }

    get ready(): boolean {
        return this.isReady;
    }

    get hasOfflineStt(): boolean {
        return this.isWhistleReady && this.whistle !== null;
    }

    async transcribe(samples: Float32Array, sampleRate = 16000): Promise<string> {
        if (!this.isWhistleReady || !this.whistle) return '';
        try {
            const res = await this.whistle.transcribe({ samples, sampleRate });
            return res && typeof res.text === 'string' ? res.text.trim() : '';
        } catch (err) {
            Logger.warn(LogDomain.AUDIO, '[NeedleRouter] Whistle STT error during offline transcription', err);
            return '';
        }
    }

    async transcribeAndDispatch(
        samples: Float32Array,
        sampleRate: number,
        toolRegistry: ToolRegistry,
        envContext: EnvironmentContext
    ): Promise<NeedleDispatchResult> {
        const text = await this.transcribe(samples, sampleRate);
        if (!text) {
            return { handled: false };
        }
        Logger.info(LogDomain.AUDIO, `[Offline/Whistle] Local voice transcript: "${text}"`);
        return this.tryDispatch(text, toolRegistry, envContext);
    }

    async tryDispatch(
        transcript: string,
        toolRegistry: ToolRegistry,
        _envContext: EnvironmentContext
    ): Promise<NeedleDispatchResult> {
        if (!this.isReady || !this.needle) {
            return { handled: false };
        }

        const trimmed = transcript.trim();
        if (!trimmed) {
            return { handled: false };
        }

        // Filter bare wake words so we don't trigger tools on just "Friday"
        if (/^(friday|hey\s+friday|fryday)$/i.test(trimmed)) {
            return { handled: false };
        }

        // Clean leading wake words (e.g. "Friday, open downloads" -> "open downloads")
        const cleanedTranscript = trimmed.replace(/^(hey\s+friday|ok\s+friday|okay\s+friday|friday|fryday)[,\s:]*(please\s+)?/i, '').trim();
        const query = cleanedTranscript || trimmed;

        try {
            const completion = await this.needle.complete(query, { tools: this.tools });
            if (!completion || !completion.success || !completion.function_calls || completion.function_calls.length === 0) {
                return { handled: false };
            }

            const call = completion.function_calls[0];
            const confidence = typeof completion.confidence === 'number' ? completion.confidence : 0;
            const functionName = call.name;
            const args = (call.arguments || {}) as Record<string, unknown>;

            // Normalize path arguments for Windows system context early
            if (typeof args.path === 'string') {
                args.path = this.normalizePath(args.path, _envContext);
            }

            // Hard Safety Guard: Blocklist check for execute_command
            if (functionName === 'execute_command') {
                const cmd = String(args.command || '');
                if (DANGEROUS_CMD.test(cmd)) {
                    Logger.warn(LogDomain.TOOLS, `[NeedleRouter] Blocked dangerous command pattern in: "${cmd}". Delegating to Gemini.`);
                    return { handled: false };
                }

                if (confidence < this.executeConfidenceThreshold) {
                    Logger.debug(LogDomain.TOOLS, `[NeedleRouter] execute_command confidence (${confidence.toFixed(2)}) below threshold (${this.executeConfidenceThreshold}). Delegating to Gemini.`);
                    return { handled: false };
                }
            } else if (['open_path', 'list_directory', 'change_directory'].includes(functionName)) {
                // If the path physically exists on the user's filesystem, we have high empirical certainty
                const pathExists = typeof args.path === 'string' && fs.existsSync(args.path);
                const requiredMinConfidence = pathExists ? 0.20 : this.safeToolConfidenceThreshold;

                if (confidence < requiredMinConfidence) {
                    Logger.debug(LogDomain.TOOLS, `[NeedleRouter] ${functionName} confidence (${confidence.toFixed(2)}) below threshold (${requiredMinConfidence}). Delegating to Gemini.`);
                    return { handled: false };
                }
            } else {
                if (confidence < this.safeToolConfidenceThreshold) {
                    Logger.debug(LogDomain.TOOLS, `[NeedleRouter] ${functionName} confidence (${confidence.toFixed(2)}) below threshold (${this.safeToolConfidenceThreshold}). Delegating to Gemini.`);
                    return { handled: false };
                }
            }

            // Guard: ensure open_gui_app does not mistake a web URL for a desktop app name
            if (functionName === 'open_gui_app') {
                const appName = String(args.appName || '').toLowerCase();
                if (appName.startsWith('http://') || appName.startsWith('https://') || appName.includes('www.') || appName.endsWith('.com')) {
                    Logger.debug(LogDomain.TOOLS, `[NeedleRouter] open_gui_app received a URL (${appName}), delegating to browser/Gemini.`);
                    return { handled: false };
                }
            }

            // Map function name to ToolRegistry name
            const toolName = this.mapFunctionToTool(functionName);
            if (!toolName) {
                return { handled: false };
            }

            // Validate that all required parameters are non-empty
            const toolDef = this.tools.find(t => t.name === functionName);
            if (toolDef && toolDef.parameters && Array.isArray((toolDef.parameters as any).required)) {
                for (const reqKey of (toolDef.parameters as any).required) {
                    const val = args[reqKey];
                    if (val === undefined || val === null || val === '') {
                        Logger.debug(LogDomain.TOOLS, `[NeedleRouter] Missing required argument '${reqKey}' for ${functionName}. Delegating to Gemini.`);
                        return { handled: false };
                    }
                }
            }

            Logger.info(LogDomain.TOOLS, `[NeedleRouter] Fast-path routing '${functionName}' -> '${toolName}' (confidence: ${confidence.toFixed(2)})`);

            // Execute via FRIDAY's ToolRegistry
            const executionResult = await toolRegistry.execute(toolName, args);

            return {
                handled: true,
                toolName,
                functionName,
                arguments: args,
                confidence,
                result: executionResult.success ? executionResult.data : executionResult.error
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.warn(LogDomain.TOOLS, `[NeedleRouter] Error during fast-path routing, falling back to Gemini: ${msg}`);
            return { handled: false, error: msg };
        }
    }

    private mapFunctionToTool(functionName: string): string | null {
        switch (functionName) {
            case 'file_search': return 'FILE_SEARCH';
            case 'list_directory': return 'LIST_DIRECTORY';
            case 'change_directory': return 'CHANGE_DIRECTORY';
            case 'open_path': return 'OPEN_PATH';
            case 'open_browser': return 'OPEN_BROWSER';
            case 'open_gui_app': return 'OPEN_GUI_APP';
            case 'execute_command': return 'EXECUTE_COMMAND';
            default: return null;
        }
    }

    private normalizePath(inputPath: string, envContext: EnvironmentContext): string {
        const raw = inputPath.trim();
        const lower = raw.toLowerCase().replace(/['"]/g, '');

        // If it's already an existing file or absolute path like C:\... or \\..., return as is
        if (path.isAbsolute(raw) || fs.existsSync(raw)) {
            return raw;
        }

        const home = envContext.homeDir || process.env.USERPROFILE || process.env.HOME || '';

        // Match common Windows user folder aliases
        if (lower === 'downloads' || lower === 'downloads folder' || lower === 'download') {
            return path.join(home, 'Downloads');
        }
        if (lower === 'desktop' || lower === 'desktop folder') {
            return path.join(home, 'Desktop');
        }
        if (lower === 'documents' || lower === 'documents folder' || lower === 'my documents') {
            return path.join(home, 'Documents');
        }
        if (lower === 'pictures' || lower === 'pictures folder') {
            return path.join(home, 'Pictures');
        }
        if (lower === 'videos' || lower === 'videos folder') {
            return path.join(home, 'Videos');
        }
        if (lower === 'music' || lower === 'music folder') {
            return path.join(home, 'Music');
        }
        if (lower === 'home' || lower === 'home folder' || lower === 'user profile') {
            return home;
        }
        if (lower === 'current' || lower === 'current directory' || lower === 'here' || lower === '.') {
            return envContext.cwd;
        }

        // Relative path from CWD
        return path.resolve(envContext.cwd, raw);
    }

    async close(): Promise<void> {
        if (this.needle && typeof this.needle.close === 'function') {
            try {
                await this.needle.close();
            } catch {
                // Ignore close errors
            }
            this.needle = null;
            this.isReady = false;
        }

        if (this.whistle && typeof this.whistle.close === 'function') {
            try {
                await this.whistle.close();
            } catch {
                // Ignore close errors
            }
            this.whistle = null;
            this.isWhistleReady = false;
        }
    }
}
