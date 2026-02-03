// ipcHandlers.ts

import { ipcMain, app, nativeImage, screen } from "electron";
import fs from "node:fs";

import { AppState } from "./main";

type Rect = { x: number; y: number; width: number; height: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function safeHandle(
  channel: string,
  handler: Parameters<typeof ipcMain.handle>[1]
): void {
  // Prevent “Attempted to register a second handler” during dev reloads
  try {
    ipcMain.removeHandler(channel);
  } catch {
    // ignore
  }
  ipcMain.handle(channel, handler);
}

export function initializeIpcHandlers(appState: AppState): void {
  safeHandle(
    "update-content-dimensions",
    async (_event, { width, height }: { width: number; height: number }) => {
      if (width && height) appState.setWindowDimensions(width, height);
      return { success: true };
    }
  );

  safeHandle("delete-screenshot", async (_event, path: string) => {
    return appState.deleteScreenshot(path);
  });

  safeHandle("take-screenshot", async () => {
    const screenshotPath = await appState.takeScreenshot();
    const preview = await appState.getImagePreview(screenshotPath);
    return { path: screenshotPath, preview };
  });

  safeHandle("get-screenshots", async () => {
    const paths =
      appState.getView() === "queue"
        ? appState.getScreenshotQueue()
        : appState.getExtraScreenshotQueue();

    const previews = await Promise.all(
      paths.map(async (path) => ({
        path,
        preview: await appState.getImagePreview(path),
      }))
    );

    return previews;
  });

  safeHandle("toggle-window", async () => {
    appState.toggleMainWindow();
    return { success: true };
  });

  safeHandle("reset-queues", async () => {
    try {
      appState.clearQueues();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) };
    }
  });

  // -----------------------------------------------------------
  // SNIPPING TOOL HANDLERS
  // -----------------------------------------------------------

  safeHandle("start-snip", async () => {
    appState.windowHelper.createSnippingWindow();
    return { success: true };
  });

  safeHandle("cancel-snip", async () => {
    appState.windowHelper.restoreWindowAfterSnip();
    appState.getMainWindow()?.webContents.send("reset-view");
    return { success: true };
  });

  safeHandle("snip-complete", async (_event, rect: Rect) => {
    const mainWindow = appState.getMainWindow();
    if (!mainWindow) return { success: false, error: "No main window" };

    try {
      // Get window offset (e.g. for menu bar/notch)
      const bounds = mainWindow.getBounds();

      // Hide our overlay window so it isn't captured
      mainWindow.setOpacity(0);
      mainWindow.hide();
      await sleep(200);

      // IMPORTANT: Don't call appState.takeScreenshot() here because that function
      // hides/shows the window internally. We already hid it; we want it to stay hidden.
      const fullPath = await appState.screenshotHelper.takeScreenshot(
        () => {},
        () => {}
      );

      // Restore window state (exit snipping mode) *before* sending UI events
      appState.windowHelper.restoreWindowAfterSnip();
      if (!mainWindow.isDestroyed()) mainWindow.setOpacity(1);

      // Load screenshot, scale rect for Retina/HiDPI, and clamp to bounds
      const image = nativeImage.createFromPath(fullPath);
      const size = image.getSize();

      const display = screen.getPrimaryDisplay();
      const scaleFactor = display.scaleFactor || 1;

      const scaled: Rect = {
        x: Math.round((rect.x + bounds.x) * scaleFactor),
        y: Math.round((rect.y + bounds.y) * scaleFactor),
        width: Math.round(rect.width * scaleFactor),
        height: Math.round(rect.height * scaleFactor),
      };

      // Clamp rect so nativeImage.crop never throws out-of-bounds
      const x = clamp(scaled.x, 0, Math.max(0, size.width - 1));
      const y = clamp(scaled.y, 0, Math.max(0, size.height - 1));
      const w = clamp(scaled.width, 1, Math.max(1, size.width - x));
      const h = clamp(scaled.height, 1, Math.max(1, size.height - y));

      const cropped = image.crop({ x, y, width: w, height: h });
      const buffer = cropped.toPNG();

      fs.writeFileSync(fullPath, buffer);

      const preview = `data:image/png;base64,${buffer.toString("base64")}`;

      // Update UI: exit snipping overlay + add screenshot to list
      mainWindow.webContents.send("reset-view");
      mainWindow.webContents.send("screenshot-taken", { path: fullPath, preview });

      // Run OCR and send result (this is what your React flow listens for)
      mainWindow.webContents.send("ocr-start");
      const text = await appState.screenshotHelper.extractTextFromImage(buffer);
      mainWindow.webContents.send("ocr-result", text);

      return { success: true, path: fullPath };
    } catch (error: any) {
      console.error("Snipping failed:", error);

      try {
        appState.windowHelper.restoreWindowAfterSnip();
      } catch {
        // ignore
      }

      const mw = appState.getMainWindow();
      if (mw && !mw.isDestroyed()) mw.setOpacity(1);

      return { success: false, error: error?.message ?? String(error) };
    }
  });

  // -----------------------------------------------------------
  // Existing handlers
  // -----------------------------------------------------------

  safeHandle("analyze-audio-base64", async (_event, data: string, mimeType: string) => {
    return appState.processingHelper.processAudioBase64(data, mimeType);
  });

  safeHandle("analyze-audio-file", async (_event, path: string) => {
    return appState.processingHelper.processAudioFile(path);
  });

  safeHandle("analyze-image-file", async (_event, path: string) => {
    return appState.processingHelper.getLLMHelper().analyzeImageFile(path);
  });

  safeHandle("gemini-chat", async (_event, message: string) => {
    return appState.processingHelper.getLLMHelper().chatWithGemini(message);
  });

  safeHandle("quit-app", async () => {
    app.quit();
    return { success: true };
  });

  safeHandle("move-window-left", async () => {
    appState.moveWindowLeft();
    return { success: true };
  });

  safeHandle("move-window-right", async () => {
    appState.moveWindowRight();
    return { success: true };
  });

  safeHandle("move-window-up", async () => {
    appState.moveWindowUp();
    return { success: true };
  });

  safeHandle("move-window-down", async () => {
    appState.moveWindowDown();
    return { success: true };
  });

  safeHandle("center-and-show-window", async () => {
    appState.centerAndShowWindow();
    return { success: true };
  });

  safeHandle("get-current-llm-config", async () => {
    const llmHelper = appState.processingHelper.getLLMHelper();
    return {
      provider: llmHelper.getCurrentProvider(),
      model: llmHelper.getCurrentModel(),
      isOllama: llmHelper.isUsingOllama(),
    };
  });

  safeHandle("get-available-ollama-models", async () => {
    const llmHelper = appState.processingHelper.getLLMHelper();
    return llmHelper.getOllamaModels();
  });

  safeHandle("switch-to-ollama", async (_event, model?: string, url?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToOllama(model, url);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) };
    }
  });

  safeHandle("switch-to-gemini", async (_event, apiKey?: string) => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      await llmHelper.switchToGemini(apiKey);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) };
    }
  });

  safeHandle("test-llm-connection", async () => {
    try {
      const llmHelper = appState.processingHelper.getLLMHelper();
      return await llmHelper.testConnection();
    } catch (error: any) {
      return { success: false, error: error?.message ?? String(error) };
    }
  });
}
