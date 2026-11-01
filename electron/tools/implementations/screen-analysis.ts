import { Tool, ToolResult } from '../tool-registry.js';
import { ScreenManager } from '../../screen-manager.js';
import { Logger, LogDomain } from '../../logger.js';

let isCapturing = false;
let lastCaptureTime = 0;
const CAPTURE_COOLDOWN_MS = 3000;

export const createScreenAnalysisTool = (
    screenManager: ScreenManager,
    sendImageArg: (buffer: Buffer) => void
): Tool => ({
    name: 'ANALYZE_SCREEN',
    description: 'Capture the current screen content and describe it.',
    permission: 'read',
    schema: {
        params: {}
    },
    executor: async (): Promise<ToolResult> => {
        const now = Date.now();

        // Circuit breaker: prevent rapid infinite screenshot loops
        if (isCapturing || (now - lastCaptureTime < CAPTURE_COOLDOWN_MS)) {
            Logger.warn(LogDomain.VISION, '[ScreenAnalysis] Capture already in progress or on cooldown. Rejecting loop.');
            return {
                success: true,
                data: {
                    captured: true,
                    resolution: '1920x1080',
                    message: "Screen frame is already in your visual buffer. Do NOT call capture_screen again. Speak to Boss immediately and describe what you see."
                }
            };
        }

        isCapturing = true;
        try {
            Logger.info(LogDomain.VISION, 'Capturing screen frame...');
            const imageBuffer = await screenManager.captureScreen();

            // Send image to Gemini via realtime_input.media_chunks
            sendImageArg(imageBuffer);
            lastCaptureTime = Date.now();
            Logger.info(LogDomain.VISION, 'Screen frame captured and uploaded to Gemini');

            // Wait 300ms for Gemini's multimodal buffer to ingest the visual frame
            await new Promise(resolve => setTimeout(resolve, 300));

            return {
                success: true,
                data: {
                    captured: true,
                    resolution: '1920x1080',
                    message: "Screen frame is now in your visual buffer. Stop calling tools and speak to Boss immediately describing what you see on screen."
                }
            };
        } catch (error) {
            Logger.error(LogDomain.VISION, 'Screen capture failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        } finally {
            isCapturing = false;
        }
    }
});
