import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Tool, ToolResult } from '../tool-registry.js';
import { EnvironmentContext } from '../environment-context.js';
import { Logger, LogDomain } from '../../logger.js';

// ─── Blacklisted command patterns ─────────────────────────────────────────────
const BLACKLIST: Array<{ pattern: RegExp; reason: string }> = [
    { pattern: /npm\s+install\s+-g/i, reason: 'Global npm install is blocked.' },
    { pattern: /rm\s+-rf\s/i, reason: 'Recursive force-delete is blocked.' },
    { pattern: /rmdir\s+\/s/i, reason: 'Recursive directory removal is blocked.' },
    { pattern: /del\s+\/s/i, reason: 'Recursive file deletion is blocked.' },
    { pattern: /taskkill/i, reason: 'Process termination is blocked.' },
    { pattern: /Set-ExecutionPolicy/i, reason: 'Changing PowerShell execution policy is blocked.' },
    { pattern: /format\s+[a-z]:/i, reason: 'Disk formatting is blocked.' },
    { pattern: /reg\s+(delete|add)/i, reason: 'Registry modification is blocked.' },
    { pattern: /shutdown/i, reason: 'System shutdown is blocked.' },
    { pattern: /schtasks\s+\/(create|delete)/i, reason: 'Scheduled task modification is blocked.' },
];

const MAX_OUTPUT_LENGTH = 8000; // Cap output to prevent context overflow
const EXEC_TIMEOUT_MS = 30_000; // 30 second timeout

export const createExecuteCommandTool = (envContext: EnvironmentContext): Tool => ({
    name: 'EXECUTE_COMMAND',
    description: 'Execute a shell command in the current working directory and return stdout/stderr.',
    permission: 'execute',
    schema: {
        params: {
            command: {
                type: 'string',
                required: true,
                description: 'The shell command to execute.'
            }
        }
    },
    executor: async (params): Promise<ToolResult> => {
        const command: string = params.command;

        if (!command || !command.trim()) {
            return { success: false, error: 'No command provided.' };
        }

        // ─── Blacklist check ──────────────────────────────────────────────
        for (const entry of BLACKLIST) {
            if (entry.pattern.test(command)) {
                Logger.warn(LogDomain.TOOLS, `[ExecuteCommand] BLOCKED: "${command}" — ${entry.reason}`);
                return {
                    success: false,
                    error: `SECURITY OVERRIDE: ${entry.reason} Destructive or global command blocked.`
                };
            }
        }

        // ─── Python venv enforcement ──────────────────────────────────────
        let finalCommand = command;
        const isKiCadPython = /KiCad.*python/i.test(command);
        const isPythonRelated = /\b(pip\s+install|python|python3)\b/i.test(command);
        if (isPythonRelated && !isKiCadPython) {
            const cwd = envContext.cwd;
            const venvPath = path.join(cwd, '.venv');
            const venvActivate = path.join(venvPath, 'Scripts', 'activate.bat');

            if (!fs.existsSync(venvActivate)) {
                Logger.info(LogDomain.TOOLS, `[ExecuteCommand] No venv found at ${venvPath}. Creating one first.`);
                // Chain: create venv → activate → run original command
                finalCommand = `python -m venv "${venvPath}" && "${venvActivate}" && ${command}`;
            } else {
                // Activate existing venv before running the command
                finalCommand = `"${venvActivate}" && ${command}`;
            }
            Logger.info(LogDomain.TOOLS, `[ExecuteCommand] Python venv enforced: ${finalCommand}`);
        }

        Logger.info(LogDomain.TOOLS, `[ExecuteCommand] Running: ${finalCommand}`);
        Logger.info(LogDomain.TOOLS, `[ExecuteCommand] CWD: ${envContext.cwd}`);

        return new Promise<ToolResult>((resolve) => {
            exec(finalCommand, {
                cwd: envContext.cwd,
                timeout: EXEC_TIMEOUT_MS,
                maxBuffer: 1024 * 1024, // 1 MB
                shell: 'cmd.exe',
            }, (error, stdout, stderr) => {
                const truncate = (s: string) => s.length > MAX_OUTPUT_LENGTH
                    ? s.substring(0, MAX_OUTPUT_LENGTH) + '\n...(truncated)'
                    : s;

                if (error) {
                    Logger.warn(LogDomain.TOOLS, `[ExecuteCommand] Error: ${error.message}`);
                    resolve({
                        success: false,
                        data: {
                            exitCode: error.code ?? 1,
                            stdout: truncate(stdout || ''),
                            stderr: truncate(stderr || error.message),
                        },
                        error: `Command failed with exit code ${error.code ?? 1}`
                    });
                    return;
                }

                Logger.info(LogDomain.TOOLS, `[ExecuteCommand] Completed successfully.`);
                resolve({
                    success: true,
                    data: {
                        exitCode: 0,
                        stdout: truncate(stdout || '(no output)'),
                        stderr: truncate(stderr || ''),
                    }
                });
            });
        });
    }
});
