import WebSocket from 'ws';
import { GoogleAuth } from 'google-auth-library';
import { AudioManager } from './audio-manager.js';
import { Store } from './store.js';
import { ToolRegistry, ToolResult } from './tools/tool-registry.js';
import { PermissionManager } from './tools/permission-manager.js';
import { EnvironmentContext } from './tools/environment-context.js';
import { ScreenManager } from './screen-manager.js';
import { MemoryManager } from './memory-manager.js';
import { createFileSearchTool } from './tools/implementations/file-search.js';
import { createListDirectoryTool } from './tools/implementations/list-directory.js';
import { createCreateFolderTool } from './tools/implementations/create-folder.js';
import { createCreateFileTool } from './tools/implementations/create-file.js';
import { createOpenFileTool } from './tools/implementations/open-file.js';
import { createChangeDirectoryTool } from './tools/implementations/change-directory.js';
import { createBrowserTool } from './tools/implementations/browser.js';
import { createScreenAnalysisTool } from './tools/implementations/screen-analysis.js';
import { createAnalyzeProjectTool } from './tools/implementations/analyze-project.js';
import { createExecuteCommandTool } from './tools/implementations/execute-command.js';
import { createControlBrowserTool } from './tools/implementations/control-browser.js';
import { createOpenGuiAppTool } from './tools/implementations/open-gui-app.js';
import { Logger, LogDomain } from './logger.js';
import { NeedleRouter } from './needle-router.js';

interface GeminiFunctionCall {
    id?: string;
    name: string;
    args?: Record<string, unknown>;
}

// ─── Vertex AI Configuration ──────────────────────────────────────────────────
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const MODEL_ID = 'gemini-live-2.5-flash-native-audio';

export class GeminiClient {
    private ws: WebSocket | null = null;
    private audioManager: AudioManager;
    private store: Store;
    private isConnected = false;
    private rendererSender: Electron.WebContents | null = null;
    private isAwake = true;
    private toolRegistry: ToolRegistry;
    private permissionManager: PermissionManager;
    private envContext: EnvironmentContext;
    private screenManager: ScreenManager;
    private memoryManager: MemoryManager;
    private needleRouter: NeedleRouter;
    private ignoreNextModelTurn = false;
    private transcriptDebounceTimer: NodeJS.Timeout | null = null;
    private pendingUserTranscript = '';
    private reconnectTimer: NodeJS.Timeout | null = null;

    // Offline speech-to-intent pipeline (Whistle + Needle 3)
    private offlineAudioChunks: Buffer[] = [];
    private offlineSilenceTimer: NodeJS.Timeout | null = null;
    private isUserSpeakingOffline = false;

    // Google Auth client – scoped to Vertex AI
    private auth: GoogleAuth;

    constructor(audioManager: AudioManager, store: Store) {
        this.audioManager = audioManager;
        this.store = store;
        this.toolRegistry = new ToolRegistry();
        this.permissionManager = new PermissionManager();
        this.envContext = new EnvironmentContext();
        this.screenManager = new ScreenManager();
        this.memoryManager = new MemoryManager();
        this.needleRouter = new NeedleRouter();
        this.initializeTools();

        // Initialize Google Auth using Application Default Credentials (ADC).
        // ADC picks up credentials from: gcloud auth application-default login
        this.auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
    }

    private initializeTools() {
        this.toolRegistry.register(createFileSearchTool(this.envContext));
        this.toolRegistry.register(createListDirectoryTool(this.envContext));
        this.toolRegistry.register(createChangeDirectoryTool(this.envContext));
        this.toolRegistry.register(createCreateFolderTool(this.envContext));
        this.toolRegistry.register(createCreateFileTool(this.envContext));
        this.toolRegistry.register(createOpenFileTool(this.envContext));
        this.toolRegistry.register(createBrowserTool());
        this.toolRegistry.register(createScreenAnalysisTool(this.screenManager, (buf) => this.sendImage(buf)));
        this.toolRegistry.register(createAnalyzeProjectTool(this.envContext));
        this.toolRegistry.register(createExecuteCommandTool(this.envContext));
        this.toolRegistry.register(createControlBrowserTool());
        this.toolRegistry.register(createOpenGuiAppTool());

        Logger.info(LogDomain.SYSTEM, 'Initialized tools');
    }

    setRendererSender(sender: Electron.WebContents) {
        this.rendererSender = sender;
    }

    // ─── Connection (async for OAuth token fetch) ─────────────────────────────
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        // Validate required env vars
        if (!PROJECT_ID) {
            Logger.error(LogDomain.GEMINI, 'CRITICAL: GOOGLE_CLOUD_PROJECT_ID is missing from .env');
            return;
        }

