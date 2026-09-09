"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { CustomerFormData } from "@/lib/schemas/customer";
import { formatCustomerListName } from "@/lib/customer-list";
import { CustomerListCell } from "@/components/customer-list-cell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerForm } from "@/app/customers/_components/customer-form";

type CustomerOption = {
  id: number;
  name: string;
  phone: string | null;
  customer_type: "individual" | "company";
  vehicle_numbers: string | null;
};

export type SelectedCustomer = {
  id: number;
  name: string;
  customer_type?: "individual" | "company";
};

type CreatedCustomer = { id: number; name: string; customer_type?: "individual" | "company" };

export function CustomerPicker({
  selected,
  onSelect,
  allowCreate = false,
}: {
  selected: SelectedCustomer | null;
  onSelect: (customer: SelectedCustomer | null) => void;
  allowCreate?: boolean;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const { data: page, isLoading } = useQuery<{ data: CustomerOption[] }>({
    queryKey: queryKeys.customers.list(debounced),
    queryFn: () =>
      apiClient.get<{ data: CustomerOption[] }>(
        `/api/customers?page_size=50${debounced ? `&q=${encodeURIComponent(debounced)}` : ""}`
      ),
    enabled: !selected && !addingCustomer,
  });
  const customers = page?.data;

  const displayedCustomers = debounced || showAll ? customers : customers?.slice(0, 5);
  const hasMore = !debounced && !showAll && customers && customers.length > 5;

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) =>
      apiClient.post<CreatedCustomer>("/api/customers", data),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onSelect({
        id: customer.id,
        name: formatCustomerListName(customer.name, customer.customer_type),
        customer_type: customer.customer_type ?? "individual",
      });
      setAddingCustomer(false);
      setSearch("");
      toast.success("Customer added");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to add customer");
    },
  });

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2">
        <span className="text-sm font-medium">{selected.name}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    );
  }

  if (allowCreate && addingCustomer) {
    return (
      <div className="space-y-3 rounded-md border p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Add customer</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setAddingCustomer(false)}
          >
            <SearchIcon className="size-4" />
            Search existing
          </Button>
        </div>
        <CustomerForm
          submitLabel="Save & select customer"
          isSubmitting={createMutation.isPending}
          onSubmit={(data) => createMutation.mutate(data)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search customer by name, phone, vehicle number, or model…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowAll(false);
        }}
      />
      <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
        {isLoading && <Skeleton className="h-8 w-full" />}
        {!isLoading && customers?.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {debounced ? "No customers found." : "No customers yet — add one below."}
          </p>
        )}
        {!isLoading &&
          displayedCustomers?.map((customer) => (
            <Button
              key={customer.id}
              type="button"
              variant="ghost"
              className="h-auto w-full flex-col items-start justify-start gap-0 px-2 py-1.5 text-left"
              onClick={() =>
                onSelect({
                  id: customer.id,
                  name: formatCustomerListName(customer.name, customer.customer_type),
                  customer_type: customer.customer_type ?? "individual",
                })
              }
            >
              <CustomerListCell
                name={customer.name}
                customerType={customer.customer_type}
                phone={customer.phone}
                vehicleSummary={customer.vehicle_numbers}
                inlineDetails={customer.customer_type === "company"}
              />
              {customer.customer_type !== "company" && (
                <span className="w-full text-xs font-normal text-muted-foreground">
                  {[customer.phone, customer.vehicle_numbers].filter(Boolean).join(" · ") ||
                    "No contact info"}
                </span>
              )}
            </Button>
          ))}
        {hasMore && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-xs text-muted-foreground"
            onClick={() => setShowAll(true)}
          >
            See all... or search from top search bar
          </Button>
        )}
      </div>

      {allowCreate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => setAddingCustomer(true)}
        >
          <PlusIcon className="size-4" />
          Add new customer
        </Button>
      )}
    </div>
  );
}
