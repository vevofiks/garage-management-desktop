"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export type AuthUser = {
  id: number;
  username: string;
  role: "admin" | "staff";
};

/**
 * Wraps GET /api/auth/me (built in Phase 1). Until that route exists this
 * just resolves to "not logged in" rather than throwing, so it's safe to
 * mount from the nav shell before Phase 1 is built.
 */
export function useAuth() {
  const query = useQuery<AuthUser | null>({
    queryKey: queryKeys.auth.me,
    queryFn: async () => {
      try {
        return await apiClient.get<AuthUser>("/api/auth/me");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
  });

  const isUnauthenticated = query.data === null || (query.isError && query.error instanceof ApiError && query.error.status === 401);

  return {
    user: query.data || null,
    isLoading: query.isLoading,
    isUnauthenticated,
  };
}

/**
 * Guards an admin-only page: redirects non-admins away once the auth query
 * resolves. The API route behind the page already rejects staff with a 403
 * regardless (that's the real security boundary — proxy.ts + this hook are
 * both just UX so a staff user isn't left staring at a broken empty page
 * instead of being routed somewhere sensible).
 */
export function useRequireRole(role: "admin" | "staff" | ("admin" | "staff")[]) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const allowedRoles = Array.isArray(role) ? role : [role];

  useEffect(() => {
    if (!isLoading && user && !allowedRoles.includes(user.role)) {
      router.replace("/");
    }
    // allowedRoles is derived fresh each render from `role` — compare via its
    // joined value so this effect doesn't re-fire on every render when the
    // caller passes an array literal inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, allowedRoles.join(","), router]);

  return { user, isLoading, isAllowed: !isLoading && !!user && allowedRoles.includes(user.role) };
}
