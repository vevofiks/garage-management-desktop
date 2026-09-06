"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import {
  createInvoiceSchema,
  PAYMENT_METHOD_LABELS,
  type CreateInvoiceInput,
  type PaymentMethod,
} from "@/lib/schemas/invoice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomerPicker, type SelectedCustomer } from "@/components/customer-picker";
import { InvoiceItemsField } from "../_components/invoice-items-field";

type Vehicle = { id: number; vehicle_number: string | null; vehicle_model: string | null };

/**
 * The only billing entry point in the app: pick a customer (and one of
 * their vehicles, if any are on file), add line items — from the
 * predefined-services catalog, or typed in directly for anything extra —
 * and create the invoice. There is no separate Services module anymore;
 * the invoice itself is the record of the work done.
 */
export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  // Arriving from a "Create Invoice" action on a specific customer (e.g. the
  // dashboard's Recent Customers row) — skip the picker and go straight to
  // that customer instead of making them search for who they just clicked.
  const prefillCustomerId = searchParams.get("customerId");
  const { data: prefillCustomer } = useQuery<SelectedCustomer>({
    queryKey: queryKeys.customers.detail(Number(prefillCustomerId)),
    queryFn: () => apiClient.get<SelectedCustomer>(`/api/customers/${prefillCustomerId}`),
    enabled: !!prefillCustomerId && !selectedCustomer,
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateInvoiceInput>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      customer_id: 0,
      vehicle_id: null,
      notes: "",
      items: [{ description: "", type: "labor", amount: 0 }],
      paid_amount: 0,
      payment_method: "cash",
      payment_method_note: "",
    },
  });

  const selectedPaymentMethod = watch("payment_method");

  const handleSelectCustomer = (customer: SelectedCustomer | null) => {
    setSelectedCustomer(customer);
    setValue("customer_id", customer?.id ?? 0, { shouldValidate: true });
    setValue("vehicle_id", null);
    setVehicleError(null);
  };

  useEffect(() => {
    if (prefillCustomer && !selectedCustomer) {
      handleSelectCustomer(prefillCustomer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillCustomer]);

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: queryKeys.customers.vehicles(selectedCustomer?.id ?? 0),
    queryFn: () => apiClient.get<Vehicle[]>(`/api/customers/${selectedCustomer!.id}/vehicles`),
    enabled: !!selectedCustomer,
  });

  // One vehicle on file — preselect silently. Multiple vehicles — user must pick.
  useEffect(() => {
    if (vehicles?.length === 1) {
      setValue("vehicle_id", vehicles[0].id);
      setVehicleError(null);
    } else if (vehicles && vehicles.length > 1) {
      setValue("vehicle_id", null);
    }
  }, [vehicles, setValue]);

  const hasMultipleVehicles = !!vehicles && vehicles.length > 1;
  const selectedVehicleId = watch("vehicle_id");
  const selectedVehicleLabel =
    selectedVehicleId && vehicles
      ? vehicles.find((v) => v.id === selectedVehicleId)
      : null;

  const onSubmit = (data: CreateInvoiceInput) => {
    if (hasMultipleVehicles && !data.vehicle_id) {
      setVehicleError("Select a vehicle for this customer");
      return;
    }
    setVehicleError(null);
    mutation.mutate(data);
  };

  const mutation = useMutation({
    mutationFn: (data: CreateInvoiceInput) => apiClient.post<{ id: number }>("/api/invoices", data),
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(selectedCustomer!.id) });
      toast.success("Invoice created");
      // Straight to the printable preview — editing (items, payment, etc.)
      // happens later from the invoices list, not as a forced next step
      // right after creating.
      router.push(`/invoices/${invoice.id}/print`);
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to create invoice"),
  });

  const [cashAmount, setCashAmount] = useState<number | "">("");
  const [cardAmount, setCardAmount] = useState<number | "">("");

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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New Invoice" backHref="/invoices" backLabel="Back to invoices" />
      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label>Customer</Label>
              <CustomerPicker
                selected={selectedCustomer}
                onSelect={handleSelectCustomer}
                allowCreate
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
                        ? [selectedVehicleLabel.vehicle_number, selectedVehicleLabel.vehicle_model]
                            .filter(Boolean)
                            .join(" — ") || `Vehicle #${selectedVehicleLabel.id}`
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles!.map((vehicle) => (
                      <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                        {[vehicle.vehicle_number, vehicle.vehicle_model].filter(Boolean).join(" — ") ||
                          `Vehicle #${vehicle.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vehicleError && <p className="text-sm text-destructive">{vehicleError}</p>}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
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
                        if (method === "both") {
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

                {selectedPaymentMethod !== "both" && (
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
              {selectedPaymentMethod === "both" && (
                <p className="text-xs text-muted-foreground">
                  Total Paid: <span className="font-semibold text-foreground">QAR {(watch("paid_amount") || 0).toFixed(2)}</span> ({watch("payment_method_note")})
                </p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create Invoice"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
