"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The standard header for every top-level and detail page — title (+
 * optional back button and subtitle) on the left, page-level actions on the
 * right, separated from the content below by a bottom border. Every page
 * under src/app/** was previously hand-rolling its own version of this
 * (a plain `<h1>` in a `flex justify-between` div, sometimes with a back
 * button, sometimes without); centralizing it here means a tweak to the
 * look (spacing, border, back-button style) only has to happen once.
 */
export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b pb-5", className)}>
      <div className="flex items-center gap-3">
        {backHref && (
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={
              <Link href={backHref} aria-label={backLabel ?? "Back"}>
                <ArrowLeftIcon className="size-4" />
              </Link>
            }
          />
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
