export enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3,
    TRACE = 4
}

export enum LogDomain {
    SYSTEM = 'SYSTEM',
    AUDIO = 'AUDIO',
    GEMINI = 'GEMINI',
    WAKE = 'WAKE',
    TOOLS = 'TOOLS',
    ENV = 'ENV',
    UI = 'UI',
    SCREEN = 'SCREEN',
    VISION = 'VISION'
}

export class Logger {
    private static level: LogLevel = LogLevel.INFO;

    static initialize() {
        const envLevel = process.env.FRIDAY_LOG_LEVEL?.toUpperCase();
        if (envLevel) {
            switch (envLevel) {
                case 'ERROR': this.level = LogLevel.ERROR; break;
                case 'WARN': this.level = LogLevel.WARN; break;
                case 'INFO': this.level = LogLevel.INFO; break;
                case 'DEBUG': this.level = LogLevel.DEBUG; break;
                case 'TRACE': this.level = LogLevel.TRACE; break;
            }
        }
        console.log(`[Logger] Initialized at level: ${LogLevel[this.level]}`);
    }

    private static shouldLog(level: LogLevel): boolean {
        return level <= this.level;
    }

    private static format(level: LogLevel, domain: LogDomain, message: string): string {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, -1); // HH:mm:ss.sss
        return `[${timestamp}] [${LogLevel[level]}] [${domain}] ${message}`;
    }

    static error(domain: LogDomain, message: string, meta?: any) {
        if (this.shouldLog(LogLevel.ERROR)) {
            console.error(this.format(LogLevel.ERROR, domain, message), meta || '');
        }
    }

    static warn(domain: LogDomain, message: string, meta?: any) {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.format(LogLevel.WARN, domain, message), meta || '');
        }
    }

    static info(domain: LogDomain, message: string, meta?: any) {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.format(LogLevel.INFO, domain, message), meta || '');
        }
    }

    static debug(domain: LogDomain, message: string, meta?: any) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(this.format(LogLevel.DEBUG, domain, message), meta || '');
        }
    }

    static trace(domain: LogDomain, message: string, meta?: any) {
        if (this.shouldLog(LogLevel.TRACE)) {
            console.log(this.format(LogLevel.TRACE, domain, message), meta || '');
        }
    }
}

// Auto-initialize on import if needed, or call Logger.initialize() in main
Logger.initialize();
