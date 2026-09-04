"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

type Invoice = {
  id: number;
  customer_id: number;
  customer_name: string;
  vehicle_number: string | null;
  vehicle_model: string | null;
  total_amount: number;
  paid_amount: number;
  payment_status: "unpaid" | "partial" | "paid";
  created_at: string;
};

type StatusFilter = "all" | "unpaid" | "partial" | "paid";

type InvoicePage = {
  data: Invoice[];
  page: number;
  totalPages: number;
  total: number;
};

const STATUS_BADGE: Record<Invoice["payment_status"], "default" | "secondary" | "destructive"> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
};

export default function InvoicesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  // A new search term or status filter invalidates whatever page we were on.
  // Reset during render (React's documented pattern for derived state)
  // rather than in a useEffect, which would cause an extra render first.
  const filterKey = `${debounced}|${status}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data: result, isLoading } = useQuery<InvoicePage>({
    queryKey: queryKeys.invoices.list({ q: debounced, status, page }),
    queryFn: () =>
      apiClient.get<InvoicePage>(
        `/api/invoices?page=${page}&status=${status}${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`
      ),
  });
  const invoices = result?.data;

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      toast.success("Invoice deleted");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to delete invoice"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        actions={
          <Button nativeButton={false} render={<Link href="/invoices/new">New Invoice</Link>} />
        }
      />

      <div className="flex gap-3">
        <Input
          placeholder="Search by customer, invoice, vehicle number, or model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Select value={status} onValueChange={(val) => val && setStatus(val as StatusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              invoices?.map((invoice, index) => (
                <TableRow
                  key={invoice.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/invoices/${invoice.id}`)}
                >
                  <TableCell className="text-muted-foreground text-xs font-medium">
                    {(page - 1) * 10 + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      INV-{invoice.id}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.customer_name}</TableCell>
                  <TableCell>
                    {[invoice.vehicle_number, invoice.vehicle_model].filter(Boolean).join(" — ") || "—"}
                  </TableCell>
                  <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                  <TableCell>{formatCurrency(invoice.paid_amount)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[invoice.payment_status]}>
                      {invoice.payment_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(invoice.created_at)}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="destructive" size="sm">
                            Delete
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete INV-{invoice.id}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes this invoice and its line items. This can&apos;t
                            be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(invoice.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && invoices?.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                  {debounced || status !== "all" ? "No invoices match your filters." : "No invoices yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {result && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
