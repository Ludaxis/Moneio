'use client';

import { Badge } from '@moneio/ui/primitives';

type InvoiceStatus = 'pending' | 'approved' | 'paid' | 'void';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

const statusConfig: Record<
  InvoiceStatus,
  { variant: 'warning' | 'success' | 'default' | 'danger'; label: string }
> = {
  pending: { variant: 'warning', label: 'Pending' },
  approved: { variant: 'success', label: 'Approved' },
  paid: { variant: 'default', label: 'Paid' },
  void: { variant: 'danger', label: 'Void' },
};

export function InvoiceStatusBadge({ status }: InvoiceStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
