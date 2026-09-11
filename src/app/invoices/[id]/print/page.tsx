"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftIcon, DownloadIcon, PencilIcon, PrinterIcon, TrashIcon } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDateOnly, formatVehiclePrint } from "@/lib/format";
import { ITEM_TYPE_LABELS } from "@/lib/invoice-line-items";
import { type CustomerType } from "@/lib/schemas/customer";
import { formatInvoicePrintCustomerLines } from "@/components/customer-list-cell";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/schemas/invoice";
import { logToApp, waitForPrintAssets } from "@/lib/electron-log";
import { downloadInvoicePdf } from "@/lib/invoice-download";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type InvoiceDetail = {
  id: number;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_type: CustomerType;
  vehicle_number: string | null;
  vehicle_model: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  total_amount: number;
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  payment_method: PaymentMethod;
  payment_method_note: string | null;
  notes: string | null;
  service_date: string;
  created_at: string;
  items: {
    id: number;
    description: string;
    type: "part" | "labor" | "discount";
    amount: number;
  }[];
};

export default function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params);
  const id = Number(idParam);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const autoDownloadTriggered = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const printInFlight = useRef(false);

  const { data: invoice, isLoading } = useQuery<InvoiceDetail>({
    queryKey: queryKeys.invoices.detail(id),
    queryFn: () => apiClient.get<InvoiceDetail>(`/api/invoices/${id}`),
  });

  useEffect(() => {
    if (invoice) {
      logToApp("Invoice print page loaded", {
        invoiceId: invoice.id,
        itemCount: invoice.items.length,
        href: typeof window !== "undefined" ? window.location.href : "",
        hasElectronAPI: typeof window !== "undefined" && !!window.electronAPI?.printInvoice,
      });
    }
  }, [invoice]);

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      toast.success("Invoice deleted");
      router.push("/invoices");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to delete invoice"),
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadInvoicePdf(id);
    } finally {
      setIsDownloading(false);
    }
  };

  useEffect(() => {
    if (!invoice || autoDownloadTriggered.current) return;
    if (searchParams.get("download") !== "1") return;
    autoDownloadTriggered.current = true;
    void handleDownload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, searchParams]);

  // One print at a time. A second click while the first job's dialog or spool was still
  // open used to fire another print on top of it — stacking dialogs and jobs is exactly
  // what turns a slow printer into a frozen app. The ref stops a fast double-click that
  // lands before React has re-rendered the button as disabled.
  const handlePrint = async () => {
    if (printInFlight.current) return;
    printInFlight.current = true;
    setIsPrinting(true);
    try {
      await runPrint();
    } finally {
      printInFlight.current = false;
      setIsPrinting(false);
    }
  };

  const runPrint = async () => {
    logToApp("Print button clicked", {
      invoiceId: id,
      href: window.location.href,
      hasElectronAPI: !!window.electronAPI?.printInvoice,
    });

    if (typeof window !== "undefined" && window.electronAPI?.printInvoice) {
      try {
        logToApp("Waiting for print assets (images/fonts)…");
        const readiness = await waitForPrintAssets();
        logToApp("Print asset readiness", readiness);

        if (readiness.timedOut) {
          logToApp("WARNING: Timed out waiting for images — proceeding with print anyway");
        }
        if (readiness.imagesFailed.length > 0) {
          logToApp("WARNING: Failed to load image(s)", { urls: readiness.imagesFailed });
        }

        logToApp("Calling electronAPI.printInvoice()");
        const res = await window.electronAPI.printInvoice({
          debugContext: {
            invoiceId: id,
            ...readiness,
          },
        });

        logToApp("printInvoice() returned", {
          success: res.success,
          error: res.error ?? null,
          elapsedMs: res.elapsedMs ?? null,
          printerUsed: res.printerUsed ?? null,
          usedFallback: res.usedFallback ?? false,
        });

        if (res?.success && res.usedFallback) {
          // The driver refused the direct job, so the invoice was handed to the OS
          // PDF viewer instead — the operator still has to hit Print there.
          logToApp("Print fell back to the PDF viewer", { path: res.fallbackPath ?? null });
          toast.warning("Printer didn't respond — invoice opened in your PDF viewer, print from there");
        } else if (res?.success) {
          logToApp("Print reported success");
          toast.success("Print job sent to printer");
        } else if (res && !res.success && res.error) {
          if (!/cancel/i.test(res.error)) {
            toast.error(`Printing failed: ${res.error}`);
          } else {
            logToApp("Print canceled by user in dialog");
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        logToApp("printInvoice() threw", { message });
        toast.error(`Print error: ${message}`);
      }
    } else {
      logToApp("electronAPI unavailable — using window.print() browser fallback");
      window.print();
    }
  };

  if (isLoading || !invoice) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const subtotal = invoice.items
    .filter((item) => item.type === "part" || item.type === "labor")
    .reduce((sum, item) => sum + item.amount, 0);
  const discount = invoice.items
    .filter((item) => item.type === "discount")
    .reduce((sum, item) => sum + item.amount, 0);
  const balanceDue = Math.max(0, invoice.total_amount - invoice.paid_amount);

  return (
    <div className="mx-auto max-w-2xl p-8 text-sm text-foreground print:mx-0 print:max-w-none print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link href={`/invoices`} aria-label="Back to invoice">
                <ArrowLeftIcon className="size-4" />
              </Link>
            }
          />
          <h1 className="text-lg font-semibold">Invoice Preview</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href={`/invoices/${id}/edit`}>
                <PencilIcon className="size-4" /> Edit
              </Link>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive">
                  <TrashIcon className="size-4" /> Delete
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete INV-{id}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes this invoice and its line items. This can&apos;t be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => deleteMutation.mutate()}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" onClick={handleDownload} disabled={isDownloading}>
            <DownloadIcon className="size-4" /> {isDownloading ? "Saving…" : "Download PDF"}
          </Button>
          <Button onClick={handlePrint} disabled={isPrinting}>
            <PrinterIcon className="size-4" /> {isPrinting ? "Printing…" : "Print"}
          </Button>
        </div>
      </div>

      {/*
        Sized 210mm x 273mm so one layout fits both A4 (210x297) and US Letter
        (216x279) — max-w caps it on the wider Letter sheet, min-h lets a long item
        list grow onto a second page instead of being clipped at a fixed height.
      */}
      <div className="flex flex-col space-y-6 rounded-md border p-8 text-neutral-900 print:box-border print:min-h-[273mm] print:w-full print:max-w-[210mm] print:justify-between print:space-y-0 print:border-0 print:p-[14mm]">
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {/* Plain img — more reliable than next/image for Electron webContents.print() */}
              <img
                src="/app-logo.png"
                alt="Babu Awamir Auto Garage"
                className="h-16 w-auto shrink-0 object-contain"
                onLoad={() => logToApp("Invoice logo loaded", { src: "/app-logo.png" })}
                onError={() =>
                  logToApp("Invoice logo FAILED to load", { src: "/app-logo.png" })
                }
              />
              <div>
                <h2 className="text-lg font-bold tracking-tight">BABU AWAMIR AUTO GARAGE</h2>
                <p className="text-neutral-500">Mechanical, Electrical, AC, Computer</p>
                <p className="text-neutral-500">Diesel and Petrol</p>
                <p className="text-neutral-500">CR No. 218623</p>
              </div>
            </div>
            <div className="text-right">
              <h3 className="text-2xl font-bold tracking-tight text-[#9f1616]">INVOICE</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-y border-neutral-200 py-4">
            <div>
              <div className="font-semibold text-[#9f1616]">Office Address</div>
              <div>Al jazeera complex</div>
              <div>Birkath al Awamer</div>
              <div className="text-neutral-500">Mobile No. 70524528, 30233733</div>
            </div>
            <div>
              <div className="font-semibold text-[#9f1616]">To</div>
              {formatInvoicePrintCustomerLines({
                name: invoice.customer_name,
                customerType: invoice.customer_type,
                phone: invoice.customer_phone,
                address: invoice.customer_address,
                driverName: invoice.driver_name,
                driverPhone: invoice.driver_phone,
                vehicleNumber: invoice.vehicle_number,
                vehicleModel: invoice.vehicle_model,
              }).map((line, i) => (
                <div key={i} className={i === 0 ? undefined : "text-neutral-500"}>
                  {line}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <span className="font-semibold text-[#9f1616]">Ref:</span> INV-{invoice.id}
            </div>
            <div>
              <span className="font-semibold text-[#9f1616]">Service Date:</span>{" "}
              {formatDateOnly(invoice.service_date, invoice.created_at)}
            </div>
            <div className="sm:text-right">
              <span className="font-semibold text-[#9f1616]">Vehicle:</span>{" "}
              {formatVehiclePrint(invoice.vehicle_number, invoice.vehicle_model)}
            </div>
          </div>
        </div>

        <table className="w-full text-left">
          <thead>
            <tr className="bg-[#9f1616] text-white">
              <th className="py-3 pl-3 font-medium w-10">#</th>
              <th className="py-3 font-medium">Description</th>
              <th className="py-3 font-medium">Type</th>
              <th className="py-3 pr-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, index) => (
              <tr key={item.id} className="border-b border-neutral-200">
                <td className="py-3 pl-3 text-neutral-500 font-medium">{index + 1}</td>
                <td className="py-3">{item.description}</td>
                <td className="py-3 text-neutral-500">{ITEM_TYPE_LABELS[item.type]}</td>
                <td className="py-3 pr-3 text-right">
                  {item.type === "discount" ? "-" : ""}
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-start justify-between gap-8">
          {invoice.notes && (
            <div className="max-w-xs text-sm">
              <div className="font-semibold text-[#9f1616]">Note</div>
              <p className="text-neutral-500">{invoice.notes}</p>
            </div>
          )}

          <div className="ml-auto w-64 space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{formatCurrency(discount)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-neutral-200 pt-1 font-semibold">
              <span>Total</span>
              <span>{formatCurrency(invoice.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>
                Paid (
                {(invoice.payment_method === "other" || invoice.payment_method === "both") && invoice.payment_method_note
                  ? invoice.payment_method_note
                  : PAYMENT_METHOD_LABELS[invoice.payment_method]}
                )
              </span>
              <span>{formatCurrency(invoice.paid_amount)}</span>
            </div>
            <div className="flex items-center justify-between bg-[#9f1616] px-3 py-2 font-semibold text-white">
              <span>Balance Due</span>
              <span>{formatCurrency(balanceDue)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t border-neutral-200 pt-4">
          <p className="text-center font-semibold text-[#9f1616]">Thank you for your business</p>
          <div className="grid grid-cols-2 gap-4 text-xs text-neutral-500">
            <div>
              <div className="font-semibold text-[#9f1616]">Questions?</div>
              <div>Call us: 70524528, 30233733</div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-[#9f1616]">Terms &amp; Conditions</div>
              <div>Goods once sold are not returnable. All amounts are in QAR.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
