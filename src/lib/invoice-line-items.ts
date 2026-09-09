import type { InvoiceItemFormData } from './schemas/invoice';

export type ChargeType = 'labor' | 'part' | 'both';

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  labor: 'Labor',
  part: 'Parts',
  both: 'Both',
};

export const ITEM_TYPE_LABELS: Record<InvoiceItemFormData['type'], string> = {
  labor: 'Labor',
  part: 'Parts',
  discount: 'Discount',
};

export type FormServiceLineItem = {
  kind: 'service';
  description: string;
  chargeType: ChargeType;
  laborAmount: number;
  partAmount: number;
};

export type FormDiscountLineItem = {
  kind: 'discount';
  description: string;
  amount: number;
};

export type FormLineItem = FormServiceLineItem | FormDiscountLineItem;

export function defaultServiceLine(): FormServiceLineItem {
  return {
    kind: 'service',
    description: '',
    chargeType: 'labor',
    laborAmount: 0,
    partAmount: 0,
  };
}

export function defaultDiscountLine(): FormDiscountLineItem {
  return {
    kind: 'discount',
    description: 'Loyalty Discount',
    amount: 0,
  };
}

/** Form rows → API/storage line items (splits "both" into part + labor rows). */
export function flattenFormLineItems(items: FormLineItem[]): InvoiceItemFormData[] {
  const result: InvoiceItemFormData[] = [];

  for (const item of items) {
    if (item.kind === 'discount') {
      result.push({ description: item.description, type: 'discount', amount: item.amount });
      continue;
    }

    if (item.chargeType === 'labor' || item.chargeType === 'both') {
      if (item.laborAmount > 0) {
        result.push({ description: item.description, type: 'labor', amount: item.laborAmount });
      }
    }
    if (item.chargeType === 'part' || item.chargeType === 'both') {
      if (item.partAmount > 0) {
        result.push({ description: item.description, type: 'part', amount: item.partAmount });
      }
    }
  }

  return result;
}

/** API/storage line items → editable form rows (one row per stored item). */
export function expandToFormLineItems(items: InvoiceItemFormData[]): FormLineItem[] {
  return items.map((item) => {
    if (item.type === 'discount') {
      return { kind: 'discount', description: item.description, amount: item.amount };
    }
    if (item.type === 'part') {
      return {
        kind: 'service',
        description: item.description,
        chargeType: 'part',
        laborAmount: 0,
        partAmount: item.amount,
      };
    }
    return {
      kind: 'service',
      description: item.description,
      chargeType: 'labor',
      laborAmount: item.amount,
      partAmount: 0,
    };
  });
}

export function computeFormLineItemsTotal(items: FormLineItem[]): number {
  return flattenFormLineItems(items).reduce(
    (sum, item) => (item.type === 'discount' ? sum - item.amount : sum + item.amount),
    0
  );
}
