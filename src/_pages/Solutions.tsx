import React, { useState, useEffect, useRef } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"

interface SolutionsProps {
  setView: React.Dispatch<React.SetStateAction<"queue" | "solutions" | "debug" | "snipping">>
}

const Solutions: React.FC<SolutionsProps> = ({ setView }) => {
  const [solution, setSolution] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const updateDimensions = () => {
      if (contentRef.current) {
        window.electronAPI.updateContentDimensions({
          width: contentRef.current.scrollWidth,
          height: contentRef.current.scrollHeight
        })
      }
    }
    const observer = new ResizeObserver(updateDimensions)
    if (contentRef.current) observer.observe(contentRef.current)
    updateDimensions()
    return () => observer.disconnect()
  }, [solution, loading, error])

  useEffect(() => {
    const removeStartListener = window.electronAPI.onProcessingStart(() => {
      setLoading(true)
      setError(null)
      setSolution(null)
    })
    const removeSuccessListener = window.electronAPI.onSolutionSuccess((data: any) => {
      setLoading(false)
      setSolution(data)
    })
    const removeErrorListener = window.electronAPI.onSolutionError((err: string) => {
      setLoading(false)
      setError(err)
    })
    return () => {
      removeStartListener()
      removeSuccessListener()
      removeErrorListener()
    }
  }, [])

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div 
      ref={contentRef}
      className="w-full min-h-[120px] p-2 font-sans select-none text-slate-200"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-purple-500/10 blur-2xl opacity-40 rounded-3xl" />
        
        <div className="relative rounded-2xl bg-gradient-to-br from-slate-950/98 to-slate-900/98 backdrop-blur-2xl border border-cyan-500/20 shadow-2xl ring-1 ring-cyan-500/10 overflow-hidden flex flex-col">
          
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-gradient-to-r from-white/[0.02] to-transparent">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setView("queue")}
                className="group p-2 rounded-xl bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-300 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-500/20"
                title="Back to Queue"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </button>
              
              <div className="h-5 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
              
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full shadow-lg shadow-cyan-500/50" />
                <span className="text-xs font-bold tracking-widest text-cyan-300 uppercase">
                  Analysis Protocol
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {loading && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-950/50 to-blue-950/50 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
                  <div className="relative">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse shadow-lg shadow-cyan-500/50 block" />
                    <span className="absolute inset-0 w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
                  </div>
                  <span className="text-[10px] text-cyan-300 font-bold tracking-widest">PROCESSING</span>
                </div>
              )}
              <button
                onClick={() => setView("debug")}
                className="text-[10px] font-bold px-4 py-2 rounded-lg bg-gradient-to-r from-slate-800/50 to-slate-700/50 hover:from-slate-700/70 hover:to-slate-600/70 text-slate-300 hover:text-white border border-white/10 hover:border-white/20 transition-all duration-200 uppercase tracking-wider shadow-sm hover:shadow-lg"
              >
                DEBUG
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
            
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 space-y-6">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 border-4 border-cyan-500/10 rounded-full" />
                  <div className="absolute inset-0 border-t-4 border-cyan-500 rounded-full animate-spin shadow-lg shadow-cyan-500/30" />
                  <div className="absolute inset-2 border-4 border-blue-500/10 rounded-full" />
                  <div className="absolute inset-2 border-t-4 border-blue-500 rounded-full animate-spin animation-delay-150 shadow-lg shadow-blue-500/30" />
                </div>
                <div className="text-center space-y-2">
                  <p className="text-sm text-cyan-300 tracking-widest font-bold animate-pulse">ANALYZING DATA</p>
                  <p className="text-[10px] text-slate-500 tracking-wider">Neural networks processing...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 to-rose-500/20 blur-xl opacity-60 rounded-2xl" />
                <div className="relative p-5 rounded-xl bg-gradient-to-br from-red-950/40 to-rose-950/40 border border-red-500/30 flex items-start gap-4 shadow-xl">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30 shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-bold text-red-200 mb-2 tracking-wide">ANALYSIS FAILED</h4>
                    <p className="text-xs text-red-200/80 leading-relaxed">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {solution && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {solution.problem_statement && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-1 h-4 bg-gradient-to-b from-slate-500 to-slate-600 rounded-full" />
                      <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Identified Problem</h3>
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-slate-700/10 to-slate-600/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                      <div className="relative p-4 rounded-xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10 text-sm text-slate-200 leading-relaxed shadow-lg backdrop-blur-sm">
                        {solution.problem_statement}
                      </div>
                    </div>
                  </div>
                )}

                {solution.solution?.code && (
                  <div className="space-y-3 group">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-4 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full shadow-lg shadow-cyan-500/50" />
                        <h3 className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Solution Logic</h3>
                      </div>
                      <button
                        onClick={() => handleCopyCode(solution.solution.code)}
                        className={`text-[10px] flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 font-bold tracking-wide ${
                          copied 
                            ? 'bg-green-500/20 border border-green-500/40 text-green-300 shadow-lg shadow-green-500/20' 
                            : 'bg-white/5 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/30 text-slate-400 hover:text-cyan-300 opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {copied ? (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                            <span>COPIED</span>
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            <span>COPY CODE</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 blur-xl opacity-60 rounded-xl" />
                      <div className="relative rounded-xl overflow-hidden border border-cyan-500/20 bg-[#1e1e1e] shadow-2xl ring-1 ring-cyan-500/10">
                        <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-slate-900/80 to-slate-800/80 border-b border-cyan-500/20">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500/80 shadow-sm" />
                            <div className="w-2 h-2 rounded-full bg-yellow-500/80 shadow-sm" />
                            <div className="w-2 h-2 rounded-full bg-green-500/80 shadow-sm" />
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono tracking-wider">solution.py</span>
                        </div>
                        <div className="select-text cursor-text">
                          <SyntaxHighlighter
                            language="python"
                            style={vscDarkPlus}
                            customStyle={{ 
                              margin: 0, 
                              padding: "1.5rem", 
                              background: "transparent", 
                              fontSize: "0.8rem", 
                              lineHeight: "1.7",
                              fontFamily: "'Fira Code', 'Consolas', monospace"
                            }}
                            wrapLines={true}
                            wrapLongLines={true}
                          >
                            {solution.solution.code}
                          </SyntaxHighlighter>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {solution.reasoning && (
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-blue-500/5 blur-xl opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                    <div className="relative flex gap-4 items-start px-4 py-4 rounded-xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-white/5 backdrop-blur-sm">
                      <div className="w-1 h-16 bg-gradient-to-b from-cyan-500/40 via-blue-500/40 to-purple-500/40 rounded-full flex-shrink-0 shadow-lg" />
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                          </svg>
                          <h3 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Reasoning</h3>
                        </div>
                        <p className="text-xs text-slate-300 italic leading-relaxed pl-1">{solution.reasoning}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Solutions