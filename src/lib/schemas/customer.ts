import { z } from 'zod';

// Plain (non-optional, non-transformed) string fields on purpose: zodResolver
// infers a form's field types from the schema's *input* type, and a form
// text input always produces a string (never undefined) — mixing in
// .optional()/.transform() here made the input/output types diverge and
// broke that inference. Empty-but-allowed fields are instead validated with
// .refine() so "" stays a plain valid string.
const PHONE_PATTERN = /^[0-9+\-\s()]{6,20}$/;

export const customerVehicleSchema = z.object({
  id: z.number().optional(),
  vehicle_number: z.string().trim().max(20),
  vehicle_model: z.string().trim().max(50),
});

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine((val) => val === '' || PHONE_PATTERN.test(val), 'Enter a valid phone number'),
  address: z.string().trim().max(300),
  vehicles: z.array(customerVehicleSchema),
});

export type CustomerFormData = z.infer<typeof customerSchema>;

/**
 * The form always sends fields (react-hook-form defaultValues fill ''
 * for anything empty), but a direct API caller may omit optional ones
 * entirely — normalize before customerSchema.parse() so that's treated the
 * same as sending defaults.
 */
export function normalizeCustomerInput(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawVehicles = Array.isArray(b.vehicles) ? b.vehicles : [];
  return {
    name: b.name,
    phone: b.phone ?? '',
    address: b.address ?? '',
    vehicles: rawVehicles.map((v: unknown) => {
      const item = (v ?? {}) as Record<string, unknown>;
      return {
        id: typeof item.id === 'number' ? item.id : undefined,
        vehicle_number: item.vehicle_number ?? '',
        vehicle_model: item.vehicle_model ?? '',
      };
    }),
  };
}
