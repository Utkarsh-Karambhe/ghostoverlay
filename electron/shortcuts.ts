import { globalShortcut, app } from "electron"
import { AppState } from "./main"
import * as fs from "fs"

export class ShortcutsHelper {
  private appState: AppState

  constructor(appState: AppState) {
    this.appState = appState
  }

  public registerGlobalShortcuts(): void {
    const isMac = process.platform === "darwin"

    // -------- Shortcut Definitions (Cross-platform safe) --------
    const SHORTCUTS = {
      SHOW_WINDOW: isMac
        ? "Command+Shift+Space"
        : "Control+Shift+Space",

      OCR: isMac
        ? "Command+H"
        : "Control+Shift+H",

      PROCESS: isMac
        ? "Command+Enter"
        : "Control+Enter",

      RESET: isMac
        ? "Command+R"
        : "Control+Shift+R",

      TOGGLE_WINDOW: isMac
        ? "Command+B"
        : "Control+Shift+B",

      MOVE_LEFT: isMac
        ? "Command+Left"
        : "Control+Alt+Left",

      MOVE_RIGHT: isMac
        ? "Command+Right"
        : "Control+Alt+Right",

      MOVE_UP: isMac
        ? "Command+Up"
        : "Control+Alt+Up",

      MOVE_DOWN: isMac
        ? "Command+Down"
        : "Control+Alt+Down",
    }

    // -------- Helper to safely register shortcuts --------
    const register = (accelerator: string, action: () => void) => {
      try {
        globalShortcut.register(accelerator, action)
        console.log(`✅ Registered shortcut: ${accelerator}`)
      } catch (error) {
        console.warn(`❌ Failed to register shortcut: ${accelerator}`, error)
      }
    }
    

    // -------- Show / Center Window --------
    register(SHORTCUTS.SHOW_WINDOW, () => {
      console.log("Show/Center window shortcut pressed")
      this.appState.centerAndShowWindow()
    })

    // -------- OCR Shortcut --------
    register(SHORTCUTS.OCR, async () => {
      const mainWindow = this.appState.getMainWindow()
      if (!mainWindow) return

      console.log("OCR shortcut pressed")

      try {
        const screenshotPath = await this.appState.takeScreenshot()
        const imageBuffer = fs.readFileSync(screenshotPath)

        mainWindow.webContents.send("ocr-start")

        const text =
          await this.appState.screenshotHelper.extractTextFromImage(
            imageBuffer
          )

        this.appState.centerAndShowWindow()
        mainWindow.webContents.send("ocr-result", text)

        console.log("OCR completed successfully")
      } catch (error) {
        console.error("OCR failed:", error)
        mainWindow.webContents.send(
          "ocr-error",
          "Failed to extract text"
        )
      }
    })

    // -------- Process Screenshots --------
    register(SHORTCUTS.PROCESS, async () => {
      await this.appState.processingHelper.processScreenshots()
    })

    // -------- Reset App State --------
    register(SHORTCUTS.RESET, () => {
      console.log("Reset shortcut pressed")
      this.appState.processingHelper.cancelOngoingRequests()
      this.appState.clearQueues()
      this.appState.setView("queue")

      const mainWindow = this.appState.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("reset-view")
      }
    })

    // -------- Window Movement --------
    register(SHORTCUTS.MOVE_LEFT, () => this.appState.moveWindowLeft())
    register(SHORTCUTS.MOVE_RIGHT, () => this.appState.moveWindowRight())
    register(SHORTCUTS.MOVE_UP, () => this.appState.moveWindowUp())
    register(SHORTCUTS.MOVE_DOWN, () => this.appState.moveWindowDown())

    // -------- Toggle Window Visibility --------
    register(SHORTCUTS.TOGGLE_WINDOW, () => {
      this.appState.toggleMainWindow()
      const mainWindow = this.appState.getMainWindow()

      if (
        mainWindow &&
        !this.appState.isVisible() &&
        process.platform === "darwin"
      ) {
        mainWindow.setAlwaysOnTop(true, "normal")
        setTimeout(() => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.setAlwaysOnTop(true, "floating")
          }
        }, 100)
      }
    })

    // -------- Cleanup --------
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
    })
  }
}
