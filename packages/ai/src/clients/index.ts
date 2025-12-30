// LLM client exports
export * from './openai';
export * from './gemini';

import type { LlmClient } from '../extraction/invoice-extractor';
import type { AiConfig } from '../types';

import { createGeminiChatClient, createGeminiClient } from './gemini';
// OpenAI disabled for testing - uncomment to re-enable
// import { createOpenAiChatClient, createOpenAiClient } from './openai';

/**
 * Create an LLM client - currently Gemini only
 * TODO: Re-enable OpenAI fallback after Gemini testing is complete
 */
export function createLlmClient(config?: Partial<AiConfig>): LlmClient {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (geminiKey) {
    return createGeminiClient({ ...config, apiKey: geminiKey });
  }

  // OpenAI fallback disabled for testing
  // const openaiKey = process.env.OPENAI_API_KEY;
  // if (openaiKey) {
  //   return createOpenAiClient({ ...config, apiKey: openaiKey });
  // }

  throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY is required');
}

/**
 * Create an LLM client configured for chat - currently Gemini only
 * TODO: Re-enable OpenAI fallback after Gemini testing is complete
 */
export function createChatClient(config?: Partial<AiConfig>): LlmClient {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (geminiKey) {
    return createGeminiChatClient({ ...config, apiKey: geminiKey });
  }

  // OpenAI fallback disabled for testing
  // const openaiKey = process.env.OPENAI_API_KEY;
  // if (openaiKey) {
  //   return createOpenAiChatClient({ ...config, apiKey: openaiKey });
  // }

  throw new Error('GEMINI_API_KEY or GOOGLE_AI_API_KEY is required');
}
