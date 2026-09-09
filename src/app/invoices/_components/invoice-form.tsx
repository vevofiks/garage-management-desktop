"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  invoiceFormSchema,
  PAYMENT_METHOD_LABELS,
  type CreateInvoiceInput,
  type InvoiceFormInput,
  type PaymentMethod,
} from "@/lib/schemas/invoice";
import { defaultServiceLine, expandToFormLineItems, flattenFormLineItems } from "@/lib/invoice-line-items";
import {
  formatCustomerDisplayName,
  type CustomerType,
} from "@/lib/schemas/customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerPicker, type SelectedCustomer } from "@/components/customer-picker";
import { formatVehicleOptionLabel, resolveServiceDate, todayISODate } from "@/lib/format";
import { InvoiceItemsField } from "./invoice-items-field";

type Vehicle = {
  id: number;
  vehicle_number: string | null;
  vehicle_model: string | null;
  driver_name: string | null;
  driver_phone: string | null;
};

type CustomerDetailForInvoice = {
  id: number;
  name: string;
  customer_type: CustomerType;
  vehicles: Vehicle[];
};

type InvoiceForEdit = {
  id: number;
  customer_id: number;
  vehicle_id: number | null;
  service_date?: string | null;
  created_at?: string;
  notes: string | null;
  paid_amount: number;
  payment_method: PaymentMethod;
  payment_method_note: string | null;
  items: { description: string; type: "part" | "labor" | "discount"; amount: number }[];
};

function toSelectedCustomer(detail: CustomerDetailForInvoice): SelectedCustomer {
  return {
    id: detail.id,
    name: formatCustomerDisplayName(detail.name, detail.customer_type, detail.vehicles),
    customer_type: detail.customer_type ?? "individual",
  };
}

function parseSplitPaymentNote(note: string | null | undefined): { cash: number | ""; card: number | "" } {
  if (!note) return { cash: "", card: "" };
  const cashMatch = note.match(/Cash:\s*QAR\s*([\d.]+)/i);
  const cardMatch = note.match(/Card:\s*QAR\s*([\d.]+)/i);
  return {
    cash: cashMatch ? Number(cashMatch[1]) : "",
    card: cardMatch ? Number(cardMatch[1]) : "",
  };
}

type InvoiceFormProps = {
  mode: "create" | "edit";
  invoiceId?: number;
  prefillCustomerId?: number | null;
  onSuccess?: (invoiceId: number) => void;
};

