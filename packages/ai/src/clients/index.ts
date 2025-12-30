// LLM client exports
export * from './openai';
export * from './gemini';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { AiConfig } from '../types';

import { createGeminiChatClient, createGeminiClient } from './gemini';
import { createOpenAiChatClient, createOpenAiClient } from './openai';

/**
 * Create an LLM client based on available API keys
 * Prefers Gemini if GEMINI_API_KEY is set, falls back to OpenAI
 */
export function createLlmClient(config?: Partial<AiConfig>): LlmClient {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    return createGeminiClient({ ...config, apiKey: geminiKey });
  }

  if (openaiKey) {
    return createOpenAiClient({ ...config, apiKey: openaiKey });
  }

  throw new Error('Either GEMINI_API_KEY or OPENAI_API_KEY is required');
}

/**
 * Create an LLM client configured for chat
 * Prefers Gemini if GEMINI_API_KEY is set, falls back to OpenAI
 */
export function createChatClient(config?: Partial<AiConfig>): LlmClient {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    return createGeminiChatClient({ ...config, apiKey: geminiKey });
  }

  if (openaiKey) {
    return createOpenAiChatClient({ ...config, apiKey: openaiKey });
  }

  throw new Error('Either GEMINI_API_KEY or OPENAI_API_KEY is required');
}
