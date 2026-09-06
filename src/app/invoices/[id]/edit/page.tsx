"use client";

import { use } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvoiceForm } from "../../_components/invoice-form";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params);
  const id = Number(idParam);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={`Edit INV-${id}`}
        backHref={`/invoices/${id}`}
        backLabel="Back to invoice"
      />
      <Card>
        <CardHeader>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceForm mode="edit" invoiceId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
