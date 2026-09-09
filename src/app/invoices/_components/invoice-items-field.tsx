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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PredefinedServiceSelect } from "@/components/predefined-service-select";
import { formatCurrency } from "@/lib/format";
import {
  CHARGE_TYPE_LABELS,
  computeFormLineItemsTotal,
  defaultDiscountLine,
  defaultServiceLine,
  type ChargeType,
  type FormLineItem,
} from "@/lib/invoice-line-items";

type ItemsFormShape = { items?: FormLineItem[] };

const numberInputProps = {
  setValueAs: (v: string) => (v === "" ? 0 : Number(v)),
};

/**
 * Invoice line-item editor with per-row charge type: Labor, Parts, or Both.
 * "Both" shows separate parts and labor amount fields; saved as two API rows.
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

  const total = Math.max(0, computeFormLineItemsTotal(items ?? []));
  const itemsRootError = (errors.items as { root?: { message?: string } } | undefined)?.root;
  const itemErrors = errors.items as
    | {
        [index: number]: {
          description?: { message?: string };
          laborAmount?: { message?: string };
          partAmount?: { message?: string };
          amount?: { message?: string };
        };
      }
    | undefined;

  const handleChargeTypeChange = (index: number, chargeType: ChargeType) => {
    itemsSetValue(`items.${index}.chargeType`, chargeType, { shouldValidate: true });
    if (chargeType === "labor") {
      itemsSetValue(`items.${index}.partAmount`, 0);
    } else if (chargeType === "part") {
      itemsSetValue(`items.${index}.laborAmount`, 0);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Line Items</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(defaultServiceLine())}
          >
            <Plus className="size-4" /> Add Item
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(defaultDiscountLine())}
          >
            <Plus className="size-4" /> Discount
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {fields.map((field, index) => {
          const row = items?.[index];
          const isService = row?.kind === "service";
          const chargeType = isService ? row.chargeType : null;
          const rowError = itemErrors?.[index];

          return (
            <div key={field.id} className="space-y-1">
              <div className="flex flex-wrap items-start gap-2">
                {isService ? (
                  <div className="w-28 shrink-0">
                    <Select
                      value={chargeType ?? "labor"}
                      onValueChange={(val) => {
                        if (val) handleChargeTypeChange(index, val as ChargeType);
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(CHARGE_TYPE_LABELS) as [ChargeType, string][]).map(
                          ([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <Badge variant="secondary" className="mt-2 w-28 shrink-0 justify-center">
                    Discount
                  </Badge>
                )}

                <div className="min-w-[12rem] flex-1">
                  {isService ? (
                    <PredefinedServiceSelect
                      value={row?.description ?? ""}
                      onChange={(name) => itemsSetValue(`items.${index}.description`, name)}
                    />
                  ) : (
                    <Input
                      placeholder="e.g. Loyalty discount"
                      {...itemsRegister(`items.${index}.description`)}
                    />
                  )}
                </div>

                {isService && chargeType === "both" ? (
                  <>
                    <div className="w-28 shrink-0 space-y-1">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Parts"
                        aria-label="Parts amount"
                        {...itemsRegister(`items.${index}.partAmount`, numberInputProps)}
                      />
                    </div>
                    <div className="w-28 shrink-0 space-y-1">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Labor"
                        aria-label="Labor amount"
                        {...itemsRegister(`items.${index}.laborAmount`, numberInputProps)}
                      />
                    </div>
                  </>
                ) : isService && chargeType === "part" ? (
                  <div className="w-28 shrink-0">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Parts"
                      aria-label="Parts amount"
                      {...itemsRegister(`items.${index}.partAmount`, numberInputProps)}
                    />
                  </div>
                ) : isService ? (
                  <div className="w-28 shrink-0">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Labor"
                      aria-label="Labor amount"
                      {...itemsRegister(`items.${index}.laborAmount`, numberInputProps)}
                    />
                  </div>
                ) : (
                  <div className="w-28 shrink-0">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...itemsRegister(`items.${index}.amount`, numberInputProps)}
                    />
                  </div>
                )}

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

              {(rowError?.description?.message ||
                rowError?.laborAmount?.message ||
                rowError?.partAmount?.message ||
                rowError?.amount?.message) && (
                <p className="pl-1 text-sm text-destructive">
                  {rowError?.description?.message ||
                    rowError?.laborAmount?.message ||
                    rowError?.partAmount?.message ||
                    rowError?.amount?.message}
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
