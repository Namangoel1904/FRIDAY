export {};

type FridayStatus = 'initializing' | 'idle' | 'listening' | 'speaking' | 'processing';

declare global {
    interface Window {
        electron?: {
            onStatusUpdate: (callback: (data: {
                state: FridayStatus;
                tool?: string;
                cwd?: string;
            }) => void) => void;
            rendererReady: () => void;
        };
    }
}
