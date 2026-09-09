/**
 * src/lib/query-keys.ts
 *
 * One key factory per entity so every useQuery/useMutation invalidation
 * target is typed and can't typo-drift between files. See the
 * "Mutation → invalidation matrix" in docs/implementation.md for which keys
 * each mutation must invalidate.
 */

export const queryKeys = {
  customers: {
    all: ["customers"] as const,
    list: (q?: string, page = 1) => ["customers", "list", q ?? "", page] as const,
    detail: (id: number) => ["customers", "detail", id] as const,
    vehicles: (id: number) => ["customers", "vehicles", id] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    list: (
      filters: { q?: string; from?: string; to?: string; customerId?: number; status?: string; page?: number } = {}
    ) => ["invoices", "list", filters] as const,
    detail: (id: number) => ["invoices", "detail", id] as const,
  },
  expenses: {
    all: ["expenses"] as const,
    list: (filters: { from?: string; to?: string; categoryId?: number; page?: number } = {}) =>
      ["expenses", "list", filters] as const,
    categories: ["expenses", "categories"] as const,
  },
  users: {
    all: ["users"] as const,
    list: ["users", "list"] as const,
  },
  predefinedServices: {
    all: ["predefinedServices"] as const,
  },
  auth: {
    me: ["auth", "me"] as const,
  },
  reports: {
    dashboard: ["reports", "dashboard"] as const,
    profitLoss: (params: { from: string; to: string; groupBy: "day" | "week" | "month" }) =>
      ["reports", "profit-loss", params] as const,
  },
  auditLogs: {
    all: ["auditLogs"] as const,
  },
  sync: {
    status: ["sync", "status"] as const,
  },
};
