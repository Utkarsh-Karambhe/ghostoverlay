import React, { useState, useEffect, useRef } from "react"
import { IoLogOutOutline } from "react-icons/io5"

interface QueueCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  screenshots: Array<{ path: string; preview: string }>
  onChatToggle: () => void
  onSettingsToggle: () => void
}

const QueueCommands: React.FC<QueueCommandsProps> = ({
  onTooltipVisibilityChange,
  screenshots,
  onChatToggle,
  onSettingsToggle
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const [audioResult, setAudioResult] = useState<string | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    let tooltipHeight = 0
    if (tooltipRef.current && isTooltipVisible) {
      tooltipHeight = tooltipRef.current.offsetHeight + 10
    }
    onTooltipVisibilityChange(isTooltipVisible, tooltipHeight)
  }, [isTooltipVisible])

  const handleMouseEnter = () => {
    setIsTooltipVisible(true)
  }

  const handleMouseLeave = () => {
    setIsTooltipVisible(false)
  }

  const handleRecordClick = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (e) => chunks.current.push(e.data)
        recorder.onstop = async () => {
          const blob = new Blob(chunks.current, { type: chunks.current[0]?.type || 'audio/webm' })
          chunks.current = []
          const reader = new FileReader()
          reader.onloadend = async () => {
            const base64Data = (reader.result as string).split(',')[1]
            try {
              const result = await window.electronAPI.analyzeAudioFromBase64(base64Data, blob.type)
              setAudioResult(result.text)
            } catch (err) {
              setAudioResult('Audio analysis failed.')
            }
          }
          reader.readAsDataURL(blob)
        }
        setMediaRecorder(recorder)
        recorder.start()
        setIsRecording(true)
      } catch (err) {
        setAudioResult('Could not start recording.')
      }
    } else {
      mediaRecorder?.stop()
      setIsRecording(false)
      setMediaRecorder(null)
    }
  }

  return (
    <div className="w-fit">
      <div className="flex items-center gap-3 draggable-area">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-slate-800/40 to-slate-700/40 border border-white/5 hover:border-white/10 transition-all duration-200">
          <span className="text-[10px] font-semibold text-slate-400 tracking-wide">TOGGLE</span>
          <div className="flex gap-1">
            <kbd className="bg-white/10 hover:bg-white/15 transition-colors rounded px-2 py-0.5 text-[10px] font-bold text-white/80 shadow-sm border border-white/10">
              ⌘
            </kbd>
            <kbd className="bg-white/10 hover:bg-white/15 transition-colors rounded px-2 py-0.5 text-[10px] font-bold text-white/80 shadow-sm border border-white/10">
              B
            </kbd>
          </div>
        </div>

        {screenshots.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-900/20 to-cyan-800/20 border border-cyan-500/20 hover:border-cyan-500/30 transition-all duration-200">
            <span className="text-[10px] font-semibold text-cyan-300 tracking-wide">SOLVE</span>
            <div className="flex gap-1">
              <kbd className="bg-cyan-500/20 hover:bg-cyan-500/30 transition-colors rounded px-2 py-0.5 text-[10px] font-bold text-cyan-200 shadow-sm border border-cyan-500/30">
                ⌘
              </kbd>
              <kbd className="bg-cyan-500/20 hover:bg-cyan-500/30 transition-colors rounded px-2 py-0.5 text-[10px] font-bold text-cyan-200 shadow-sm border border-cyan-500/30">
                ↵
              </kbd>
            </div>
          </div>
        )}

        <button
          className={`group relative px-3 py-1.5 rounded-lg transition-all duration-300 overflow-hidden ${
            isRecording 
              ? 'bg-gradient-to-r from-red-500/30 to-rose-500/30 border border-red-500/40 shadow-lg shadow-red-500/20' 
              : 'bg-gradient-to-r from-purple-900/20 to-purple-800/20 border border-purple-500/20 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10'
          }`}
          onClick={handleRecordClick}
          type="button"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          {isRecording ? (
            <span className="relative flex items-center gap-2 text-[10px] font-bold text-red-200 tracking-wide">
              <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
              RECORDING
            </span>
          ) : (
            <span className="relative flex items-center gap-2 text-[10px] font-semibold text-purple-300 tracking-wide">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
              VOICE
            </span>
          )}
        </button>

        <button
          className="group relative px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-900/20 to-blue-800/20 border border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-blue-500/10"
          onClick={onChatToggle}
          type="button"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative flex items-center gap-2 text-[10px] font-semibold text-blue-300 tracking-wide">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            CHAT
          </span>
        </button>

        <button
          className="group relative px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-900/20 to-amber-800/20 border border-amber-500/20 hover:border-amber-500/40 transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-amber-500/10"
          onClick={onSettingsToggle}
          type="button"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          <span className="relative flex items-center gap-2 text-[10px] font-semibold text-amber-300 tracking-wide">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v6m0 6v6M5.6 5.6l4.2 4.2m4.4 4.4l4.2 4.2M1 12h6m6 0h6M5.6 18.4l4.2-4.2m4.4-4.4l4.2-4.2"/>
            </svg>
            MODELS
          </span>
        </button>

        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-700/50 to-slate-800/50 hover:from-cyan-500/20 hover:to-blue-500/20 backdrop-blur-sm transition-all duration-300 flex items-center justify-center cursor-help border border-white/10 hover:border-cyan-500/30 group shadow-sm">
            <span className="text-xs font-bold text-slate-400 group-hover:text-cyan-300 transition-colors">?</span>
          </div>

          {isTooltipVisible && (
            <div
              ref={tooltipRef}
              className="absolute top-full right-0 mt-3 w-96 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
            >
              <div className="p-4 bg-gradient-to-br from-slate-900/95 to-slate-950/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl ring-1 ring-white/5">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-3 border-b border-white/10">
                    <div className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
                    <h3 className="font-bold text-sm text-cyan-100 tracking-wide">KEYBOARD SHORTCUTS</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="group p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-200 border border-white/5 hover:border-cyan-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-200">Toggle Window</span>
                        <div className="flex gap-1">
                          <kbd className="bg-slate-800/80 px-2 py-1 rounded text-[10px] font-bold text-slate-300 border border-white/10 shadow-sm">⌘</kbd>
                          <kbd className="bg-slate-800/80 px-2 py-1 rounded text-[10px] font-bold text-slate-300 border border-white/10 shadow-sm">B</kbd>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-slate-400">
                        Show or hide this window
                      </p>
                    </div>

                    <div className="group p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-200 border border-white/5 hover:border-cyan-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-200">Take Screenshot</span>
                        <div className="flex gap-1">
                          <kbd className="bg-slate-800/80 px-2 py-1 rounded text-[10px] font-bold text-slate-300 border border-white/10 shadow-sm">⌘</kbd>
                          <kbd className="bg-slate-800/80 px-2 py-1 rounded text-[10px] font-bold text-slate-300 border border-white/10 shadow-sm">H</kbd>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-slate-400">
                        Capture and analyze problem descriptions. The 5 latest screenshots are saved
                      </p>
                    </div>

                    <div className="group p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-all duration-200 border border-white/5 hover:border-cyan-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-200">Solve Problem</span>
                        <div className="flex gap-1">
                          <kbd className="bg-slate-800/80 px-2 py-1 rounded text-[10px] font-bold text-slate-300 border border-white/10 shadow-sm">⌘</kbd>
                          <kbd className="bg-slate-800/80 px-2 py-1 rounded text-[10px] font-bold text-slate-300 border border-white/10 shadow-sm">↵</kbd>
                        </div>
                      </div>
                      <p className="text-[10px] leading-relaxed text-slate-400">
                        Generate solution based on current problem
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mx-1 h-5 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />

        <button
          className="group p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-all duration-200 border border-red-500/20 hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/20"
          title="Sign Out"
          onClick={() => window.electronAPI.quitApp()}
        >
          <IoLogOutOutline className="w-4 h-4 text-red-400 group-hover:text-red-300 transition-colors" />
        </button>
      </div>

      {audioResult && (
        <div className="mt-3 p-3 bg-gradient-to-r from-purple-900/30 to-purple-800/30 rounded-lg text-white text-xs border border-purple-500/30 shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-400 flex-shrink-0 mt-0.5">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            </svg>
            <div>
              <span className="font-bold text-purple-200 block mb-1">Audio Transcription:</span>
              <span className="text-purple-100">{audioResult}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default QueueCommands