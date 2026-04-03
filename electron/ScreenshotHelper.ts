import { join } from "path"
import { app } from "electron"
import * as fs from "fs"
import { exec } from "child_process"
import { promisify } from "util"
import { createWorker, Worker as TesseractWorker } from 'tesseract.js';
import { v4 as uuidv4 } from "uuid"
import sharp from "sharp"

// Use native macOS command for reliability
const execAsync = promisify(exec)

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 5

  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string

  private view: "queue" | "solutions" = "queue"

  // Reusable Tesseract worker with idle auto-termination
  private ocrWorker: TesseractWorker | null = null
  private ocrIdleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly OCR_IDLE_TIMEOUT_MS = 30_000 // 30 seconds

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
   * Get or create a reusable Tesseract OCR worker.
   * Auto-terminates after 30s of idle to free memory.
   */
  private async getOcrWorker(): Promise<TesseractWorker> {
    // Reset idle timer on every call
    if (this.ocrIdleTimer) {
      clearTimeout(this.ocrIdleTimer)
      this.ocrIdleTimer = null
    }

    if (!this.ocrWorker) {
      console.log("[OCR] Creating new Tesseract worker...")
      this.ocrWorker = await createWorker('eng')
      console.log("[OCR] Worker ready.")
    }

    // Schedule auto-termination after idle period
    this.ocrIdleTimer = setTimeout(async () => {
      if (this.ocrWorker) {
        console.log("[OCR] Terminating idle worker to free memory.")
        await this.ocrWorker.terminate()
        this.ocrWorker = null
      }
    }, this.OCR_IDLE_TIMEOUT_MS)

    return this.ocrWorker
  }

  /**
   * EXTRACT TEXT FROM IMAGE (OCR) — uses reusable worker
   */
  async extractTextFromImage(imageBuffer: Buffer): Promise<string> {
    try {
      console.log("Running OCR on screenshot...");
      const worker = await this.getOcrWorker()
      const { data: { text } } = await worker.recognize(imageBuffer)
      console.log(`OCR Extracted ${text.length} characters.`);
      return text.trim();
    } catch (error) {
      console.error("OCR Failed:", error);
      // If the worker errored, clear it so a fresh one is created next time
      this.ocrWorker = null
      return "";
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
      // Resize to a small thumbnail to avoid holding full-res PNGs in memory
      const thumbnail = await sharp(filepath)
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer()
      return `data:image/jpeg;base64,${thumbnail.toString("base64")}`
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
