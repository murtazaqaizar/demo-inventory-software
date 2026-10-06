import Link from "next/link";
import { requireUser } from "@/lib/guards";
import { listProductTagsWithCounts } from "@/lib/products";
import { Button, PageHeader } from "@/components/ui";
import { TagManager } from "./tag-manager";

export default async function ProductTagsPage() {
  const [user, tags] = await Promise.all([requireUser(), listProductTagsWithCounts()]);
  return (
    <div>
      <PageHeader
        title="Product tags"
        description="Create the categories your stock is grouped under. Every tag here is offered in the Category dropdown when you add or edit a product."
        action={
          <Link href="/products/new">
            <Button variant="secondary">+ New product</Button>
          </Link>
        }
      />
      <TagManager tags={tags} canRemove={user.role === "OWNER"} />
    </div>
  );
}
