// OpenAI LLM client adapter
import OpenAI from 'openai';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { AiConfig, ModelInfo } from '../types';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.1;

export interface OpenAiClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  maxRetries?: number;
  timeout?: number;
}

/**
 * OpenAI LLM client implementation
 *
 * Uses gpt-4o-mini by default for cost efficiency while maintaining quality.
 * Supports JSON mode for structured output extraction.
 */
export class OpenAiClient implements LlmClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(config: OpenAiClientConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
    });
    this.model = config.model || DEFAULT_MODEL;
    this.maxTokens = config.maxTokens || DEFAULT_MAX_TOKENS;
    this.temperature = config.temperature || DEFAULT_TEMPERATURE;
  }

  /**
   * Complete a prompt using OpenAI's chat completions API
   *
   * @param prompt - The prompt text to complete
   * @param _schema - Optional schema (unused, we use JSON mode instead)
   * @returns The model's response text
   */
  async complete(prompt: string, _schema?: unknown): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert document data extractor. Always respond with valid JSON only, no markdown or explanations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned empty response');
    }

    return content;
  }

  /**
   * Get model info for tracking and auditing
   */
  getModelInfo(): ModelInfo {
    return {
      provider: 'openai',
      model: this.model,
      version: '2024', // API version
    };
  }
}

/**
 * Factory function to create OpenAI client from environment config
 */
export function createOpenAiClient(config?: Partial<AiConfig>): OpenAiClient {
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  return new OpenAiClient({
    apiKey,
    model: config?.model || DEFAULT_MODEL,
    maxRetries: config?.maxRetries || 3,
    timeout: config?.timeout || 60000,
  });
}

/**
 * Create an OpenAI client configured for chat (streaming support in T22)
 */
export function createOpenAiChatClient(config?: Partial<AiConfig>): OpenAiClient {
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  return new OpenAiClient({
    apiKey,
    model: config?.model || 'gpt-4o',
    maxRetries: config?.maxRetries || 3,
    timeout: config?.timeout || 60000,
    temperature: 0.7, // Higher temperature for chat
  });
}
