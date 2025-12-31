'use client';

import { useConversation } from '@elevenlabs/react';
import { cn } from '@moneio/ui';
import { Mic, MicOff, Volume2, X } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';

interface VoiceAssistantProps {
  workspaceId: string;
  onTranscript?: (text: string) => void;
  onResponse?: (text: string) => void;
  className?: string;
}

type ConversationStatus = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Voice Assistant Component using ElevenLabs Conversational AI
 *
 * Real-time voice conversation with low latency:
 * - Uses ElevenLabs agent for STT + LLM + TTS
 * - Client tools provide access to financial data
 * - WebRTC connection for instant responses
 */
export function VoiceAssistant({
  workspaceId,
  onTranscript,
  onResponse,
  className,
}: VoiceAssistantProps) {
  const [status, setStatus] = useState<ConversationStatus>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastResponse, setLastResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);

  // ElevenLabs Conversational AI hook with client tools for financial data
  const conversation = useConversation({
    onConnect: () => {
      console.log('[Voice] Connected to ElevenLabs agent');
      setStatus('connected');
      setError(null);
    },
    onDisconnect: () => {
      console.log('[Voice] Disconnected from ElevenLabs agent');
      setStatus('idle');
    },
    onMessage: (message) => {
      console.log('[Voice] Message:', message);
      // Handle transcriptions and responses
      if (message.source === 'user') {
        setLastTranscript(message.message);
        onTranscript?.(message.message);
      } else if (message.source === 'ai') {
        setLastResponse(message.message);
        onResponse?.(message.message);
      }
    },
    onError: (err) => {
      console.error('[Voice] Error:', err);
      setError(typeof err === 'string' ? err : 'Connection error');
      setStatus('error');
    },
    // Single powerful tool that queries the financial database via chat API
    clientTools: {
      // Query financial data - full database access through chat API
      queryFinancialData: async (params: { question: string }) => {
        console.log('[Voice Tool] queryFinancialData called with:', params.question);
        try {
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              workspaceId,
              message: params.question,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to query financial data');
          }

          const data = await response.json();
          // Extract the response content
          const answer =
            typeof data.message === 'string'
              ? data.message
              : data.message?.content || 'No data found';

          console.log('[Voice Tool] queryFinancialData response:', answer);
          return answer;
        } catch (err) {
          console.error('[Voice Tool] queryFinancialData error:', err);
          return 'Sorry, I was unable to retrieve that financial information. Please try again.';
        }
      },
    },
  });

  // Check for microphone permission on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((result) => {
          setHasMicPermission(result.state === 'granted');
        })
        .catch(() => {
          // Permission API not supported, will check when starting
          setHasMicPermission(null);
        });
    }
  }, []);

  // Request microphone permission
  const requestMicPermission = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasMicPermission(true);
      return true;
    } catch {
      setError('Microphone access denied');
      setHasMicPermission(false);
      return false;
    }
  }, []);

  // Start conversation
  const startConversation = useCallback(async () => {
    setError(null);
    setLastTranscript('');
    setLastResponse('');
    setIsExpanded(true);
    setStatus('connecting');

    // Ensure microphone permission
    if (hasMicPermission !== true) {
      const granted = await requestMicPermission();
      if (!granted) {
        setStatus('error');
        return;
      }
    }

    try {
      // Get agent ID from environment or use default
      const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

      if (!agentId) {
        throw new Error('ElevenLabs agent ID not configured');
      }

      await conversation.startSession({
        agentId,
        connectionType: 'webrtc',
      });
    } catch (err) {
      console.error('[Voice] Failed to start conversation:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setStatus('error');
    }
  }, [conversation, hasMicPermission, requestMicPermission]);

  // End conversation
  const endConversation = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (err) {
      console.error('[Voice] Failed to end conversation:', err);
    }
    setStatus('idle');
  }, [conversation]);

  // Close the expanded view
  const handleClose = useCallback(() => {
    endConversation();
    setIsExpanded(false);
    setLastTranscript('');
    setLastResponse('');
    setError(null);
  }, [endConversation]);

  // Determine if agent is speaking
  const isSpeaking = conversation.isSpeaking;

  return (
    <div className={cn('fixed bottom-24 right-6 z-50', className)}>
      {!isExpanded ? (
        <button
          onClick={startConversation}
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
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-3 w-3 rounded-full',
                  status === 'connecting' && 'animate-pulse bg-yellow-500',
                  status === 'connected' && !isSpeaking && 'animate-pulse bg-danger-500',
                  status === 'connected' && isSpeaking && 'animate-pulse bg-success-500',
                  status === 'idle' && 'bg-muted',
                  status === 'error' && 'bg-danger-500'
                )}
              />
              <span className="text-sm font-medium text-foreground">
                {status === 'connecting' && 'Connecting...'}
                {status === 'connected' && !isSpeaking && 'Listening...'}
                {status === 'connected' && isSpeaking && 'Speaking...'}
                {status === 'idle' && 'Voice Assistant'}
                {status === 'error' && 'Error'}
              </span>
            </div>
            <button
              onClick={handleClose}
              className="rounded-md p-1 transition-colors hover:bg-muted"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Transcript */}
          {lastTranscript && (
            <div className="mb-3 rounded-lg bg-muted/50 p-2">
              <p className="mb-1 text-xs text-muted-foreground">You said:</p>
              <p className="text-sm text-foreground">{lastTranscript}</p>
            </div>
          )}

          {/* Response */}
          {lastResponse && (
            <div className="mb-3 rounded-lg bg-primary/10 p-2">
              <p className="mb-1 text-xs text-muted-foreground">Response:</p>
              <p className="text-sm text-foreground">{lastResponse}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-3 rounded-lg bg-danger-50 p-2 dark:bg-danger-950">
              <p className="text-sm text-danger-600 dark:text-danger-400">{error}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {status === 'idle' && (
              <button
                onClick={startConversation}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground transition-colors hover:bg-primary/90'
                )}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}

            {status === 'connecting' && (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              </div>
            )}

            {status === 'connected' && !isSpeaking && (
              <button
                onClick={endConversation}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  'animate-pulse bg-danger-500 text-white transition-colors hover:bg-danger-600'
                )}
              >
                <MicOff className="h-5 w-5" />
              </button>
            )}

            {status === 'connected' && isSpeaking && (
              <button
                onClick={endConversation}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  'bg-success-500 text-white transition-colors hover:bg-success-600'
                )}
              >
                <Volume2 className="h-5 w-5 animate-pulse" />
              </button>
            )}

            {status === 'error' && (
              <button
                onClick={startConversation}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground transition-colors hover:bg-primary/90'
                )}
              >
                <Mic className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Hint */}
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {status === 'idle' && 'Tap to start a voice conversation'}
            {status === 'connecting' && 'Establishing connection...'}
            {status === 'connected' && !isSpeaking && "Speak now - I'm listening"}
            {status === 'connected' && isSpeaking && 'Tap to end conversation'}
            {status === 'error' && 'Tap to try again'}
          </p>
        </div>
      )}
    </div>
  );
}
