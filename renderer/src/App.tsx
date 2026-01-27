import React, { useState, useEffect, useRef } from 'react';
import './App.css';

declare global {
  interface Window {
    electronAPI: any;
  }
}

function App() {
  const [prompt, setPrompt] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Helper to log to UI
  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [...prev.slice(-4), msg]); // Keep last 5 logs
  };

  useEffect(() => {
    addLog("App mounted. Checking API...");
    
    if (!window.electronAPI) {
      addLog("❌ ERROR: window.electronAPI is missing!");
      return;
    }

    addLog("✅ API found. Registering listeners...");

    // Register START listener
    let removeStart = () => {};
    if (window.electronAPI.onOcrStart) {
      removeStart = window.electronAPI.onOcrStart(() => {
        addLog("⚡ RECEIVED: OCR Start Event");
        setIsScanning(true);
      });
    } else {
      addLog("❌ Missing onOcrStart function");
    }

    // Register RESULT listener
    let removeResult = () => {};
    if (window.electronAPI.onOcrResult) {
      removeResult = window.electronAPI.onOcrResult((text: string) => {
        addLog(`⚡ RECEIVED: OCR Text (${text.length} chars)`);
        setIsScanning(false);
        
        setPrompt(prev => {
          const sep = prev ? "\n\n" : "";
          return prev + sep + "--- OCR CONTENT ---\n" + text;
        });
      });
    } else {
      addLog("❌ Missing onOcrResult function");
    }

    return () => {
      removeStart();
      removeResult();
    };
  }, []);

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    console.log("Submitting:", prompt);
  };

  return (
    <div style={{ padding: '20px', height: '100vh', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h3>Cluely Assistant</h3>
      
      {/* DEBUG PANEL - This will show you exactly what is happening */}
      <div style={{ 
        backgroundColor: '#eee', 
        padding: '10px', 
        borderRadius: '5px',
        fontSize: '12px',
        fontFamily: 'monospace',
        border: '1px solid #ccc',
        minHeight: '60px'
      }}>
        <strong>Debug Log:</strong>
        {debugLog.length === 0 && <div>Waiting for logs...</div>}
        {debugLog.map((line, i) => (
          <div key={i} style={{margin: '2px 0'}}>{line}</div>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={isScanning ? "Scanning..." : "Press Cmd+H to scan screen..."}
        style={{
          flex: 1,
          padding: '15px',
          borderRadius: '8px',
          border: '1px solid #ccc',
          fontSize: '14px',
          fontFamily: 'monospace',
          backgroundColor: isScanning ? '#e8f0fe' : 'white',
          resize: 'none'
        }}
      />

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button onClick={() => setPrompt("")}>Clear</button>
        <button onClick={handleSubmit} style={{ fontWeight: 'bold' }}>Submit</button>
      </div>
    </div>
  );
}

export default App;
