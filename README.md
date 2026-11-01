# FRIDAY

**A voice-first, multimodal AI desktop assistant powered by Google Gemini Live on Vertex AI.**

FRIDAY is a personal AI system built on Electron, React, and TypeScript. It runs as a transparent, always-on-top overlay on the desktop and communicates with the user entirely through natural speech. It is designed to act as an autonomous agent capable of controlling the host operating system, executing code, browsing the web, and retaining memory across sessions — all orchestrated through a real-time bidirectional audio stream to Google's Gemini Live model.

---

## Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Tool System](#tool-system)
- [Memory System](#memory-system)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running FRIDAY](#running-friday)
- [Project Structure](#project-structure)
- [Hardware Projects](#hardware-projects)
- [Roadmap](#roadmap)
- [License](#license)

---

## Architecture

FRIDAY is structured around the standard Electron dual-process model with a clear separation of concerns:

```
┌────────────────────────────────────────────────────────────┐
│                  Renderer Process (Vite + React)           │
│   FridayHUD.tsx / JarvisHUD.tsx  — Transparent Overlay UI │
└───────────────────────────┬────────────────────────────────┘
                            │  contextBridge IPC
┌───────────────────────────▼────────────────────────────────┐
│                    Main Process (Node.js)                   │
│                                                            │
│  main.ts             — Application lifecycle, plugin HTTP  │
│  gemini-client.ts    — Vertex AI Bidi WebSocket hub        │
│  audio-manager.ts    — Microphone detection & streaming    │
│  screen-manager.ts   — Screen capture for vision tasks     │
│  memory-manager.ts   — Persistent JSON memory store        │
│  store.ts            — Session configuration (JSON)        │
│  logger.ts           — Structured, domain-tagged logging   │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │              Tool Registry (tool-registry.ts)        │  │
│  │  permission-manager.ts  •  sandbox.ts               │  │
│  │  environment-context.ts                             │  │
│  │  implementations/ — 12 registered tools             │  │
│  └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                            │  WebSocket (WSS)
┌───────────────────────────▼────────────────────────────────┐
│              Vertex AI  —  LlmBidiService                  │
│              gemini-live-2.5-flash-native-audio            │
└────────────────────────────────────────────────────────────┘
```

Authentication is handled exclusively through **Google Application Default Credentials (ADC)** via `google-auth-library`. No JSON key files are embedded in the project. OAuth tokens are refreshed automatically on every WebSocket reconnect.

A local **Express HTTP server** (port `8999`) serves static plugin assets, enabling the use of bundled Next.js applications as FRIDAY plugins without breaking absolute asset paths.

---

## Features

- **Voice-First Interaction** — Streams raw PCM audio to Gemini Live in real time. No push-to-talk required; FRIDAY listens continuously and responds via native audio synthesis from the model.
- **Transparent HUD Overlay** — A frameless, always-on-top, click-through window that does not interfere with the user's existing workflow.
- **Agentic Tool Execution** — FRIDAY autonomously selects and invokes tools from a typed registry based on inferred user intent. Tool calls are dispatched and their results are fed back into the conversation stream.
- **Persistent Cross-Session Memory** — A structured JSON memory store persists user preferences, active projects, to-do items, and general notes across all sessions via system-prompt injection.
- **Multimodal Vision** — Captures and analyses the desktop screen on demand, enabling FRIDAY to reason about the user's current visual context.
- **Plugin System** — A local HTTP server exposes a `plugins/` directory, allowing externally built web applications (including full Next.js static exports) to be loaded inside FRIDAY as embedded panels.
- **Permission-Gated Execution** — All write and execute-level tool calls pass through a `PermissionManager` and `sandbox` layer before reaching the OS.

---

## Tool System

Tools are registered at startup by `gemini-client.ts` via `ToolRegistry`. Each tool exposes a typed `ToolSchema` and is assigned one of three permission levels: `read`, `write`, or `execute`.

| Tool | Permission | Description |
|---|---|---|
| `list_directory` | read | Lists the contents of a directory |
| `file_search` | read | Searches for files matching a pattern |
| `change_directory` | read | Changes the agent's working directory context |
| `open_file` | read | Opens a file or folder in the OS default application |
| `create_file` | write | Creates a new file at a specified path |
| `create_folder` | write | Creates a new directory |
| `execute_command` | execute | Runs an arbitrary shell command in a controlled subprocess |
| `open_gui_app` | execute | Launches a named desktop application |
| `open_browser` | read | Opens a URL or search query in the default browser |
| `control_browser` | execute | Programmatically controls a Puppeteer browser instance |
| `capture_screen` | read | Captures a screenshot for visual analysis |
| `analyze_project` | read | Reads and summarises a codebase for contextual awareness |

---

## Memory System

Persistent memory is managed by `MemoryManager` and stored at:

```
%USERPROFILE%\.friday\friday-memory.json
```

This file is never committed to version control. The memory schema tracks four categories:

| Field | Type | Description |
|---|---|---|
| `userName` | `string` | Preferred name for address (default: `"Boss"`) |
| `todos` | `Array` | Task checklist with completion state and timestamps |
| `activeProjects` | `Array` | Project names, paths, and attached notes |
| `generalNotes` | `string` | Free-form persistent context |

On every session start, `MemoryManager.toPromptString()` serialises this data and injects it into the Gemini system instruction. During a session, FRIDAY can invoke `addMemory`, `removeMemory`, and `getMemory` tool calls autonomously to update the store in real time.

---

## Prerequisites

The following must be present on the host machine before setup:

| Dependency | Purpose | Install |
|---|---|---|
| Node.js (v20+) | JavaScript runtime | [nodejs.org](https://nodejs.org/) |
| npm | Package manager | Included with Node.js |
| Python 3.x | Hardware automation scripts | [python.org](https://www.python.org/) |
| FFmpeg & FFplay | Audio encoding and playback | [gyan.dev/ffmpeg](https://www.gyan.dev/ffmpeg/builds/) |
| Google Cloud CLI | ADC authentication | [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install) |
| A Google Cloud Project | Vertex AI API access | [console.cloud.google.com](https://console.cloud.google.com/) |

> **Note:** The Vertex AI API must be enabled on the Google Cloud project, and billing must be active (the \$300 free trial is sufficient to begin).

---

## Setup

### 1. Authenticate with Google Cloud

Install the Google Cloud CLI, then run:

```powershell
gcloud init
gcloud auth application-default login
```

This stores credentials at `%APPDATA%\gcloud\application_default_credentials.json`. FRIDAY picks these up automatically — no service account key file is required.

### 2. Configure Environment Variables

Copy the example environment file and fill in your values:

```powershell
copy .env.example .env
```

Open `.env` and set at minimum:

```env
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
```

If FFmpeg is not on the system `PATH`, also set:

```env
FFMPEG_PATH=C:\path\to\ffmpeg.exe
FFPLAY_PATH=C:\path\to\ffplay.exe
```

### 3. Install Dependencies

```powershell
npm install
```

---

## Running FRIDAY

```powershell
npm run dev
```

This command concurrently starts the Vite development server (renderer process) and compiles and launches the Electron main process. FRIDAY will appear as a small transparent overlay and begin listening for audio immediately.

To produce a production build:

```powershell
npm run build
```

---

## Project Structure

```
FRIDAY/
├── electron/                        # Electron main process (Node.js)
│   ├── main.ts                      # Application entry point
│   ├── gemini-client.ts             # Vertex AI WebSocket client & tool orchestration
│   ├── audio-manager.ts             # Microphone detection and PCM streaming
│   ├── screen-manager.ts            # Desktop screen capture
│   ├── memory-manager.ts            # Persistent JSON memory store
│   ├── store.ts                     # Session configuration store
│   ├── logger.ts                    # Structured logger with domain tags
│   ├── preload.ts                   # Electron contextBridge API surface
│   └── tools/
│       ├── tool-registry.ts         # Tool registration and lookup
│       ├── permission-manager.ts    # Permission gating for write/execute tools
│       ├── sandbox.ts               # Subprocess sandboxing layer
│       ├── environment-context.ts   # OS environment introspection
│       └── implementations/         # Individual tool modules (12 tools)
├── src/                             # Renderer process (React + Vite)
│   ├── FridayHUD.tsx                # Primary HUD overlay component
│   ├── JarvisHUD.tsx                # Alternative HUD theme
│   └── App.tsx                      # Root application component
├── plugins/                         # Embedded web application plugins
│   └── pdfcraft/                    # Example plugin (Next.js static export)
├── hardware_projects/               # PCB design automation (Python + KiCad API)
│   ├── kicad_builder_template.py    # Reusable PCB generation template
│   ├── build_board.py               # Board build entry point
│   └── memoband.kicad_pcb           # MemoBand wearable PCB layout
├── public/                          # Static assets served by Vite
├── .env.example                     # Environment variable template
├── package.json                     # NPM scripts and dependencies
├── tsconfig.electron.json           # TypeScript config for Electron main
├── tsconfig.app.json                # TypeScript config for React renderer
└── vite.config.ts                   # Vite bundler configuration
```

---

## Hardware Projects

The `hardware_projects/` directory contains Python scripts that interface with the **KiCad Python API (`pcbnew`)** to programmatically generate PCB board files. This is the foundation for FRIDAY's planned hardware design capability — enabling voice-commanded PCB generation.

**Current target:** The **MemoBand**, a wearable voice-capture device built around the ESP32-C3, INMP441 I2S digital microphone, and MicroSD card module.

**Constraints enforced by the generator:**
- Only `.kicad_pcb` board files are produced. Schematic (`.kicad_sch`) generation is not supported.
- Board outlines use strict KiCad 10.0 `gr_line` syntax with `(stroke ...)` wrappers.
- Footprint positions are applied via regex substitution on raw `.kicad_mod` text, not by injecting raw coordinate tokens.

---

## Roadmap

- **Needle 3 Integration (Scenario A):** Embed Cactus Compute's Needle 3 on-device model as a local tool-call router. Routine desktop commands will be dispatched locally in milliseconds without a Gemini API round-trip, reducing latency and cloud cost.
- **Offline Fallback Mode:** FRIDAY remains operational for core desktop automation tasks when network connectivity is unavailable.
- **MemoBand Companion Integration (Scenario C):** A mobile companion application that runs Needle 3 on-device and relays structured tool intents to the FRIDAY desktop instance over a local network connection.
- **KiCad Tool Implementation:** A dedicated `kicad-generator` tool registered in the tool registry, allowing FRIDAY to design and open PCB layouts via voice command.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for the full text.
