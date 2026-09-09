import { z } from 'zod';

export const userSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  password: z.string().min(4, 'Password must be at least 4 characters').optional().or(z.literal('')),
  role: z.enum(['admin', 'staff'])
});

export type UserFormData = z.infer<typeof userSchema>;
