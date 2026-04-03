// ============================================================
// llm-helper.ts
// LLMHelper — Unified LLM abstraction for Gemini & Ollama
// ============================================================

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"

// ─────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────

interface OllamaResponse {
  response: string
  done: boolean
}

interface OllamaModel {
  name: string
}

interface OllamaTagsResponse {
  models?: OllamaModel[]
}

interface AnalysisResult {
  text: string
  timestamp: number
}

interface ConnectionTestResult {
  success: boolean
  error?: string
}

type LLMProvider = "ollama" | "gemini"

// ─────────────────────────────────────────────
// Prompts (module-level constants)
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Wingman AI, a professional-grade assistant designed for developers and technical professionals.

CORE BEHAVIOR:
1. Be direct and professional—no fluff, no unnecessary preamble.
2. Default to clear, concise TEXT answers using bullet points, numbered lists, or short paragraphs.
3. Do NOT provide code unless the user EXPLICITLY asks for code (e.g., "write code", "give me the code", "show me how to code this", "implement this", "write me a Java/Python program").
4. If the user asks a question about code concepts, explain in plain language WITHOUT writing code unless they specifically request it.
5. Always assume the user is intelligent and time-constrained.

ABSOLUTE NO-CODE RULE FOR MATH & APTITUDE:
- When the user asks a math, aptitude, reasoning, or calculation question, you MUST solve it yourself using step-by-step mental/manual calculation.
- NEVER write Python, Java, JavaScript, or ANY programming code to solve math problems.
- NEVER say "let me write a script" or "here's a program to solve this" for math/aptitude questions.
- Do the arithmetic, algebra, probability, permutation, combination, percentage, ratio, etc. by hand, showing each step clearly.
- The ONLY time you write code is when the user explicitly says words like "write code", "give me the code", "I want a Java/Python program", etc.

CODE RULES (ONLY when user explicitly requests code):
- Write code that follows industry best practices (SOLID, DRY, error handling).
- Include comments only for non-obvious logic or business rules.
- For Java: Follow Google/Oracle style guide (camelCase, proper indentation, 100-char line limit).
- For Python: Follow PEP 8 standards.
- Always handle errors gracefully (try-catch, null checks, validation).
- If code requires setup/dependencies, list them explicitly.

CS FUNDAMENTALS RULE:
- If the user asks a CS fundamental question (data structures, algorithms, OS, DBMS, networking, OOP concepts, etc.), answer in clear plain text with explanations.
- Use bullet points, numbered lists, or short paragraphs.
- Do NOT write code unless the user explicitly asks for a code implementation.

ACCURACY & TRUTHFULNESS:
- Do NOT invent APIs, libraries, or methods that don't exist.
- If you're unsure about syntax or behavior, say "I'm not certain" and explain why.
- If the question lacks context, ask 1 clarifying question before answering.
- Avoid over-claiming; be specific about version numbers, frameworks, and compatibility.

