"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, PlusIcon, XIcon } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDate } from "@/lib/format";
import { useRequireRole } from "@/hooks/use-auth";
import { expenseSchema, type ExpenseFormData } from "@/lib/schemas/expense";
import { ExpenseCategorySelect, type ExpenseCategory } from "@/components/expense-category-select";
import { DateRangePicker } from "@/components/date-range-picker";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Expense = {
  id: number;
  category_id: number;
  category_name: string;
  amount: number;
  notes: string | null;
  date: string;
};

type ExpensePage = {
  data: Expense[];
  page: number;
  totalPages: number;
  total: number;
  totalAmount: number;
};

const ALL_CATEGORIES_VALUE = "__all__";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpensesPage() {
  const { isAllowed, isLoading: isAuthLoading } = useRequireRole(["admin", "staff"]);
  const queryClient = useQueryClient();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES_VALUE);
  const [page, setPage] = useState(1);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const filters = {
    from: from || undefined,
    to: to || undefined,
    categoryId: categoryFilter === ALL_CATEGORIES_VALUE ? undefined : Number(categoryFilter),
  };

  // A new filter invalidates whatever page we were on. Reset during render
  // (React's documented pattern for derived state) rather than in a
  // useEffect, which would cause an extra render before the reset lands.
  const filterKey = `${from}|${to}|${categoryFilter}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const { data: categories } = useQuery<ExpenseCategory[]>({
    queryKey: queryKeys.expenses.categories,
    queryFn: () => apiClient.get<ExpenseCategory[]>("/api/expense-categories"),
    enabled: isAllowed,
  });

  const { data: result, isLoading } = useQuery<ExpensePage>({
    queryKey: queryKeys.expenses.list({ ...filters, page }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.from) params.set("from", filters.from);
      if (filters.to) params.set("to", filters.to);
      if (filters.categoryId) params.set("category_id", String(filters.categoryId));
      params.set("page", String(page));
      return apiClient.get<ExpensePage>(`/api/expenses?${params.toString()}`);
    },
    enabled: isAllowed,
  });
  const expenses = result?.data;
  const total = result?.totalAmount ?? 0;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category_id: 0, amount: 0, notes: "", date: todayISO() },
  });

  const categoryIdValue = watch("category_id");

  const openNewDialog = () => {
    setEditingExpense(null);
    reset({ category_id: 0, amount: 0, notes: "", date: todayISO() });
    setIsDialogOpen(true);
  };

  const openEditDialog = (expense: Expense) => {
    setEditingExpense(expense);
    reset({
      category_id: expense.category_id,
      amount: expense.amount,
      notes: expense.notes ?? "",
      date: expense.date,
    });
    setIsDialogOpen(true);
  };

  const invalidateExpenses = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
  };

  const saveMutation = useMutation({
    mutationFn: (data: ExpenseFormData) =>
      editingExpense
        ? apiClient.patch(`/api/expenses/${editingExpense.id}`, data)
        : apiClient.post("/api/expenses", data),
    onSuccess: () => {
      invalidateExpenses();
      // The list is invalidated and does refetch — but if a date-range or
      // category filter happens to be active, the row just saved can fall
      // outside it and never appear, which reads exactly like "it didn't
      // save" until a full reload clears the (component-local) filter
      // state back to empty. Clear filters here so what was just logged or
      // edited is always visible immediately, no reload required.
      setFrom("");
      setTo("");
      setCategoryFilter(ALL_CATEGORIES_VALUE);
      toast.success(editingExpense ? "Expense updated" : "Expense logged");
      setIsDialogOpen(false);
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to save expense"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/api/expenses/${id}`),
    onSuccess: () => {
      invalidateExpenses();
      toast.success("Expense deleted");
    },
    onError: (error: ApiError) => toast.error(error.message || "Failed to delete expense"),
  });

  if (isAuthLoading || !isAllowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger
              render={
                <Button onClick={openNewDialog}>
                  <PlusIcon className="size-4" /> Log Expense
                </Button>
              }
            />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingExpense ? "Edit Expense" : "Log Expense"}</DialogTitle>
              <DialogDescription>
                {editingExpense
                  ? "Update this expense's details below."
                  : "Record money spent by the garage — parts, rent, utilities, salaries, or anything else."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="category_id">Category</Label>
                <ExpenseCategorySelect
                  value={categoryIdValue || null}
                  onChange={(id) => setValue("category_id", id, { shouldValidate: true })}
                  disabled={isSubmitting}
                />
                {errors.category_id && (
                  <p className="text-sm text-destructive">{errors.category_id.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    {...register("amount", {
                      setValueAs: (v) => (v === "" ? 0 : Number(v)),
                    })}
                    disabled={isSubmitting}
                  />
                  {errors.amount && (
                    <p className="text-sm text-destructive">{errors.amount.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" {...register("date")} disabled={isSubmitting} />
                  {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">
                  Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="notes" {...register("notes")} disabled={isSubmitting} />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving…" : editingExpense ? "Save Changes" : "Log Expense"}
                </Button>
              </div>
            </form>
          </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
        <DateRangePicker
          from={from}
          to={to}
          onRangeChange={(f, t) => { setFrom(f); setTo(t); }}
          className="w-56 bg-background"
        />
        
        <Select value={categoryFilter} onValueChange={(val) => val && setCategoryFilter(val)}>
          <SelectTrigger id="category-filter" className="w-48 bg-background font-normal text-muted-foreground data-[state=value]:text-foreground">
            <SelectValue>
              {categoryFilter === ALL_CATEGORIES_VALUE
                ? "All categories"
                : (categories?.find((c) => String(c.id) === categoryFilter)?.name ?? categoryFilter)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES_VALUE}>All categories</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(from || to || categoryFilter !== ALL_CATEGORIES_VALUE) && (
          <Button
            type="button"
            variant="ghost"
            className="gap-2 px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => {
              setFrom("");
              setTo("");
              setCategoryFilter(ALL_CATEGORIES_VALUE);
            }}
          >
            <XIcon className="size-4 shrink-0" />
            Clear
          </Button>
        )}
      </div>


      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading &&
              expenses?.map((expense, index) => (
                <TableRow key={expense.id}>
                  <TableCell className="text-muted-foreground text-xs font-medium">
                    {(page - 1) * 10 + index + 1}
                  </TableCell>
                  <TableCell>{formatDate(expense.date)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{expense.category_name}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{expense.notes || "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(expense)}>
                      Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button variant="destructive" size="sm">
                            Delete
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the {formatCurrency(expense.amount)} entry from{" "}
                            {formatDate(expense.date)}. This can&apos;t be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(expense.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && expenses?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                  {from || to || categoryFilter !== ALL_CATEGORIES_VALUE
                    ? "No expenses match your filters."
                    : "No expenses logged yet."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {result && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          onPageChange={setPage}
        />
      )}

      <div className="flex justify-end">
        <div className="text-lg text-muted-foreground">
          Total: <span className="font-semibold text-foreground">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
