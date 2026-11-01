import 'dotenv/config';
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { AudioManager } from './audio-manager.js';
import { Logger, LogDomain } from './logger.js';
import { closeBrowser } from './tools/implementations/control-browser.js';

// ─── Plugin HTTP Server ──────────────────────────────────────────────────────
// Serves plugins/ as a static site on port 8999.
// Required because file:// breaks Next.js absolute asset paths (__next/ chunks).
//
// WHY TWO MOUNTS:
// Next.js static export bakes absolute paths like /_next/static/... into HTML.
// When Electron loads http://localhost:8999/pdfcraft/out/en/tools/merge-pdf/,
// the browser requests /_next/... from the server root.
// The first mount serves /pdfcraft/out/... routes.
// The second mount (pdfcraft/out as root) catches /_next/, /fonts/, /workers/,
// /sw.js, /coherentpdf.browser.min.js, /qpdf.wasm, etc. as absolute paths.
// Express cascades: if file not found in mount 1, it falls through to mount 2.
const PLUGIN_SERVER_PORT = 8999;
const pluginServerApp = express();
const pluginsRoot = path.join(process.cwd(), 'plugins');
const pdfcraftOut = path.join(pluginsRoot, 'pdfcraft', 'out');
pluginServerApp.use(express.static(pluginsRoot));
pluginServerApp.use(express.static(pdfcraftOut));
pluginServerApp.listen(PLUGIN_SERVER_PORT, () => {
    console.log(`[PluginServer] Serving plugins/ on http://localhost:${PLUGIN_SERVER_PORT}`);
    console.log(`[PluginServer] Fallback root: plugins/pdfcraft/out/ (for Next.js /_next/ assets)`);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { GeminiClient } from './gemini-client.js';
import { Store } from './store.js';
import isDev from 'electron-is-dev';

// Initialize Logger
Logger.initialize();

let mainWindow: BrowserWindow | null = null;
const store = new Store();
const audioManager = new AudioManager();
const geminiClient = new GeminiClient(audioManager, store);

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 300,
        height: 300,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        hasShadow: false,
        backgroundColor: '#00000000'
    });

    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => (mainWindow = null));
}

app.on('ready', async () => {
    Logger.info(LogDomain.SYSTEM, 'FRIDAY Application Starting...');
    createWindow();

    // Initialize Audio Logic
    try {
        const micName = await audioManager.detectInputDevice();
        Logger.info(LogDomain.AUDIO, `Selected Mic: ${micName}`);

        // Connect to Gemini (Vertex AI – async for OAuth token fetch)
        await geminiClient.connect();

        // Start Recording
        audioManager.startRecording(micName, (chunk) => {
            geminiClient.sendAudio(chunk);
        });

    } catch (error) {
        Logger.error(LogDomain.SYSTEM, 'Initialization failed', error);
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', async () => {
    geminiClient.disconnect();
    audioManager.stopAll();
    await closeBrowser();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// IPC for UI updates (Renderer -> Main)
ipcMain.on('renderer-ready', (event) => {
    geminiClient.setRendererSender(event.sender);
});
