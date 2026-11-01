import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext } from '../environment-context.js';
import { Logger, LogDomain } from '../../logger.js';

// ─── Directories & extensions to always skip ──────────────────────────────────
const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.next', '.nuxt', '__pycache__', '.venv', 'venv',
    'dist', 'build', 'out', '.idea', '.vscode', '.cache', 'coverage',
    'vendor', 'bower_components', '.svn',
]);

const IGNORE_FILES = new Set(['.env', '.env.local', '.env.production']);

const BINARY_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp',
    '.mp3', '.mp4', '.avi', '.mov', '.wav', '.ogg', '.webm',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.pyc', '.class', '.o', '.obj',
    '.lock', // package-lock.json etc are huge
]);

// Files to always try to read (priority files)
const PRIORITY_FILES = new Set([
    'package.json', 'readme.md', 'readme.txt', 'readme',
    'tsconfig.json', 'tsconfig.electron.json',
    'vite.config.ts', 'vite.config.js',
    'next.config.ts', 'next.config.js',
    '.env.example', 'cargo.toml', 'requirements.txt',
    'pyproject.toml', 'setup.py', 'setup.cfg',
    'makefile', 'dockerfile', 'docker-compose.yml',
]);

const MAX_TREE_DEPTH = 4;
const MAX_FILE_READ_BYTES = 8000; // ~8 KB per file
const MAX_TOTAL_PAYLOAD = 120_000; // ~120 KB total response budget

export const createAnalyzeProjectTool = (envContext: EnvironmentContext): Tool => ({
    name: 'ANALYZE_PROJECT',
    description: 'Ingest and analyze a project directory: generate a tree, read key files, and return a structured summary.',
    permission: 'read',
    schema: {
        params: {
            projectDirectory: {
                type: 'string',
                required: true,
                description: 'Absolute or relative path to the project root.'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        try {
            const rootDir = envContext.resolvePath(params.projectDirectory);

            if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
                return { success: false, error: `Not a valid directory: ${rootDir}` };
            }

            Logger.info(LogDomain.TOOLS, `[AnalyzeProject] Scanning: ${rootDir}`);

            // 1. Build directory tree
            const tree = buildTree(rootDir, '', 0);

            // 2. Read priority/entry-point files
            const fileContents = readKeyFiles(rootDir, 0);

            // 3. Assemble payload
            let payload = `## Project Tree\n\`\`\`\n${tree}\n\`\`\`\n\n## Key File Contents\n`;
            let totalSize = Buffer.byteLength(payload, 'utf-8');

            for (const { relativePath, content } of fileContents) {
                const section = `\n### ${relativePath}\n\`\`\`\n${content}\n\`\`\`\n`;
                const sectionSize = Buffer.byteLength(section, 'utf-8');
                if (totalSize + sectionSize > MAX_TOTAL_PAYLOAD) {
                    payload += `\n(Truncated — payload budget reached at ${Math.round(totalSize / 1024)} KB)\n`;
                    break;
                }
                payload += section;
                totalSize += sectionSize;
            }

            Logger.info(LogDomain.TOOLS, `[AnalyzeProject] Done. Payload: ${Math.round(totalSize / 1024)} KB`);

            return {
                success: true,
                data: {
                    projectRoot: rootDir,
                    analysis: payload,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTree(dir: string, prefix: string, depth: number): string {
    if (depth > MAX_TREE_DEPTH) return `${prefix}...\n`;

    let result = '';
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return `${prefix}(permission denied)\n`;
    }

    // Sort: dirs first, then files
    entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const isLast = i === entries.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) {
                result += `${prefix}${connector}${entry.name}/ (ignored)\n`;
                continue;
            }
            result += `${prefix}${connector}${entry.name}/\n`;
            result += buildTree(path.join(dir, entry.name), prefix + childPrefix, depth + 1);
        } else {
            result += `${prefix}${connector}${entry.name}\n`;
        }
    }

    return result;
}

function readKeyFiles(dir: string, depth: number): Array<{ relativePath: string; content: string }> {
    if (depth > MAX_TREE_DEPTH) return [];

    const results: Array<{ relativePath: string; content: string }> = [];
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name)) continue;
            results.push(...readKeyFiles(fullPath, depth + 1));
            continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        const nameLower = entry.name.toLowerCase();

        // Skip binaries and ignored files
        if (BINARY_EXTENSIONS.has(ext)) continue;
        if (IGNORE_FILES.has(nameLower)) continue;

        // Only read priority files at root, or entry-point-looking files deeper
        const isPriority = PRIORITY_FILES.has(nameLower);
        const isEntryPoint = depth <= 1 && (
            nameLower.includes('main') || nameLower.includes('index') || nameLower.includes('app')
        );

        if (isPriority || isEntryPoint) {
            try {
                const stat = fs.statSync(fullPath);
                if (stat.size > MAX_FILE_READ_BYTES * 2) {
                    // Read only the beginning of very large files
                    const fd = fs.openSync(fullPath, 'r');
                    const buf = Buffer.alloc(MAX_FILE_READ_BYTES);
                    fs.readSync(fd, buf, 0, MAX_FILE_READ_BYTES, 0);
                    fs.closeSync(fd);
                    results.push({
                        relativePath: path.relative(dir, fullPath).replace(/\\/g, '/') || entry.name,
                        content: buf.toString('utf-8') + '\n... (truncated)',
                    });
                } else {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    results.push({
                        relativePath: path.relative(dir, fullPath).replace(/\\/g, '/') || entry.name,
                        content,
                    });
                }
            } catch {
                // Skip unreadable files
            }
        }
    }

    return results;
}
