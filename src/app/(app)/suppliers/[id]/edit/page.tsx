import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { PageHeader } from "@/components/ui";
import { SupplierEditForm } from "./edit-form";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwnerPage(); // money side — OWNER only
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  return (
    <div>
      <PageHeader title={`Edit ${supplier.name}`} description="Change this supplier's details." />
      <SupplierEditForm
        initial={{
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone,
          notes: supplier.notes,
        }}
      />
    </div>
  );
}
