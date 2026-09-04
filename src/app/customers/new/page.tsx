"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { CustomerFormData } from "@/lib/schemas/customer";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "../_components/customer-form";

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CustomerFormData) => apiClient.post("/api/customers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      toast.success("Customer added");
      router.push("/customers");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to add customer");
    },
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="Add Customer" backHref="/customers" backLabel="Back to customers" />
      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm
            submitLabel="Add Customer"
            isSubmitting={mutation.isPending}
            onSubmit={(data) => mutation.mutate(data)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
