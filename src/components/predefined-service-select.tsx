"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PredefinedService = { id: number; name: string };

const ADD_NEW_VALUE = "__add_new__";

/**
 * The description picker for a part/labor line item — a Select over the
 * shared `predefined_services` catalog (seeded with the garage's common
 * jobs), with an inline "add new" affordance that grows the catalog instead
 * of falling back to a free-text field. Used by both the service item
 * editor and the invoice item editor so the same catalog backs both.
 */
export function PredefinedServiceSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: catalog } = useQuery<PredefinedService[]>({
    queryKey: queryKeys.predefinedServices.all,
    queryFn: () => apiClient.get<PredefinedService[]>("/api/predefined-services"),
  });

  const addMutation = useMutation({
    mutationFn: (name: string) =>
      apiClient.post<PredefinedService>("/api/predefined-services", { name }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.predefinedServices.all });
      onChange(created.name);
      setIsAdding(false);
      setNewName("");
    },
  });

  if (isAdding) {
    return (
      <div className="flex gap-1">
        <Input
          autoFocus
          placeholder="New service name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              e.preventDefault();
              addMutation.mutate(newName.trim());
            }
            if (e.key === "Escape") setIsAdding(false);
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={!newName.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate(newName.trim())}
        >
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setIsAdding(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Select
      // Always a defined string (never `value || undefined`) — Base UI
      // decides controlled-vs-uncontrolled from whether `value` is
      // `undefined` on the *first* render, so a freshly-appended row
      // starting at "" and later flipping to a real name would otherwise
      // toggle controlled state mid-lifetime and log a console warning.
      value={value}
      onValueChange={(val) => {
        if (!val) return;
        if (val === ADD_NEW_VALUE) {
          setIsAdding(true);
          return;
        }
        onChange(val);
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        {/* Explicit children, not the default label-lookup: right after
            adding a new catalog entry there's a brief window before the
            refetched list contains it, and an unmatched value would
            otherwise render blank instead of the name just chosen. */}
        <SelectValue placeholder="Select a service…">{value || undefined}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {catalog?.map((service) => (
          <SelectItem key={service.id} value={service.name}>
            {service.name}
          </SelectItem>
        ))}
        <SelectItem value={ADD_NEW_VALUE}>
          <span className="flex items-center gap-1 text-primary">
            <Plus className="size-3.5" /> Add new service…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
