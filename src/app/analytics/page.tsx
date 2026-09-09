"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCwIcon } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { formatCurrency, formatDate } from "@/lib/format";
import { useRequireRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EvilAreaChart } from "@/components/evilcharts/charts/recharts-area-chart";

type GroupBy = "day" | "week" | "month";
type PeriodRow = { period: string; revenue: number; expenses: number; net: number };
type AuditLog = {
  id: number;
  username: string;
  action: string;
  description: string;
  created_at: string;
};

const AUTO_REFRESH_INTERVAL_MS = 8000;

const chartConfig = {
  revenue: {
    label: "Revenue",
    colors: { light: ["#047857"], dark: ["#10b981"] },
  },
  expenses: {
    label: "Expenses",
    colors: { light: ["#be123c"], dark: ["#f43f5e"] },
  },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function AnalyticsPage() {
  const { isAllowed, isLoading: isAuthLoading } = useRequireRole("admin");

  const [from, setFrom] = useState(firstOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading } = useQuery<PeriodRow[]>({
    queryKey: queryKeys.reports.profitLoss({ from, to, groupBy }),
    queryFn: () =>
      apiClient.get<PeriodRow[]>(
        `/api/reports/profit-loss?from=${from}&to=${to}&groupBy=${groupBy}`
      ),
    enabled: isAllowed && !!from && !!to,
  });

  const { data: logs, isLoading: isLoadingLogs } = useQuery<AuditLog[]>({
    queryKey: queryKeys.auditLogs.all,
    queryFn: () => apiClient.get<AuditLog[]>("/api/audit-logs"),
    enabled: isAllowed,
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  const totals = (data ?? []).reduce(
    (acc, row) => ({
      revenue: acc.revenue + row.revenue,
      expenses: acc.expenses + row.expenses,
      net: acc.net + row.net,
    }),
    { revenue: 0, expenses: 0, net: 0 }
  );

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
        title="Analytics"
        description="Profit & loss trend and recent account activity, for admins."
      />

      <div className="flex flex-wrap items-end justify-end gap-4 pb-2">
        <div className="flex flex-col gap-2">
          <Label>Date Range</Label>
          <DateRangePicker
            from={from}
            to={to}
            onRangeChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
            className="w-56 bg-background"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="group-by">Group By</Label>
          <Select value={groupBy} onValueChange={(val) => val && setGroupBy(val as GroupBy)}>
            <SelectTrigger id="group-by" className="w-48 bg-background font-normal text-muted-foreground data-[state=value]:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Revenue</div>
            <div className="text-xl font-semibold tracking-tight">
              {isLoading ? "—" : formatCurrency(totals.revenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Expenses</div>
            <div className="text-xl font-semibold tracking-tight">
              {isLoading ? "—" : formatCurrency(totals.expenses)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Net Profit</div>
            <div className="text-xl font-semibold tracking-tight">
              {isLoading ? "—" : formatCurrency(totals.net)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invoices or expenses in this range.</p>
          ) : (
            <EvilAreaChart
              data={data}
              config={chartConfig}
              xDataKey="period"
              curveType="monotone"
              className="h-72"
            >
              <EvilAreaChart.Grid />
              <EvilAreaChart.XAxis dataKey="period" />
              <EvilAreaChart.YAxis />
              <EvilAreaChart.Tooltip />
              <EvilAreaChart.Legend />
              <EvilAreaChart.Area dataKey="revenue" variant="gradient" />
              <EvilAreaChart.Area dataKey="expenses" variant="gradient" />
            </EvilAreaChart>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Audit Logs</CardTitle>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <RefreshCwIcon className={cn("size-3.5", autoRefresh && "animate-spin")} />
            Auto-refresh {autoRefresh ? "On" : "Off"}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoadingLogs || !logs ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(log.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{log.username}</TableCell>
                    <TableCell>{log.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
