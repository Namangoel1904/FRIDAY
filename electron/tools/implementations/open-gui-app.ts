import { BrowserWindow } from 'electron';
import { Tool, ToolResult } from '../tool-registry.js';
import { Logger, LogDomain } from '../../logger.js';

const PLUGIN_SERVER_PORT = 8999;

// ─── Tracks open plugin windows ──────────────────────────────────────────────
const openWindows: Map<string, BrowserWindow> = new Map();

/**
 * Build the localhost URL for a plugin page.
 * PDFCraft is exported to plugins/pdfcraft/out/en/tools/<route>/
 * so we map:  /merge-pdf  →  http://localhost:8999/pdfcraft/out/en/tools/merge-pdf/
 */
function resolvePluginUrl(appName: string, route: string): string {
    const base = `http://localhost:${PLUGIN_SERVER_PORT}/${appName.toLowerCase()}/out`;

    if (appName.toLowerCase() === 'pdfcraft') {
        const cleanRoute = (route || '/').replace(/^\//, '');
        if (cleanRoute && cleanRoute !== '') {
            return `${base}/en/tools/${cleanRoute}/`;
        }
        return `${base}/en/`;
    }

    // Generic fallback for future plugins
    const cleanRoute = (route || '/').replace(/^\//, '');
    return cleanRoute ? `${base}/${cleanRoute}/` : `${base}/`;
}

export const createOpenGuiAppTool = (): Tool => ({
    name: 'OPEN_GUI_APP',
    description: 'Launch a local GUI plugin app in a new window. Use route to deep-link to a specific tool (e.g., /split-pdf).',
    permission: 'execute',
    schema: {
        params: {
            appName: {
                type: 'string',
                required: true,
                description: 'Name of the plugin app to launch (e.g., "PDFCraft").'
            },
            route: {
                type: 'string',
                required: false,
                description: 'Optional deep-link route (e.g., "/split-pdf", "/merge-pdf").'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        const appName: string = params.appName;
        const route: string = params.route || '/';

        if (!appName) {
            return { success: false, error: 'appName is required.' };
        }

        try {
            const targetUrl = resolvePluginUrl(appName, route);

            Logger.info(LogDomain.TOOLS, `[GuiApp] Launching ${appName} at route "${route}" → ${targetUrl}`);

            // Reuse existing window if same app+route, otherwise create new
            const windowKey = `${appName.toLowerCase()}-${route}`;
            const existing = openWindows.get(windowKey);
            if (existing && !existing.isDestroyed()) {
                existing.focus();
                return {
                    success: true,
                    data: { appName, route, reused: true, message: `${appName} is already open. Brought to front.` }
                };
            }

            // Launch via IPC to the main process
            const win = new BrowserWindow({
                width: 1200,
                height: 800,
                autoHideMenuBar: true,
                title: `${appName} — ${route === '/' ? 'Home' : route.replace(/^\//, '')}`,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            win.loadURL(targetUrl);

            win.on('closed', () => {
                openWindows.delete(windowKey);
            });

            openWindows.set(windowKey, win);

            return {
                success: true,
                data: {
                    appName,
                    route,
                    url: targetUrl,
                    message: `Launched ${appName} at "${route}". The window is now open.`
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
});
