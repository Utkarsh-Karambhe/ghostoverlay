import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai"
import fs from "fs"

interface OllamaResponse {
  response: string
  done: boolean
}

export class LLMHelper {
  private model: GenerativeModel | null = null
  
  // UPDATED PROMPT: More direct and balanced for code vs text
  private readonly systemPrompt = `You are Wingman AI, a professional-grade assistant designed for developers and technical professionals.

CORE BEHAVIOR:
1. Be direct and professional—no fluff, no "Here's the code" preamble.
2. For coding: Provide production-ready code first, then brief explanation only if asked.
3. For non-coding: Use bullet points or numbered lists; keep answers concise.
4. Always assume the user is intelligent and time-constrained.

CODE QUALITY RULES:
- Write code that follows industry best practices (SOLID, DRY, error handling).
- Include comments only for non-obvious logic or business rules.
- For Java: Follow Google/Oracle style guide (camelCase, proper indentation, 100-char line limit).
- For Python: Follow PEP 8 standards.
- Always handle errors gracefully (try-catch, null checks, validation).
- If code requires setup/dependencies, list them explicitly.

ACCURACY & TRUTHFULNESS:
- Do NOT invent APIs, libraries, or methods that don't exist.
- If you're unsure about syntax or behavior, say "I'm not certain" and explain why.
- If the question lacks context, ask 1 clarifying questions before answering.
- Avoid over-claiming; be specific about version numbers, frameworks, and compatibility.

OUTPUT FORMATTING:
- Code blocks: Use proper language tags (\`\`\`java, \`\`\`python, \`\`\`javascript).
- Preserve indentation and line breaks—never minify or compress.
- If multiple files are needed, clearly label each file with its path/name.
- If response spans multiple concepts, use clear section headers.

REFUSAL RULES:
- Refuse requests for: cheating/exam assistance, bypassing security, harmful/illegal actions.
- If a request seems unethical, offer a legitimate alternative (e.g., "Learning resources" instead of "exam answers").

EDGE CASES:
- If the problem is ambiguous or underspecified, ask clarifying questions.
- If performance/security tradeoffs exist, mention them.
- If deprecated syntax is detected, suggest the modern alternative.`

  private readonly aptitudeReasoningPrompt = `
SPECIAL INSTRUCTION (MANDATORY):

If the question belongs to ANY of the following categories:
- Verbal Reasoning
- Logical Reasoning
- Quantitative Aptitude
- Analytical Reasoning
- Critical Reasoning

Then you MUST:
1. Solve the problem step-by-step
2. Clearly explain each logical or mathematical step
3. Show how you arrive at the final answer
4. Keep explanations concise but complete
5. End with a clearly labeled FINAL ANSWER

Do NOT skip steps.
Do NOT give only the final answer.
`

  private useOllama: boolean = false
  private ollamaModel: string = "llama3.2"
  private ollamaUrl: string = "http://localhost:11434"

