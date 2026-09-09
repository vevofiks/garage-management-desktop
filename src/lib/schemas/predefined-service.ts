import { z } from 'zod';

export const predefinedServiceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
});

export type PredefinedServiceFormData = z.infer<typeof predefinedServiceSchema>;
