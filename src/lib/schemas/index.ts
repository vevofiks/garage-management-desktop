/**
 * src/lib/schemas/
 *
 * One zod schema file per entity (customer.ts, service.ts, invoice.ts, ...),
 * added as each phase in docs/implementation.md needs it. Each schema is
 * imported by BOTH the Route Handler that validates the request body and the
 * client form (via @hookform/resolvers/zod), so the two can't disagree about
 * what's valid.
 */

export {};
