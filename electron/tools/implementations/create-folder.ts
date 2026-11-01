import * as fs from 'fs';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext } from '../environment-context.js';
import { validateSandbox } from '../sandbox.js';
import { Logger, LogDomain } from '../../logger.js';

export const createCreateFolderTool = (envContext: EnvironmentContext): Tool => ({
    name: 'CREATE_FOLDER',
    description: 'Create a new folder at the specified absolute path.',
    permission: 'write',
    schema: {
        params: {
            path: {
                type: 'string',
                required: true,
                description: 'Path where the folder should be created'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        try {
            const folderPath = envContext.resolvePath(params.path);

            // ─── Sandbox check ────────────────────────────────────────────
            const sandboxError = validateSandbox(folderPath);
            if (sandboxError) {
                Logger.warn(LogDomain.TOOLS, `[CreateFolder] BLOCKED: ${folderPath}`);
                return { success: false, error: sandboxError };
            }

            Logger.info(LogDomain.TOOLS, `[CreateFolder] Creating: ${folderPath}`);

            if (fs.existsSync(folderPath)) {
                return {
                    success: false,
                    error: `Path already exists: ${folderPath}`
                };
            }

            fs.mkdirSync(folderPath, { recursive: true });

            Logger.info(LogDomain.TOOLS, `[CreateFolder] Successfully created: ${folderPath}`);

            return {
                success: true,
                data: {
                    path: folderPath,
                    created: true
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
