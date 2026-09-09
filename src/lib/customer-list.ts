import type { CustomerType } from '@/lib/schemas/customer';
import { formatVehicleShort } from '@/lib/format';

/**
 * SQLite GROUP_CONCAT for customer list views — company rows include driver,
 * phone, and vehicle; individual rows show vehicle number/model only.
 */
export const CUSTOMER_VEHICLE_LIST_SQL = `
  GROUP_CONCAT(
    CASE
      WHEN customers.customer_type = 'company' AND vehicles.driver_name IS NOT NULL AND vehicles.driver_name != ''
        THEN TRIM(
          vehicles.driver_name ||
          CASE WHEN vehicles.driver_phone IS NOT NULL AND vehicles.driver_phone != ''
            THEN ' (' || vehicles.driver_phone || ')' ELSE '' END ||
          CASE
            WHEN vehicles.vehicle_number IS NOT NULL AND vehicles.vehicle_number != ''
              AND vehicles.vehicle_model IS NOT NULL AND vehicles.vehicle_model != ''
              THEN ' · ' || vehicles.vehicle_number || ' — ' || vehicles.vehicle_model
            WHEN vehicles.vehicle_number IS NOT NULL AND vehicles.vehicle_number != ''
              THEN ' · ' || vehicles.vehicle_number
            WHEN vehicles.vehicle_model IS NOT NULL AND vehicles.vehicle_model != ''
              THEN ' · ' || vehicles.vehicle_model
            ELSE ''
          END
        )
      WHEN vehicles.vehicle_number IS NOT NULL AND vehicles.vehicle_number != '' AND vehicles.vehicle_model IS NOT NULL AND vehicles.vehicle_model != ''
        THEN vehicles.vehicle_number || ' (' || vehicles.vehicle_model || ')'
      WHEN vehicles.vehicle_number IS NOT NULL AND vehicles.vehicle_number != ''
        THEN vehicles.vehicle_number
      WHEN vehicles.vehicle_model IS NOT NULL AND vehicles.vehicle_model != ''
        THEN vehicles.vehicle_model
      ELSE NULL
    END,
    ', '
  ) AS vehicle_numbers`;

/** Primary label in list tables — keeps company name separate from driver names. */
export function formatCustomerListName(
  name: string | null | undefined,
  customerType?: CustomerType | null
): string {
  const trimmed = name?.trim();
  if (customerType === 'company') {
    if (trimmed && trimmed !== 'Company') return trimmed;
    return 'Company';
  }
  return trimmed || '—';
}

export function splitVehicleListSummary(summary: string | null | undefined): string[] {
  if (!summary?.trim()) return [];
  return summary.split(', ').filter(Boolean);
}

export type InvoiceCustomerContext = {
  name: string;
  customerType?: CustomerType | null;
  phone?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleNumber?: string | null;
  vehicleModel?: string | null;
};

/** Invoice list row — company shows name, company phone, and billed driver/vehicle. */
export function formatInvoiceCustomerLines({
  name,
  customerType,
  phone,
  driverName,
  driverPhone,
  vehicleNumber,
  vehicleModel,
}: InvoiceCustomerContext): { primary: string; secondary: string[] } {
  const primary = formatCustomerListName(name, customerType);

  if (customerType !== 'company') {
    const vehicle = formatVehicleShort(vehicleNumber, vehicleModel);
    return {
      primary,
      secondary: vehicle !== '—' ? [vehicle] : [],
    };
  }

  const secondary: string[] = [];
  if (phone?.trim()) secondary.push(`Company: ${phone.trim()}`);

  const driverParts = [driverName?.trim(), driverPhone?.trim()].filter(Boolean);
  const vehicle = formatVehicleShort(vehicleNumber, vehicleModel);
  const billedLine = [...driverParts, vehicle !== '—' ? vehicle : ''].filter(Boolean).join(' · ');
  if (billedLine) secondary.push(billedLine);

  return { primary, secondary };
}
