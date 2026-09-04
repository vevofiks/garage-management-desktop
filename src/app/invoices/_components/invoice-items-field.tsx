"use client";

import {
  useFieldArray,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PredefinedServiceSelect } from "@/components/predefined-service-select";
import { formatCurrency } from "@/lib/format";
import { computeInvoiceTotal } from "@/lib/invoice-totals";
import type { InvoiceItemFormData } from "@/lib/schemas/invoice";

// `items` optional for the same reason as ServiceItemsField's ItemsFormShape
// (see that file) — keeps this usable from both the create flow and the
// invoice detail page's edit-items form without the two needing identical
// required-ness on every other field.
type ItemsFormShape = { items?: InvoiceItemFormData[] };

/**
 * The invoice line-item editor — same generic-narrowing approach as Phase
 * 3's ServiceItemsField (see that file for why).
 *
 * Regular rows are billed as labor and pick their description from the
 * shared predefined-services catalog — there's no per-row part/labor
 * toggle to fill in. Discount is added as its own row kind via the
 * dedicated button below (locked to that type, with a plain text label
 * instead of a catalog pick — "Loyalty discount" is a one-off label, not a
 * repeatable job), rather than a type Select on every row that's almost
 * always going to say "labor" anyway.
 */
export function InvoiceItemsField<TFieldValues extends ItemsFormShape>({
  control,
  register,
  setValue,
  errors,
}: {
  control: Control<TFieldValues>;
  register: UseFormRegister<TFieldValues>;
  setValue: UseFormSetValue<TFieldValues>;
  errors: FieldErrors<TFieldValues>;
}) {
  const itemsControl = control as unknown as Control<ItemsFormShape>;
  const itemsRegister = register as unknown as UseFormRegister<ItemsFormShape>;
  const itemsSetValue = setValue as unknown as UseFormSetValue<ItemsFormShape>;

  const { fields, append, remove } = useFieldArray({ control: itemsControl, name: "items" });
  const items = useWatch({ control: itemsControl, name: "items" });

  const total = computeInvoiceTotal(items ?? []);
  // react-hook-form nests an array-level error (e.g. the schema's
  // `.min(1, 'Add at least one line item')`) under `.root`, not directly on
  // `errors.items` — `errors.items` itself indexes the per-row field errors
  // instead. Reading `errors.items?.message` (as this used to) is always
  // undefined, which silently swallowed every validation error on this
  // field: a row left with no description (required — the predefined-
  // service picker starts empty) or a non-numeric amount blocked submission
  // with zero visible feedback, indistinguishable from the button just not
  // working.
  const itemsRootError = (errors.items as { root?: { message?: string } } | undefined)?.root;
  const itemErrors = errors.items as
    | { [index: number]: { description?: { message?: string }; amount?: { message?: string } } }
    | undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Line Items</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ description: "", type: "labor", amount: 0 })}
          >
            <Plus className="size-4" /> Add Item
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ description: "Loyalty Discount", type: "discount", amount: 0 })}
          >
            <Plus className="size-4" /> Discount
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {fields.map((field, index) => {
          const itemType = items?.[index]?.type ?? "labor";
          const isCatalogType = itemType === "part" || itemType === "labor";

          const rowError = itemErrors?.[index];

          return (
            <div key={field.id} className="space-y-1">
              <div className="flex items-start gap-2">
                {!isCatalogType && (
                  <Badge variant="secondary" className="mt-2 w-16 shrink-0 justify-center capitalize">
                    {itemType}
                  </Badge>
                )}
                <div className="flex-1">
                  {isCatalogType ? (
                    <PredefinedServiceSelect
                      value={items?.[index]?.description ?? ""}
                      onChange={(name) => itemsSetValue(`items.${index}.description`, name)}
                    />
                  ) : (
                    <Input
                      placeholder="e.g. Loyalty discount"
                      {...itemsRegister(`items.${index}.description`)}
                    />
                  )}
                </div>
                <div className="w-28 shrink-0">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...itemsRegister(`items.${index}.amount`, {
                    setValueAs: (v) => (v === "" ? 0 : Number(v)),
                  })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  aria-label="Remove item"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {(rowError?.description?.message || rowError?.amount?.message) && (
                <p className="pl-1 text-sm text-destructive">
                  {rowError?.description?.message || rowError?.amount?.message}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {itemsRootError?.message && (
        <p className="text-sm text-destructive">{itemsRootError.message}</p>
      )}

      <div className="flex justify-end text-sm font-medium">Total: {formatCurrency(total)}</div>
    </div>
  );
}
