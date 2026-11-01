import { Logger, LogDomain } from '../logger.js';

export type PermissionLevel = 'read' | 'write' | 'execute';

export interface ToolSchema {
    params: Record<string, {
        type: string;
        required: boolean;
        description?: string;
    }>;
}

export interface ToolResult {
    success: boolean;
    data?: any;
    error?: string;
}

export interface Tool {
    name: string;
    description: string;
    permission: PermissionLevel;
    schema: ToolSchema;
    executor: (params: any) => Promise<ToolResult>;
}

export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    register(tool: Tool): void {
        if (this.tools.has(tool.name)) {
            Logger.warn(LogDomain.TOOLS, `[ToolRegistry] Tool '${tool.name}' already registered, overwriting.`);
        }
        this.tools.set(tool.name, tool);
        Logger.debug(LogDomain.TOOLS, `Registered tool: ${tool.name} (${tool.permission})`);
    }

    getTool(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    requiresPermission(toolName: string): boolean {
        const tool = this.getTool(toolName);
        if (!tool) return false;
        return tool.permission === 'write' || tool.permission === 'execute';
    }

    async execute(toolName: string, params: any): Promise<ToolResult> {
        const tool = this.getTool(toolName);

        if (!tool) {
            return {
                success: false,
                error: `Tool '${toolName}' not found`
            };
        }

        // Validate required parameters
        const validation = this.validateParams(tool, params);
        if (!validation.valid) {
            return {
                success: false,
                error: `Invalid parameters: ${validation.error}`
            };
        }

        try {
            Logger.info(LogDomain.TOOLS, `Executing ${toolName}`, params);
            const result = await tool.executor(params);

            // Only log completion details at DEBUG to avoid clutter
            Logger.debug(LogDomain.TOOLS, `${toolName} completed`, result);
            return result;
        } catch (error) {
            Logger.error(LogDomain.TOOLS, `${toolName} failed`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Tool execution failed'
            };
        }
    }

    private validateParams(tool: Tool, params: any): { valid: boolean; error?: string } {
        for (const [paramName, paramDef] of Object.entries(tool.schema.params)) {
            if (paramDef.required && !params[paramName]) {
                return {
                    valid: false,
                    error: `Missing required parameter: ${paramName}`
                };
            }
        }
        return { valid: true };
    }
}