  constructor(apiKey?: string, useOllama: boolean = false, ollamaModel?: string, ollamaUrl?: string) {
    this.useOllama = useOllama
    
    if (useOllama) {
      this.ollamaUrl = ollamaUrl || "http://localhost:11434"
      this.ollamaModel = ollamaModel || "llama3.2" // Default fallback
      console.log(`[LLMHelper] Using Ollama with model: ${this.ollamaModel}`)
      
      // Auto-detect and use first available model if specified model doesn't exist
      this.initializeOllamaModel()
    } else if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey)
      this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
      console.log("[LLMHelper] Using Google Gemini")
    } else {
      // It is okay to initialize without keys if we switch later, but warn
      console.warn("[LLMHelper] No API key or Ollama enabled initially.")
    }
  }

  private async fileToGenerativePart(imagePath: string) {
    const imageData = await fs.promises.readFile(imagePath)
    return {
      inlineData: {
        data: imageData.toString("base64"),
        mimeType: "image/png"
      }
    }
  }

  private cleanJsonResponse(text: string): string {
    // Remove markdown code block syntax if present
    text = text.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
    // Remove any leading/trailing whitespace
    text = text.trim();
    return text;
  }

  private async callOllama(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data: OllamaResponse = await response.json()
      return data.response

    } catch (error) {
      console.error("[LLMHelper] Error calling Ollama:", error)
      throw new Error(`Failed to connect to Ollama: ${error.message}. Make sure Ollama is running on ${this.ollamaUrl}`)
    }
  }

  private async checkOllamaAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  private async initializeOllamaModel(): Promise<void> {
    try {
      const availableModels = await this.getOllamaModels()
      if (availableModels.length === 0) {
        console.warn("[LLMHelper] No Ollama models found")
        return
      }

      // Check if current model exists, if not use the first available
      if (!availableModels.includes(this.ollamaModel)) {
        this.ollamaModel = availableModels[0]
        console.log(`[LLMHelper] Auto-selected first available model: ${this.ollamaModel}`)
      }

      // Test the selected model works
      const testResult = await this.callOllama("Hello")
      console.log(`[LLMHelper] Successfully initialized with model: ${this.ollamaModel}`)
    } catch (error) {
      console.error(`[LLMHelper] Failed to initialize Ollama model: ${error.message}`)
      // Try to use first available model as fallback
      try {
        const models = await this.getOllamaModels()
        if (models.length > 0) {
          this.ollamaModel = models[0]
          console.log(`[LLMHelper] Fallback to: ${this.ollamaModel}`)
        }
      } catch (fallbackError) {
        console.error(`[LLMHelper] Fallback also failed: ${fallbackError.message}`)
      }
    }
  }

  public async extractProblemFromImages(imagePaths: string[]) {
    try {
      // Only Gemini supports multi-modal image analysis easily via this SDK
      if (this.useOllama || !this.model) {
         throw new Error("Image extraction requires Gemini mode. Ollama vision not fully implemented in this helper.")
      }

      const imageParts = await Promise.all(imagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n${this.aptitudeReasoningPrompt}\n\nYou are a wingman. Please analyze these images and extract the following information in JSON format:\n{
  "problem_statement": "A clear statement of the problem or situation depicted in the images.",
  "context": "Relevant background or context from the images.",
  "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
  "reasoning": "Explanation of why these suggestions are appropriate."
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      return JSON.parse(text)
    } catch (error) {
      console.error("Error extracting problem from images:", error)
      throw error
    }
  }

  public async generateSolution(problemInfo: any) {
    const prompt = `${this.systemPrompt}\n${this.aptitudeReasoningPrompt}\n\nGiven this problem or situation:\n${JSON.stringify(problemInfo, null, 2)}\n\nPlease provide your response in the following JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

    console.log("[LLMHelper] Calling Gemini LLM for solution...");
    try {
      if (this.useOllama) {
         // Fallback for Ollama JSON handling if needed (Ollama JSON mode is tricky, basic text preferred)
         const textResponse = await this.callOllama(prompt);
         const cleaned = this.cleanJsonResponse(textResponse);
         return JSON.parse(cleaned);
      } else if (this.model) {
         const result = await this.model.generateContent(prompt)
         console.log("[LLMHelper] Gemini LLM returned result.");
         const response = await result.response
         const text = this.cleanJsonResponse(response.text())
         const parsed = JSON.parse(text)
         console.log("[LLMHelper] Parsed LLM response:", parsed)
         return parsed
      }
      throw new Error("No provider configured");
    } catch (error) {
      console.error("[LLMHelper] Error in generateSolution:", error);
      throw error;
    }
  }

  public async debugSolutionWithImages(problemInfo: any, currentCode: string, debugImagePaths: string[]) {
    try {
       if (this.useOllama || !this.model) {
         throw new Error("Visual debugging requires Gemini mode.")
      }

      const imageParts = await Promise.all(debugImagePaths.map(path => this.fileToGenerativePart(path)))
      
      const prompt = `${this.systemPrompt}\n${this.aptitudeReasoningPrompt}\n\nYou are a wingman. Given:\n1. The original problem or situation: ${JSON.stringify(problemInfo, null, 2)}\n2. The current response or approach: ${currentCode}\n3. The debug information in the provided images\n\nPlease analyze the debug information and provide feedback in this JSON format:\n{
  "solution": {
    "code": "The code or main answer here.",
    "problem_statement": "Restate the problem or situation.",
    "context": "Relevant background/context.",
    "suggested_responses": ["First possible answer or action", "Second possible answer or action", "..."],
    "reasoning": "Explanation of why these suggestions are appropriate."
  }
}\nImportant: Return ONLY the JSON object, without any markdown formatting or code blocks.`

      const result = await this.model.generateContent([prompt, ...imageParts])
      const response = await result.response
      const text = this.cleanJsonResponse(response.text())
      const parsed = JSON.parse(text)
      console.log("[LLMHelper] Parsed debug LLM response:", parsed)
      return parsed
    } catch (error) {
      console.error("Error debugging solution with images:", error)
      throw error
    }
  }

  public async analyzeAudioFile(audioPath: string) {
    // --- FIX: Check for Ollama mode ---
    if (this.useOllama || !this.model) {
      console.warn("Audio analysis skipped: Local Ollama does not support audio files.");
      return { text: "Audio analysis requires Gemini mode.", timestamp: Date.now() };
    }

    try {
      const audioData = await fs.promises.readFile(audioPath);
      const audioPart = {
        inlineData: {
          data: audioData.toString("base64"),
          mimeType: "audio/mp3"
        }
      };
      const prompt = `${this.systemPrompt}\n${this.aptitudeReasoningPrompt}\n\nDescribe this audio clip in a short, concise answer.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio file:", error);
      throw error;
    }
  }

  public async analyzeAudioFromBase64(data: string, mimeType: string) {
    // --- FIX: Check for Ollama mode ---
    if (this.useOllama || !this.model) {
      console.warn("Audio analysis skipped: Local Ollama does not support audio base64.");
      return { text: "Audio analysis requires Gemini mode.", timestamp: Date.now() };
    }

    try {
      const audioPart = {
        inlineData: {
          data,
          mimeType
        }
      };
      const prompt = `${this.systemPrompt}\n${this.aptitudeReasoningPrompt}\n\nDescribe this audio clip in a short, concise answer.`;
      const result = await this.model.generateContent([prompt, audioPart]);
      const response = await result.response;
      const text = response.text();
      return { text, timestamp: Date.now() };
    } catch (error) {
      console.error("Error analyzing audio from base64:", error);
      throw error;
    }
  }

  public async analyzeImageFile(imagePath: string) {
    try {
      // If using Ollama, we try to use LLaVA if installed, otherwise basic text fallback
      if (this.useOllama) {
         return { text: "Image analysis requires Gemini or a Vision-capable Ollama model (e.g. LLaVA).", timestamp: Date.now() }
      }

      if (!this.model) throw new Error("No Gemini model available");

      const imageData = await fs.promises.readFile(imagePath)
  
      const imagePart = {
        inlineData: {
          data: imageData.toString("base64"),
          mimeType: "image/png"
        }
      }
  
      const prompt = `
  ${this.systemPrompt}
  ${this.aptitudeReasoningPrompt}
  
  You are analyzing a screenshot provided by the user.
  
  IMPORTANT OUTPUT RULES (STRICT):
  - If your answer contains ANY code, you MUST:
    - Wrap the code in a Markdown code block (triple backticks)
    - Specify the language (e.g. \`\`\`java, \`\`\`python)
    - Preserve proper indentation and line breaks
    - NEVER return code in a single line
    - Each import, statement, and block must be on its own line
  
  - If the code is Java:
    - Each import must be on a new line
    - Use standard Java formatting
    - Properly indent classes, methods, and loops
  
  - If the answer does NOT require code:
    - Respond in clear, readable paragraphs or bullet points
  
  TASK:
  1. Briefly describe what is shown in the image.
  2. If the image implies a coding problem or question, provide a clear and well-formatted solution.
  3. Suggest a few possible next actions the user could take.
  
  Do NOT return JSON.
  Do NOT compress or minify output.
  Formatting quality is very important.
  `
  
      const result = await this.model.generateContent([prompt, imagePart])
      const response = await result.response
      const text = response.text()
  
      return { text, timestamp: Date.now() }
    } catch (error) {
      console.error("Error analyzing image file:", error)
      throw error
    }
  }
  
  public async chatWithGemini(message: string): Promise<string> {
    try {
      // Inject both system prompts into the message flow for chat
      const combinedPrompt = `${this.systemPrompt}\n${this.aptitudeReasoningPrompt}\n\nUser Question: ${message}`;
      
      if (this.useOllama) {
        return this.callOllama(combinedPrompt);
      } else if (this.model) {
        const result = await this.model.generateContent(combinedPrompt);
        const response = await result.response;
        return response.text();
      } else {
        throw new Error("No LLM provider configured");
      }
    } catch (error) {
      console.error("[LLMHelper] Error in chatWithGemini:", error);
      throw error;
    }
  }

  public async chat(message: string): Promise<string> {
    return this.chatWithGemini(message);
  }

  public isUsingOllama(): boolean {
    return this.useOllama;
  }

  public async getOllamaModels(): Promise<string[]> {
    if (!this.useOllama) return [];
    
    try {
      const response = await fetch(`${this.ollamaUrl}/api/tags`);
      if (!response.ok) throw new Error('Failed to fetch models');
      
      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error("[LLMHelper] Error fetching Ollama models:", error);
      return [];
    }
  }

  public getCurrentProvider(): "ollama" | "gemini" {
    return this.useOllama ? "ollama" : "gemini";
  }

  public getCurrentModel(): string {
    return this.useOllama ? this.ollamaModel : "gemini-2.0-flash";
  }

  public async switchToOllama(model?: string, url?: string): Promise<void> {
    this.useOllama = true;
    if (url) this.ollamaUrl = url;
    
    if (model) {
      this.ollamaModel = model;
    } else {
      // Auto-detect first available model
      await this.initializeOllamaModel();
    }
    
    console.log(`[LLMHelper] Switched to Ollama: ${this.ollamaModel} at ${this.ollamaUrl}`);
  }

  public async switchToGemini(apiKey?: string): Promise<void> {
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    }
    
    if (!this.model && !apiKey) {
      throw new Error("No Gemini API key provided and no existing model instance");
    }
    
    this.useOllama = false;
    console.log("[LLMHelper] Switched to Gemini");
  }

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.useOllama) {
        const available = await this.checkOllamaAvailable();
        if (!available) {
          return { success: false, error: `Ollama not available at ${this.ollamaUrl}` };
        }
        // Test with a simple prompt
        await this.callOllama("Hello");
        return { success: true };
      } else {
        if (!this.model) {
          return { success: false, error: "No Gemini model configured" };
        }
        // Test with a simple prompt
        const result = await this.model.generateContent("Hello");
        const response = await result.response;
        const text = response.text(); // Ensure the response is valid
        if (text) {
          return { success: true };
        } else {
          return { success: false, error: "Empty response from Gemini" };
        }
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
