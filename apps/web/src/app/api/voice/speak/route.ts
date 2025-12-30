/**
 * Text-to-Speech API using ElevenLabs
 *
 * POST /api/voice/speak - Convert text to speech
 *
 * Uses ElevenLabs for high-quality voice synthesis
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
});

// Default voice - Rachel (warm, professional)
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/**
 * POST /api/voice/speak
 * Convert text to speech using ElevenLabs
 */
export async function POST(request: Request) {
  try {
    // Check auth
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { text, voiceId } = parsed.data;

    // Check for ElevenLabs API key
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ElevenLabs not configured' }, { status: 503 });
    }

    // Call ElevenLabs Text-to-Speech API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || DEFAULT_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          Accept: 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', response.status, errorText);
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 });
    }

    // Stream the audio response
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('Voice API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
