// LLM client exports
export * from './openai';
export * from './gemini';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { AiConfig } from '../types';

import { createGeminiChatClient, createGeminiClient } from './gemini';
import { createOpenAiChatClient, createOpenAiClient } from './openai';

/**
 * Create an LLM client with provider fallback
 * Priority: Gemini > OpenAI
 */
export function createLlmClient(config?: Partial<AiConfig>): LlmClient {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (geminiKey) {
    return createGeminiClient({ ...config, apiKey: geminiKey });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return createOpenAiClient({ ...config, apiKey: openaiKey });
  }

  throw new Error('GEMINI_API_KEY, GOOGLE_AI_API_KEY, or OPENAI_API_KEY is required');
}

/**
 * Create an LLM client configured for chat with provider fallback
 * Priority: Gemini > OpenAI
 */
export function createChatClient(config?: Partial<AiConfig>): LlmClient {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (geminiKey) {
    return createGeminiChatClient({ ...config, apiKey: geminiKey });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return createOpenAiChatClient({ ...config, apiKey: openaiKey });
  }

  throw new Error('GEMINI_API_KEY, GOOGLE_AI_API_KEY, or OPENAI_API_KEY is required');
}
