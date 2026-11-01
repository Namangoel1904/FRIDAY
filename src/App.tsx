import { useEffect, useState } from 'react';
import { JarvisHUD } from './JarvisHUD';

interface StatusUpdate {
    state: 'initializing' | 'idle' | 'listening' | 'speaking' | 'processing';
}

function App() {
    const [status, setStatus] = useState<StatusUpdate['state']>('initializing');

    useEffect(() => {
        if (window.electron?.onStatusUpdate) {
            window.electron.onStatusUpdate((data: StatusUpdate) => {
                setStatus(data.state);
            });
        }

        if (window.electron?.rendererReady) {
            window.electron.rendererReady();
        }
    }, []);

    return <JarvisHUD status={status} />;
}

export default App;
