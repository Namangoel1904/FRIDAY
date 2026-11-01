import { desktopCapturer } from 'electron';
import { Logger, LogDomain } from './logger.js';

export class ScreenManager {

    /**
     * Captures the primary display and returns it as a JPEG Buffer.
     */
    async captureScreen(): Promise<Buffer> {
        try {
            const startTime = Date.now();
            Logger.info(LogDomain.SCREEN, 'Capturing screen...');

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width: 1920, height: 1080 }
            });

            Logger.debug(LogDomain.SCREEN, `Available Sources: ${sources.map(s => `${s.name} (${s.id})`).join(', ')}`);

            // Prefer primary display or the first one available
            const primarySource = sources[0];

            if (!primarySource) {
                throw new Error('No screen sources found');
            }

            // Get thumbnail as JPEG
            const image = primarySource.thumbnail.toJPEG(80); // 80% quality

            const duration = Date.now() - startTime;
            const sizeKb = Math.round(image.length / 1024);

            Logger.info(LogDomain.SCREEN, `Screen captured (${primarySource.display_id || 'primary'}, 1920x1080, ${sizeKb}KB, ${duration}ms)`);

            return image;

        } catch (error) {
            Logger.error(LogDomain.SCREEN, 'Failed to capture screen', error);
            throw error;
        }
    }
}
