"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PencilIcon, TrashIcon, PlusIcon } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDate } from "@/lib/format";
import { vehicleSchema, type VehicleFormData } from "@/lib/schemas/vehicle";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Vehicle = { id: number; vehicle_number: string | null; vehicle_model: string | null; created_at: string };

type CustomerDetail = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  created_at: string;
  vehicles: Vehicle[];
  total_visits: number;
  total_spent: number;
  invoices: {
    id: number;
    total_amount: number;
    paid_amount: number;
    payment_status: "unpaid" | "partial" | "paid";
    created_at: string;
    notes: string | null;
    vehicle_number: string | null;
    vehicle_model: string | null;
  }[];
};

function VehicleForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  defaultValues?: Partial<VehicleFormData>;
  onSubmit: (data: VehicleFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleFormData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { vehicle_number: "", vehicle_model: "", ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-start gap-2">
      <div className="space-y-1">
        <Input placeholder="Vehicle number" {...register("vehicle_number")} disabled={isSubmitting} />
        {errors.vehicle_number && (
          <p className="text-sm text-destructive">{errors.vehicle_number.message}</p>
        )}
      </div>
      <div className="space-y-1">
        <Input placeholder="Vehicle model" {...register("vehicle_model")} disabled={isSubmitting} />
        {errors.vehicle_model && (
          <p className="text-sm text-destructive">{errors.vehicle_model.message}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          Save
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params);
  const id = Number(idParam);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<number | null>(null);

  const { data: customer, isLoading } = useQuery<CustomerDetail>({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => apiClient.get<CustomerDetail>(`/api/customers/${id}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/api/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      toast.success("Customer deleted");
      router.push("/customers");
    },
    onError: (error: ApiError) => {
      toast.error(error.message || "Failed to delete customer");
    },
  });

  const invalidateCustomer = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.vehicles(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.customers.list("") });
  };

  const addVehicleMutation = useMutation({
    mutationFn: (data: VehicleFormData) => apiClient.post(`/api/customers/${id}/vehicles`, data),
    onSuccess: () => {
      invalidateCustomer();
      toast.success("Vehicle added");
      setAddingVehicle(false);
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to add vehicle"),
  });

  const updateVehicleMutation = useMutation({
    mutationFn: ({ vehicleId, data }: { vehicleId: number; data: VehicleFormData }) =>
      apiClient.patch(`/api/vehicles/${vehicleId}`, data),
    onSuccess: () => {
      invalidateCustomer();
      toast.success("Vehicle updated");
      setEditingVehicleId(null);
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to update vehicle"),
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: (vehicleId: number) => apiClient.delete(`/api/vehicles/${vehicleId}`),
    onSuccess: () => {
      invalidateCustomer();
      toast.success("Vehicle deleted");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to delete vehicle"),
  });

  if (isLoading || !customer) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full max-w-md" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={customer.name}
        backHref="/customers"
        backLabel="Back to customers"
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/customers/${id}/edit`}>Edit</Link>}
            />
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive">Delete</Button>} />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can&apos;t be undone. Customers with service or invoice history can&apos;t
                    be deleted.
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
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Phone</div>
            <div>{customer.phone || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Address</div>
            <div>{customer.address || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Customer Since</div>
            <div>{formatDate(customer.created_at)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Visits</div>
            <div>{customer.total_visits}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total Spend</div>
            <div>{formatCurrency(customer.total_spent)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Vehicles</CardTitle>
          {!addingVehicle && (
            <Button variant="outline" size="sm" onClick={() => setAddingVehicle(true)}>
              <PlusIcon className="size-4" />
              Add Vehicle
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {customer.vehicles.length === 0 && !addingVehicle && (
            <p className="text-sm text-muted-foreground">No vehicles on file.</p>
          )}
          {customer.vehicles.map((vehicle) =>
            editingVehicleId === vehicle.id ? (
              <VehicleForm
                key={vehicle.id}
                defaultValues={{
                  vehicle_number: vehicle.vehicle_number ?? "",
                  vehicle_model: vehicle.vehicle_model ?? "",
                }}
                isSubmitting={updateVehicleMutation.isPending}
                onCancel={() => setEditingVehicleId(null)}
                onSubmit={(data) => updateVehicleMutation.mutate({ vehicleId: vehicle.id, data })}
              />
            ) : (
              <div
                key={vehicle.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{vehicle.vehicle_number || "—"}</div>
                  <div className="text-muted-foreground">{vehicle.vehicle_model || "—"}</div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Edit vehicle"
                    onClick={() => setEditingVehicleId(vehicle.id)}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button variant="ghost" size="icon-sm" aria-label="Delete vehicle">
                          <TrashIcon className="size-4" />
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this vehicle?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This can&apos;t be undone. Vehicles with service history can&apos;t be
                          deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => deleteVehicleMutation.mutate(vehicle.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )
          )}
          {addingVehicle && (
            <VehicleForm
              isSubmitting={addVehicleMutation.isPending}
              onCancel={() => setAddingVehicle(false)}
              onSubmit={(data) => addVehicleMutation.mutate(data)}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice History</CardTitle>
        </CardHeader>
        <CardContent>
          {customer.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.invoices.map((invoice, index) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/invoices/${invoice.id}`)}
                  >
                    <TableCell className="text-muted-foreground text-xs font-medium">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <Link href={`/invoices/${invoice.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                        INV-{invoice.id}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {[invoice.vehicle_number, invoice.vehicle_model].filter(Boolean).join(" — ") || "—"}
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.total_amount)}</TableCell>
                    <TableCell>{formatCurrency(invoice.paid_amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          invoice.payment_status === "paid"
                            ? "default"
                            : invoice.payment_status === "partial"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {invoice.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(invoice.created_at)}</TableCell>
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
