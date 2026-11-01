import * as path from 'path';
import * as os from 'os';
import { Logger, LogDomain } from '../logger.js';

export interface FileMetadata {
    name: string;
    path: string;
    type: 'file' | 'folder';
    size?: number;
}

export class EnvironmentContext {
    private _cwd: string;
    private _homeDir: string;
    private _downloadsDir: string;
    private _lastSearchResults: FileMetadata[] = [];
    private _lastListedDirectory: string | null = null;

    constructor() {
        this._homeDir = process.env.USERPROFILE || process.env.HOME || os.homedir();
        this._downloadsDir = path.join(this._homeDir, 'Downloads');

        // Start in Home directory by default
        this._cwd = this._homeDir;

        Logger.info(LogDomain.ENV, 'EnvironmentContext Initialized');
        Logger.info(LogDomain.ENV, `HOME: ${this._homeDir}`);
        Logger.info(LogDomain.ENV, `CWD: ${this._cwd}`);
    }

    get cwd(): string {
        return this._cwd;
    }

    get homeDir(): string {
        return this._homeDir;
    }

    get downloadsDir(): string {
        return this._downloadsDir;
    }

    set cwd(newCwd: string) {
        if (!path.isAbsolute(newCwd)) {
            Logger.warn(LogDomain.ENV, `Attempted to set relative CWD: ${newCwd}. Ignoring.`);
            return;
        }
        this._cwd = path.resolve(newCwd);
        Logger.info(LogDomain.ENV, `CWD updated to: ${this._cwd}`);
    }

    get lastSearchResults(): FileMetadata[] {
        return this._lastSearchResults;
    }

    setLastSearchResults(results: FileMetadata[]) {
        this._lastSearchResults = results;
        Logger.debug(LogDomain.ENV, `Stored ${results.length} search results`);
    }

    get lastListedDirectory(): string | null {
        return this._lastListedDirectory;
    }

    setLastListedDirectory(dir: string | null) {
        this._lastListedDirectory = dir;
        Logger.debug(LogDomain.ENV, `Last listed directory: ${dir}`);
    }

    /**
     * Resolve a path to absolute.
     */
    resolvePath(inputPath: string): string {
        if (path.isAbsolute(inputPath)) {
            return path.normalize(inputPath);
        }
        const resolved = path.resolve(this._cwd, inputPath);
        Logger.debug(LogDomain.ENV, `Resolving '${inputPath}' -> '${resolved}'`);
        return resolved;
    }

    clearResults() {
        this._lastSearchResults = [];
        this._lastListedDirectory = null;
        Logger.debug(LogDomain.ENV, 'Cleared all stored results');
    }
}
