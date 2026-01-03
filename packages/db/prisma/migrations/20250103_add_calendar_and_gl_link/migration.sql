-- Add calendar system support to workspaces (Jalali/Gregorian)
ALTER TABLE public.workspaces
ADD COLUMN IF NOT EXISTS calendar_system VARCHAR(10) NOT NULL DEFAULT 'gregorian';

-- Add GL account link to bank accounts for double-entry accounting
ALTER TABLE public.bank_accounts
ADD COLUMN IF NOT EXISTS gl_account_id UUID REFERENCES public.gl_accounts(id) ON DELETE SET NULL;

-- Index for faster GL account lookups on bank accounts
CREATE INDEX IF NOT EXISTS bank_accounts_gl_account_id_idx ON public.bank_accounts(gl_account_id);
