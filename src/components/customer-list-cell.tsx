import {
  formatCustomerListName,
  splitVehicleListSummary,
  type InvoiceCustomerContext,
  formatInvoiceCustomerLines,
} from '@/lib/customer-list';
import { formatVehicleShort } from '@/lib/format';
import { CUSTOMER_TYPE_LABELS, type CustomerType } from '@/lib/schemas/customer';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';

type CustomerListCellProps = {
  name: string;
  customerType?: CustomerType | null;
  phone?: string | null;
  vehicleSummary?: string | null;
  /** When true, drivers/vehicles render under the name (picker, compact rows). */
  inlineDetails?: boolean;
};

export function CustomerListCell({
  name,
  customerType,
  phone,
  vehicleSummary,
  inlineDetails = false,
}: CustomerListCellProps) {
  const isCompany = customerType === 'company';
  const vehicleLines = splitVehicleListSummary(vehicleSummary);

  if (isCompany && inlineDetails) {
    return (
      <div className="space-y-0.5">
        <div className="font-medium">{formatCustomerListName(name, customerType)}</div>
        {phone && <div className="text-xs text-muted-foreground">Company: {phone}</div>}
        {vehicleLines.map((line) => (
          <div key={line} className="text-xs text-muted-foreground">
            {line}
          </div>
        ))}
        {vehicleLines.length === 0 && !phone && (
          <div className="text-xs text-muted-foreground">No drivers added</div>
        )}
      </div>
    );
  }

  return <span className="font-medium">{formatCustomerListName(name, customerType)}</span>;
}

export function CustomerVehicleListCell({
  customerType,
  vehicleSummary,
}: {
  customerType?: CustomerType | null;
  vehicleSummary?: string | null;
}) {
  const lines = splitVehicleListSummary(vehicleSummary);

  if (lines.length === 0) return <span className="text-muted-foreground">—</span>;

  if (customerType === 'company') {
    return (
      <div className="space-y-1 text-xs leading-relaxed">
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    );
  }

  return <span>{vehicleSummary}</span>;
}

export function InvoiceCustomerCell(props: InvoiceCustomerContext) {
  const { primary, secondary } = formatInvoiceCustomerLines(props);

  return (
    <div className="space-y-0.5">
      <div className="font-medium">{primary}</div>
      {secondary.map((line) => (
        <div key={line} className="text-xs text-muted-foreground">
          {line}
        </div>
      ))}
    </div>
  );
}

type InvoiceCustomerVehicleSectionProps = {
  customerId: number;
  name: string;
  customerType?: CustomerType | null;
  phone?: string | null;
  address?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  vehicleNumber?: string | null;
  vehicleModel?: string | null;
  notes?: string | null;
};

/** Detail/print-style grid for one invoice's customer + billed vehicle. */
export function InvoiceCustomerVehicleSection({
  customerId,
  name,
  customerType,
  phone,
  address,
  driverName,
  driverPhone,
  vehicleNumber,
  vehicleModel,
  notes,
}: InvoiceCustomerVehicleSectionProps) {
  const isCompany = customerType === 'company';
  const displayName = formatCustomerListName(name, customerType);

  if (isCompany) {
    return (
      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        <div>
          <div className="text-muted-foreground">Company</div>
          <Link href={`/customers/${customerId}`} className="font-medium hover:underline">
            {displayName}
          </Link>
          <div className="mt-1">
            <Badge variant="outline" className="text-xs">
              {CUSTOMER_TYPE_LABELS.company}
            </Badge>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Company phone</div>
          <div>{phone || '—'}</div>
        </div>
        {address && (
          <div>
            <div className="text-muted-foreground">Address</div>
            <div>{address}</div>
          </div>
        )}
        <div>
          <div className="text-muted-foreground">Driver</div>
          <div>{driverName?.trim() || '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Driver phone</div>
          <div>{driverPhone?.trim() || '—'}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Vehicle</div>
          <div>{formatVehicleShort(vehicleNumber, vehicleModel)}</div>
        </div>
        {notes && (
          <div className="col-span-2 sm:col-span-3">
            <div className="text-muted-foreground">Notes</div>
            <div>{notes}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
      <div>
        <div className="text-muted-foreground">Customer</div>
        <Link href={`/customers/${customerId}`} className="font-medium hover:underline">
          {displayName}
        </Link>
      </div>
      <div>
        <div className="text-muted-foreground">Phone</div>
        <div>{phone || '—'}</div>
      </div>
      <div>
        <div className="text-muted-foreground">Vehicle Number</div>
        <div>{vehicleNumber || '—'}</div>
      </div>
      <div>
        <div className="text-muted-foreground">Vehicle Model</div>
        <div>{vehicleModel || '—'}</div>
      </div>
      {notes && (
        <div className="col-span-2 sm:col-span-4">
          <div className="text-muted-foreground">Notes</div>
          <div>{notes}</div>
        </div>
      )}
    </div>
  );
}

/** Plain text lines for invoice print "To" block — company shows driver + vehicle. */
export function formatInvoicePrintCustomerLines({
  name,
  customerType,
  phone,
  address,
  driverName,
  driverPhone,
  vehicleNumber,
  vehicleModel,
}: Omit<InvoiceCustomerVehicleSectionProps, 'customerId' | 'notes'>): string[] {
  const lines: string[] = [formatCustomerListName(name, customerType)];

  if (customerType === 'company') {
    if (phone?.trim()) lines.push(`Company: ${phone.trim()}`);
    if (address?.trim()) lines.push(address.trim());
    const driverParts = [driverName?.trim(), driverPhone?.trim()].filter(Boolean);
    if (driverParts.length > 0) lines.push(`Driver: ${driverParts.join(' · ')}`);
    return lines;
  }

  if (address?.trim()) lines.push(address.trim());
  else if (phone?.trim()) lines.push(phone.trim());
  if (address?.trim() && phone?.trim()) lines.push(phone.trim());

  return lines;
}
