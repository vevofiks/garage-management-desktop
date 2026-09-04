"use client";

import * as React from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A single-calendar date range picker.
 * `from` / `to` are ISO date strings (YYYY-MM-DD) or empty strings.
 * Matches the image reference: one calendar with range highlight,
 * from/to shown in the trigger button.
 *
 * The popover stays open while the user is mid-range (from chosen, to not yet)
 * and closes only once both ends are confirmed.
 */
export function DateRangePicker({
  from,
  to,
  onRangeChange,
  className,
}: {
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  // Track an in-progress selection locally — we only call onRangeChange
  // (and close) once the user has picked both from & to.
  const [pendingRange, setPendingRange] = React.useState<DateRange | undefined>(undefined);

  function handleSelect(selected: DateRange | undefined) {
    setPendingRange(selected);

    const toISO = (d: Date | undefined) =>
      d ? d.toISOString().slice(0, 10) : "";

    if (selected?.from && selected?.to) {
      // Both ends chosen — commit and close
      onRangeChange(toISO(selected.from), toISO(selected.to));
      setOpen(false);
    } else if (selected?.from && !selected?.to) {
      // First click — keep open so user can pick the end date
      // Emit partial state so the parent could show "from" if needed,
      // but keep the popover open.
      onRangeChange(toISO(selected.from), "");
    } else {
      onRangeChange("", "");
    }
  }

  // Format the trigger label
  function formatTrigger() {
    if (!from && !to) return "Select date range";
    const fmt = (iso: string) =>
      new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      });
    if (from && to) return `${fmt(from)} – ${fmt(to)}`;
    if (from) return `From ${fmt(from)}`;
    return `To ${fmt(to)}`;
  }

  // Handles both directions of Base UI's onOpenChange: opening seeds
  // pendingRange from the current committed from/to right here (not a
  // separate effect reacting to `open` — that pattern calls setState
  // synchronously inside an effect, which the lint rule flags, and there's
  // no external system to synchronize with here anyway). Closing is guarded
  // the same as before: outside-click/Escape while `from` is set but `to`
  // isn't keeps the popover open so the user can finish the range.
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPendingRange({
        from: from ? new Date(from + "T00:00:00") : undefined,
        to: to ? new Date(to + "T00:00:00") : undefined,
      });
      setOpen(true);
      return;
    }
    if (pendingRange?.from && !pendingRange?.to) {
      // User clicked away mid-selection — keep open so they can finish
      return;
    }
    setOpen(false);
  }

  const displayRange: DateRange = {
    from: from ? new Date(from + "T00:00:00") : undefined,
    to: to ? new Date(to + "T00:00:00") : undefined,
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          // Content goes ON the rendered Button itself, not as PopoverTrigger's
          // own children — Base UI's render-prop composition takes the
          // element's own children as what's actually rendered inside it
          // (same pattern as every AlertDialogTrigger/DialogTrigger render
          // in this app). Putting the icon+label on the Trigger instead, as
          // this did before, meant Button rendered empty while the icon and
          // label text spilled out unstyled next to it — collapsing the
          // button down to its empty min-height and leaving the label
          // floating outside it instead of centered inside a proper h-8 box.
          <Button
            variant="outline"
            className={cn(
              // Match the h-8 height of SelectTrigger for field uniformity
              "w-48 justify-start gap-2 text-left font-normal",
              !from && !to && "text-muted-foreground",
              className
            )}
          >
            <CalendarIcon className="size-4 shrink-0" />
            {formatTrigger()}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          // min={1} forces react-day-picker to leave `to` undefined on the
          // first click instead of collapsing to a same-day range — without
          // it, addToRange() sets `to: date` immediately on the very first
          // click (min defaults to 0), which made handleSelect below see a
          // "complete" range and commit+close the popover before the user
          // ever got to pick an end date.
          min={1}
          selected={open ? pendingRange : displayRange}
          onSelect={handleSelect}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  );
}