OUTPUT FORMATTING:
- Prefer plain text explanations, bullet points, and numbered lists.
- Only use code blocks when the user explicitly asks for code.
- When code IS requested, use proper language tags (\`\`\`java, \`\`\`python, \`\`\`javascript).
- Preserve indentation and line breaks in code—never minify or compress.
- If response spans multiple concepts, use clear section headers.
- For ANY mathematical expressions: use $...$ for inline math and $$...$$ for block/display math. NEVER use \\[...\\] or \\(...\\) delimiters. Example: $\\frac{a}{b}$ for inline, $$\\frac{a}{b}$$ for display.

REFUSAL RULES:
- Refuse requests for: cheating/exam assistance, bypassing security, harmful/illegal actions.
- If a request seems unethical, offer a legitimate alternative (e.g., "Learning resources" instead of "exam answers").

EDGE CASES:
- If the problem is ambiguous or underspecified, ask clarifying questions.
- If performance/security tradeoffs exist, mention them.
- If deprecated syntax is detected, suggest the modern alternative.`

const APTITUDE_REASONING_PROMPT = `
SPECIAL INSTRUCTION (MANDATORY):

If the question belongs to ANY of the following categories:
- Verbal Reasoning
- Logical Reasoning
- Quantitative Aptitude
- Analytical Reasoning
- Critical Reasoning
- Mathematics / Arithmetic / Algebra / Geometry / Probability

Then you MUST:
1. Solve the problem step-by-step using your own reasoning — do ALL math calculations manually
2. Clearly explain each logical or mathematical step
3. Show how you arrive at the final answer
4. Keep explanations concise but complete
5. End with a clearly labeled FINAL ANSWER

STRICTLY FORBIDDEN for math/aptitude:
- Do NOT write Python, Java, or ANY code to solve the problem
- Do NOT use code blocks to perform calculations
- Do NOT suggest running a script — just do the math yourself step by step

Do NOT skip steps.
Do NOT give only the final answer.
`

const IMAGE_ANALYSIS_PROMPT = `
You are analyzing a screenshot provided by the user.

IMPORTANT OUTPUT RULES (STRICT):
- Do NOT provide code unless the user explicitly asked for code.
- Respond in clear, readable paragraphs or bullet points.
- If code IS explicitly requested, wrap it in proper Markdown code blocks with language tags.

TASK:
1. Briefly describe what is shown in the image.
2. If the image implies a question, provide a clear explanation or answer in plain text.
3. Suggest a few possible next actions the user could take.

Do NOT return JSON.
Do NOT compress or minify output.
Formatting quality is very important.
`

const SOLUTION_JSON_SCHEMA = `{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}`

const EXTRACTION_JSON_SCHEMA = `{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}`

// ─────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────

const DEFAULT_OLLAMA_URL   = "http://localhost:11434"
const DEFAULT_OLLAMA_MODEL = "llama3.2"
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"

// ============================================================
// LLMHelper Class
// ============================================================

export class LLMHelper {

  // ─────────────────────────────────────────────
  // Private State
  // ─────────────────────────────────────────────

  private model: GenerativeModel | null = null
  private useOllama: boolean            = false
  private ollamaModel: string           = DEFAULT_OLLAMA_MODEL
  private ollamaUrl: string             = DEFAULT_OLLAMA_URL

  // ─────────────────────────────────────────────
  // Constructor
  // ─────────────────────────────────────────────

  constructor(
    apiKey?: string,
    useOllama: boolean = false,
    ollamaModel?: string,
    ollamaUrl?: string
  ) {
    this.useOllama = useOllama

    if (useOllama) {
      this.ollamaUrl   = ollamaUrl   || DEFAULT_OLLAMA_URL
      this.ollamaModel = ollamaModel || DEFAULT_OLLAMA_MODEL
      console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel}`)
      this.initializeOllamaModel()
    } else if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey)
      this.model  = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL })
      console.log("[LLMHelper] Using Google Gemini")
    } else {
      console.warn("[LLMHelper] No API key or Ollama enabled initially.")
    }
  }

  // ─────────────────────────────────────────────
  // Private — Utilities
  // ─────────────────────────────────────────────

  /**
   * Strips markdown code fences from an LLM JSON response.
   */
  private cleanJsonResponse(text: string): string {
    return text
      .replace(/^```(?:json)?\n/, "")
      .replace(/\n```$/, "")
      .trim()
  }

  /**
   * Reads an image from disk and returns a Gemini-compatible inline part.
   */
  private async fileToGenerativePart(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath)
    return {
      inlineData: {
        data:     imageData.toString("base64"),
        mimeType: "image/png",
      },
    }
  }

  /**
   * Builds the combined system + aptitude prompt prefix.
   */
  private buildBasePrompt(): string {
    return `${SYSTEM_PROMPT}\n${APTITUDE_REASONING_PROMPT}`
  }

  // ─────────────────────────────────────────────
  // Private — Ollama Internals
  // ─────────────────────────────────────────────

  /**
   * Pings the Ollama server to verify availability.
   */
  private async checkOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Auto-selects a valid Ollama model on startup.
   * Falls back to the first available model if the configured one is absent.
   */
  private async initializeOllamaModel(): Promise<void> {
    try {
      const isAvailable = await this.checkOllamaAvailable()
      if (!isAvailable) {
        console.warn(`[LLMHelper] Ollama not available at ${this.ollamaUrl}. Skipping model auto-detection.`)
        return
      }

      const availableModels = await this.getOllamaModels()
      if (availableModels.length === 0) {
        console.warn("[LLMHelper] No Ollama models found.")
        return
      }

      if (!availableModels.includes(this.ollamaModel)) {
        this.ollamaModel = availableModels[0]
        console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
      }

      console.log(`[LLMHelper] Successfully initialized with model: ${this.ollamaModel}`)
    } catch (error: any) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
      try {
        const models = await this.getOllamaModels()
        if (models.length > 0) {
          this.ollamaModel = models[0]
          console.log(`[LLMHelper] Fallback to: ${this.ollamaModel}`)
        }
      } catch {
        // Silently ignore if Ollama is unreachable during fallback
      }
    }
  }

  /**
   * Sends a single non-streaming prompt to Ollama and returns the full response.
   */
  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:   this.ollamaModel,
          prompt,
          stream:  false,
          options: { temperature: 0.7, top_p: 0.9 },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data: OllamaResponse = await response.json()
      return data.response
    } catch (error: any) {
      console.error("[LLMHelper] Error calling Ollama:", error)
      if (error.code === "ECONNREFUSED" || error.message.includes("fetch failed")) {
        throw new Error(`Ollama is not running at ${this.ollamaUrl}. Please start Ollama to use local LLM features.`)
      }
      throw new Error(`Failed to connect to Ollama: ${error.message}`)
    }
  }

  /**
   * Streams tokens from Ollama, invoking `onChunk` for each partial token.
   * Returns the complete assembled response.
   */
  private async callOllamaStream(
    prompt:  string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:   this.ollamaModel,
          prompt,
          stream:  true,
          options: { temperature: 0.7, top_p: 0.9 },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body reader available")

      const decoder  = new TextDecoder()
      let   fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text  = decoder.decode(value, { stream: true })
        const lines = text.split("\n").filter(line => line.trim())

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)
            if (parsed.response) {
              fullText += parsed.response
              onChunk(parsed.response)
            }
          } catch {
            // Skip malformed NDJSON lines
          }
        }
      }

      return fullText
    } catch (error: any) {
      console.error("[LLMHelper] Error streaming from Ollama:", error)
      if (error.code === "ECONNREFUSED" || error.message.includes("fetch failed")) {
        throw new Error(`Ollama is not running at ${this.ollamaUrl}. Please start Ollama to use local LLM features.`)
      }
      throw new Error(`Failed to stream from Ollama: ${error.message}`)
    }
  }

  // ─────────────────────────────────────────────
  // Public — Provider Management
  // ─────────────────────────────────────────────

  /** Returns true if Ollama is the active provider. */
  public isUsingOllama(): boolean {
    return this.useOllama
  }

  /** Returns the active provider identifier. */
  public getCurrentProvider(): LLMProvider {
    return this.useOllama ? "ollama" : "gemini"
  }

  /** Returns the currently active model name. */
  public getCurrentModel(): string {
    return this.useOllama ? this.ollamaModel : DEFAULT_GEMINI_MODEL
  }

  /** Fetches all locally available Ollama model names. */
  public async getOllamaModels(): Promise<string[]> {
    if (!this.useOllama) return []

    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      if (!response.ok) throw new Error("Failed to fetch models")

      const data: OllamaTagsResponse = await response.json()
      return data.models?.map(model => model.name) ?? []
    } catch (error: any) {
      if (error.code === "ECONNREFUSED" || error.message.includes("fetch failed")) {
        console.warn(`[LLMHelper] Could not fetch Ollama models: Service not running at ${this.ollamaUrl}`)
      } else {
        console.error("[LLMHelper] Error fetching Ollama models:", error)
      }
      return []
    }
  }

  /**
   * Switches the active provider to Ollama.
   * Optionally accepts a model name and base URL.
   */
  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true
    if (url) this.ollamaUrl = url

    if (model) {
      this.ollamaModel = model
    } else {
      await this.initializeOllamaModel()
    }

    console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`)
  }

  /**
   * Switches the active provider to Google Gemini.
   * Requires an API key if no Gemini model is already configured.
   */
  public async switchToGemini(apiKey?: string): Promise<void> {
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey)
      this.model   = genAI.getGenerativeModel({ model: DEFAULT_GEMINI_MODEL })
    }

    if (!this.model) {
      throw new Error("No Gemini API key provided and no existing model instance.")
    }

    this.useOllama = false
    console.log("[LLMHelper] Switched to Gemini")
  }

  /**
   * Sends a lightweight probe to verify the active provider is reachable.
   */
  public async testConnection(): Promise<ConnectionTestResult> {
    try {
      if (this.useOllama) {
        const available = await this.checkOllamaAvailable()
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` }
        }
        await this.callOllama("Hello")
        return { success: true }
      }

      if (!this.model) {
        return { success: false, error: "No Gemini model configured" }
      }

      const result   = await this.model.generateContent("Hello")
      const response = await result.response
      const text     = response.text()

      return text
        ? { success: true }
        : { success: false, error: "Empty response from Gemini" }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  // ─────────────────────────────────────────────
  // Public — Image & Audio Analysis
  // ─────────────────────────────────────────────

  /**
   * Extracts a structured problem description from one or more screenshots.
   * Requires Gemini mode (Ollama vision not supported).
   */
  public async extractProblemFromImages(imagePaths: string[]) {
    if (this.useOllama || !this.model) {
      throw new Error("Image extraction requires Gemini mode. Ollama vision not fully implemented in this helper.")
    }

    try {
      const imageParts = await Promise.all(imagePaths.map(p => this.fileToGenerativePart(p)))

      const prompt = `${this.buildBasePrompt()}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n${EXTRACTION_JSON_SCHEMA}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result   = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text     = this.cleanJsonResponse(response.text())

      return JSON.parse(text)
    } catch (error) {
      console.error("[LLMHelper] Error extracting problem from images:", error)
      throw error
    }
  }

  /**
   * Analyzes a single screenshot from disk and returns a plain-text description.
   * Requires Gemini mode.
   */
  public async analyzeImageFile(imagePath: string): Promise<AnalysisResult> {
    if (this.useOllama) {
      return {
        text:      "Image analysis requires Gemini or a Vision-capable Ollama model (e.g. LLaVA).",
        timestamp: Date.now(),
      }
    }

    if (!this.model) throw new Error("No Gemini model available")

    try {
      const imageData = await fs.promises.readFile(imagePath)
      const imagePart = {
        inlineData: {
          data:     imageData.toString("base64"),
          mimeType: "image/png",
        },
      }

      const prompt = `${this.buildBasePrompt()}\n\n${IMAGE_ANALYSIS_PROMPT}`

      const result   = await this.model.generateContent([prompt, imagePart])
      const response = await result.response

      return { text: response.text(), timestamp: Date.now() }
    } catch (error) {
      console.error("[LLMHelper] Error analyzing image file:", error)
      throw error
    }
  }

  /**
   * Analyzes an audio file from disk.
   * Requires Gemini mode.
   */
  public async analyzeAudioFile(audioPath: string): Promise<AnalysisResult> {
    if (this.useOllama || !this.model) {
      console.warn("[LLMHelper] Audio analysis skipped: Local Ollama does not support audio files.")
      return { text: "Audio analysis requires Gemini mode.", timestamp: Date.now() }
    }

    try {
      const audioData = await fs.promises.readFile(audioPath)
      const audioPart = {
        inlineData: {
          data:     audioData.toString("base64"),
          mimeType: "audio/mp3",
        },
      }

      const prompt   = `${this.buildBasePrompt()}\n\nDescribe this audio clip in a short, concise answer.`
      const result   = await this.model.generateContent([prompt, audioPart])
      const response = await result.response

      return { text: response.text(), timestamp: Date.now() }
    } catch (error) {
      console.error("[LLMHelper] Error analyzing audio file:", error)
      throw error
    }
  }

  /**
   * Analyzes audio supplied as a base64 string.
   * Requires Gemini mode.
   */
  public async analyzeAudioFromBase64(data: string, mimeType: string): Promise<AnalysisResult> {
    if (this.useOllama || !this.model) {
      console.warn("[LLMHelper] Audio analysis skipped: Local Ollama does not support audio base64.")
      return { text: "Audio analysis requires Gemini mode.", timestamp: Date.now() }
    }

    try {
      const audioPart = { inlineData: { data, mimeType } }
      const prompt    = `${this.buildBasePrompt()}\n\nDescribe this audio clip in a short, concise answer.`
      const result    = await this.model.generateContent([prompt, audioPart])
      const response  = await result.response

      return { text: response.text(), timestamp: Date.now() }
    } catch (error) {
      console.error("[LLMHelper] Error analyzing audio from base64:", error)
      throw error
    }
  }

  // ─────────────────────────────────────────────
  // Public — Solution Generation & Debugging
  // ─────────────────────────────────────────────

  /**
   * Generates a structured JSON solution for a given problem object.
   * Works with both Gemini and Ollama.
   */
  public async generateSolution(problemInfo: any) {
    const prompt = `${this.buildBasePrompt()}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n${SOLUTION_JSON_SCHEMA}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling LLM for solution...")

    try {
      if (this.useOllama) {
        const textResponse = await this.callOllama(prompt)
        return JSON.parse(this.cleanJsonResponse(textResponse))
      }

      if (this.model) {
        const result   = await this.model.generateContent(prompt)
        const response = await result.response
        const text     = this.cleanJsonResponse(response.text())
        const parsed   = JSON.parse(text)

        console.log("[LLMHelper] Parsed LLM response:", parsed)
        return parsed
      }

      throw new Error("No provider configured")
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error)
      throw error
    }
  }

  /**
   * Generates a debug-informed solution by cross-referencing current code
   * with runtime screenshots. Requires Gemini mode.
   */
  public async debugSolutionWithImages(
    problemInfo:      any,
    currentCode:      string,
    debugImagePaths:  string[]
  ) {
    if (this.useOllama || !this.model) {
      throw new Error("Visual debugging requires Gemini mode.")
    }

    try {
      const imageParts = await Promise.all(debugImagePaths.map(p => this.fileToGenerativePart(p)))

      const prompt = `${this.buildBasePrompt()}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n${SOLUTION_JSON_SCHEMA}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result   = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text     = this.cleanJsonResponse(response.text())
      const parsed   = JSON.parse(text)

      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("[LLMHelper] Error debugging solution with images:", error)
      throw error
    }
  }

  // ─────────────────────────────────────────────
  // Public — Chat Interface
  // ─────────────────────────────────────────────

  /**
   * Sends a single message and returns the full response.
   * Routes to Ollama or Gemini based on the current provider.
   */
  public async chatWithGemini(message: string): Promise<string> {
    try {
      const combinedPrompt = `${this.buildBasePrompt()}\n\nUser Question: ${message}`

      if (this.useOllama) {
        return this.callOllama(combinedPrompt)
      }

      if (this.model) {
        const result   = await this.model.generateContent(combinedPrompt)
        const response = await result.response
        return response.text()
      }

      throw new Error("No LLM provider configured")
    } catch (error) {
      console.error("[LLMHelper] Error in chatWithGemini:", error)
      throw error
    }
  }

  /**
   * Alias for `chatWithGemini` — provider-agnostic entry point.
   */
  public async chat(message: string): Promise<string> {
    return this.chatWithGemini(message)
  }

  /**
   * Streams a chat response token-by-token via `onChunk`.
   * Returns the fully assembled response string when streaming completes.
   */
  public async chatWithGeminiStream(
    message: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    try {
      const combinedPrompt = `${this.buildBasePrompt()}\n\nUser Question: ${message}`

      if (this.useOllama) {
        return this.callOllamaStream(combinedPrompt, onChunk)
      }

      if (this.model) {
        const result   = await this.model.generateContentStream(combinedPrompt)
        let   fullText = ""

        for await (const chunk of result.stream) {
          const chunkText = chunk.text()
          if (chunkText) {
            fullText += chunkText
            onChunk(chunkText)
          }
        }

        return fullText
      }

      throw new Error("No LLM provider configured")
    } catch (error) {
      console.error("[LLMHelper] Error in chatWithGeminiStream:", error)
      throw error
    }
  }
}