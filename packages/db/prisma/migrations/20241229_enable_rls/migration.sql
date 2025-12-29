-- Enable Row Level Security on all tables
-- Since we use Prisma with service role connection, we allow all for authenticated service role
-- API authorization is handled at the application layer

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_categorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gl_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

-- Create policies to allow service role (Prisma) full access
-- The service role bypasses RLS by default, but we add explicit policies for clarity

-- Policy for service role: allow all operations
-- Note: The postgres/service role connection used by Prisma bypasses RLS automatically
-- These policies are for the anon/authenticated roles if accessed via Supabase client

-- Users table: users can only see themselves
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Workspace members: users can see workspaces they belong to
CREATE POLICY "Users can view their workspace memberships" ON public.workspace_members
  FOR SELECT USING (auth.uid() = user_id);

-- Workspaces: users can see workspaces they're members of
CREATE POLICY "Users can view their workspaces" ON public.workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_members.workspace_id = workspaces.id
      AND workspace_members.user_id = auth.uid()
    )
  );

-- For all other tables, deny direct access via Supabase client
-- All access should go through our API which uses Prisma with service role

-- Documents
CREATE POLICY "Deny direct access to documents" ON public.documents
  FOR ALL USING (false);

-- Document blobs
CREATE POLICY "Deny direct access to document_blobs" ON public.document_blobs
  FOR ALL USING (false);

-- Extractions
CREATE POLICY "Deny direct access to extractions" ON public.extractions
  FOR ALL USING (false);

-- OCR artifacts
CREATE POLICY "Deny direct access to ocr_artifacts" ON public.ocr_artifacts
  FOR ALL USING (false);

-- Invoices
CREATE POLICY "Deny direct access to invoices" ON public.invoices
  FOR ALL USING (false);

-- Invoice line items
CREATE POLICY "Deny direct access to invoice_line_items" ON public.invoice_line_items
  FOR ALL USING (false);

-- Bank accounts
CREATE POLICY "Deny direct access to bank_accounts" ON public.bank_accounts
  FOR ALL USING (false);

-- Bank transactions
CREATE POLICY "Deny direct access to bank_transactions" ON public.bank_transactions
  FOR ALL USING (false);

-- Categories
CREATE POLICY "Deny direct access to categories" ON public.categories
  FOR ALL USING (false);

-- Transaction categorizations
CREATE POLICY "Deny direct access to transaction_categorizations" ON public.transaction_categorizations
  FOR ALL USING (false);

-- Merchants
CREATE POLICY "Deny direct access to merchants" ON public.merchants
  FOR ALL USING (false);

-- Rules
CREATE POLICY "Deny direct access to rules" ON public.rules
  FOR ALL USING (false);

-- Matches
CREATE POLICY "Deny direct access to matches" ON public.matches
  FOR ALL USING (false);

-- FX rates (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view fx_rates" ON public.fx_rates
  FOR SELECT USING (auth.role() = 'authenticated');

-- Audit log
CREATE POLICY "Deny direct access to audit_log" ON public.audit_log
  FOR ALL USING (false);

-- GL Accounts
CREATE POLICY "Deny direct access to gl_accounts" ON public.gl_accounts
  FOR ALL USING (false);

-- Journal entries
CREATE POLICY "Deny direct access to journal_entries" ON public.journal_entries
  FOR ALL USING (false);

-- Journal lines
CREATE POLICY "Deny direct access to journal_lines" ON public.journal_lines
  FOR ALL USING (false);

-- Accounting periods
CREATE POLICY "Deny direct access to accounting_periods" ON public.accounting_periods
  FOR ALL USING (false);

-- GL Balances
CREATE POLICY "Deny direct access to gl_balances" ON public.gl_balances
  FOR ALL USING (false);

-- AI Suggestions
CREATE POLICY "Deny direct access to ai_suggestions" ON public.ai_suggestions
  FOR ALL USING (false);