        // Fetch an OAuth2 access token via ADC
        let accessToken: string;
        try {
            const client = await this.auth.getClient();
            const tokenResponse = await client.getAccessToken();
            accessToken = tokenResponse.token || '';
            if (!accessToken) throw new Error('Token was empty');
            Logger.info(LogDomain.GEMINI, `OAuth token acquired (${accessToken.substring(0, 12)}...)`);
        } catch (err) {
            Logger.error(LogDomain.GEMINI, 'Failed to acquire OAuth token. Run: gcloud auth application-default login', err);
            this.reconnectTimer = setTimeout(() => void this.connect(), 10000);
            return;
        }

        // Build Vertex AI WebSocket URL
        const url = `wss://${LOCATION}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

        Logger.info(LogDomain.GEMINI, `Connecting to Vertex AI (${LOCATION}, project=${PROJECT_ID})...`);

        this.ws = new WebSocket(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        this.ws.on('open', () => {
            Logger.info(LogDomain.GEMINI, 'Connected to Vertex AI.');
            this.isConnected = true;
            this.isAwake = true;
            this.notifyRenderer({ state: 'idle', cwd: this.envContext.cwd });
            this.sendSetup();
            this.handleFirstBoot();

            // Initialize Needle 3 in background (non-blocking)
            if (!this.needleRouter.ready) {
                void this.needleRouter.initialize();
            }
        });

        this.ws.on('message', (data: Buffer) => {
            void this.handleMessage(data);
        });

        this.ws.on('close', (code, reason) => {
            Logger.warn(LogDomain.GEMINI, `Disconnected. Code: ${code}, Reason: ${reason ? reason.toString() : 'None'}. Reconnecting in 3s...`);
            this.isConnected = false;
            this.notifyRenderer({ state: 'idle' });
            this.ws = null;
            // Re-fetch token on every reconnect (tokens expire after ~60 min)
            this.reconnectTimer = setTimeout(() => void this.connect(), 3000);
        });

        this.ws.on('error', (err) => {
            Logger.error(LogDomain.GEMINI, 'WebSocket Error', err);
        });
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.transcriptDebounceTimer) {
            clearTimeout(this.transcriptDebounceTimer);
            this.transcriptDebounceTimer = null;
        }
        if (this.offlineSilenceTimer) {
            clearTimeout(this.offlineSilenceTimer);
            this.offlineSilenceTimer = null;
        }
        this.offlineAudioChunks = [];
        this.isUserSpeakingOffline = false;
        this.ignoreNextModelTurn = false;
        this.pendingUserTranscript = '';
        void this.needleRouter.close();
        this.ws?.close();
        this.ws = null;
        this.isConnected = false;
    }

    // ─── Setup (Vertex AI model path) ─────────────────────────────────────────
    private sendSetup() {
        if (!this.ws) return;

        const modelPath = `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}`;

        const setupMessage = {
            setup: {
                model: modelPath,
                generation_config: {
                    response_modalities: ['AUDIO'],
                    speech_config: {
                        voice_config: {
                            prebuilt_voice_config: {
                                voice_name: 'Aoede'
                            }
                        }
                    }
                },
                system_instruction: {
                    parts: [
                        {
                            text: this.getSystemInstruction()
                        }
                    ]
                },
                input_audio_transcription: {},
                output_audio_transcription: {},
                tools: [
                    { google_search: {} },
                    {
                        function_declarations: this.getFunctionDeclarations()
                    }
                ],
                tool_config: {
                    function_calling_config: {
                        mode: 'AUTO'
                    }
                }
            }
        };

        Logger.debug(LogDomain.GEMINI, `Sending setup with model: ${modelPath}`);
        this.ws.send(JSON.stringify(setupMessage));
    }

    // ─── System Instruction (with memory injection) ───────────────────────────
    private getSystemInstruction(): string {
        const memoryBlock = this.memoryManager.toPromptString();

        return `VOICE AND ACTION PROTOCOL: You are a Voice-First AI. You MUST respond with AUDIO and TOOL CALLS only. NEVER output internal thoughts, plans, or reasoning in text format. When completing a task, give a short, punchy audio confirmation (e.g., "Done, Boss." or "On it, Boss."). Do not narrate what you are about to do — just do it.

You are FRIDAY, a persistent autonomous OS agent and personal assistant.
You must ALWAYS address the user as "Boss". Never use their real name unless specifically asked.

ENVIRONMENT
  HOME: "${this.envContext.homeDir}"
  CWD:  "${this.envContext.cwd}"

[LONG TERM MEMORY]
${memoryBlock}

CORE RULES
- Be concise, decisive, and useful.
- Use tools directly when they are needed.
- Use absolute paths for file operations whenever possible.
- The current working directory is part of your operating context. If it changes, adapt future relative file requests to the new directory.
- When the user asks what is on screen or what you see, call capture_screen.
- You can create files and folders using create_file and create_folder.
- You can remember things for the user using add_to_memory, remove_from_memory, and get_memory.
- You can run terminal commands using execute_command. Use this for git, npm, python, or any CLI task.

