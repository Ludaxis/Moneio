// Google Gemini LLM client adapter
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { AiConfig, ModelInfo } from '../types';

// Use stable GA models - preview models have inconsistent JSON support
const DEFAULT_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';
const CHAT_MODEL = 'gemini-2.0-flash';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.1;

export interface GeminiClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Google Gemini LLM client implementation
 *
 * Uses gemini-3-pro-preview for best quality results.
 * Supports JSON mode for structured output extraction.
 */
export class GeminiClient implements LlmClient {
  private readonly client: GoogleGenerativeAI;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: GeminiClientConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature || DEFAULT_TEMPERATURE;
  }

  /**
   * Complete a prompt using Gemini's generateContent API
   *
   * @param prompt - The prompt text to complete
   * @param _schema - Optional schema (unused, we use JSON instructions instead)
   * @returns The model's response text
   */
  async complete(prompt: string, _schema?: unknown): Promise<string> {
    const systemPrompt =
      'You are an expert document data extractor. Always respond with valid JSON only, no markdown or explanations.';

    // Try with the configured model first, then fallback
    const modelsToTry = [this.model, FALLBACK_MODEL].filter((m, i, arr) => arr.indexOf(m) === i);

    let lastError: Error | null = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini] Trying model: ${modelName}`);
        const result = await this.tryGenerate(modelName, systemPrompt, prompt, true);
        if (result) return result;
      } catch (error) {
        console.warn(`[Gemini] Model ${modelName} with JSON mode failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));

        // Try without JSON mode as fallback
        try {
          console.log(`[Gemini] Retrying ${modelName} without JSON mode`);
          const result = await this.tryGenerate(modelName, systemPrompt, prompt, false);
          if (result) return result;
        } catch (retryError) {
          console.warn(`[Gemini] Model ${modelName} without JSON mode also failed:`, retryError);
          lastError = retryError instanceof Error ? retryError : new Error(String(retryError));
        }
      }
    }

    throw lastError || new Error('All Gemini models failed');
  }

  private async tryGenerate(
    modelName: string,
    systemPrompt: string,
    prompt: string,
    useJsonMode: boolean
  ): Promise<string | null> {
    const generativeModel = this.client.getGenerativeModel({
      model: modelName,
      generationConfig: {
        maxOutputTokens: this.maxTokens,
        temperature: this.temperature,
        ...(useJsonMode ? { responseMimeType: 'application/json' } : {}),
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });

    const result = await generativeModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
        },
      ],
    });

    const response = result.response;

    // Check for blocked content or safety issues
    if (response.promptFeedback?.blockReason) {
      throw new Error(`Gemini blocked prompt: ${response.promptFeedback.blockReason}`);
    }

    // Check candidates for finish reasons
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Gemini finish reason: ${candidate.finishReason}`);
    }

    const content = response.text();

    if (!content) {
      throw new Error('Gemini returned empty response');
    }

    console.log(`[Gemini] Success with model: ${modelName}`);

    // Clean up response if it has markdown code blocks
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.slice(7);
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.slice(3);
    }
    if (cleanContent.endsWith('```')) {
      cleanContent = cleanContent.slice(0, -3);
    }

    return cleanContent.trim();
  }

  /**
   * Get model info for tracking and auditing
   */
  getModelInfo(): ModelInfo {
    return {
      provider: 'google',
      model: this.model,
      version: '2024',
    };
  }
}

/**
 * Factory function to create Gemini client from environment config
 */
export function createGeminiClient(config?: Partial<AiConfig>): GeminiClient {
  const apiKey = config?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY is required');
  }

  return new GeminiClient({
    apiKey,
    model: config?.model || DEFAULT_MODEL,
  });
}

/**
 * Create a Gemini client configured for chat (higher quality model)
 */
export function createGeminiChatClient(config?: Partial<AiConfig>): GeminiClient {
  const apiKey = config?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY is required');
  }

  return new GeminiClient({
    apiKey,
    model: config?.model || CHAT_MODEL,
    temperature: 0.7, // Higher temperature for chat
  });
}
