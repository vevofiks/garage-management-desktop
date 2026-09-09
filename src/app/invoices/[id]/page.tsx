"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DownloadIcon, PencilIcon, PrinterIcon } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { ITEM_TYPE_LABELS } from "@/lib/invoice-line-items";
import {
  paymentSchema,
  PAYMENT_METHOD_LABELS,
  RECORDABLE_PAYMENT_METHODS,
  type PaymentFormData,
  type PaymentMethod,
} from "@/lib/schemas/invoice";
import { type CustomerType } from "@/lib/schemas/customer";
import { InvoiceCustomerVehicleSection } from "@/components/customer-list-cell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type InvoiceDetail = {
  id: number;
  customer_id: number;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_type: CustomerType;
  vehicle_number: string | null;
  vehicle_model: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  notes: string | null;
  total_amount: number;
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  payment_method: PaymentMethod;
  payment_method_note: string | null;
  service_date: string;
  created_at: string;
  items: { id: number; description: string; type: "part" | "labor" | "discount"; amount: number }[];
};

const PAYMENT_BADGE: Record<InvoiceDetail["payment_status"], "default" | "secondary" | "destructive"> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
};

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params);
  const id = Number(idParam);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: invoice, isLoading } = useQuery<InvoiceDetail>({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: () => apiClient.get<InvoiceDetail>(`/api/invoices/${id}`),
  });

  const {
    register: paymentRegister,
    handleSubmit: handlePaymentSubmit,
    watch: watchPayment,
    setValue: setPaymentValue,
    setError: setPaymentError,
    formState: { errors: paymentErrors, isSubmitting: isSavingPayment },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { paid_amount: 0, payment_method: "cash", payment_method_note: "" },
    values: invoice
      ? {
          paid_amount: invoice.paid_amount,
          payment_method:
            invoice.payment_method === "credit" ? "cash" : invoice.payment_method,
          payment_method_note: invoice.payment_method_note ?? "",
        }
      : undefined,
  });

  const selectedPaymentMethod = watchPayment("payment_method");
  const [paymentCashAmount, setPaymentCashAmount] = useState<number | "">("");
  const [paymentCardAmount, setPaymentCardAmount] = useState<number | "">("");

  const handlePaymentSplitChange = (cash: number | "", card: number | "") => {
    setPaymentCashAmount(cash);
    setPaymentCardAmount(card);
    const numCash = typeof cash === "number" ? cash : 0;
    const numCard = typeof card === "number" ? card : 0;
    const total = Math.round((numCash + numCard) * 100) / 100;
    setPaymentValue("paid_amount", total, { shouldValidate: true });
    setPaymentValue(
      "payment_method_note",
      `Cash: QAR ${numCash.toFixed(2)} | Card: QAR ${numCard.toFixed(2)}`,
      { shouldValidate: true }
    );
  };

  const invalidateInvoice = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
  };

  const recordPaymentMutation = useMutation({
    mutationFn: (data: PaymentFormData) => apiClient.patch(`/api/invoices/${id}`, data),
    onSuccess: () => {
      invalidateInvoice();
      toast.success("Payment recorded");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to record payment"),
  });

  if (isLoading || !invoice) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full max-w-4xl" />
      </div>
    );
  }

  const balanceDue = Math.max(0, invoice.total_amount - invoice.paid_amount);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`INV-${invoice.id}`}
        backHref="/invoices"
        backLabel="Back to invoices"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push(`/invoices/${id}/edit`)}>
              <PencilIcon className="size-4" /> Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/invoices/${id}/print?download=1`)}
            >
              <DownloadIcon className="size-4" /> Download PDF
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={`/invoices/${id}/print`}>
                  <PrinterIcon className="size-4" /> Print
                </Link>
              }
            />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Service Date</dt>
              <dd className="font-medium">
                {formatDateOnly(invoice.service_date, invoice.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Invoice #</dt>
              <dd className="font-medium">INV-{invoice.id}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer & Vehicle</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceCustomerVehicleSection
            customerId={invoice.customer_id}
            name={invoice.customer_name}
            customerType={invoice.customer_type}
            phone={invoice.customer_phone}
            address={invoice.customer_address}
            driverName={invoice.driver_name}
            driverPhone={invoice.driver_phone}
            vehicleNumber={invoice.vehicle_number}
            vehicleModel={invoice.vehicle_model}
            notes={invoice.notes}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-muted-foreground">{ITEM_TYPE_LABELS[item.type]}</TableCell>
                  <TableCell className="text-right">
                    {item.type === "discount" ? "-" : ""}
                    {formatCurrency(item.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payment</CardTitle>
          <Badge variant={PAYMENT_BADGE[invoice.payment_status]} className="capitalize">
            {invoice.payment_status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium">{formatCurrency(invoice.total_amount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="font-medium">{formatCurrency(invoice.paid_amount)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Balance Due</dt>
              <dd className="font-medium">{formatCurrency(balanceDue)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Payment Method</dt>
              <dd className="font-medium">
                <Badge variant={invoice.payment_method === "credit" ? "outline" : "secondary"}>
                  {PAYMENT_METHOD_LABELS[invoice.payment_method]}
                </Badge>
                {(invoice.payment_method === "other" || invoice.payment_method === "both") &&
                  invoice.payment_method_note && (
                    <span className="mt-1 block font-normal text-muted-foreground">
                      {invoice.payment_method_note}
                    </span>
                  )}
              </dd>
            </div>
          </dl>

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Record a Payment</h3>
            <form
              onSubmit={handlePaymentSubmit((data) => {
                if (data.paid_amount > invoice.total_amount) {
                  setPaymentError("paid_amount", {
                    message: "Amount paid cannot be more than the invoice total",
                  });
                  return;
                }
                recordPaymentMutation.mutate(data);
              })}
              className="space-y-4 pb-4"
            >
              <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="payment_method">Payment Method</Label>
                  <Select
                    value={selectedPaymentMethod}
                    onValueChange={(val) => {
                      if (val) {
                        const method = val as PaymentMethod;
                        setPaymentValue("payment_method", method);
                        if (method === "both") {
                          const currentPaid = watchPayment("paid_amount") || invoice.total_amount;
                          const half = Math.round((currentPaid / 2) * 100) / 100;
                          const rest = Math.round((currentPaid - half) * 100) / 100;
                          handlePaymentSplitChange(half, rest);
                        } else if (method !== "other") {
                          setPaymentValue("payment_method_note", "");
                        }
                      }
                    }}
                    disabled={isSavingPayment}
                  >
                    <SelectTrigger
                      id="payment_method"
                      className="w-full bg-background font-normal text-muted-foreground data-[state=value]:text-foreground"
                    >
                      <SelectValue>{PAYMENT_METHOD_LABELS[selectedPaymentMethod]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {RECORDABLE_PAYMENT_METHODS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PAYMENT_METHOD_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedPaymentMethod !== "both" && (
                  <div className="flex flex-col gap-2 relative">
                    <Label htmlFor="paid_amount">Amount Paid</Label>
                    <Input
                      id="paid_amount"
                      type="number"
                      step="0.01"
                      {...paymentRegister("paid_amount", {
                        setValueAs: (v) => (v === "" ? 0 : Number(v)),
                      })}
                      disabled={isSavingPayment}
                    />
                    {paymentErrors.paid_amount && (
                      <p className="absolute -bottom-5 left-0 text-xs text-destructive">
                        {paymentErrors.paid_amount.message}
                      </p>
                    )}
                  </div>
                )}

                {selectedPaymentMethod === "both" && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="payment_cash_amount">Cash Amount (QAR)</Label>
                      <Input
                        id="payment_cash_amount"
                        type="number"
                        step="0.01"
                        placeholder="e.g. 50.00"
                        value={paymentCashAmount}
                        onChange={(e) =>
                          handlePaymentSplitChange(
                            e.target.value === "" ? "" : Number(e.target.value),
                            paymentCardAmount
                          )
                        }
                        disabled={isSavingPayment}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="payment_card_amount">Card Amount (QAR)</Label>
                      <Input
                        id="payment_card_amount"
                        type="number"
                        step="0.01"
                        placeholder="e.g. 50.00"
                        value={paymentCardAmount}
                        onChange={(e) =>
                          handlePaymentSplitChange(
                            paymentCashAmount,
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        disabled={isSavingPayment}
                      />
                    </div>
                  </>
                )}

                {selectedPaymentMethod === "other" && (
                  <div className="flex flex-col gap-2 relative">
                    <Label htmlFor="payment_method_note">Describe it</Label>
                    <Input
                      id="payment_method_note"
                      placeholder="e.g. Half cash, half GPay"
                      {...paymentRegister("payment_method_note")}
                      disabled={isSavingPayment}
                    />
                    {paymentErrors.payment_method_note && (
                      <p className="absolute -bottom-5 left-0 text-xs text-destructive">
                        {paymentErrors.payment_method_note.message}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                {selectedPaymentMethod === "both" ? (
                  <p className="text-xs text-muted-foreground">
                    Total Paid:{" "}
                    <span className="font-semibold text-foreground">
                      QAR {(watchPayment("paid_amount") || 0).toFixed(2)}
                    </span>{" "}
                    ({watchPayment("payment_method_note")})
                  </p>
                ) : (
                  <div />
                )}
                <Button type="submit" disabled={isSavingPayment}>
                  {isSavingPayment ? "Saving…" : "Record Payment"}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