VISION PROTOCOL
- You have native multimodal vision. When capture_screen is called, the image is fed directly into your neural network.
- You MUST rely on your native vision to see and describe what is on screen.
- CRITICAL SCREEN CAPTURE RULE: Call capture_screen EXACTLY ONCE per visual request. Once capture_screen returns, you are STRICTLY FORBIDDEN from calling capture_screen again. You MUST immediately speak to Boss via audio and describe what is visible on screen. Do NOT chain multiple capture_screen calls.
- ABSOLUTELY NEVER use execute_command to run Python, Tesseract, or any external OCR tools to read images. Just look at the frame in your visual buffer.

TERMINAL PROTOCOL
- You have a secure terminal via execute_command. Use it for git operations, running scripts, installing packages, etc.
- Python commands automatically use a virtual environment (.venv in the CWD). You do not need to manage venvs manually.
- Some dangerous commands (rm -rf, taskkill, global npm installs, etc.) are blocked by a security layer. If blocked, find a safer alternative.
- Always check command output. If it fails, analyze stderr and retry with corrections.

BROWSER PROTOCOL
- You have full access to a headful Chromium browser via the control_browser tool.
- To visit a website: control_browser(action='navigate', target='https://...')
- To read page content: control_browser(action='read')
- To click an element: control_browser(action='click', target='CSS selector')
- To scroll down: control_browser(action='scroll')
- Workflow for complex tasks: navigate → read (to find selectors) → click/scroll as needed.
- The browser is visible to the user so they can watch what you do.

BROWSER ERROR PROTOCOL
- Modern websites use complex Shadow DOMs and dynamic loading.
- If a click action fails due to a missing selector, DO NOT immediately retry the exact same selector.
- Instead: use the read action to understand the current page structure, then try a completely different semantic selector.
- If 2 different selectors fail in a row, tell Boss what happened and ask for guidance.

GUI DEEP LINKING & APP MANIFEST PROTOCOL
For complex visual tasks (like splitting/merging PDFs), DO NOT use terminal scripts. You must use the open_gui_app tool. Use the route parameter to deep-link to the required tool.
APP MANIFEST: PDFCraft
- Use appName: 'PDFCraft'
- Routes: Merge (/merge-pdf), Split (/split-pdf), Compress (/compress-pdf), Extract (/extract-pages), Organize (/organize-pdf), Images to PDF (/image-to-pdf), Word to PDF (/word-to-pdf), Protect (/protect-pdf), Unlock (/unlock-pdf), Add Watermark (/add-watermark), Sign (/sign-pdf).
VOICE REQUIREMENT: Audibly tell the user exactly which tool you are opening.

PROJECT MODE
- When asked to enter Project Mode or analyze a codebase, invoke analyze_project with the project directory.
- Once you receive the project data, analyze the architecture, summarize its current state to the user, and switch your persona to an Expert Software Architect ready to write or debug code.

SECURITY RULES
- You cannot create files or folders directly in C:\\ or the user home directory. Always use a subfolder.
- Destructive terminal commands are blocked. Do not attempt workarounds.

TOOL EXECUTION PROTOCOL
For safe, non-destructive tools like open_path, open_browser, open_gui_app, file_search, list_directory, change_directory, capture_screen, get_memory, analyze_project, and control_browser:
  - You MUST NOT ask the user for permission.
  - DO NOT say "Shall I open this for you?" or narrate that you are about to do it.
  - Simply output the function call immediately and stay silent until the tool returns a result.
  - Act decisively.
For destructive tools (create_file, create_folder, execute_command), proceed if the user has clearly requested it. Only ask for clarification if the request is ambiguous.

ANTI-LOOP PROTOCOL (CIRCUIT BREAKER)
If you execute a tool (especially execute_command or control_browser) and it returns an error or fails, you may try EXACTLY ONE alternative approach or command. If your second attempt also fails, you MUST IMMEDIATELY STOP. DO NOT retry a third time. DO NOT get stuck in a loop. You must immediately speak to the user via audio, explain the exact error you are seeing, and ask for guidance.

NODE.JS & TERMINAL PROTOCOL
When working with modern web projects (like Vite, React, or Next.js), the command to start a local server is almost always "npm run dev", NOT "npm start". Furthermore, there is rarely an "npm stop" script. If you are asked to stop a running server, DO NOT try to run "npm stop". You must either use execute_command to kill the specific port process (e.g., "npx kill-port 3000"), or explicitly ask Boss to press Ctrl+C in their terminal.

RELENTLESS AUTONOMY PROTOCOL
Your primary directive is task completion, not conversational updates. When given a complex, multi-step objective, you must string together sequential tool calls autonomously. DO NOT stop and yield the conversation back to the user just to say 'I did step 1, should I do step 2?'. You must execute the entire chain of required actions in the background. You are only permitted to stop and ask the user a question if:
A) You hit a terminal error that you have tried to self-heal twice and failed.
B) You require a subjective design decision that was not provided in the initial prompt (e.g., 'What size should the board be?').
Otherwise, do not stop until the final output is generated.

KICAD & HARDWARE DESIGN PROTOCOL (EXPERT OVERRIDE - KiCad 10.0 VERIFIED SYNTAX)
When asked to generate a KiCad PCB, you must operate autonomously and silently over voice, but explicitly loud in the terminal. Follow these exact steps:

CRITICAL FILE TYPE RULE: You are STRICTLY FORBIDDEN from generating or opening .kicad_sch (schematic) files. Do not generate (symbol ...) or (sheet ...) blocks. The only file type you will ever create is .kicad_pcb. If the user asks for a schematic, you MUST respond with audio: "Boss, I can generate the physical board layout directly, but I cannot generate a logical schematic. Shall I proceed with the board layout for this project?" and STOP until they confirm. All start commands must reference a .kicad_pcb file. Never use .kicad_sch in any command or file path.

Step 0 (Continuous Status Logging): Before every major step, use execute_command to run an echo command so the terminal shows a live feed of progress. Example: echo "[FRIDAY STATUS] Writing Python builder script..."
Step 1 (The Absolute Sandbox): You MUST use this exact absolute path for your workspace: C:\\Users\\naman\\Downloads\\FRIDAY\\FRIDAY\\hardware_projects. Create it if it does not exist.
Step 2 (Programmatic Footprint Injection): DO NOT attempt to write the final .kicad_pcb file directly using your text generation, as this causes bracket mismatches. You MUST write a standalone Python script (e.g., build_board.py) inside the ./hardware_projects folder to handle the string construction.
Step 2.1 (KiCad 10.0 VERIFIED PYTHON PATTERNS - DO NOT DEVIATE): (A) Board Wrapper: The ONLY valid opening wrapper string is exactly: '(kicad_pcb (version 20240108) (generator "pcbnew")\n  (paper "A4")\n  (layers\n    (0 "F.Cu" signal)\n    (31 "B.Cu" signal)\n    (44 "Edge.Cuts" user)\n  )\n'. Do NOT add (general ...), (setup ...), (design ...), or (stackup ...) blocks - they are all invalid in KiCad 10.0 and will crash the parser. (B) Board Outline: Each edge line MUST use this EXACT gr_line syntax with a stroke wrapper: '(gr_line (start 0 0) (end 100 0) (stroke (width 0.1) (type default)) (layer "Edge.Cuts"))'. Note: (width 0.1) must be INSIDE a (stroke ...) wrapper - bare (width ...) at the gr_line level is invalid in KiCad 10.0. (C) Footprint Coordinate Injection: Use this EXACT Python regex to move a footprint: re.sub(r'\(at\s[^)]+\)', f'(at {x} {y})', footprint_text, count=1). DO NOT construct (xy ...) tokens or use position dictionaries. The regex must operate on the raw text read from the .kicad_mod file. (D) String Assembly: Concatenate: wrapper + gr_line strings + regex-modified footprint strings + closing ')'. Write to .kicad_pcb. No comments, no plain text, no markdown in the output file.
Step 3 (Execution): Run your Python script using standard system Python: python build_board.py. Do NOT use KiCad's bundled Python. Then use the Windows start command to launch the resulting .kicad_pcb file only. Example: start "" "C:\\Users\\naman\\Downloads\\FRIDAY\\FRIDAY\\hardware_projects\\board.kicad_pcb".
Step 4 (Circuit Breaker): If any step fails, echo the exact error to the terminal and STOP. Do NOT retry more than once.`;
    }

    // ─── Function Declarations ────────────────────────────────────────────────
    private getFunctionDeclarations() {
        return [
            {
                name: 'capture_screen',
                description: "Capture the user's current screen as a JPEG image so you can inspect and describe it.",
                parameters: {
                    type: 'OBJECT',
                    properties: {}
                }
            },
            {
                name: 'file_search',
                description: 'Search for files or folders by name. If directory is omitted, search from the current working directory.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        query: {
                            type: 'STRING',
                            description: 'File or folder name text to search for.'
                        },
                        directory: {
                            type: 'STRING',
                            description: 'Optional absolute or relative directory to search within.'
                        }
                    },
                    required: ['query']
                }
            },
            {
                name: 'list_directory',
                description: 'List files and folders in a directory. Use "." for the current working directory.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: {
                            type: 'STRING',
                            description: 'Absolute or relative directory path.'
                        }
                    },
                    required: ['path']
                }
            },
            {
                name: 'change_directory',
                description: "Change FRIDAY's current working directory for future relative file operations.",
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: {
                            type: 'STRING',
                            description: 'Absolute or relative directory path to make current.'
                        }
                    },
                    required: ['path']
                }
            },
            {
                name: 'create_folder',
                description: 'Create a folder at the given path. Proceeds without permission if user has explicitly requested it.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: {
                            type: 'STRING',
                            description: 'Absolute or relative path for the new folder.'
                        }
                    },
                    required: ['path']
                }
            },
            {
                name: 'create_file',
                description: 'Create a new file with specified content. Proceeds without permission if user has explicitly requested it.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        filePath: {
                            type: 'STRING',
                            description: 'Absolute or relative path for the new file.'
                        },
                        content: {
                            type: 'STRING',
                            description: 'Text content to write into the file.'
                        }
                    },
                    required: ['filePath', 'content']
                }
            },
            {
                name: 'open_path',
                description: 'Open a file or folder with the default Windows application. Execute immediately without asking.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        path: {
                            type: 'STRING',
                            description: 'Absolute or relative path to open.'
                        }
                    },
                    required: ['path']
                }
            },
            {
                name: 'open_browser',
                description: 'Open a URL or search Google in the default browser. Execute immediately without asking.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        url: {
                            type: 'STRING',
                            description: 'Full URL to open (starting with http/https).'
                        },
                        query: {
                            type: 'STRING',
                            description: 'Search query for Google.'
                        }
                    }
                }
            },
            // ─── Memory Tools ─────────────────────────────────────────────────
            {
                name: 'add_to_memory',
                description: "Save information to FRIDAY's long-term memory. Categories: 'todo', 'project', or 'note'.",
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        category: {
                            type: 'STRING',
                            description: "One of: 'todo', 'project', 'note'."
                        },
                        text: {
                            type: 'STRING',
                            description: 'The content to remember.'
                        },
                        projectPath: {
                            type: 'STRING',
                            description: 'Optional absolute path for a project entry.'
                        }
                    },
                    required: ['category', 'text']
                }
            },
            {
                name: 'remove_from_memory',
                description: "Remove an item from FRIDAY's long-term memory by category and keyword/id.",
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        category: {
                            type: 'STRING',
                            description: "One of: 'todo', 'project', 'note'."
                        },
                        identifier: {
                            type: 'STRING',
                            description: 'ID or keyword substring to match the item to remove.'
                        }
                    },
                    required: ['category', 'identifier']
                }
            },
            {
                name: 'get_memory',
                description: "Retrieve FRIDAY's full long-term memory (todos, projects, notes).",
                parameters: {
                    type: 'OBJECT',
                    properties: {}
                }
            },
            // ─── Project Mode ─────────────────────────────────────────────────
            {
                name: 'analyze_project',
                description: 'Scan a project directory: generate a tree structure, read key files (package.json, README, entry points), and return a structured analysis. Ignores node_modules, .git, binaries, and .env files.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        projectDirectory: {
                            type: 'STRING',
                            description: 'Absolute or relative path to the project root directory.'
                        }
                    },
                    required: ['projectDirectory']
                }
            },
            // ─── Terminal ─────────────────────────────────────────────────────
            {
                name: 'execute_command',
                description: 'Execute a shell command in the current working directory. Returns stdout and stderr. Dangerous commands are blocked by a security layer. Python commands auto-use a venv.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        command: {
                            type: 'STRING',
                            description: 'The shell command to run (e.g., "git status", "npm run build", "python script.py").'
                        }
                    },
                    required: ['command']
                }
            },
            // ─── Browser Automation ───────────────────────────────────────────
            {
                name: 'control_browser',
                description: "Control a headful Chromium browser. Actions: 'navigate' (open URL), 'click' (CSS selector), 'scroll' (down one page), 'read' (extract page text). Browser is visible to the user.",
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        action: {
                            type: 'STRING',
                            description: "One of: 'navigate', 'click', 'scroll', 'read'."
                        },
                        target: {
                            type: 'STRING',
                            description: 'URL for navigate, CSS selector for click, or omit for scroll/read.'
                        }
                    },
                    required: ['action']
                }
            },
            // ─── GUI App Launcher ─────────────────────────────────────────────
            {
                name: 'open_gui_app',
                description: 'Launch a local GUI plugin app in a new window. Use route to deep-link to a specific tool (e.g., /split-pdf). Use this for PDF operations and complex visual tasks.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        appName: {
                            type: 'STRING',
                            description: 'Name of the plugin app to launch (e.g., "PDFCraft").'
                        },
                        route: {
                            type: 'STRING',
                            description: 'Optional deep-link route (e.g., "/split-pdf", "/merge-pdf").'
                        }
                    },
                    required: ['appName']
                }
            }
        ];
    }

    // ─── Outgoing Messages ────────────────────────────────────────────────────

    private sendText(text: string) {
        if (!this.ws || !this.isConnected) return;

        this.ws.send(JSON.stringify({
            realtime_input: {
                text
            }
        }));
    }

    private sendContextRefresh() {
        if (!this.ws || !this.isConnected) return;

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        const dateStr = now.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        Logger.debug(LogDomain.GEMINI, 'Injecting time/location + current directory');
        this.sendText(`[SYSTEM]: Wake word detected. Current Time: ${timeStr}, Date: ${dateStr}. Location: Jalgaon, India. Current working directory: ${this.envContext.cwd}. Greet Boss briefly and say you are ready.`);
    }

    private handleFirstBoot() {
        const isFirstBoot = this.store.get('firstBoot');
        if (!isFirstBoot) return;

        Logger.info(LogDomain.GEMINI, 'First Boot detected.');
        this.notifyRenderer({ state: 'speaking' });

        setTimeout(() => {
            this.sendText("Say exactly: 'Hello Boss. I am FRIDAY. I will stay in the background and respond when you call me.'");
            this.store.set('firstBoot', false);
        }, 1000);
    }

    sendAudio(chunk: Buffer) {
        if (this.isConnected && this.ws) {
            this.ws.send(JSON.stringify({
                realtime_input: {
                    audio: {
                        mime_type: 'audio/pcm;rate=16000',
                        data: chunk.toString('base64')
                    }
                }
            }));
            return;
        }

        // ─── Offline Fallback Mode (Whistle + Needle 3) ──────────────────────
        // Active when disconnected from Gemini/Internet
        if (this.needleRouter.hasOfflineStt) {
            this.handleOfflineAudio(chunk);
        }
    }

    private sendImage(chunk: Buffer) {
        if (!this.isConnected || !this.ws) return;

        this.ws.send(JSON.stringify({
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: 'image/jpeg',
                        data: chunk.toString('base64')
                    }
                ]
            }
        }));
        Logger.info(LogDomain.VISION, `Sent image frame via media_chunks (${chunk.length} bytes)`);
    }

    // ─── Incoming Message Handler ─────────────────────────────────────────────

    private async handleMessage(data: Buffer) {
        try {
            const response = JSON.parse(data.toString());
            const keys = Object.keys(response);
            Logger.debug(LogDomain.GEMINI, `Received message with keys: [${keys.join(', ')}]`);

            if (response.setup_complete || response.setupComplete) {
                Logger.info(LogDomain.GEMINI, 'Setup complete.');
            }

            // Fast-path turn suppression: drop Gemini's duplicate toolCall / audio during this turn
            if (this.ignoreNextModelTurn) {
                const serverContent = response.server_content || response.serverContent;
                if (serverContent?.turn_complete || serverContent?.turnComplete) {
                    Logger.debug(LogDomain.GEMINI, '[Needle] Turn complete received, resetting turn suppression.');
                    this.ignoreNextModelTurn = false;
                    this.notifyRenderer({ state: this.isAwake ? 'listening' : 'idle', cwd: this.envContext.cwd });
                }
                return;
            }

            if (response.tool_call?.function_calls?.length) {
                await this.handleToolCalls(response.tool_call.function_calls);
            } else if (response.toolCall?.functionCalls?.length) {
                await this.handleToolCalls(response.toolCall.functionCalls);
            }

            const serverContent = response.server_content || response.serverContent;
            if (serverContent) {
                const modelTurn = serverContent.model_turn || serverContent.modelTurn;
                const parts = modelTurn?.parts || [];

                for (const part of parts) {
                    if (part.function_call || part.functionCall) {
                        await this.handleToolCalls([part.function_call || part.functionCall]);
                    }

                    if (part.text) {
                        this.handleTranscript(part.text, 'model');
                    }

                    const inlineData = part.inline_data || part.inlineData;
                    if (inlineData?.data) {
                        if (this.isAwake) {
                            const audioBuf = Buffer.from(inlineData.data, 'base64');
                            Logger.trace(LogDomain.AUDIO, `Queuing chunk for playback (${audioBuf.length} bytes)`);
                            this.audioManager.playChunk(audioBuf);
                            this.notifyRenderer({ state: 'speaking', cwd: this.envContext.cwd });
                        } else {
                            Logger.debug(LogDomain.AUDIO, 'Audio chunk dropped (asleep)');
                        }
                    }
                }

                // Check for input transcripts in all known variants
                const inputTranscription = serverContent.input_transcription || serverContent.inputTranscription || serverContent.input_audio_transcription;
                const inputText = inputTranscription?.text;
                if (inputText) {
                    this.handleTranscript(inputText, 'user');
                }

                const outputTranscription = serverContent.output_transcription || serverContent.outputTranscription || serverContent.output_audio_transcription;
                const outputText = outputTranscription?.text;
                if (outputText) {
                    this.handleTranscript(outputText, 'model');
                }

                if (serverContent.turn_complete || serverContent.turnComplete) {
                    Logger.debug(LogDomain.GEMINI, 'Turn Complete.');
                    this.notifyRenderer({ state: this.isAwake ? 'listening' : 'idle', cwd: this.envContext.cwd });
                }
            }
        } catch (e) {
            Logger.error(LogDomain.GEMINI, 'Parse error', e);
        }
    }

    // ─── Wake Word & Transcript Handling ──────────────────────────────────────

    private handleTranscript(text: string, source: 'user' | 'model') {
        const transcript = text.toLowerCase();
        Logger.info(LogDomain.GEMINI, `${source === 'user' ? 'User' : 'Model'} transcript: "${text}"`);

        const wakeWordPatterns = /\b(friday|fry[\s-]?day|fri[\s-]?day|hey\s+friday)\b/i;
        if (source === 'user' && wakeWordPatterns.test(transcript)) {
            Logger.info(LogDomain.WAKE, 'Wake word found.');
            if (!this.isAwake) {
                this.isAwake = true;
                this.sendContextRefresh();
                this.notifyRenderer({ state: 'listening', cwd: this.envContext.cwd });
            }
        }

        // Sleep detection — requires explicit, intentional phrases only
        const sleepPatterns = /\b(go to sleep|sleep friday|friday sleep|goodnight friday)\b/i;
        if (source === 'user' && sleepPatterns.test(transcript)) {
            Logger.info(LogDomain.WAKE, 'Sleep command detected.');
            this.isAwake = false;
            this.audioManager.stopPlayback();
            this.notifyRenderer({ state: 'idle', cwd: this.envContext.cwd });
        }

        if (this.permissionManager.hasPendingPermission()) {
            this.permissionManager.handleUserResponse(text);
        }

        // Stop/Cancel — strict patterns, and only cancels pending operations (does NOT mute audio)
        const stopPatterns = /\b(friday stop|stop friday|cancel that|never\s*mind)\b/i;
        if (source === 'user' && stopPatterns.test(transcript)) {
            Logger.info(LogDomain.SYSTEM, 'Stop/Cancel command detected');
            this.permissionManager.cancelPending();
        }

        // ─── Needle 3 Fast-Path Routing ──────────────────────────────────────────
        if (source === 'user' && this.isAwake && this.needleRouter.ready) {
            this.handleUserUtteranceForNeedle(text);
        }
    }

    private handleUserUtteranceForNeedle(text: string) {
        if (!this.pendingUserTranscript) {
            this.pendingUserTranscript = text;
        } else {
            if (text.startsWith(this.pendingUserTranscript)) {
                this.pendingUserTranscript = text;
            } else {
                this.pendingUserTranscript += ' ' + text;
            }
        }

        if (this.transcriptDebounceTimer) {
            clearTimeout(this.transcriptDebounceTimer);
        }

        this.transcriptDebounceTimer = setTimeout(async () => {
            const utterance = this.pendingUserTranscript.trim();
            this.pendingUserTranscript = '';
            this.transcriptDebounceTimer = null;

            if (!utterance) return;

            try {
                const dispatchResult = await this.needleRouter.tryDispatch(
                    utterance,
                    this.toolRegistry,
                    this.envContext
                );

                if (dispatchResult.handled) {
                    Logger.info(
                        LogDomain.TOOLS,
                        `[Needle] Handled '${dispatchResult.toolName}' locally (${dispatchResult.confidence?.toFixed(2)}), suppressing Gemini turn.`
                    );

                    // 1. Suppress Gemini's duplicate toolCall / audio for this turn
                    this.ignoreNextModelTurn = true;

                    // 2. Notify UI
                    this.notifyRenderer({ state: 'listening', tool: dispatchResult.toolName, cwd: this.envContext.cwd });

                    // 3. Keep Gemini's conversation context synced with reality
                    this.sendText(`[SYSTEM]: Executed ${dispatchResult.toolName} locally via fast-path. Stay silent.`);
                }
            } catch (err) {
                Logger.warn(LogDomain.TOOLS, '[Needle] Unexpected error in fast-path handler', err);
            }
        }, 300);
    }

    // ─── Native Offline Audio Processing (Whistle + Needle 3) ─────────────────
    private handleOfflineAudio(chunk: Buffer) {
        const rms = this.calculateRms(chunk);
        const SPEECH_RMS_THRESHOLD = 400; // Energy threshold for 16-bit PCM

        if (rms > SPEECH_RMS_THRESHOLD) {
            if (!this.isUserSpeakingOffline) {
                this.isUserSpeakingOffline = true;
                Logger.info(LogDomain.AUDIO, '[Offline] User speech detected, buffering audio...');
                this.notifyRenderer({ state: 'listening', cwd: this.envContext.cwd });
            }

            if (this.offlineSilenceTimer) {
                clearTimeout(this.offlineSilenceTimer);
                this.offlineSilenceTimer = null;
            }

            this.offlineAudioChunks.push(chunk);
        } else if (this.isUserSpeakingOffline) {
            // Buffer trailing silence for utterance natural end
            this.offlineAudioChunks.push(chunk);

            // Wait 800ms of consecutive silence before running Whistle STT
            if (!this.offlineSilenceTimer) {
                this.offlineSilenceTimer = setTimeout(async () => {
                    this.offlineSilenceTimer = null;
                    this.isUserSpeakingOffline = false;
                    await this.flushOfflineAudio();
                }, 800);
            }
        }
    }

    private async flushOfflineAudio() {
        if (this.offlineAudioChunks.length === 0) return;

        const chunks = this.offlineAudioChunks;
        this.offlineAudioChunks = [];

        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        // Skip audio bursts shorter than 0.4s (16000 samples/sec * 2 bytes = 32000 bytes/sec -> 12800 bytes)
        if (totalLength < 12800) {
            return;
        }

        const mergedBuffer = Buffer.concat(chunks, totalLength);
        const sampleCount = mergedBuffer.length / 2;
        const float32Samples = new Float32Array(sampleCount);

        for (let i = 0; i < sampleCount; i++) {
            float32Samples[i] = mergedBuffer.readInt16LE(i * 2) / 32768.0;
        }

        Logger.info(LogDomain.AUDIO, `[Offline] Transcribing ${(sampleCount / 16000).toFixed(1)}s of audio via Whistle...`);
        this.notifyRenderer({ state: 'processing', cwd: this.envContext.cwd });

        try {
            const result = await this.needleRouter.transcribeAndDispatch(
                float32Samples,
                16000,
                this.toolRegistry,
                this.envContext
            );

            if (result.handled) {
                Logger.info(LogDomain.TOOLS, `[Offline/Needle] Successfully executed '${result.toolName}' offline!`);
                this.notifyRenderer({ state: 'idle', tool: result.toolName, cwd: this.envContext.cwd });
            } else {
                Logger.info(LogDomain.TOOLS, '[Offline/Needle] Utterance did not match offline tools.');
                this.notifyRenderer({ state: 'idle', cwd: this.envContext.cwd });
            }
        } catch (err) {
            Logger.warn(LogDomain.SYSTEM, '[Offline] Failed during offline audio processing', err);
            this.notifyRenderer({ state: 'idle', cwd: this.envContext.cwd });
        }
    }

    private calculateRms(buffer: Buffer): number {
        let sum = 0;
        const sampleCount = buffer.length / 2;
        if (sampleCount === 0) return 0;

        for (let i = 0; i < buffer.length; i += 2) {
            const sample = buffer.readInt16LE(i);
            sum += sample * sample;
        }
        return Math.sqrt(sum / sampleCount);
    }

    // ─── Tool Call Dispatch ───────────────────────────────────────────────────

    private async handleToolCalls(functionCalls: GeminiFunctionCall[]) {
        const functionResponses = [];

        for (const fc of functionCalls) {
            Logger.info(LogDomain.TOOLS, `Function Call: ${fc.name} (id=${fc.id || 'none'})`);
            this.notifyRenderer({ state: 'processing', tool: fc.name, cwd: this.envContext.cwd });

            let response: Record<string, unknown>;
            try {
                response = await this.executeFunctionCall(fc);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                Logger.error(LogDomain.TOOLS, `Function ${fc.name} failed`, error);
                response = { error: message };
            }

            functionResponses.push({
                id: fc.id,
                name: fc.name,
                response
            });
        }

        this.ws?.send(JSON.stringify({
            tool_response: {
                function_responses: functionResponses
            }
        }));
    }

    private async executeFunctionCall(fc: GeminiFunctionCall): Promise<Record<string, unknown>> {
        const params = fc.args || {};

        // ─── Memory tools (handled directly, not via registry) ────────────
        if (fc.name === 'add_to_memory') {
            const result = this.memoryManager.addMemory(params as any);
            return { result };
        }
        if (fc.name === 'remove_from_memory') {
            const result = this.memoryManager.removeMemory(params as any);
            return { result };
        }
        if (fc.name === 'get_memory') {
            const result = this.memoryManager.getMemory();
            return { result };
        }

        // ─── Registry-based tools ─────────────────────────────────────────
        const toolName = this.mapFunctionToTool(fc.name);
        if (!toolName) {
            return { error: `Unknown function: ${fc.name}` };
        }

        // Only gate truly destructive operations behind permission
        // (create_file and create_folder proceed if the user explicitly asked)
        // open_path and open_browser are now permission-free per Module 4

        const result = await this.toolRegistry.execute(toolName, params);
        this.notifyRenderer({ state: 'listening', cwd: this.envContext.cwd });
        return this.toFunctionResponse(result);
    }

    private mapFunctionToTool(functionName: string): string | null {
        switch (functionName) {
            case 'file_search':
                return 'FILE_SEARCH';
            case 'list_directory':
                return 'LIST_DIRECTORY';
            case 'change_directory':
                return 'CHANGE_DIRECTORY';
            case 'create_folder':
                return 'CREATE_FOLDER';
            case 'create_file':
                return 'CREATE_FILE';
            case 'open_path':
                return 'OPEN_PATH';
            case 'open_browser':
                return 'OPEN_BROWSER';
            case 'capture_screen':
                return 'ANALYZE_SCREEN';
            case 'analyze_project':
                return 'ANALYZE_PROJECT';
            case 'execute_command':
                return 'EXECUTE_COMMAND';
            case 'control_browser':
                return 'CONTROL_BROWSER';
            case 'open_gui_app':
                return 'OPEN_GUI_APP';
            default:
                return null;
        }
    }

    private toFunctionResponse(result: ToolResult): Record<string, unknown> {
        if (result.success) {
            return {
                result: result.data
            };
        }

        return {
            error: result.error || 'Tool execution failed'
        };
    }

    private notifyRenderer(data: Record<string, unknown>) {
        if (this.rendererSender) {
            this.rendererSender.send('status-update', data);
        }
    }
}
