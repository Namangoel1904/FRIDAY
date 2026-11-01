import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext } from '../environment-context.js';
import { validateSandbox } from '../sandbox.js';
import { Logger, LogDomain } from '../../logger.js';

export const createCreateFileTool = (envContext: EnvironmentContext): Tool => ({
    name: 'CREATE_FILE',
    description: 'Create a new file at the specified path with the given content.',
    permission: 'write',
    schema: {
        params: {
            filePath: {
                type: 'string',
                required: true,
                description: 'Absolute or relative path for the new file'
            },
            content: {
                type: 'string',
                required: true,
                description: 'Text content to write into the file'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        try {
            const resolvedPath = envContext.resolvePath(params.filePath);

            // ─── Sandbox check ────────────────────────────────────────────
            const sandboxError = validateSandbox(resolvedPath);
            if (sandboxError) {
                Logger.warn(LogDomain.TOOLS, `[CreateFile] BLOCKED: ${resolvedPath}`);
                return { success: false, error: sandboxError };
            }

            const dir = path.dirname(resolvedPath);

            // Ensure parent directories exist
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                Logger.debug(LogDomain.TOOLS, `[CreateFile] Created parent dirs: ${dir}`);
            }

            Logger.info(LogDomain.TOOLS, `[CreateFile] Writing: ${resolvedPath}`);
            await fs.promises.writeFile(resolvedPath, params.content || '', 'utf-8');

            return {
                success: true,
                data: {
                    path: resolvedPath,
                    bytesWritten: Buffer.byteLength(params.content || '', 'utf-8'),
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
