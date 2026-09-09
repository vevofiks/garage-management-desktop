"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon } from "lucide-react";
import {
  customerSchema,
  CUSTOMER_TYPE_LABELS,
  type CustomerFormData,
  type CustomerType,
} from "@/lib/schemas/customer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const emptyVehicle = {
  driver_name: "",
  driver_phone: "",
  vehicle_number: "",
  vehicle_model: "",
};

export function CustomerForm({
  defaultValues,
  onSubmit,
  isSubmitting,
  submitLabel,
  showVehiclesSection = true,
}: {
  defaultValues?: Partial<CustomerFormData>;
  onSubmit: (data: CustomerFormData) => void;
  isSubmitting: boolean;
  submitLabel: string;
  showVehiclesSection?: boolean;
}) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      customer_type: "individual",
      name: "",
      phone: "",
      address: "",
      vehicles: [{ ...emptyVehicle }],
      ...defaultValues,
    },
  });

  const customerType = watch("customer_type");
  const isCompany = customerType === "company";

  const { fields, append, remove } = useFieldArray({
    control,
    name: "vehicles",
  });

  const setCustomerType = (type: CustomerType) => {
    setValue("customer_type", type, { shouldValidate: true });
    if (type === "individual") {
      fields.forEach((_, index) => {
        setValue(`vehicles.${index}.driver_name`, "");
        setValue(`vehicles.${index}.driver_phone`, "");
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-3">
        <Label>Customer type</Label>
        <div className="flex flex-wrap gap-2">
          {(["individual", "company"] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant={customerType === type ? "default" : "outline"}
              size="sm"
              onClick={() => setCustomerType(type)}
              disabled={isSubmitting}
            >
              {CUSTOMER_TYPE_LABELS[type]}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {isCompany
            ? "Company customers can have multiple drivers, each with a mobile number and vehicle."
            : "Individual customers use a mobile number and their own vehicle(s)."}
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            {isCompany ? "Company name" : "Name"}{" "}
            {isCompany && (
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            )}
          </Label>
          <Input
            id="name"
            placeholder={isCompany ? "Leave blank to use driver name" : undefined}
            {...register("name")}
            disabled={isSubmitting}
          />
          {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">
            {isCompany ? "Company phone" : "Mobile number"}{" "}
            <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="phone"
            placeholder="+974 5555 5555"
            {...register("phone")}
            disabled={isSubmitting}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">
            Address <span className="text-xs font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="address" {...register("address")} disabled={isSubmitting} />
          {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
        </div>
      </div>

      {showVehiclesSection && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">
                  {isCompany ? "Drivers & vehicles" : "Vehicles"}
                </Label>
                {isCompany && (
                  <Badge variant="outline" className="text-xs">
                    Company
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {isCompany
                  ? "Add each driver with their mobile number and vehicle details."
                  : "Add one or more vehicles under this customer (optional)."}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ ...emptyVehicle })}
              disabled={isSubmitting}
            >
              <PlusIcon className="size-4" />
              {isCompany ? "Add driver" : "Add vehicle"}
            </Button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-md border p-3 bg-muted/20 space-y-3">
                {isCompany && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Driver name</Label>
                      <Input
                        placeholder="e.g. Ahmed Ali"
                        {...register(`vehicles.${index}.driver_name`)}
                        disabled={isSubmitting}
                      />
                      {errors.vehicles?.[index]?.driver_name && (
                        <p className="text-xs text-destructive">
                          {errors.vehicles[index]?.driver_name?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Driver number</Label>
                      <Input
                        placeholder="+974 5555 5555"
                        {...register(`vehicles.${index}.driver_phone`)}
                        disabled={isSubmitting}
                      />
                      {errors.vehicles?.[index]?.driver_phone && (
                        <p className="text-xs text-destructive">
                          {errors.vehicles[index]?.driver_phone?.message}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Vehicle number</Label>
                      <Input
                        placeholder="e.g. 123456 or QA-99"
                        {...register(`vehicles.${index}.vehicle_number`)}
                        disabled={isSubmitting}
                      />
                      {errors.vehicles?.[index]?.vehicle_number && (
                        <p className="text-xs text-destructive">
                          {errors.vehicles[index]?.vehicle_number?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Vehicle model</Label>
                      <Input
                        placeholder="e.g. Toyota Land Cruiser"
                        {...register(`vehicles.${index}.vehicle_model`)}
                        disabled={isSubmitting}
                      />
                      {errors.vehicles?.[index]?.vehicle_model && (
                        <p className="text-xs text-destructive">
                          {errors.vehicles[index]?.vehicle_model?.message}
                        </p>
                      )}
                    </div>
                  </div>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-6 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(index)}
                      disabled={isSubmitting}
                    >
                      <TrashIcon className="size-4" />
                      <span className="sr-only">Remove entry</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
