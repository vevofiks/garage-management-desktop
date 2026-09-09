"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSignIcon,
  WalletIcon,
  TrendingUpIcon,
  ReceiptIcon,
  PlusIcon,
  Loader2,
  CreditCardIcon,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDate, formatDateOnly } from "@/lib/format";
import {
  CUSTOMER_TYPE_LABELS,
  type CustomerType,
} from "@/lib/schemas/customer";
import { CustomerListCell, CustomerVehicleListCell, InvoiceCustomerCell } from "@/components/customer-list-cell";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/schemas/invoice";
import { useRequireRole } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type DashboardData = {
  sales: number;
  balanceDue: number;
  expenses: number;
  profit: number;
  invoiceCount: number;
  creditOutstanding: number;
  creditInvoicesThisMonth: number;
  creditOutstandingThisMonth: number;
  recentCustomers: {
    id: number;
    name: string;
    phone: string | null;
    customer_type: CustomerType;
    vehicle_numbers: string | null;
    created_at: string;
  }[];
  recentInvoices: {
    id: number;
    customer_name: string;
    customer_type: CustomerType;
    customer_phone: string | null;
    vehicle_number: string | null;
    vehicle_model: string | null;
    driver_name: string | null;
    driver_phone: string | null;
    total_amount: number;
    paid_amount: number;
    payment_status: "unpaid" | "partial" | "paid";
    payment_method: PaymentMethod;
    service_date: string;
    created_at: string;
  }[];
  outstandingCredit: {
    id: number;
    customer_name: string;
    customer_type: CustomerType;
    customer_phone: string | null;
    vehicle_number: string | null;
    vehicle_model: string | null;
    driver_name: string | null;
    driver_phone: string | null;
    total_amount: number;
    paid_amount: number;
    payment_status: "unpaid" | "partial" | "paid";
    service_date: string;
    created_at: string;
  }[];
  recentExpenses: {
    id: number;
    amount: number;
    notes: string | null;
    date: string;
    category_name: string;
  }[];
};

const PAYMENT_BADGE: Record<DashboardData["recentInvoices"][number]["payment_status"], "default" | "secondary" | "destructive"> = {
  paid: "default",
  partial: "secondary",
  unpaid: "destructive",
};

const STAT_CARDS = [
  { key: "sales" as const, label: "Sales (Collected)", icon: DollarSignIcon, format: formatCurrency },
  { key: "balanceDue" as const, label: "Balance Due", icon: ReceiptIcon, format: formatCurrency },
  { key: "expenses" as const, label: "Expenses", icon: WalletIcon, format: formatCurrency },
  { key: "profit" as const, label: "Net Profit", icon: TrendingUpIcon, format: formatCurrency },
];

const CREDIT_STAT_CARDS = [
  { key: "creditOutstanding" as const, label: "Credit Outstanding", icon: CreditCardIcon, format: formatCurrency },
  {
    key: "creditInvoicesThisMonth" as const,
    label: "Credit Invoices (This Month)",
    icon: ReceiptIcon,
    format: (n: number) => String(n),
  },
];

export default function DashboardPage() {
  const { isAllowed, isLoading: isAuthLoading } = useRequireRole("admin");

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: queryKeys.reports.dashboard,
    queryFn: () => apiClient.get<DashboardData>("/api/reports/dashboard"),
    enabled: isAllowed,
  });

  if (isAuthLoading || !isAllowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="This month's snapshot at a glance." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_CARDS.map((stat) => (
          <Card key={stat.key}>
            <CardContent className="flex items-center gap-3 py-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <stat.icon className="size-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="text-xl font-semibold tracking-tight">
                  {isLoading || !data ? "—" : stat.format(data[stat.key])}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {CREDIT_STAT_CARDS.map((stat) => (
          <Card key={stat.key}>
            <CardContent className="flex items-center gap-3 py-2">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <stat.icon className="size-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="text-xl font-semibold tracking-tight">
                  {isLoading || !data ? "—" : stat.format(data[stat.key])}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Customers</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <Link href="/customers/new">
                  <PlusIcon className="size-3.5" /> New Customer
                </Link>
              }
            />
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : data.recentCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Drivers / Vehicles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentCustomers.map((customer, index) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <Link href={`/customers/${customer.id}`} className="hover:underline">
                          <CustomerListCell
                            name={customer.name}
                            customerType={customer.customer_type}
                          />
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CUSTOMER_TYPE_LABELS[customer.customer_type ?? "individual"]}
                        </Badge>
                      </TableCell>
                      <TableCell>{customer.phone || "—"}</TableCell>
                      <TableCell>
                        <CustomerVehicleListCell
                          customerType={customer.customer_type}
                          vehicleSummary={customer.vehicle_numbers}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={
                            <Link
                              href={`/invoices/new?customerId=${customer.id}`}
                              aria-label={`Create invoice for ${customer.name}`}
                            >
                              <ReceiptIcon className="size-3.5" /> Invoice
                            </Link>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Invoices</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={
                <Link href="/invoices/new">
                  <PlusIcon className="size-3.5" /> New Invoice
                </Link>
              }
            />
          </CardHeader>
          <CardContent>
            {isLoading || !data ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : data.recentInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Customer / Vehicle</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentInvoices.map((invoice, index) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                          INV-{invoice.id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <InvoiceCustomerCell
                          name={invoice.customer_name}
                          customerType={invoice.customer_type}
                          phone={invoice.customer_phone}
                          driverName={invoice.driver_name}
                          driverPhone={invoice.driver_phone}
                          vehicleNumber={invoice.vehicle_number}
                          vehicleModel={invoice.vehicle_model}
                        />
                      </TableCell>
                      <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant={invoice.payment_method === "credit" ? "outline" : "secondary"}>
                          {PAYMENT_METHOD_LABELS[invoice.payment_method]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PAYMENT_BADGE[invoice.payment_status]}>
                          {invoice.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={`/invoices/${invoice.id}`}>View</Link>}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Outstanding Credit</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/invoices?filter=credit">View all credit invoices</Link>}
          />
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data.outstandingCredit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No outstanding credit invoices.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer / Vehicle</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Service Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.outstandingCredit.map((invoice, index) => {
                  const balance = Math.max(0, invoice.total_amount - invoice.paid_amount);
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/invoices/${invoice.id}`} className="hover:underline">
                          INV-{invoice.id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <InvoiceCustomerCell
                          name={invoice.customer_name}
                          customerType={invoice.customer_type}
                          phone={invoice.customer_phone}
                          driverName={invoice.driver_name}
                          driverPhone={invoice.driver_phone}
                          vehicleNumber={invoice.vehicle_number}
                          vehicleModel={invoice.vehicle_model}
                        />
                      </TableCell>
                      <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                      <TableCell className="font-medium text-destructive">{formatCurrency(balance)}</TableCell>
                      <TableCell>{formatDateOnly(invoice.service_date, invoice.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={<Link href={`/invoices/${invoice.id}`}>Collect</Link>}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Expenses</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={
              <Link href="/expenses">
                <PlusIcon className="size-3.5" /> Log Expense
              </Link>
            }
          />
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data.recentExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses logged yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentExpenses.map((expense, index) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>{formatDate(expense.date)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{expense.category_name}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{expense.notes || "—"}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
