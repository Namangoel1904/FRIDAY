import * as path from 'path';
import * as os from 'os';

// ─── Sandbox Path Validator ───────────────────────────────────────────────────
// Prevents FRIDAY from writing to dangerous system locations.

const HOME_DIR = path.resolve(
    process.env.USERPROFILE || process.env.HOME || os.homedir()
).toLowerCase();

// Exact directories where direct file/folder creation is FORBIDDEN
const BLOCKED_ROOTS = [
    'c:\\',
    HOME_DIR,
];

/**
 * Returns an error string if the target path is directly inside a forbidden
 * root, or null if the path is safe.
 */
export function validateSandbox(targetPath: string): string | null {
    const normalizedTarget = path.resolve(targetPath).toLowerCase();
    const parentDir = path.dirname(normalizedTarget);

    for (const blocked of BLOCKED_ROOTS) {
        // Block if the target IS the blocked root, or its parent IS the blocked root
        if (normalizedTarget === blocked || parentDir === blocked) {
            return `SECURITY OVERRIDE: Cannot write directly to root or user home directory. Please specify a subfolder (e.g., ${path.join(blocked, 'Downloads', 'MyProject')}).`;
        }
    }
    return null;
}
