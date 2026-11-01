import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext, FileMetadata } from '../environment-context.js';
import { Logger, LogDomain } from '../../logger.js';

export const createFileSearchTool = (envContext: EnvironmentContext): Tool => ({
    name: 'FILE_SEARCH',
    description: 'Search for files by name in a directory. Returns absolute paths.',
    permission: 'read',
    schema: {
        params: {
            query: {
                type: 'string',
                required: true,
                description: 'File name or pattern to search for'
            },
            directory: {
                type: 'string',
                required: false,
                description: 'Directory to search in (defaults to user home)'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        const startTime = Date.now();
        const { query, directory } = params;
        const searchDir = directory ? envContext.resolvePath(directory) : envContext.cwd;

        Logger.info(LogDomain.TOOLS, `[FileSearch] STARTED (query="${query}", dir="${searchDir}")`);

        try {
            const results: FileMetadata[] = [];
            let searchComplete = false;

            // Search Logic
            const searchRecursive = async (dir: string, depth: number): Promise<void> => {
                if (searchComplete || depth > 3 || results.length >= 20) return;

                try {
                    const entries = await fs.promises.readdir(dir, { withFileTypes: true });

                    for (const entry of entries) {
                        if (searchComplete || results.length >= 20) break;

                        const fullPath = path.join(dir, entry.name);

                        // Match logic
                        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
                            results.push({
                                name: entry.name,
                                path: fullPath,
                                type: entry.isDirectory() ? 'folder' : 'file',
                                size: entry.isFile() ? (await fs.promises.stat(fullPath).catch(() => ({ size: 0 }))).size : undefined
                            });
                        }

                        // Recurse
                        if (entry.isDirectory()) {
                            await searchRecursive(fullPath, depth + 1);
                        }
                    }
                } catch {
                    // Ignore access errors
                }
            };

            // Timeout Wrapper
            const searchPromise = searchRecursive(searchDir, 0);

            const timeoutPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                    searchComplete = true; // Signal to stop recursion
                    resolve();
                }, 1000); // 1s Limit
            });

            await Promise.race([searchPromise, timeoutPromise]);

            const duration = Date.now() - startTime;

            // Store results
            envContext.setLastSearchResults(results);

            Logger.info(LogDomain.TOOLS, `[FileSearch] COMPLETED (${results.length} results, ${duration}ms)`);
            if (results.length > 0) {
                Logger.debug(LogDomain.TOOLS, `Top result: ${results[0].path}`);
            }

            return {
                success: true,
                data: {
                    query,
                    searchDirectory: searchDir,
                    count: results.length,
                    files: results.slice(0, 10), // Limit return payload
                    durationMs: duration
                }
            };

        } catch (error) {
            const duration = Date.now() - startTime;
            Logger.error(LogDomain.TOOLS, `[FileSearch] FAILED after ${duration}ms`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
});
