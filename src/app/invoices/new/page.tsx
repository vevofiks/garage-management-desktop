"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceForm } from "../_components/invoice-form";

export default function NewInvoicePage() {
  const searchParams = useSearchParams();
  const prefillCustomerId = searchParams.get("customerId");
  const prefillId = prefillCustomerId ? Number(prefillCustomerId) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New Invoice" backHref="/invoices" backLabel="Back to invoices" />
      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceForm mode="create" prefillCustomerId={prefillId} />
        </CardContent>
      </Card>
    </div>
  );
}
