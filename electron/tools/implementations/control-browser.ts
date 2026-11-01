import puppeteer, { Browser, Page } from 'puppeteer';
import { Tool, ToolResult } from '../tool-registry.js';
import { Logger, LogDomain } from '../../logger.js';

// ─── Persistent browser instance ──────────────────────────────────────────────
let browser: Browser | null = null;
let page: Page | null = null;

const MAX_READ_LENGTH = 12_000; // ~12 KB text budget for page content

async function ensureBrowser(): Promise<Page> {
    if (browser && browser.connected && page && !page.isClosed()) {
        return page;
    }

    Logger.info(LogDomain.TOOLS, '[Browser] Launching Puppeteer...');
    browser = await puppeteer.launch({
        headless: false,          // Visible browser so user can see what FRIDAY is doing
        defaultViewport: null,    // Use full window size
        args: [
            '--start-maximized',
            '--no-first-run',
            '--no-default-browser-check',
        ],
    });

    const pages = await browser.pages();
    page = pages[0] || await browser.newPage();

    page.on('close', () => {
        page = null;
    });

    browser.on('disconnected', () => {
        browser = null;
        page = null;
        Logger.info(LogDomain.TOOLS, '[Browser] Disconnected.');
    });

    return page;
}

export const createControlBrowserTool = (): Tool => ({
    name: 'CONTROL_BROWSER',
    description: 'Control a headful Chromium browser. Actions: navigate (open URL), click (CSS selector), scroll (down), read (extract page text).',
    permission: 'execute',
    schema: {
        params: {
            action: {
                type: 'string',
                required: true,
                description: "One of: 'navigate', 'click', 'scroll', 'read'."
            },
            target: {
                type: 'string',
                required: false,
                description: 'URL for navigate, CSS selector for click, or omit for scroll/read.'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        const action: string = (params.action || '').toLowerCase();
        const target: string = params.target || '';

        try {
            const activePage = await ensureBrowser();

            switch (action) {
                // ─── Navigate ─────────────────────────────────────────────
                case 'navigate': {
                    if (!target) {
                        return { success: false, error: 'navigate requires a URL in the target parameter.' };
                    }
                    Logger.info(LogDomain.TOOLS, `[Browser] Navigating to: ${target}`);
                    await activePage.goto(target, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    const title = await activePage.title();
                    return {
                        success: true,
                        data: { action: 'navigate', url: target, pageTitle: title }
                    };
                }

                // ─── Click ────────────────────────────────────────────────
                case 'click': {
                    if (!target) {
                        return { success: false, error: 'click requires a CSS selector in the target parameter.' };
                    }
                    Logger.info(LogDomain.TOOLS, `[Browser] Clicking: ${target}`);
                    try {
                        await activePage.waitForSelector(target, { timeout: 5_000 });
                        await activePage.click(target);
                        // Wait a moment for any navigation or JS to fire
                        await new Promise(r => setTimeout(r, 500));
                        const titleAfterClick = await activePage.title();
                        return {
                            success: true,
                            data: { action: 'click', selector: target, pageTitle: titleAfterClick }
                        };
                    } catch (clickErr) {
                        const clickMsg = clickErr instanceof Error ? clickErr.message : String(clickErr);
                        Logger.warn(LogDomain.TOOLS, `[Browser] Click failed for "${target}": ${clickMsg}`);
                        return {
                            success: false,
                            error: `Selector "${target}" not found on page (waited 5s). This may be due to Shadow DOM, dynamic loading, or an incorrect selector. DO NOT retry the same selector. Use control_browser(action='read') to inspect the page structure and find the correct selector.`
                        };
                    }
                }

                // ─── Scroll ───────────────────────────────────────────────
                case 'scroll': {
                    Logger.info(LogDomain.TOOLS, '[Browser] Scrolling down...');
                    await activePage.evaluate(() => window.scrollBy(0, window.innerHeight));
                    return {
                        success: true,
                        data: { action: 'scroll', direction: 'down', pixels: 'one viewport height' }
                    };
                }

                // ─── Read ─────────────────────────────────────────────────
                case 'read': {
                    Logger.info(LogDomain.TOOLS, '[Browser] Reading page content...');
                    const url = activePage.url();
                    const title = await activePage.title();

                    // Extract text from body, truncate to budget
                    let bodyText = await activePage.evaluate(() => {
                        // Remove script/style noise
                        const scripts = document.querySelectorAll('script, style, noscript');
                        scripts.forEach(s => s.remove());
                        return document.body?.innerText || '';
                    });

                    if (bodyText.length > MAX_READ_LENGTH) {
                        bodyText = bodyText.substring(0, MAX_READ_LENGTH) + '\n...(truncated)';
                    }

                    return {
                        success: true,
                        data: {
                            action: 'read',
                            url,
                            title,
                            textLength: bodyText.length,
                            content: bodyText,
                        }
                    };
                }

                default:
                    return {
                        success: false,
                        error: `Unknown action: "${action}". Valid actions: navigate, click, scroll, read.`
                    };
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            Logger.error(LogDomain.TOOLS, `[Browser] ${action} failed: ${msg}`);
            return {
                success: false,
                error: `Browser ${action} failed: ${msg}`
            };
        }
    }
});

/** Cleanup function to close the browser gracefully */
export async function closeBrowser(): Promise<void> {
    if (browser) {
        try { await browser.close(); } catch { /* ignore */ }
        browser = null;
        page = null;
    }
}
