import { shell } from 'electron';
import { Tool, ToolResult } from '../tool-registry.js';
import { Logger, LogDomain } from '../../logger.js';

export const createBrowserTool = (): Tool => ({
    name: 'OPEN_BROWSER',
    description: 'Open a URL or perform a Google search in the default web browser.',
    permission: 'execute',
    schema: {
        params: {
            url: {
                type: 'string',
                required: false,
                description: 'The URL to open. If omitted, uses the query to search.'
            },
            query: {
                type: 'string',
                required: false,
                description: 'The search query to perform on Google if URL is not provided.'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        try {
            let targetUrl = params.url;

            if (!targetUrl && params.query) {
                targetUrl = `https://www.google.com/search?q=${encodeURIComponent(params.query)}`;
            }

            if (!targetUrl) {
                return {
                    success: false,
                    error: 'Either url or query must be provided'
                };
            }

            // Basic validation
            if (!targetUrl.startsWith('http')) {
                targetUrl = 'https://' + targetUrl;
            }

            Logger.info(LogDomain.TOOLS, `[Browser] Opening: ${targetUrl}`);
            await shell.openExternal(targetUrl);

            return {
                success: true,
                data: {
                    url: targetUrl,
                    opened: true
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
