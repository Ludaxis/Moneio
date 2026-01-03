'use client';

import { Badge } from '@moneio/ui/primitives';
import { useTranslations } from 'next-intl';

type InvoiceStatus = 'pending' | 'approved' | 'paid' | 'void';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

const statusVariants: Record<InvoiceStatus, 'warning' | 'success' | 'default' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  paid: 'default',
  void: 'danger',
};

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const t = useTranslations('invoices');
  const variant = statusVariants[status] || statusVariants.pending;
  return <Badge variant={variant}>{t(status)}</Badge>;
}
