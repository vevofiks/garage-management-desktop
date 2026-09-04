/**
 * src/lib/format.ts
 *
 * Shared display formatting so every module renders money/dates the same way.
 */

const currencyFormatter = new Intl.NumberFormat("en-QA", {
  style: "currency",
  currency: "QAR",
});

export function formatCurrency(amount: number) {
  return currencyFormatter.format(amount);
}

const dateFormatter = new Intl.DateTimeFormat("en-QA", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDate(value: string | Date) {
  return dateFormatter.format(new Date(value));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
