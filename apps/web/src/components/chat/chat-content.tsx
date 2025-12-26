'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Send, Bot, User, FileText, CreditCard, Receipt, Loader2 } from 'lucide-react';
import { Button, Input, Badge } from '@moneio/ui';

interface Citation {
  type: 'invoice' | 'transaction' | 'document';
  id: string;
  title: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  followUps?: string[];
  createdAt: Date;
}

export function ChatContent() {
  const t = useTranslations('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // TODO: Call chat API
    // Simulate response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I can help you understand your financial data. To get started, please upload some documents or import your bank transactions. Once you have data, I can answer questions about your spending, cashflow, VAT, and more.',
        followUps: [
          'How do I upload a document?',
          'What reports can you generate?',
          'Can you explain how categorization works?',
        ],
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  const handleFollowUp = (question: string) => {
    setInput(question);
  };

  const CitationIcon = ({ type }: { type: Citation['type'] }) => {
    switch (type) {
      case 'invoice':
        return <Receipt className="h-3 w-3" />;
      case 'transaction':
        return <CreditCard className="h-3 w-3" />;
      case 'document':
        return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-auto p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/20">
              <Bot className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-50">
              {t('askAnything')}
            </h2>
            <p className="mt-2 max-w-md text-neutral-600 dark:text-neutral-400">
              Ask me about your transactions, invoices, spending patterns, or VAT calculations.
              I&apos;ll provide answers with citations to your data.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFollowUp('What was my total spending last month?')}
              >
                Total spending last month?
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFollowUp('How much VAT did I pay this quarter?')}
              >
                VAT this quarter?
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFollowUp('Show me my top merchants')}
              >
                Top merchants?
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 ${
                  message.role === 'user' ? 'justify-end' : ''
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/20">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] space-y-3 ${
                    message.role === 'user'
                      ? 'rounded-lg bg-primary-600 px-4 py-3 text-white'
                      : ''
                  }`}
                >
                  <p className="text-sm leading-relaxed">{message.content}</p>

                  {/* Citations */}
                  {message.citations && message.citations.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-neutral-500">
                        {t('citations')}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {message.citations.map((citation, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="cursor-pointer hover:bg-neutral-200"
                          >
                            <CitationIcon type={citation.type} />
                            <span className="ml-1">{citation.title}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-ups */}
                  {message.followUps && message.followUps.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-neutral-500">
                        {t('followUp')}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {message.followUps.map((followUp, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={() => handleFollowUp(followUp)}
                          >
                            {followUp}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900/20">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{t('thinking')}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('placeholder')}
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" disabled={!input.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
