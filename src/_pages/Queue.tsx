import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import {
  Toast,
  ToastTitle,
  ToastDescription,
  ToastVariant,
  ToastMessage
} from "../components/ui/toast"
import QueueCommands from "../components/Queue/QueueCommands"
import ModelSelector from "../components/ui/ModelSelector"

interface QueueProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug" | "snipping">>
  ocrText?: string
  onOcrText?: (text: string) => void
}

const Queue: React.FC<QueueProps> = ({ setView, ocrText, onOcrText }) => {
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastMessage>({
    title: "",
    description: "",
    variant: "neutral"
  })

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  const [chatInput, setChatInput] = useState("")
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "gemini"; text: string }[]>([])

  const [chatLoading, setChatLoading] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)

  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string }>({
    provider: "gemini",
    model: "gemini-2.0-flash"
  })

  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = "en-US"

      recognitionRef.current.onresult = (event: any) => {
        let interimTranscript = ""
        let finalTranscript = ""

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          } else {
            interimTranscript += event.results[i][0].transcript
          }
        }

        if (finalTranscript) {
          setChatInput((prev) => {
            const text = prev.trim()
            return text ? text + " " + finalTranscript : finalTranscript
          })
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech error", event.error)
        setIsListening(false)
        showToast("Voice Error", `Reason: ${event.error}`, "error")
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
      }
    }
  }, [])

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      try {
        recognitionRef.current?.start()
        setIsListening(true)
      } catch (err) {
        console.error("Failed to start voice", err)
        setIsListening(false)
        showToast("Error", "Could not start microphone.", "error")
      }
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("cluelyChatHistory")
    if (saved) {
      try {
        setChatMessages(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to parse chat history", e)
      }
    }
  }, [])

  useEffect(() => {
    if (chatMessages.length > 0) {
      const recentHistory = chatMessages.slice(-20)
      localStorage.setItem("cluelyChatHistory", JSON.stringify(recentHistory))
    }
  }, [chatMessages])

  const clearHistory = () => {
    setChatMessages([])
    localStorage.removeItem("cluelyChatHistory")
    showToast("Memory Cleared", "Started a fresh conversation session.", "neutral")
  }

  const { data: screenshots = [], refetch } = useQuery<Array<{ path: string; preview: string }>, Error>(
    ["screenshots"],
    async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        return existing
      } catch (error) {
        console.error("Error loading screenshots:", error)
        showToast("Error", "Failed to load existing screenshots", "error")
        return []
      }
    },
    {
      staleTime: Infinity,
      cacheTime: Infinity,
      refetchOnWindowFocus: true,
      refetchOnMount: true
    }
  )

  useEffect(() => {
    if (ocrText) {
      setIsChatOpen(true)
      setChatInput((prev) => (prev ? prev + "\n" + ocrText : ocrText))
      if (onOcrText) onOcrText("")
      setTimeout(() => chatInputRef.current?.focus(), 100)
    }
  }, [ocrText, onOcrText])

  const showToast = (title: string, description: string, variant: ToastVariant) => {
    setToastMessage({ title, description, variant })
    setToastOpen(true)
  }

  const handleChatSend = async () => {
    if (!chatInput.trim()) return

    if (chatInput.trim() === "/clear") {
      clearHistory()
      setChatInput("")
      return
    }

    const newMsg = { role: "user" as const, text: chatInput }
    const updatedHistory = [...chatMessages, newMsg]
    setChatMessages(updatedHistory)

    setChatLoading(true)
    setChatInput("")

    try {
      const systemPrompt = `
SYSTEM RULES:
1. IF CODE ASKED: Return ONLY the code. No markdown backticks unless asked. No explanations.
2. IF GENERAL CHAT: Answer normally, be helpful and concise (2-6 lines).
3. PREFERENCE: If I ask for a solution, give the most optimal one immediately.
4. TONE: Direct and efficient.
`.trim()

      const historyContext =
        systemPrompt +
        "\n\n" +
        updatedHistory
          .slice(-6)
          .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
          .join("\n")

      const response = await window.electronAPI.invoke("gemini-chat", historyContext)

      setChatMessages((prev) => [...prev, { role: "gemini", text: response }])
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "gemini", text: "Error: " + String(err) }])
    } finally {
      setChatLoading(false)
      chatInputRef.current?.focus()
    }
  }

  useEffect(() => {
    const loadCurrentModel = async () => {
      try {
        const config = await window.electronAPI.getCurrentLlmConfig()
        setCurrentModel({ provider: config.provider, model: config.model })
      } catch (error) {
        console.error("Error loading current model config:", error)
      }
    }
    loadCurrentModel()
  }, [])

  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Processing Failed", "There was an error processing your screenshots.", "error")
        setView("queue")
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast("No Screenshots", "There are no screenshots to process.", "neutral")
      })
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  useEffect(() => {
    const unsubscribe = window.electronAPI.onScreenshotTaken(async (data) => {
      await refetch()
      setIsChatOpen(true)
    })
    return () => {
      unsubscribe && unsubscribe()
    }
  }, [refetch])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleChatToggle = () => {
    setIsChatOpen(!isChatOpen)
  }

  const handleSettingsToggle = () => {
    setIsSettingsOpen(!isSettingsOpen)
  }

  const handleModelChange = (provider: "ollama" | "gemini", model: string) => {
    setCurrentModel({ provider, model })
    const modelName = provider === "ollama" ? model : "Gemini"
    setChatMessages((msgs) => [
      ...msgs,
      {
        role: "gemini",
        text: `🔄 Switched to ${provider === "ollama" ? "🏠" : "☁️"} ${modelName}.`
      }
    ])
  }
  

  return (
    <div
      ref={barRef}
      style={{
        position: "relative",
        width: "100%",
        pointerEvents: "auto"
      }}
      className="select-none font-mono"
    >
      <div className="w-full">
        {/* Drag Handle Bar */}
        <div className="draggable-area w-full h-6 flex items-center justify-center cursor-move bg-gradient-to-r from-slate-900/50 to-slate-800/50 border-b border-white/5 rounded-t-2xl mb-2">
          <div className="flex gap-1">
            <div className="w-1 h-1 rounded-full bg-slate-600"></div>
            <div className="w-1 h-1 rounded-full bg-slate-600"></div>
            <div className="w-1 h-1 rounded-full bg-slate-600"></div>
          </div>
        </div>

        <div className="px-2 py-1">
          <Toast

            open={toastOpen}
            onOpenChange={setToastOpen}
            variant={toastMessage.variant}
            duration={3000}
          >
            <ToastTitle>{toastMessage.title}</ToastTitle>
            <ToastDescription>{toastMessage.description}</ToastDescription>
          </Toast>

          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 blur-xl opacity-50 rounded-3xl" />
            
            <div className="relative flex items-center gap-2 p-2 rounded-2xl bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
              <div className="flex items-center gap-2 px-1">
                <QueueCommands
                  screenshots={screenshots}
                  onTooltipVisibilityChange={handleTooltipVisibilityChange}
                  onChatToggle={handleChatToggle}
                  onSettingsToggle={handleSettingsToggle}
                />
              </div>

              <div className="flex-1" />

              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={() => window.electronAPI.invoke("start-snip")}
                  className="group relative p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 transition-all duration-300 border border-cyan-500/20 hover:border-cyan-400/40 hover:shadow-lg hover:shadow-cyan-500/20"
                  title="Snip Region"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-cyan-400 group-hover:text-cyan-300 transition-colors"
                  >
                    <path d="M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" />
                    <path d="M9 9l6 6" />
                    <path d="M15 9l-6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {isSettingsOpen && (
            <div className="mt-3 w-full mx-auto animate-in fade-in slide-in-from-top-3 duration-300">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 blur-xl opacity-40 rounded-2xl" />
                <div className="relative rounded-2xl bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-2xl border border-amber-500/20 shadow-2xl p-5 ring-1 ring-amber-500/10">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/10">
                    <div className="w-1 h-5 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
                    <h3 className="text-sm font-bold text-amber-200 tracking-wide">MODEL CONFIGURATION</h3>
                  </div>
                  <ModelSelector onModelChange={handleModelChange} onChatOpen={() => setIsChatOpen(true)} />
                </div>
              </div>
            </div>
          )}

          {isChatOpen && (
            <div className="mt-3 w-full mx-auto animate-in fade-in slide-in-from-top-3 duration-300">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 blur-xl opacity-40 rounded-2xl" />
                
                <div className="relative rounded-2xl bg-gradient-to-br from-slate-900/98 to-slate-950/98 backdrop-blur-2xl border border-cyan-500/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-5 ring-1 ring-cyan-500/10 flex flex-col">
                  <div className="flex justify-between items-center mb-4 px-1 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_12px_rgba(34,211,238,1)] animate-pulse" />
                        <div className="absolute inset-0 w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                      </div>
                      <span className="text-[11px] uppercase tracking-widest text-cyan-300 font-bold">
                        NEURAL INTERFACE
                      </span>
                      <div className="h-3 w-px bg-white/20" />
                      <span className="text-[10px] text-slate-500 font-semibold">
                        {chatMessages.length} MSG
                      </span>
                    </div>
                    <button
                      onClick={clearHistory}
                      className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 transition-all uppercase tracking-wide shadow-sm"
                      title="Clear Chat Memory"
                    >
                      PURGE
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto mb-4 p-4 rounded-xl bg-black/30 max-h-72 min-h-[140px] border border-white/5 shadow-inner backdrop-blur-sm">
                    {chatMessages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3 opacity-70">
                        <div className="relative w-14 h-14 rounded-2xl border-2 border-cyan-500/20 flex items-center justify-center bg-gradient-to-br from-cyan-500/5 to-blue-500/5 shadow-lg">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="28"
                            height="28"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            className="text-cyan-500/60"
                          >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
                        <div className="text-center space-y-1">
                          <p className="text-xs font-bold text-slate-400">AWAITING INPUT</p>
                          <p className="text-[10px] text-slate-600">
                            ⌘+H for Visual Input • /clear to Reset
                          </p>
                        </div>
                      </div>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`w-full flex ${
                            msg.role === "user" ? "justify-end" : "justify-start"
                          } mb-3`}
                        >
                          <div
                            className={`select-text cursor-text max-w-[85%] px-4 py-3 rounded-2xl text-xs shadow-lg backdrop-blur-md border whitespace-pre-wrap break-words transition-all duration-200 ${
                              msg.role === "user"
                                ? "bg-gradient-to-br from-cyan-900/40 to-cyan-800/40 text-cyan-50 border-cyan-500/30 rounded-br-sm ml-8 hover:shadow-cyan-500/20"
                                : "bg-gradient-to-br from-slate-800/70 to-slate-900/70 text-slate-100 border-white/10 rounded-bl-sm mr-8 hover:shadow-white/10"
                            }`}
                            style={{ lineHeight: "1.6" }}
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))
                    )}

                    {chatLoading && (
                      <div className="flex justify-start mb-3">
                        <div className="bg-gradient-to-br from-slate-800/70 to-slate-900/70 text-cyan-300 px-4 py-3 rounded-2xl text-xs backdrop-blur-md border border-white/10 shadow-lg rounded-bl-sm">
                          <span className="inline-flex items-center gap-2">
                            <span className="flex gap-1">
                              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce shadow-sm" />
                              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-100 shadow-sm" />
                              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce delay-200 shadow-sm" />
                            </span>
                            <span className="text-[10px] uppercase tracking-widest opacity-80 font-bold">
                              PROCESSING
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <form
                    className="flex gap-2 items-center bg-black/30 p-2 rounded-xl border border-white/10 backdrop-blur-sm shadow-inner"
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleChatSend()
                    }}
                  >
                    <button
                      type="button"
                      onClick={toggleVoiceInput}
                      className={`p-2.5 rounded-lg border flex items-center justify-center transition-all duration-300 relative overflow-hidden ${
                        isListening
                          ? "bg-gradient-to-br from-red-500/30 to-rose-500/30 border-red-500/50 text-red-300 shadow-lg shadow-red-500/30"
                          : "bg-gradient-to-br from-purple-500/10 to-purple-600/10 hover:from-purple-500/20 hover:to-purple-600/20 border-purple-500/20 hover:border-purple-400/40 text-purple-400 hover:text-purple-300 hover:shadow-lg hover:shadow-purple-500/20"
                      }`}
                      title="Voice Input"
                    >
                      {isListening ? (
                        <div className="w-3.5 h-3.5 rounded-sm bg-current animate-pulse" />
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" />
                          <line x1="8" y1="23" x2="16" y2="23" />
                        </svg>
                      )}
                    </button>

                    <textarea
                      ref={chatInputRef}
                      className="flex-1 bg-transparent text-slate-100 placeholder-slate-600 text-xs focus:outline-none resize-none h-[38px] max-h-[100px] py-2.5 leading-relaxed font-sans"
                      placeholder="Enter command or query..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatLoading}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault()
                          handleChatSend()
                        }
                      }}
                    />

                    <button
                      type="submit"
                      className="p-2.5 rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-500/30 hover:from-cyan-500/50 hover:to-blue-500/50 border border-cyan-500/40 text-cyan-300 hover:text-cyan-200 flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-cyan-500/30"
                      disabled={chatLoading || !chatInput.trim()}
                      tabIndex={-1}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                        />
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Queue