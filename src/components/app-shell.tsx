"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { SyncStatusBadge } from "@/components/sync-status-badge";
import {
  SunIcon,
  MoonIcon,
  LayoutDashboardIcon,
  UsersIcon,
  ReceiptIcon,
  WalletIcon,
  UserCogIcon,
  BarChart3Icon,
  SettingsIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/invoices", label: "Invoices", icon: ReceiptIcon },
  { href: "/customers", label: "Customers", icon: UsersIcon },
  { href: "/expenses", label: "Expenses", icon: WalletIcon },
  { href: "/analytics", label: "Analytics", icon: BarChart3Icon },
  { href: "/users", label: "Users", icon: UserCogIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
    </Button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isLoading, isUnauthenticated } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Client-side auth guard — handles the Electron case where the middleware
  // server-side redirect may not fire before the React tree mounts.
  useEffect(() => {
    if (!isLoading && isUnauthenticated && pathname !== "/login") {
      router.replace("/login");
    }
  }, [isLoading, isUnauthenticated, pathname, router]);

  // Staff have no use for the Dashboard (it's owner-facing P&L data) — send
  // them to Billing instead, since invoicing is their main day-to-day task.
  // Nav-only otherwise (see visibleNavItems below); this one redirect is a
  // landing-experience nicety, not a security boundary.
  useEffect(() => {
    if (!isLoading && !isUnauthenticated && user?.role === "staff" && pathname === "/") {
      router.replace("/invoices");
    }
  }, [isLoading, isUnauthenticated, user, pathname, router]);

  if (pathname?.startsWith("/db-inspector")) {
    return <>{children}</>;
  }

  // Render nothing while auth is resolving (avoids a flash of the shell on
  // unauthenticated load before the redirect fires).
  if (pathname !== "/login" && (isLoading || isUnauthenticated)) {
    return null;
  }

  // Render nothing while a staff user is being redirected off the Dashboard.
  if (user?.role === "staff" && pathname === "/") {
    return null;
  }

  // Hide the shell completely on the login page itself.
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Print pages get a chrome-free layout (no sidebar/header) — still gated
  // by the auth checks above, unlike db-inspector's earlier bypass.
  if (pathname?.endsWith("/print")) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    try {
      await apiClient.post("/api/auth/logout", undefined);
      queryClient.clear();
      router.push("/login");
    } catch (err) {
      console.error(err);
    }
  };

  // Staff's portal is Customers + Billing + Expenses; admin is unrestricted.
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (user?.role === "admin") return true;
    return item.href === "/customers" || item.href === "/invoices" || item.href === "/expenses";
  });

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col items-center gap-2 border-b px-4 py-5">
          <Image
            src="/app-logo.png"
            alt="Babu Awamir Auto Garage"
            width={1294}
            height={556}
            priority
            className="h-16 w-auto"
          />
          <span className="text-center text-md font-semibold italic tracking-wide text-sidebar-foreground">
            Babu Awamir Auto Garage
          </span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 py-3">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                pathname === item.href &&
                  "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-12 items-center justify-between gap-3 border-b border-border px-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <SyncStatusBadge />
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span>
                Logged in as <strong>{user.username}</strong>
              </span>
            )}
            <ThemeToggle />
            {user && (
              <Button variant="outline" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            )}
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
