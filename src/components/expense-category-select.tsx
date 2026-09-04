"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
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
import { toast } from "sonner";

export type ExpenseCategory = { id: number; name: string };

const ADD_NEW_VALUE = "__add_new__";

/**
 * The expense-category picker: a Select over the admin-managed
 * `expense_categories` catalog, with an inline "add new" affordance —
 * same pattern as `PredefinedServiceSelect`, but category ids (not names)
 * are the form value here since expenses reference categories by id.
 *
 * Note: this uses Base UI (not Radix). Base UI's Select.Value does NOT
 * auto-resolve ItemText from the matched item — it renders whatever string
 * is in `value`. We work around this by passing the resolved category name
 * as the children of SelectValue explicitly.
 */
export function ExpenseCategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (categoryId: number) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: categories } = useQuery<ExpenseCategory[]>({
    queryKey: queryKeys.expenses.categories,
    queryFn: () => apiClient.get<ExpenseCategory[]>("/api/expense-categories"),
  });

  const addMutation = useMutation({
    mutationFn: (name: string) =>
      apiClient.post<ExpenseCategory>("/api/expense-categories", { name }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.categories });
      onChange(created.id);
      setIsAdding(false);
      setNewName("");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to add category"),
  });

  if (isAdding) {
    return (
      <div className="flex gap-1">
        <Input
          autoFocus
          placeholder="New category name"
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

  // Resolve the display label from the loaded categories list.
  // Base UI Select.Value renders the raw `value` string rather than
  // auto-resolving ItemText, so we pass the name as explicit children.
  const selectedLabel = categories?.find((c) => c.id === value)?.name;

  return (
    <Select
      // Always a defined string (never `value ?? undefined`) — Base UI
      // decides controlled-vs-uncontrolled from whether `value` is
      // `undefined` on the *first* render, so a form that starts with no
      // category picked and later gets one wouldn't otherwise flip
      // controlled state mid-lifetime (same fix as PredefinedServiceSelect).
      value={value === null ? "" : String(value)}
      onValueChange={(val) => {
        if (!val) return;
        if (val === ADD_NEW_VALUE) {
          setIsAdding(true);
          return;
        }
        onChange(Number(val));
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        {/* Pass name as children — Base UI renders children of SelectValue
            as-is, which correctly shows the category name instead of its id. */}
        <SelectValue placeholder="Select a category…">
          {selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {categories?.map((category) => (
          <SelectItem key={category.id} value={String(category.id)}>
            {category.name}
          </SelectItem>
        ))}
        <SelectItem value={ADD_NEW_VALUE}>
          <span className="flex items-center gap-1 text-primary">
            <Plus className="size-3.5" /> Add new category…
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
