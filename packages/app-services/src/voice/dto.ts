/**
 * Voice DTOs - API request/response types for voice endpoints
 */

import { z } from 'zod';

// Query schema for voice query endpoint
export const voiceQuerySchema = z.object({
  workspaceId: z.string().uuid(),
  question: z.string().min(1).max(500).optional(),
});

export type VoiceQueryInput = z.infer<typeof voiceQuerySchema>;

// Body schema for voice speak endpoint
export const voiceSpeakBodySchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
});

export type VoiceSpeakInput = z.infer<typeof voiceSpeakBodySchema>;

// Response types
export interface VoiceQueryResponse {
  answer: string;
}

export interface VoiceSpeakResponse {
  audioBuffer: ArrayBuffer;
  contentType: string;
}
