"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { CustomerFormData } from "@/lib/schemas/customer";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerForm } from "../../_components/customer-form";

type Vehicle = { id: number; vehicle_number: string | null; vehicle_model: string | null };

type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  vehicles?: Vehicle[];
};

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params);
  const id = Number(idParam);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => apiClient.get<Customer>(`/api/customers/${id}`),
  });

  const mutation = useMutation({
    mutationFn: (data: CustomerFormData) => apiClient.patch(`/api/customers/${id}`, data),
    onSuccess: () => {
      // .all is a prefix of both .list(q) (any search term) and .detail(id),
      // so one invalidation covers every customer-related query in the cache.
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      toast.success("Customer updated");
      router.push(`/customers/${id}`);
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to update customer");
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Edit Customer"
        backHref={`/customers/${id}`}
        backLabel="Back to customer"
      />
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading || !customer ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <CustomerForm
              submitLabel="Save Changes"
              isSubmitting={mutation.isPending}
              showVehiclesSection={true}
              defaultValues={{
                name: customer.name,
                phone: customer.phone ?? "",
                address: customer.address ?? "",
                vehicles:
                  customer.vehicles && customer.vehicles.length > 0
                    ? customer.vehicles.map((v) => ({
                        id: v.id,
                        vehicle_number: v.vehicle_number ?? "",
                        vehicle_model: v.vehicle_model ?? "",
                      }))
                    : [{ vehicle_number: "", vehicle_model: "" }],
              }}
              onSubmit={(data) => mutation.mutate(data)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
