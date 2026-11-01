import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext, FileMetadata } from '../environment-context.js';
import { Logger, LogDomain } from '../../logger.js';

export const createListDirectoryTool = (envContext: EnvironmentContext): Tool => ({
    name: 'LIST_DIRECTORY',
    description: 'List files and folders in a directory. Returns absolute paths.',
    permission: 'read',
    schema: {
        params: {
            path: {
                type: 'string',
                required: true,
                description: 'Path to the directory to list'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        try {
            const dirPath = envContext.resolvePath(params.path);

            Logger.info(LogDomain.TOOLS, `[ListDirectory] Listing: ${dirPath}`);

            if (!fs.existsSync(dirPath)) {
                return {
                    success: false,
                    error: `Directory not found: ${dirPath}`
                };
            }

            const stat = fs.statSync(dirPath);
            if (!stat.isDirectory()) {
                return {
                    success: false,
                    error: `Path is not a directory: ${dirPath}`
                };
            }

            const files = fs.readdirSync(dirPath);
            const items: FileMetadata[] = files.map(file => {
                const fullPath = path.join(dirPath, file);
                try {
                    const stat = fs.statSync(fullPath);
                    return {
                        name: file,
                        path: fullPath,
                        type: stat.isDirectory() ? 'folder' as const : 'file' as const,
                        size: stat.isFile() ? stat.size : undefined
                    };
                } catch {
                    return {
                        name: file,
                        path: fullPath,
                        type: 'file' as const
                    };
                }
            });

            // Store in environment context
            envContext.setLastListedDirectory(dirPath);

            Logger.info(LogDomain.TOOLS, `[ListDirectory] Found ${items.length} items`);
            items.slice(0, 5).forEach(i => Logger.debug(LogDomain.TOOLS, `  - [${i.type}] ${i.name}`));

            return {
                success: true,
                data: {
                    path: dirPath,
                    count: items.length,
                    items
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
