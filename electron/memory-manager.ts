import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger, LogDomain } from './logger.js';

// ─── Persistent Memory for FRIDAY ─────────────────────────────────────────────
// Stored at: %USERPROFILE%/.friday/friday-memory.json

export interface FridayMemory {
    userName: string;
    todos: Array<{ id: string; text: string; done: boolean; createdAt: string }>;
    activeProjects: Array<{ name: string; path?: string; notes?: string }>;
    generalNotes: string;
}

const DEFAULT_MEMORY: FridayMemory = {
    userName: 'Boss',
    todos: [],
    activeProjects: [],
    generalNotes: '',
};

export class MemoryManager {
    private memoryPath: string;
    private memory: FridayMemory;

    constructor() {
        const fridayDir = path.join(os.homedir(), '.friday');
        if (!fs.existsSync(fridayDir)) {
            fs.mkdirSync(fridayDir, { recursive: true });
        }
        this.memoryPath = path.join(fridayDir, 'friday-memory.json');
        this.memory = this.load();
        Logger.info(LogDomain.SYSTEM, `Memory loaded from ${this.memoryPath}`);
    }

    // ─── Read / Write ─────────────────────────────────────────────────────────
    private load(): FridayMemory {
        try {
            if (fs.existsSync(this.memoryPath)) {
                const raw = fs.readFileSync(this.memoryPath, 'utf-8');
                return { ...DEFAULT_MEMORY, ...JSON.parse(raw) };
            }
        } catch (err) {
            Logger.error(LogDomain.SYSTEM, 'Failed to load memory, resetting', err);
        }
        return { ...DEFAULT_MEMORY };
    }

    private save(): void {
        try {
            fs.writeFileSync(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf-8');
            Logger.debug(LogDomain.SYSTEM, 'Memory saved to disk');
        } catch (err) {
            Logger.error(LogDomain.SYSTEM, 'Failed to save memory', err);
        }
    }

    // ─── Public Getters ───────────────────────────────────────────────────────
    get snapshot(): FridayMemory {
        return { ...this.memory };
    }

    /** Serialized summary for system-prompt injection */
    toPromptString(): string {
        const m = this.memory;
        const todoList = m.todos.length
            ? m.todos.map((t, i) => `  ${i + 1}. [${t.done ? 'x' : ' '}] ${t.text}`).join('\n')
            : '  (none)';
        const projects = m.activeProjects.length
            ? m.activeProjects.map(p => `  - ${p.name}${p.path ? ` (${p.path})` : ''}${p.notes ? `: ${p.notes}` : ''}`).join('\n')
            : '  (none)';
        return [
            `User preferred name: ${m.userName}`,
            `Todos:\n${todoList}`,
            `Active Projects:\n${projects}`,
            m.generalNotes ? `General Notes: ${m.generalNotes}` : '',
        ].filter(Boolean).join('\n');
    }

    // ─── Tool Handlers ────────────────────────────────────────────────────────
    addMemory(params: { category: string; text: string; projectName?: string; projectPath?: string }): { success: boolean; detail: string } {
        const { category, text } = params;

        switch (category) {
            case 'todo': {
                const id = `todo_${Date.now()}`;
                this.memory.todos.push({ id, text, done: false, createdAt: new Date().toISOString() });
                this.save();
                return { success: true, detail: `Added todo: "${text}"` };
            }
            case 'project': {
                this.memory.activeProjects.push({
                    name: text,
                    path: params.projectPath,
                    notes: '',
                });
                this.save();
                return { success: true, detail: `Added project: "${text}"` };
            }
            case 'note': {
                this.memory.generalNotes = this.memory.generalNotes
                    ? `${this.memory.generalNotes}\n${text}`
                    : text;
                this.save();
                return { success: true, detail: 'Note saved.' };
            }
            default:
                return { success: false, detail: `Unknown category: ${category}` };
        }
    }

    removeMemory(params: { category: string; identifier: string }): { success: boolean; detail: string } {
        const { category, identifier } = params;

        switch (category) {
            case 'todo': {
                const idx = this.memory.todos.findIndex(
                    t => t.id === identifier || t.text.toLowerCase().includes(identifier.toLowerCase())
                );
                if (idx === -1) return { success: false, detail: `Todo not found: "${identifier}"` };
                const removed = this.memory.todos.splice(idx, 1);
                this.save();
                return { success: true, detail: `Removed todo: "${removed[0].text}"` };
            }
            case 'project': {
                const idx = this.memory.activeProjects.findIndex(
                    p => p.name.toLowerCase().includes(identifier.toLowerCase())
                );
                if (idx === -1) return { success: false, detail: `Project not found: "${identifier}"` };
                const removed = this.memory.activeProjects.splice(idx, 1);
                this.save();
                return { success: true, detail: `Removed project: "${removed[0].name}"` };
            }
            case 'note': {
                this.memory.generalNotes = '';
                this.save();
                return { success: true, detail: 'Cleared general notes.' };
            }
            default:
                return { success: false, detail: `Unknown category: ${category}` };
        }
    }

    getMemory(): { success: boolean; data: FridayMemory } {
        return { success: true, data: this.snapshot };
    }
}
