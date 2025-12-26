// Invoice service
import type { Invoice, InvoiceLineItem, InvoiceStatus, Money, UUID } from '@moneio/core-ledger';
import { addMoney, createMoney, multiplyMoney, percentageMoney } from '@moneio/core-ledger';

export interface InvoiceRepository {
  create(data: CreateInvoiceData): Promise<Invoice>;
  findById(id: UUID): Promise<Invoice | null>;
  findByWorkspace(
    workspaceId: UUID,
    options?: InvoiceQueryOptions
  ): Promise<{ items: Invoice[]; total: number }>;
  update(id: UUID, data: UpdateInvoiceData): Promise<Invoice>;
  delete(id: UUID): Promise<void>;
  createLineItem(data: CreateLineItemData): Promise<InvoiceLineItem>;
  findLineItemsByInvoice(invoiceId: UUID): Promise<InvoiceLineItem[]>;
  deleteLineItems(invoiceId: UUID): Promise<void>;
}

export interface CreateInvoiceData {
  workspaceId: UUID;
  documentId?: UUID;
  merchantId?: UUID;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency: string;
  subtotal: Money;
  vatTotal: Money;
  total: Money;
  status: InvoiceStatus;
  notes?: string;
}

export interface UpdateInvoiceData {
  merchantId?: UUID | null;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  status?: InvoiceStatus;
  notes?: string;
  subtotal?: Money;
  vatTotal?: Money;
  total?: Money;
}

export interface CreateLineItemData {
  invoiceId: UUID;
  description: string;
  quantity: number;
  unitPrice: Money;
  vatRate: number;
  lineTotal: Money;
  sortOrder: number;
}

export interface InvoiceQueryOptions {
  status?: InvoiceStatus;
  merchantId?: UUID;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: Money;
  vatRate: number;
}

export class InvoiceService {
  constructor(private readonly repository: InvoiceRepository) {}

  async createInvoice(
    workspaceId: UUID,
    currency: string,
    lineItems: LineItemInput[],
    options?: {
      documentId?: UUID;
      merchantId?: UUID;
      invoiceNumber?: string;
      issueDate?: string;
      dueDate?: string;
      notes?: string;
    }
  ): Promise<Invoice> {
    // Calculate totals from line items
    const { subtotal, vatTotal, total, processedItems } = this.calculateTotals(lineItems, currency);

    // Create invoice
    const invoice = await this.repository.create({
      workspaceId,
      documentId: options?.documentId,
      merchantId: options?.merchantId,
      invoiceNumber: options?.invoiceNumber,
      issueDate: options?.issueDate,
      dueDate: options?.dueDate,
      currency,
      subtotal,
      vatTotal,
      total,
      status: 'draft',
      notes: options?.notes,
    });

    // Create line items
    for (let i = 0; i < processedItems.length; i++) {
      await this.repository.createLineItem({
        invoiceId: invoice.id,
        ...processedItems[i],
        sortOrder: i,
      });
    }

    return invoice;
  }

  async getInvoice(id: UUID): Promise<Invoice | null> {
    return this.repository.findById(id);
  }

  async getInvoiceWithLineItems(id: UUID): Promise<{ invoice: Invoice; lineItems: InvoiceLineItem[] } | null> {
    const invoice = await this.repository.findById(id);
    if (!invoice) return null;

    const lineItems = await this.repository.findLineItemsByInvoice(id);
    return { invoice, lineItems };
  }

  async getInvoicesByWorkspace(
    workspaceId: UUID,
    options?: InvoiceQueryOptions
  ): Promise<{ items: Invoice[]; total: number }> {
    return this.repository.findByWorkspace(workspaceId, options);
  }

  async updateInvoiceStatus(id: UUID, status: InvoiceStatus): Promise<Invoice> {
    return this.repository.update(id, { status });
  }

  async approveInvoice(id: UUID): Promise<Invoice> {
    return this.updateInvoiceStatus(id, 'approved');
  }

  async markInvoicePaid(id: UUID): Promise<Invoice> {
    return this.updateInvoiceStatus(id, 'paid');
  }

  async voidInvoice(id: UUID): Promise<Invoice> {
    return this.updateInvoiceStatus(id, 'void');
  }

  async deleteInvoice(id: UUID): Promise<void> {
    await this.repository.deleteLineItems(id);
    await this.repository.delete(id);
  }

  private calculateTotals(
    lineItems: LineItemInput[],
    currency: string
  ): {
    subtotal: Money;
    vatTotal: Money;
    total: Money;
    processedItems: Array<Omit<CreateLineItemData, 'invoiceId' | 'sortOrder'>>;
  } {
    let subtotal = createMoney(0, currency as never);
    let vatTotal = createMoney(0, currency as never);

    const processedItems = lineItems.map((item) => {
      // Calculate line total (quantity * unit price)
      const lineNet = multiplyMoney(item.unitPrice, item.quantity);
      const lineVat = percentageMoney(lineNet, item.vatRate * 100);
      const lineTotal = addMoney(lineNet, lineVat);

      subtotal = addMoney(subtotal, lineNet);
      vatTotal = addMoney(vatTotal, lineVat);

      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatRate: item.vatRate,
        lineTotal,
      };
    });

    const total = addMoney(subtotal, vatTotal);

    return { subtotal, vatTotal, total, processedItems };
  }
}
