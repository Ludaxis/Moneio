'use client';

import { Bot, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, useEffect } from 'react';

import { ChatMessage, ChatInput, SuggestedQuestions } from '@/components/chat';
import { useWorkspace } from '@/hooks/use-workspace';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    queryType?: string;
    dataPoints?: Array<{
      label: string;
      value: number;
      formatted: string;
      percentage?: number;
    }>;
    suggestions?: string[];
  };
}

export default function ChatPage() {
  const t = useTranslations('navigation');
  const { workspaceId, loading: workspaceLoading } = useWorkspace();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!workspaceId || loading) return;

      // Add user message
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setLoading(true);

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            message: content,
            conversationId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to get response');
        }

        const data = await response.json();

        // Add assistant message
        const assistantMessage: Message = {
          id: data.message?.id || `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message?.content || 'I apologize, but I could not process your request.',
          timestamp: new Date(data.message?.timestamp || Date.now()),
          metadata: data.message?.metadata,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setConversationId(data.conversationId);
      } catch (error) {
        console.error('Chat error:', error);
        // Add error message
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            'I apologize, but I encountered an error processing your request. Please try again.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, loading, conversationId]
  );

  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  // Show loading state while workspace loads
  if (workspaceLoading) {
    return (
      <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
        <div className="animate-pulse text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show message if no workspace
  if (!workspaceId) {
    return (
      <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
        <div className="text-center">
          <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">No Workspace Selected</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Create or select a workspace to start chatting with your AI CFO.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">{t('chat')}</h1>
          <p className="text-sm text-muted-foreground">Your AI-powered financial assistant</p>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto py-6">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="w-full max-w-2xl">
              <SuggestedQuestions onSelect={sendMessage} />
            </div>
          </div>
        ) : (
          <div className="space-y-6 px-4">
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role}
                content={message.content}
                timestamp={message.timestamp}
                metadata={message.metadata}
                onSuggestionClick={handleSuggestionClick}
              />
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary-500 [animation-delay:-0.3s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary-500 [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-primary-500" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border pt-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            onSend={sendMessage}
            disabled={!workspaceId}
            loading={loading}
            placeholder="Ask about spending, income, runway, recurring expenses..."
          />
        </div>
      </div>
    </div>
  );
}
