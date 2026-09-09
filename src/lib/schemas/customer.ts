import { z } from 'zod';

const PHONE_PATTERN = /^[0-9+\-\s()]{6,20}$/;

export const customerTypeSchema = z.enum(['individual', 'company']);
export type CustomerType = z.infer<typeof customerTypeSchema>;

export const customerVehicleSchema = z.object({
  id: z.number().optional(),
  driver_name: z.string().trim().max(100),
  driver_phone: z
    .string()
    .trim()
    .max(20)
    .refine((val) => val === '' || PHONE_PATTERN.test(val), 'Enter a valid phone number'),
  vehicle_number: z.string().trim().max(20),
  vehicle_model: z.string().trim().max(50),
});

export type CustomerVehicleInput = z.infer<typeof customerVehicleSchema>;

export function isVehicleRowEmpty(v: CustomerVehicleInput): boolean {
  return !v.driver_name && !v.driver_phone && !v.vehicle_number && !v.vehicle_model;
}

export function filterMeaningfulVehicleRows(vehicles: CustomerVehicleInput[]): CustomerVehicleInput[] {
  return vehicles.filter((v) => !isVehicleRowEmpty(v));
}

/** Persisted name for SQLite NOT NULL — derives from driver when company name is blank. */
export function resolveStoredCustomerName(
  customerType: CustomerType,
  name: string,
  vehicles: CustomerVehicleInput[]
): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;

  if (customerType === 'company') {
    const firstDriver = filterMeaningfulVehicleRows(vehicles).find((v) => v.driver_name.trim());
    if (firstDriver) return firstDriver.driver_name.trim();
    return 'Company';
  }

  return trimmed;
}

/** UI label when stored name is blank or generic. */
export function formatCustomerDisplayName(
  name: string | null | undefined,
  customerType?: CustomerType | null,
  vehicles?: Array<{ driver_name?: string | null; driver_phone?: string | null; vehicle_number?: string | null }> | null
): string {
  const trimmed = name?.trim();
  if (trimmed && trimmed !== 'Company') return trimmed;

  if (customerType === 'company') {
    const firstDriver = vehicles?.find((v) => v.driver_name?.trim());
    if (firstDriver?.driver_name?.trim()) return firstDriver.driver_name.trim();
    const firstVehicle = vehicles?.find((v) => v.vehicle_number?.trim());
    if (firstVehicle?.vehicle_number?.trim()) return firstVehicle.vehicle_number.trim();
    return trimmed || 'Company';
  }

  return trimmed || '—';
}

export const customerSchema = z
  .object({
    customer_type: customerTypeSchema,
    name: z.string().trim().max(100),
    phone: z
      .string()
      .trim()
      .max(20)
      .refine((val) => val === '' || PHONE_PATTERN.test(val), 'Enter a valid phone number'),
    address: z.string().trim().max(300),
    vehicles: z.array(customerVehicleSchema),
  })
  .superRefine((data, ctx) => {
    const meaningfulRows = filterMeaningfulVehicleRows(data.vehicles);

    if (data.customer_type === 'individual') {
      if (!data.name.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Name is required',
          path: ['name'],
        });
      }
    }

    if (data.customer_type === 'company') {
      if (!data.name.trim() && meaningfulRows.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Add a company name or at least one driver with details',
          path: ['name'],
        });
      }
    }

    for (let i = 0; i < data.vehicles.length; i++) {
      const v = data.vehicles[i];
      if (isVehicleRowEmpty(v)) continue;

      const hasVehicle = !!(v.vehicle_number || v.vehicle_model);
      const hasDriver = !!(v.driver_name || v.driver_phone);

      if (data.customer_type === 'company') {
        if (!v.driver_name.trim()) {
          ctx.addIssue({
            code: 'custom',
            message: 'Driver name is required',
            path: ['vehicles', i, 'driver_name'],
          });
        }
        if (!v.driver_phone.trim()) {
          ctx.addIssue({
            code: 'custom',
            message: 'Driver number is required',
            path: ['vehicles', i, 'driver_phone'],
          });
        }
      } else if (hasDriver) {
        ctx.addIssue({
          code: 'custom',
          message: 'Driver details are only for company customers',
          path: ['vehicles', i, 'driver_name'],
        });
      } else if (!hasVehicle && data.customer_type === 'individual') {
        // Allow completely empty rows for individual — skipped above via isVehicleRowEmpty
      }
    }
  });

export type CustomerFormData = z.infer<typeof customerSchema>;

export function normalizeCustomerInput(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawVehicles = Array.isArray(b.vehicles) ? b.vehicles : [];
  const customerType = b.customer_type === 'company' ? 'company' : 'individual';

  return {
    customer_type: customerType,
    name: b.name ?? '',
    phone: b.phone ?? '',
    address: b.address ?? '',
    vehicles: rawVehicles.map((v: unknown) => {
      const item = (v ?? {}) as Record<string, unknown>;
      return {
        id: typeof item.id === 'number' ? item.id : undefined,
        driver_name: item.driver_name ?? '',
        driver_phone: item.driver_phone ?? '',
        vehicle_number: item.vehicle_number ?? '',
        vehicle_model: item.vehicle_model ?? '',
      };
    }),
  };
}

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  individual: 'Individual',
  company: 'Company',
};
