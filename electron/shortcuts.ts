import { globalShortcut, app } from "electron"
import { AppState } from "./main" 
import * as fs from "fs" // Import file system to read the screenshot

export class ShortcutsHelper {
  private appState: AppState

  constructor(appState: AppState) {
    this.appState = appState
  }

  public registerGlobalShortcuts(): void {
    // Show/Center window
    globalShortcut.register("CommandOrControl+Shift+Space", () => {
      console.log("Show/Center window shortcut pressed...")
      this.appState.centerAndShowWindow()
    })

    // --- UPDATED SECTION FOR OCR ---
    globalShortcut.register("CommandOrControl+H", async () => {
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow) {
        console.log("Cmd+H Pressed: Starting OCR Process...")
        try {
          // 1. Take the screenshot (returns path)
          const screenshotPath = await this.appState.takeScreenshot()
          
          // 2. Read the file into a buffer so Tesseract can use it
          const imageBuffer = fs.readFileSync(screenshotPath)

          // 3. Notify frontend that scanning has started (optional, good for UX)
          mainWindow.webContents.send("ocr-start")

          // 4. Run OCR using the method you added to ScreenshotHelper
          // Note: Assuming screenshotHelper is public on appState. 
          // If it's private, you may need to add a getter in AppState.
          const text = await this.appState.screenshotHelper.extractTextFromImage(imageBuffer)

          // 5. Bring window to front so you can edit the text
          this.appState.centerAndShowWindow()

          // 6. Send the text to the React App
          mainWindow.webContents.send("ocr-result", text)


          
          console.log("OCR Complete. Text sent to frontend.")

        } catch (error) {
          console.error("Error during OCR process:", error)
          mainWindow.webContents.send("ocr-error", "Failed to extract text.")
        }
      }
    })
    // -------------------------------

    globalShortcut.register("CommandOrControl+Enter", async () => {
      await this.appState.processingHelper.processScreenshots()
    })

    globalShortcut.register("CommandOrControl+R", () => {
      console.log("Command + R pressed. Resetting...")
      this.appState.processingHelper.cancelOngoingRequests()
      this.appState.clearQueues()
      this.appState.setView("queue")
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    })

    // Window movement shortcuts
    globalShortcut.register("CommandOrControl+Left", () => this.appState.moveWindowLeft())
    globalShortcut.register("CommandOrControl+Right", () => this.appState.moveWindowRight())
    globalShortcut.register("CommandOrControl+Down", () => this.appState.moveWindowDown())
    globalShortcut.register("CommandOrControl+Up", () => this.appState.moveWindowUp())

    globalShortcut.register("CommandOrControl+B", () => {
      this.appState.toggleMainWindow()
      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !this.appState.isVisible()) {
        if (process.platform === "darwin") {
          mainWindow.setAlwaysOnTop(true, "normal")
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setAlwaysOnTop(true, "floating")
            }
          }, 100)
        }
      }
    })

    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }
}
