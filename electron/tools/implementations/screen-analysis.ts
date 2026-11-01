import { Tool, ToolResult } from '../tool-registry.js';
import { ScreenManager } from '../../screen-manager.js';
import { Logger, LogDomain } from '../../logger.js';

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
        try {
            const imageBuffer = await screenManager.captureScreen();

            // Send image to Gemini via realtime_input
            sendImageArg(imageBuffer);
            Logger.info(LogDomain.VISION, 'Image captured and sent to Gemini');

            // ─── Race condition fix ───────────────────────────────────────
            // Wait 800ms for the server to ingest the image frame before
            // we send the tool_response. Without this delay, the model
            // reads the stale previous frame and hallucinates.
            await new Promise(resolve => setTimeout(resolve, 800));

            return {
                success: true,
                data: {
                    captured: true,
                    resolution: '1920x1080',
                    message: "New screenshot uploaded. Analyze the LATEST frame in your visual buffer to answer the user."
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
});
