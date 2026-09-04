/**
 * src/lib/api-client.ts
 *
 * Thin typed fetch wrapper around src/app/api/**. Every TanStack Query
 * query/mutation in the app goes through this instead of calling fetch()
 * directly, so error handling against src/lib/http.ts's { error } shape
 * only lives in one place.
 */

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const cloudUrl = process.env.NEXT_PUBLIC_API_URL || "";
  const isOnline = typeof window !== "undefined" ? navigator.onLine : true;

  // Use cloud URL if configured and online; fallback to local API if offline or if cloud URL is unset
  let targetUrl = path;
  if (cloudUrl && isOnline && !path.startsWith("http")) {
    targetUrl = `${cloudUrl}${path}`;
  }

  try {
    const res = await fetch(targetUrl, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiError(body?.error ?? res.statusText, res.status);
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    // If cloud request fails due to network connection, automatically fallback to local database
    if (cloudUrl && targetUrl.startsWith(cloudUrl) && err instanceof TypeError) {
      console.warn("Cloud connection unavailable. Falling back to local server.", err);
      const localRes = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
      if (!localRes.ok) {
        const body = await localRes.json().catch(() => null);
        throw new ApiError(body?.error ?? localRes.statusText, localRes.status);
      }
      if (localRes.status === 204) return undefined as T;
      return localRes.json() as Promise<T>;
    }
    throw err;
  }
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
