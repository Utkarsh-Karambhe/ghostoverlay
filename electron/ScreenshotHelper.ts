import { join } from "path"
import { app } from "electron"
import * as fs from "fs"
import { exec } from "child_process"
import { promisify } from "util"
import Tesseract from 'tesseract.js';
import { v4 as uuidv4 } from "uuid"
import { createWorker } from 'tesseract.js';

// Use native macOS command for reliability
const execAsync = promisify(exec)

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 5

  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string

  private view: "queue" | "solutions" = "queue"

  constructor(view: "queue" | "solutions" = "queue") {
    this.view = view

    // Initialize directories
    this.screenshotDir = join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = join(
      app.getPath("userData"),
      "extra_screenshots"
    )

    // Create directories if they don't exist
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true })
    }
    if (!fs.existsSync(this.extraScreenshotDir)) {
      fs.mkdirSync(this.extraScreenshotDir, { recursive: true })
    }
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue
  }

  public getExtraScreenshotQueue(): string[] {
    return this.extraScreenshotQueue
  }

  public clearQueues(): void {
    const clearDir = (dir: string) => {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          try {
            fs.unlinkSync(join(dir, file))
          } catch (e) {
            console.error(`Failed to delete ${file}`, e)
          }
        }
      }
    }

    clearDir(this.screenshotDir)
    clearDir(this.extraScreenshotDir)
    
    this.screenshotQueue = []
    this.extraScreenshotQueue = []
  }

  /**
   * EXTRACT TEXT FROM IMAGE (OCR)
   */
    /**
   * EXTRACT TEXT FROM IMAGE (OCR)
   */
      /**
   * EXTRACT TEXT FROM IMAGE (OCR)
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      console.log("Running OCR on screenshot...");
      
      // Simple approach: just use recognize() directly
      // Tesseract.js will download the language file if needed
      const { data: { text } } = await Tesseract.recognize(
        imageBuffer,
        'eng'
      );
      
      console.log(`OCR Extracted ${text.length} characters.`);
      return text.trim();
      
    } catch (error) {
      console.error("OCR Failed:", error);
      return ""; // Return empty string, not error message
    }
  }

  

  public async takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void
  ): Promise<string> {
    try {
      hideMainWindow()
      
      // Wait for window to disappear animation (increased to 300ms)
      await new Promise(resolve => setTimeout(resolve, 300))

      let screenshotPath = ""
      const filename = `${uuidv4()}.png`

      if (this.view === "queue") {
        screenshotPath = join(this.screenshotDir, filename)
      } else {
        screenshotPath = join(this.extraScreenshotDir, filename)
      }

      console.log(`Taking screenshot to: ${screenshotPath}`)

      // USE NATIVE MACOS COMMAND
      // -m: Capture MAIN monitor (fixes the tiny screenshot bug)
      // -x: No sound
      // -C: Capture cursor
      // -t png: Force PNG format
      await execAsync(`screencapture -m -x -C -t png "${screenshotPath}"`)

      // Wait for file to exist
      await this.waitForFile(screenshotPath, 5000)

      // Add to queue
      if (this.view === "queue") {
        this.screenshotQueue.push(screenshotPath)
        this.manageQueueSize(this.screenshotQueue)
      } else {
        this.extraScreenshotQueue.push(screenshotPath)
        this.manageQueueSize(this.extraScreenshotQueue)
      }

      return screenshotPath

    } catch (error: any) {
      console.error("Error taking screenshot:", error)
      // Check for common permission error text
      if (error.stderr && error.stderr.includes("permission")) {
        throw new Error("Permission denied. Please allow Screen Recording for Terminal/VS Code in System Settings.")
      }
      throw new Error(`Failed to take screenshot: ${error.message}`)
    } finally {
      showMainWindow()
    }
  }

  private manageQueueSize(queue: string[]) {
    if (queue.length > this.MAX_SCREENSHOTS) {
      const removedPath = queue.shift()
      if (removedPath) {
        try {
          if (fs.existsSync(removedPath)) fs.unlinkSync(removedPath)
        } catch (error) {
          console.error("Error removing old screenshot:", error)
        }
      }
    }
  }

  public async getImagePreview(filepath: string): Promise<string> {
    try {
      const data = await fs.promises.readFile(filepath)
      return `data:image/png;base64,${data.toString("base64")}`
    } catch (error) {
      console.error("Error reading image:", error)
      throw error
    }
  }

  public async deleteScreenshot(path: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (fs.existsSync(path)) fs.unlinkSync(path)
      
      this.screenshotQueue = this.screenshotQueue.filter(p => p !== path)
      this.extraScreenshotQueue = this.extraScreenshotQueue.filter(p => p !== path)
      
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  private async waitForFile(filePath: string, timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (true) {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath)
        if (stats.size > 0) return
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Screenshot file not found after ${timeoutMs}ms`)
      }
      await new Promise(res => setTimeout(res, 100))
    }
  }
}
