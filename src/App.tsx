import { ToastProvider } from "./components/ui/toast"
import { ToastViewport } from "@radix-ui/react-toast"
import { useEffect, useRef, useState } from "react"
import { QueryClient, QueryClientProvider } from "react-query"

import Queue from "./_pages/Queue"
import Solutions from "./_pages/Solutions"
import SnippingOverlay from "./components/Overlays/SnippingOverlay"

declare global {
  interface Window {
    electronAPI: any
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      cacheTime: Infinity
    }
  }
})

const App: React.FC = () => {
  const [view, setView] = useState<"queue" | "solutions" | "debug" | "snipping">("queue")
  const containerRef = useRef<HTMLDivElement>(null)
  const [ocrText, setOcrText] = useState<string>("")
  const [isTransitioning, setIsTransitioning] = useState(false)

  useEffect(() => {
    document.body.style.backgroundColor = "transparent"
    document.documentElement.style.backgroundColor = "transparent"
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const updateSize = () => {
      if (!containerRef.current) return
      if (view === "snipping") return
      const height = containerRef.current.scrollHeight
      const width = containerRef.current.scrollWidth
      window.electronAPI?.updateContentDimensions({ width, height })
    }
    const resizeObserver = new ResizeObserver(() => updateSize())
    const mutationObserver = new MutationObserver(() => updateSize())
    updateSize()
    resizeObserver.observe(containerRef.current)
    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [view, ocrText])

  useEffect(() => {
    const removeOcr = window.electronAPI.onOcrResult?.((text: string) => {
        setOcrText(text)
        setView("queue")
      }) || (() => {})
    const removeResetListener = window.electronAPI.onResetView?.(() => {
        setView("queue")
      }) || (() => {})
    let removeSnipModeListener = () => {}
    if (window.electronAPI.onEnterSnippingMode) {
      removeSnipModeListener = window.electronAPI.onEnterSnippingMode(() => {
        setView("snipping")
      })
    }
    return () => {
      removeOcr()
      removeResetListener()
      removeSnipModeListener()
    }
  }, [])

  useEffect(() => {
    setIsTransitioning(true)
    const timer = setTimeout(() => setIsTransitioning(false), 300)
    return () => clearTimeout(timer)
  }, [view])

  const renderView = () => {
    const baseClasses = "transition-all duration-300 ease-out"
    const animationClasses = isTransitioning 
      ? "opacity-0 scale-[0.98]" 
      : "opacity-100 scale-100"

    switch (view) {
      case "queue":
        return (
          <div className={`${baseClasses} ${animationClasses}`}>
            <Queue setView={setView} ocrText={ocrText} onOcrText={setOcrText} />
          </div>
        )
      case "solutions":
        return (
          <div className={`${baseClasses} ${animationClasses}`}>
            <Solutions setView={setView} />
          </div>
        )
      case "snipping":
        return <SnippingOverlay />
      default:
        return null
    }
  }

  return (
    <div
      ref={containerRef}
      className="min-h-0 bg-transparent text-slate-200 antialiased selection:bg-cyan-500/30 selection:text-cyan-100 font-sans"
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <div className="relative pointer-events-auto">
            {renderView()}
          </div>
          <ToastViewport className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-96 max-w-[90vw] outline-none" />
        </ToastProvider>
      </QueryClientProvider>
    </div>
  )
}

export default App