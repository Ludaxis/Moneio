'use client';

import { cn } from '@moneio/ui';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface AIChatDrawerProps {
  /** Whether the drawer is open */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;
  /** Current page context for suggestions */
  pageContext?: string;
  /** Additional className */
  className?: string;
}

const quickQuestions = [
  { id: 'q1', label: 'How much did I spend this month?', category: 'spending' },
  { id: 'q2', label: "What's my cash runway?", category: 'runway' },
  { id: 'q3', label: 'Show top expenses', category: 'expenses' },
  { id: 'q4', label: 'Any recurring charges?', category: 'recurring' },
];

/**
 * AIChatDrawer - Slide-in panel for AI chat
 *
 * Features:
 * - Slide-in from right (desktop) or bottom (mobile)
 * - Quick question buttons
 * - Chat history
 * - Context-aware suggestions
 */
export function AIChatDrawer({ isOpen, onClose, pageContext, className }: AIChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      // Focus input when opened
      setTimeout(() => inputRef.current?.focus(), 300);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setIsLoading(true);

      try {
        // TODO: Integrate with actual chat API
        // For now, simulate a response
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: `I understand you're asking about "${content}". This feature is coming soon! For now, you can explore the dashboard widgets for insights.`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error('Chat error:', error);
        // Show error message
        const errorMessage: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading]
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      sendMessage(input);
    },
    [input, sendMessage]
  );

  const handleQuickQuestion = useCallback(
    (question: string) => {
      sendMessage(question);
    },
    [sendMessage]
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-drawer bg-black/50 transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed z-drawer bg-background shadow-2xl',
          'flex flex-col',
          'transition-transform duration-300 ease-out',
          // Mobile: slide up from bottom
          'inset-x-0 bottom-0 top-16 rounded-t-2xl',
          // Desktop: slide in from right
          'md:inset-y-0 md:right-0 md:left-auto md:w-[400px] md:rounded-none',
          isOpen
            ? 'translate-y-0 md:translate-x-0'
            : 'translate-y-full md:translate-y-0 md:translate-x-full',
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label="AI Chat"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ai/10">
              <Sparkles className="h-4 w-4 text-ai" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">AI Assistant</h2>
              <p className="text-xs text-muted-foreground">Ask about your finances</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors touch-target"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            // Empty state with quick questions
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Ask me anything about your finances
              </p>

              {pageContext && <p className="text-xs text-center text-ai">Viewing: {pageContext}</p>}

              <div className="grid grid-cols-2 gap-2">
                {quickQuestions.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => handleQuickQuestion(q.label)}
                    className={cn(
                      'text-left p-3 rounded-lg border border-border',
                      'text-sm text-foreground',
                      'hover:bg-accent transition-colors',
                      'touch-target'
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Chat messages
            messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-4 py-2',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-border p-4">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question..."
              className={cn(
                'flex-1 h-10 px-4 rounded-lg',
                'bg-muted text-foreground placeholder:text-muted-foreground',
                'border border-border',
                'focus:outline-none focus:ring-2 focus:ring-ring',
                'text-sm'
              )}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                'h-10 w-10 rounded-lg',
                'flex items-center justify-center',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'touch-target'
              )}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
