"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatDate } from "@/lib/format";
import { useHotkey } from "@/hooks/use-hotkey";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  vehicle_numbers: string | null;
  created_at: string;
};

type CustomerPage = {
  data: Customer[];
  page: number;
  totalPages: number;
  total: number;
};

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  // A new search term invalidates whatever page we were on. Reset during
  // render (React's documented pattern for derived state) rather than in a
  // useEffect, which would cause an extra render before the reset lands.
  const [prevSearch, setPrevSearch] = useState(debouncedSearch);
  if (debouncedSearch !== prevSearch) {
    setPrevSearch(debouncedSearch);
    setPage(1);
  }

  useHotkey("f", useCallback(() => searchRef.current?.focus(), []));

  const { data: result, isLoading } = useQuery<CustomerPage>({
    queryKey: queryKeys.customers.list(debouncedSearch, page),
    queryFn: () =>
      apiClient.get<CustomerPage>(
        `/api/customers?page=${page}${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ""}`
      ),
  });
  const customers = result?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        actions={
          <Button nativeButton={false} render={<Link href="/customers/new">Add Customer</Link>} />
        }
      />

      <Input
        ref={searchRef}
        placeholder="Search by name, phone, vehicle number, or model… (Ctrl+F)"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Vehicles</TableHead>
              <TableHead>Added</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading &&
              customers?.map((customer, index) => (
                <TableRow
                  key={customer.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/customers/${customer.id}`)}
                >
                  <TableCell className="text-muted-foreground text-xs font-medium">
                    {(page - 1) * 10 + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>{customer.phone || "—"}</TableCell>
                  <TableCell>{customer.vehicle_numbers || "—"}</TableCell>
                  <TableCell>{formatDate(customer.created_at)}</TableCell>
                </TableRow>
              ))}

            {!isLoading && customers?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                  {debouncedSearch ? "No customers match your search." : "No customers yet."}
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
