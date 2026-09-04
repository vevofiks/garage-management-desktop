import { z } from 'zod';

// Plain (non-coerced) string fields, same reasoning as customer.ts — keeps
// zodResolver's input type matching useForm's field-value type exactly.
export const vehicleSchema = z.object({
  vehicle_number: z.string().trim().max(20),
  vehicle_model: z.string().trim().max(50),
});

export type VehicleFormData = z.infer<typeof vehicleSchema>;

export function normalizeVehicleInput(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    vehicle_number: b.vehicle_number ?? '',
    vehicle_model: b.vehicle_model ?? '',
  };
}
