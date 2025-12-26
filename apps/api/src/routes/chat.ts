// Chat routes
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const chatSchema = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

export const chatRoutes = new Hono();

// Send message
chatRoutes.post('/', zValidator('json', chatSchema), async (c) => {
  const { workspaceId, conversationId, message } = c.req.valid('json');

  // TODO: Process message through chat adapter
  // const response = await chatAdapter.answer(
  //   message,
  //   { workspaceId, locale: 'en', baseCurrency: 'EUR' },
  //   conversationHistory
  // );

  return c.json({
    conversationId: conversationId || crypto.randomUUID(),
    message: {
      role: 'assistant',
      content:
        "I'm your AI accounting assistant. I can help you understand your financial data, " +
        "answer questions about your invoices and transactions, and provide insights about your " +
        "business finances. What would you like to know?",
      citations: [],
      timestamp: new Date().toISOString(),
    },
    followUpQuestions: [
      'What was my total spending last month?',
      'How does my cashflow compare to the previous quarter?',
      'Which merchants do I spend the most with?',
    ],
  });
});

// Get conversation history
chatRoutes.get('/conversations/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Fetch conversation history
  // const conversation = await chatService.getConversation(id);

  return c.json({
    id,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

// List conversations
chatRoutes.get('/conversations', async (c) => {
  const workspaceId = c.req.query('workspaceId');

  if (!workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  // TODO: Fetch conversations
  // const conversations = await chatService.getConversations(workspaceId);

  return c.json({
    conversations: [],
  });
});

// Delete conversation
chatRoutes.delete('/conversations/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Delete conversation
  // await chatService.deleteConversation(id);

  return c.json({
    id,
    message: 'Conversation deleted',
  });
});

// Suggested questions based on context
chatRoutes.get('/suggestions', async (c) => {
  const workspaceId = c.req.query('workspaceId');

  if (!workspaceId) {
    return c.json({ error: 'workspaceId is required' }, 400);
  }

  // TODO: Generate contextual suggestions
  // const suggestions = await chatService.getSuggestions(workspaceId);

  return c.json({
    suggestions: [
      'What is my current cashflow status?',
      'Show me pending invoices',
      'What are my top expense categories this month?',
      'How much VAT have I collected this quarter?',
      'Compare my spending this month vs last month',
    ],
  });
});
