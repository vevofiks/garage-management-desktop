/**
 * src/lib/http.ts
 *
 * Consistent JSON response shapes for every Route Handler under src/app/api/**.
 * Every handler should return through one of these instead of building
 * Response.json(...) inline, so every client-side error branch can rely on
 * the same { error: string } shape.
 */

import type { NextRequest } from "next/server";
import { ZodError } from "zod";

export function ok<T>(data: T, init?: ResponseInit) {
  return Response.json(data, init);
}

export type PaginatedResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/**
 * Shared page-based list shape for the Invoices/Customers/Expenses tables —
 * `data` alongside the paging metadata the UI needs to render a page control
 * and disable prev/next correctly at the edges.
 */
export function paginated<T>(data: T[], page: number, pageSize: number, total: number, init?: ResponseInit) {
  return ok<PaginatedResult<T>>(
    { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    init
  );
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Parses `page`/`page_size` search params with sane defaults + bounds. */
export function parsePagination(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function unauthorized(message = "Unauthorized") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return Response.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return Response.json({ error: message }, { status: 404 });
}

/**
 * Throwable counterparts to the response helpers above. `requireUser`/
 * `requireRole` (src/lib/auth.ts) and route handlers throw these; only
 * `withErrorHandling` needs to know how to turn them back into a response,
 * so handler bodies stay free of try/catch boilerplate.
 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad request") {
    super(400, message);
  }
}

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/**
 * Wraps a Route Handler so every thrown HttpError/ZodError (or anything
 * unexpected) becomes a consistent { error } JSON response instead of each
 * handler repeating the same try/catch.
 */
export function withErrorHandling<Ctx = unknown>(handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return badRequest(error.issues[0]?.message ?? "Invalid request");
      }
      const errStr = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
      console.error('[API ERROR]: ' + errStr);
      return Response.json({ error: "Internal server error", details: errStr }, { status: 500 });
    }
  };
}
