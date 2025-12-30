// Google Gemini LLM client adapter
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { AiConfig, ModelInfo } from '../types';

const DEFAULT_MODEL = 'gemini-2.0-flash-exp';
const CHAT_MODEL = 'gemini-2.0-flash-exp';
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
 * Uses gemini-1.5-flash by default for cost efficiency while maintaining quality.
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
    const generativeModel = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: {
        maxOutputTokens: this.maxTokens,
        temperature: this.temperature,
        responseMimeType: 'application/json',
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

    const systemPrompt =
      'You are an expert document data extractor. Always respond with valid JSON only, no markdown or explanations.';

    const result = await generativeModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
        },
      ],
    });

    const response = result.response;
    const content = response.text();

    if (!content) {
      throw new Error('Gemini returned empty response');
    }

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
