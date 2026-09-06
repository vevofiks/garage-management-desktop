import { z } from 'zod';

const PHONE_PATTERN = /^[0-9+\-\s()]{6,20}$/;

export const vehicleSchema = z.object({
  driver_name: z.string().trim().max(100),
  driver_phone: z
    .string()
    .trim()
    .max(20)
    .refine((val) => val === '' || PHONE_PATTERN.test(val), 'Enter a valid phone number'),
  vehicle_number: z.string().trim().max(20),
  vehicle_model: z.string().trim().max(50),
});

export type VehicleFormData = z.infer<typeof vehicleSchema>;

export function normalizeVehicleInput(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    driver_name: b.driver_name ?? '',
    driver_phone: b.driver_phone ?? '',
    vehicle_number: b.vehicle_number ?? '',
    vehicle_model: b.vehicle_model ?? '',
  };
}

export function vehicleSchemaForCustomerType(customerType: 'individual' | 'company') {
  if (customerType === 'company') {
    return vehicleSchema.superRefine((data, ctx) => {
      const hasAny =
        data.driver_name || data.driver_phone || data.vehicle_number || data.vehicle_model;
      if (!hasAny) return;
      if (!data.driver_name.trim()) {
        ctx.addIssue({ code: 'custom', message: 'Driver name is required', path: ['driver_name'] });
      }
      if (!data.driver_phone.trim()) {
        ctx.addIssue({
          code: 'custom',
          message: 'Driver number is required',
          path: ['driver_phone'],
        });
      }
    });
  }
  return vehicleSchema;
}
