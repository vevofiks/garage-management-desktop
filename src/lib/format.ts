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

/** YYYY-MM-DD in local timezone — for `<input type="date">` defaults. */
export function todayISODate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Resolve invoice service_date; falls back to created_at's calendar day. */
export function resolveServiceDate(
  serviceDate: string | null | undefined,
  createdAt?: string | null
): string {
  if (typeof serviceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate.trim())) {
    return serviceDate.trim();
  }
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const datePart = String(createdAt).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }
  return todayISODate();
}

/** Display a date-only ISO string (YYYY-MM-DD) without timezone shift. */
export function formatDateOnly(
  isoDate: string | null | undefined,
  fallbackCreatedAt?: string | null
) {
  const resolved = resolveServiceDate(isoDate, fallbackCreatedAt);
  const [y, m, d] = resolved.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return dateFormatter.format(new Date(y, m - 1, d));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Invoice/list line: "QA-1234 — Toyota Land Cruiser" (number first when both exist). */
export function formatVehicleShort(
  vehicleNumber: string | null | undefined,
  vehicleModel: string | null | undefined
): string {
  return [vehicleNumber?.trim(), vehicleModel?.trim()].filter(Boolean).join(" — ") || "—";
}

/** Print invoice header: "Toyota Land Cruiser (QA-1234)" or whichever field is present. */
export function formatVehiclePrint(
  vehicleNumber: string | null | undefined,
  vehicleModel: string | null | undefined
): string {
  const number = vehicleNumber?.trim() || null;
  const model = vehicleModel?.trim() || null;
  if (model && number) return `${model} (${number})`;
  return model || number || "—";
}

/** Dropdown/list label — includes driver when present (company customers). */
export function formatVehicleOptionLabel(
  vehicle: {
    driver_name?: string | null;
    driver_phone?: string | null;
    vehicle_number?: string | null;
    vehicle_model?: string | null;
  },
  customerType?: 'individual' | 'company' | null
): string {
  const parts: string[] = [];
  if (customerType === 'company' && vehicle.driver_name?.trim()) {
    parts.push(vehicle.driver_name.trim());
  }
  const vehiclePart = formatVehicleShort(vehicle.vehicle_number, vehicle.vehicle_model);
  if (vehiclePart !== "—") parts.push(vehiclePart);
  if (customerType === 'company' && vehicle.driver_phone?.trim()) {
    parts.push(vehicle.driver_phone.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}
