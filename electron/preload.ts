import { contextBridge, ipcRenderer } from 'electron';

type StatusUpdate = {
    state: 'initializing' | 'idle' | 'listening' | 'speaking' | 'processing';
    tool?: string;
    cwd?: string;
};

contextBridge.exposeInMainWorld('electron', {
    onStatusUpdate: (callback: (data: StatusUpdate) => void) => {
        ipcRenderer.on('status-update', (_event, data) => callback(data));
    },
    rendererReady: () => {
        ipcRenderer.send('renderer-ready');
    }
});
