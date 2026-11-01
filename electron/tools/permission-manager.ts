import { Logger, LogDomain } from '../logger.js';

export type UserResponse = 'yes' | 'no' | 'cancel' | null;

export class PermissionManager {
    private pendingPermission: {
        toolName: string;
        params: any;
        resolve: (approved: boolean) => void;
    } | null = null;

    async requestPermission(toolName: string, params: any, askCallback: (message: string) => void): Promise<boolean> {
        return new Promise((resolve) => {
            this.pendingPermission = { toolName, params, resolve };

            // Generate permission request message
            const message = this.generatePermissionMessage(toolName, params);
            Logger.info(LogDomain.SYSTEM, `Requesting permission: ${message}`);

            // Callback to speak the permission request
            askCallback(message);
        });
    }

    handleUserResponse(transcript: string): boolean {
        if (!this.pendingPermission) {
            return false; // No pending permission
        }

        const response = this.parseUserResponse(transcript);
        Logger.debug(LogDomain.SYSTEM, `User response parsed as: ${response}`);

        if (response === 'yes') {
            this.pendingPermission.resolve(true);
            this.pendingPermission = null;
            return true;
        } else if (response === 'no' || response === 'cancel') {
            this.pendingPermission.resolve(false);
            this.pendingPermission = null;
            return true;
        }

        return false; // Not a clear response, still waiting
    }

    parseUserResponse(transcript: string): UserResponse {
        const lower = transcript.toLowerCase().trim();

        // Positive responses
        if (lower.includes('yes') || lower.includes('confirm') ||
            lower.includes('go ahead') || lower.includes('sure') ||
            lower.includes('okay') || lower.includes('ok')) {
            return 'yes';
        }

        // Negative responses
        if (lower.includes('no') || lower.includes('cancel') ||
            lower.includes('abort') || lower.includes('stop') ||
            lower.includes('don\'t')) {
            return 'cancel';
        }

        return null;
    }

    hasPendingPermission(): boolean {
        return this.pendingPermission !== null;
    }

    cancelPending(): void {
        if (this.pendingPermission) {
            this.pendingPermission.resolve(false);
            this.pendingPermission = null;
            Logger.info(LogDomain.SYSTEM, 'Pending permission cancelled');
        }
    }

    private generatePermissionMessage(toolName: string, params: any): string {
        switch (toolName) {
            case 'CREATE_FOLDER':
            case 'create_folder': // legacy/fallback
                return `Create folder at ${params.path}? Say yes to confirm or cancel to abort.`;
            case 'OPEN_PATH':
            case 'open_file': // legacy/fallback
                return `Open ${params.path}? Say yes to confirm or cancel to abort.`;
            default:
                return `Execute ${toolName}? Say yes to confirm or cancel to abort.`;
        }
    }
}
