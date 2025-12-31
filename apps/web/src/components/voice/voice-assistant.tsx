'use client';

import { cn } from '@moneio/ui';
import { Mic, MicOff, Volume2, Loader2, X } from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';

// Web Speech API types (not included in standard lib.dom.d.ts)
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface VoiceAssistantProps {
  workspaceId: string;
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  className?: string;
}

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

/**
 * Voice Assistant Component
 *
 * Provides voice-driven interaction with the financial assistant:
 * 1. Press to speak (uses Web Speech API for STT)
 * 2. Sends transcript to chat API
 * 3. Speaks response using ElevenLabs TTS
 */
export function VoiceAssistant({
  workspaceId,
  onTranscript,
  onResponse,
  className,
}: VoiceAssistantProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check for browser support
  const isSpeechSupported = typeof window !== 'undefined' && 'webkitSpeechRecognition' in window;

  // Initialize speech recognition
  useEffect(() => {
    if (!isSpeechSupported) return;

    const SpeechRecognition = window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onresult = (event) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const text = result[0].transcript;

      setTranscript(text);

      if (result.isFinal) {
        handleTranscriptComplete(text);
      }
    };

    recognitionRef.current.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(`Speech error: ${event.error}`);
      setState('idle');
    };

    recognitionRef.current.onend = () => {
      if (state === 'listening') {
        setState('idle');
      }
    };

    return () => {
      recognitionRef.current?.abort();
    };
  }, [isSpeechSupported]);

  // Handle completed transcript
  const handleTranscriptComplete = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setState('idle');
        return;
      }

      onTranscript?.(text);
      setState('processing');

      try {
        // Send to chat API
        const chatResponse = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            message: text,
            conversationId,
          }),
        });

        if (!chatResponse.ok) {
          throw new Error('Chat API failed');
        }

        const data = await chatResponse.json();
        // data.message is an object with {id, role, content, timestamp, metadata}
        const responseContent =
          typeof data.message === 'string' ? data.message : data.message?.content || '';
        setResponse(responseContent);
        setConversationId(data.conversationId);
        onResponse?.(responseContent);

        // Speak the response using ElevenLabs
        if (responseContent) {
          await speakResponse(responseContent);
        }
      } catch (err) {
        console.error('Chat error:', err);
        setError('Failed to get response');
        setState('idle');
      }
    },
    [workspaceId, conversationId, onTranscript, onResponse]
  );

  // Speak response using ElevenLabs
  const speakResponse = useCallback(async (text: string) => {
    setState('speaking');

    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setState('idle');
        speechSynthesis.speak(utterance);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.onended = () => {
          setState('idle');
          URL.revokeObjectURL(audioUrl);
        };
        await audioRef.current.play();
      }
    } catch (err) {
      console.error('TTS error:', err);
      // Fallback to browser TTS
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => setState('idle');
      speechSynthesis.speak(utterance);
    }
  }, []);

  // Start listening
  const startListening = useCallback(() => {
    if (!recognitionRef.current) return;

    setError(null);
    setTranscript('');
    setState('listening');
    setIsExpanded(true);

    try {
      recognitionRef.current.start();
    } catch {
      setState('idle');
    }
  }, []);

  // Stop listening
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // Stop speaking
  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    speechSynthesis.cancel();
    setState('idle');
  }, []);

  // Close expanded view
  const handleClose = useCallback(() => {
    stopListening();
    stopSpeaking();
    setIsExpanded(false);
    setTranscript('');
    setResponse('');
  }, [stopListening, stopSpeaking]);

  if (!isSpeechSupported) {
    return null; // Don't render if not supported
  }

  return (
    <>
      {/* Hidden audio element for ElevenLabs playback */}
      <audio ref={audioRef} className="hidden" />

      {/* Floating Voice Button */}
      <div className={cn('fixed bottom-24 right-6 z-50', className)}>
        {!isExpanded ? (
          <button
            onClick={startListening}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2'
            )}
            title="Voice Assistant"
          >
            <Mic className="h-6 w-6" />
          </button>
        ) : (
          <div className="w-80 rounded-2xl border border-border bg-card p-4 shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-3 w-3 rounded-full',
                    state === 'listening' && 'bg-danger-500 animate-pulse',
                    state === 'processing' && 'bg-yellow-500 animate-pulse',
                    state === 'speaking' && 'bg-success-500 animate-pulse',
                    state === 'idle' && 'bg-muted'
                  )}
                />
                <span className="text-sm font-medium text-foreground">
                  {state === 'listening' && 'Listening...'}
                  {state === 'processing' && 'Thinking...'}
                  {state === 'speaking' && 'Speaking...'}
                  {state === 'idle' && 'Voice Assistant'}
                </span>
              </div>
              <button
                onClick={handleClose}
                className="p-1 rounded-md hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Transcript */}
            {transcript && (
              <div className="mb-3 p-2 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">You said:</p>
                <p className="text-sm text-foreground">{transcript}</p>
              </div>
            )}

            {/* Response */}
            {response && (
              <div className="mb-3 p-2 rounded-lg bg-primary/10">
                <p className="text-xs text-muted-foreground mb-1">Response:</p>
                <p className="text-sm text-foreground">{response}</p>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mb-3 p-2 rounded-lg bg-danger-50 dark:bg-danger-950">
                <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-3">
              {state === 'idle' && (
                <button
                  onClick={startListening}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    'bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'
                  )}
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}

              {state === 'listening' && (
                <button
                  onClick={stopListening}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    'bg-danger-500 text-white hover:bg-danger-600 transition-colors animate-pulse'
                  )}
                >
                  <MicOff className="h-5 w-5" />
                </button>
              )}

              {state === 'processing' && (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                </div>
              )}

              {state === 'speaking' && (
                <button
                  onClick={stopSpeaking}
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    'bg-success-500 text-white hover:bg-success-600 transition-colors'
                  )}
                >
                  <Volume2 className="h-5 w-5 animate-pulse" />
                </button>
              )}
            </div>

            {/* Hint */}
            <p className="mt-3 text-xs text-center text-muted-foreground">
              {state === 'idle' && 'Tap to ask about your finances'}
              {state === 'listening' && 'Speak now...'}
              {state === 'processing' && 'Processing your request...'}
              {state === 'speaking' && 'Tap to stop'}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
