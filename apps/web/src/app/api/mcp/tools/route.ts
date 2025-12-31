import { NextResponse } from 'next/server';

// MCP Tool definitions for ElevenLabs
const TOOLS = [
  {
    name: 'get_cashflow',
    description: 'Get cashflow summary showing income, expenses, and net cashflow',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID' },
        period: {
          type: 'string',
          description: 'Period: this_month, last_month, this_year, all_time',
        },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_biggest_expenses',
    description: 'Get the largest expenses for a period',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        period: { type: 'string' },
        limit: { type: 'number', description: 'Number of expenses (default: 5)' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_spending',
    description: 'Get total spending or spending by merchant',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        merchant: { type: 'string', description: 'Filter by merchant name' },
        period: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_income',
    description: 'Get total income for a period',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        period: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_runway',
    description: 'Calculate cash runway - months until money runs out',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_subscriptions',
    description: 'Get recurring subscriptions',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_invoices',
    description: 'Get pending or overdue invoices',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        status: { type: 'string', description: 'Filter: pending, overdue, paid' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'search_transactions',
    description: 'Search transactions by description or merchant',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string' },
        query: { type: 'string', description: 'Search term' },
        limit: { type: 'number' },
      },
      required: ['workspaceId', 'query'],
    },
  },
];

// CORS headers for ElevenLabs
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function GET() {
  return NextResponse.json({ tools: TOOLS }, { headers: corsHeaders });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}