export function InvoiceForm({ mode, invoiceId, prefillCustomerId, onSuccess }: InvoiceFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [cashAmount, setCashAmount] = useState<number | "">("");
  const [cardAmount, setCardAmount] = useState<number | "">("");
  const prevCustomerId = useRef<number | null>(null);
  const formInitialized = useRef(false);

  const { data: invoice, isLoading: isLoadingInvoice } = useQuery<InvoiceForEdit>({
    queryKey: queryKeys.invoices.detail(invoiceId ?? 0),
    queryFn: () => apiClient.get<InvoiceForEdit>(`/api/invoices/${invoiceId}`),
    enabled: mode === "edit" && !!invoiceId,
  });

  const prefillId =
    mode === "create" && prefillCustomerId && prefillCustomerId > 0 ? prefillCustomerId : NaN;

  const { data: prefillCustomer } = useQuery<CustomerDetailForInvoice>({
    queryKey: queryKeys.customers.detail(prefillId),
    queryFn: () => apiClient.get<CustomerDetailForInvoice>(`/api/customers/${prefillId}`),
    enabled: mode === "create" && Number.isFinite(prefillId) && !selectedCustomer,
  });

  const customerIdForDetail = selectedCustomer?.id ?? (mode === "edit" ? invoice?.customer_id : 0);

  const { data: customerDetail } = useQuery<CustomerDetailForInvoice>({
    queryKey: queryKeys.customers.detail(customerIdForDetail ?? 0),
    queryFn: () => apiClient.get<CustomerDetailForInvoice>(`/api/customers/${customerIdForDetail}`),
    enabled: !!customerIdForDetail,
  });

  const vehicles = customerDetail?.vehicles ?? [];
  const customerType = customerDetail?.customer_type ?? selectedCustomer?.customer_type ?? "individual";

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormInput>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      customer_id: 0,
      vehicle_id: null,
      service_date: todayISODate(),
      notes: "",
      items: [defaultServiceLine()],
      paid_amount: 0,
      payment_method: "cash",
      payment_method_note: "",
    },
  });

  const selectedPaymentMethod = watch("payment_method");
  const selectedVehicleId = watch("vehicle_id");
  const hasMultipleVehicles = vehicles.length > 1;
  const selectedVehicleLabel =
    selectedVehicleId && vehicles.length > 0
      ? vehicles.find((v) => v.id === selectedVehicleId)
      : null;

  // Edit mode — hydrate form once invoice + customer detail are available.
  useEffect(() => {
    if (mode !== "edit" || !invoice || !customerDetail || formInitialized.current) return;

    const split = parseSplitPaymentNote(
      invoice.payment_method === "both" ? invoice.payment_method_note : null
    );
    setCashAmount(split.cash);
    setCardAmount(split.card);

    reset({
      customer_id: invoice.customer_id,
      vehicle_id: invoice.vehicle_id,
      service_date: resolveServiceDate(invoice.service_date, invoice.created_at),
      notes: invoice.notes ?? "",
      items: expandToFormLineItems(invoice.items),
      paid_amount: invoice.paid_amount,
      payment_method: invoice.payment_method,
      payment_method_note: invoice.payment_method_note ?? "",
    });

    setSelectedCustomer(toSelectedCustomer(customerDetail));
    prevCustomerId.current = invoice.customer_id;
    formInitialized.current = true;
  }, [mode, invoice, customerDetail, reset]);

  const handleSelectCustomer = (customer: SelectedCustomer | null) => {
    setSelectedCustomer(customer);
    setValue("customer_id", customer?.id ?? 0, { shouldValidate: true });
    if (prevCustomerId.current !== customer?.id) {
      setValue("vehicle_id", null);
    }
    prevCustomerId.current = customer?.id ?? null;
    setVehicleError(null);
  };

  useEffect(() => {
    if (mode === "create" && prefillCustomer && !selectedCustomer) {
      handleSelectCustomer(toSelectedCustomer(prefillCustomer));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomer, mode]);

  useEffect(() => {
    if (!selectedCustomer?.id || !customerDetail) return;
    const displayName = formatCustomerDisplayName(
      customerDetail.name,
      customerDetail.customer_type,
      customerDetail.vehicles
    );
    setSelectedCustomer((prev) => {
      if (!prev || prev.id !== customerDetail.id) return prev;
      if (prev.name === displayName && prev.customer_type === customerDetail.customer_type) {
        return prev;
      }
      return {
        id: prev.id,
        name: displayName,
        customer_type: customerDetail.customer_type,
      };
    });
  }, [customerDetail, selectedCustomer?.id]);

  useEffect(() => {
    if (!selectedCustomer || customerDetail === undefined) return;
    const customerChanged =
      prevCustomerId.current !== null && prevCustomerId.current !== selectedCustomer.id;

    if (vehicles.length === 1) {
      setValue("vehicle_id", vehicles[0].id);
      setVehicleError(null);
    } else if (customerChanged) {
      setValue("vehicle_id", null);
      setVehicleError(null);
    }
  }, [vehicles, selectedCustomer, customerDetail, setValue]);

  const handleSplitChange = (cash: number | "", card: number | "") => {
    setCashAmount(cash);
    setCardAmount(card);
    const numCash = typeof cash === "number" ? cash : 0;
    const numCard = typeof card === "number" ? card : 0;
    const total = Math.round((numCash + numCard) * 100) / 100;
    setValue("paid_amount", total, { shouldValidate: true });
    setValue(
      "payment_method_note",
      `Cash: QAR ${numCash.toFixed(2)} | Card: QAR ${numCard.toFixed(2)}`,
      { shouldValidate: true }
    );
  };

  const mutation = useMutation({
    mutationFn: (data: CreateInvoiceInput) =>
      mode === "edit" && invoiceId
        ? apiClient.patch<{ id: number }>(`/api/invoices/${invoiceId}`, data)
        : apiClient.post<{ id: number }>("/api/invoices", data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      if (selectedCustomer?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(selectedCustomer.id) });
      }
      if (mode === "edit" && invoiceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(invoiceId) });
      }
      toast.success(mode === "edit" ? "Invoice updated" : "Invoice created");
      const id = mode === "edit" ? invoiceId! : result.id;
      if (onSuccess) {
        onSuccess(id);
      } else {
        router.push(mode === "edit" ? `/invoices/${id}` : `/invoices/${id}/print`);
      }
    },
    onError: (error: ApiError) =>
      toast.error(error.message || `Failed to ${mode === "edit" ? "update" : "create"} invoice`),
  });

  const onSubmit = (data: InvoiceFormInput) => {
    if (hasMultipleVehicles && !data.vehicle_id) {
      setVehicleError("Select a vehicle for this customer");
      return;
    }
    setVehicleError(null);
    const payload: CreateInvoiceInput = {
      ...data,
      items: flattenFormLineItems(data.items),
    };
    mutation.mutate(payload);
  };

  if (mode === "edit" && (isLoadingInvoice || !invoice || !formInitialized.current)) {
    return <p className="text-sm text-muted-foreground">Loading invoice…</p>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label>Customer</Label>
        <CustomerPicker
          selected={selectedCustomer}
          onSelect={handleSelectCustomer}
          allowCreate={mode === "create"}
        />
        {errors.customer_id && (
          <p className="text-sm text-destructive">{errors.customer_id.message}</p>
        )}
      </div>

      {selectedCustomer && hasMultipleVehicles && (
        <div className="space-y-2">
          <Label htmlFor="vehicle_id">Vehicle</Label>
          <Select
            value={selectedVehicleId ? String(selectedVehicleId) : ""}
            onValueChange={(val) => {
              setValue("vehicle_id", val ? Number(val) : null, { shouldValidate: true });
              setVehicleError(null);
            }}
            disabled={isSubmitting}
          >
            <SelectTrigger id="vehicle_id" className="w-full">
              <SelectValue placeholder="Select a vehicle">
                {selectedVehicleLabel
                  ? formatVehicleOptionLabel(selectedVehicleLabel, customerType)
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((vehicle) => (
                <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                  {formatVehicleOptionLabel(vehicle, customerType)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vehicleError && <p className="text-sm text-destructive">{vehicleError}</p>}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="service_date">Service Date</Label>
        <Input
          id="service_date"
          type="date"
          {...register("service_date")}
          disabled={isSubmitting}
          className="w-full max-w-xs"
        />
        {errors.service_date && (
          <p className="text-sm text-destructive">{errors.service_date.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">
          Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>
        <Textarea id="notes" rows={3} {...register("notes")} disabled={isSubmitting} />
      </div>

      <InvoiceItemsField control={control} register={register} setValue={setValue} errors={errors} />

      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Payment</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="payment_method">Payment Method</Label>
            <Select
              value={selectedPaymentMethod}
              onValueChange={(val) => {
                if (val) {
                  const method = val as PaymentMethod;
                  setValue("payment_method", method);
                  if (method === "credit") {
                    setValue("paid_amount", 0, { shouldValidate: true });
                    setValue("payment_method_note", "");
                  } else if (method === "both") {
                    const currentPaid = watch("paid_amount") || 0;
                    const half = Math.round((currentPaid / 2) * 100) / 100;
                    const rest = Math.round((currentPaid - half) * 100) / 100;
                    handleSplitChange(half, rest);
                  } else if (method !== "other") {
                    setValue("payment_method_note", "");
                  }
                }
              }}
              disabled={isSubmitting}
            >
              <SelectTrigger id="payment_method" className="w-full">
                <SelectValue>{PAYMENT_METHOD_LABELS[selectedPaymentMethod]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPaymentMethod !== "both" && selectedPaymentMethod !== "credit" && (
            <div className="space-y-2">
              <Label htmlFor="paid_amount">Amount Paid</Label>
              <Input
                id="paid_amount"
                type="number"
                step="0.01"
                {...register("paid_amount", {
                  setValueAs: (v) => (v === "" ? 0 : Number(v)),
                })}
                disabled={isSubmitting}
              />
              {errors.paid_amount && (
                <p className="text-sm text-destructive">{errors.paid_amount.message}</p>
              )}
            </div>
          )}

          {selectedPaymentMethod === "both" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="cash_amount">Cash Amount (QAR)</Label>
                <Input
                  id="cash_amount"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50.00"
                  value={cashAmount}
                  onChange={(e) =>
                    handleSplitChange(
                      e.target.value === "" ? "" : Number(e.target.value),
                      cardAmount
                    )
                  }
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card_amount">Card Amount (QAR)</Label>
                <Input
                  id="card_amount"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 50.00"
                  value={cardAmount}
                  onChange={(e) =>
                    handleSplitChange(
                      cashAmount,
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  disabled={isSubmitting}
                />
              </div>
            </>
          )}

          {selectedPaymentMethod === "other" && (
            <div className="space-y-2">
              <Label htmlFor="payment_method_note">Describe it</Label>
              <Input
                id="payment_method_note"
                placeholder="e.g. Half cash, half GPay"
                {...register("payment_method_note")}
                disabled={isSubmitting}
              />
              {errors.payment_method_note && (
                <p className="text-sm text-destructive">{errors.payment_method_note.message}</p>
              )}
            </div>
          )}
        </div>
        {selectedPaymentMethod === "credit" && (
          <p className="text-xs text-muted-foreground">
            Full invoice amount will be recorded on credit — nothing collected now.
          </p>
        )}
        {selectedPaymentMethod === "both" && (
          <p className="text-xs text-muted-foreground">
            Total Paid:{" "}
            <span className="font-semibold text-foreground">
              QAR {(watch("paid_amount") || 0).toFixed(2)}
            </span>{" "}
            ({watch("payment_method_note")})
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {mode === "edit" && invoiceId && (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => router.push(`/invoices/${invoiceId}`)}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || mutation.isPending}>
          {isSubmitting || mutation.isPending
            ? mode === "edit"
              ? "Saving…"
              : "Creating…"
            : mode === "edit"
              ? "Save Changes"
              : "Create Invoice"}
        </Button>
      </div>
    </form>
  );
}
