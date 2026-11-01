import * as fs from 'fs';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext } from '../environment-context.js';
import { Logger, LogDomain } from '../../logger.js';

export const createChangeDirectoryTool = (envContext: EnvironmentContext): Tool => ({
    name: 'CHANGE_DIRECTORY',
    description: "Change FRIDAY's current working directory for future relative file operations.",
    permission: 'read',
    schema: {
        params: {
            path: {
                type: 'string',
                required: true,
                description: 'Directory path to make current'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        try {
            const targetPath = envContext.resolvePath(params.path);

            Logger.info(LogDomain.TOOLS, `[ChangeDirectory] Switching to: ${targetPath}`);

            if (!fs.existsSync(targetPath)) {
                return {
                    success: false,
                    error: `Directory not found: ${targetPath}`
                };
            }

            const stat = fs.statSync(targetPath);
            if (!stat.isDirectory()) {
                return {
                    success: false,
                    error: `Path is not a directory: ${targetPath}`
                };
            }

            envContext.cwd = targetPath;

            return {
                success: true,
                data: {
                    cwd: envContext.cwd
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
