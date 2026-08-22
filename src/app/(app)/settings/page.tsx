import { requireOwnerPage } from "@/lib/guards";
import { PageHeader } from "@/components/ui";
import { getBusinessSettings } from "@/lib/settings";
import { SettingsForms } from "./settings-forms";

export default async function SettingsPage() {
  await requireOwnerPage();
  const settings = await getBusinessSettings();

  return (
    <div>
      <PageHeader
        title="Shop details & letterhead"
        description="What prints at the top of every bill, delivery challan and customer statement."
      />
      <SettingsForms settings={settings} />
    </div>
  );
}
