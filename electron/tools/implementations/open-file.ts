import { shell } from 'electron';
import * as fs from 'fs';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext } from '../environment-context.js';
import { Logger, LogDomain } from '../../logger.js';

export const createOpenFileTool = (envContext: EnvironmentContext): Tool => ({
    name: 'OPEN_PATH',
    description: 'Open a file or folder with the default application using absolute path.',
    permission: 'execute',
    schema: {
        params: {
            path: {
                type: 'string',
                required: true,
                description: 'Path to the file or folder to open'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        try {
            const filePath = envContext.resolvePath(params.path);

            Logger.info(LogDomain.TOOLS, `[OpenFile] Opening: ${filePath}`);

            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    error: `Path not found: ${filePath}`
                };
            }

            const error = await shell.openPath(filePath);

            if (error) {
                return {
                    success: false,
                    error: `Failed to open: ${error}`
                };
            }

            Logger.info(LogDomain.TOOLS, `[OpenFile] Successfully opened: ${filePath}`);

            return {
                success: true,
                data: {
                    path: filePath,
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
