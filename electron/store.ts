import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export class Store {
    private path: string;
    private data: any;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.path = path.join(userDataPath, 'friday-config.json');
        this.data = this.parseDataFile(this.path, { firstBoot: true });
    }

    private parseDataFile(filePath: string, defaults: any) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch {
            return defaults;
        }
    }

    get(key: string) {
        return this.data[key];
    }

    set(key: string, val: any) {
        this.data[key] = val;
        fs.writeFileSync(this.path, JSON.stringify(this.data));
    }
}
