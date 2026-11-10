import { PageHeader } from "@/components/shell/page-header";
import { SchemaForm } from "@/components/patterns/schema-form";
import { requirePermission } from "@/lib/auth/session";
import { loadOptions } from "@/lib/data/records";
import { driverPersonalSchema } from "@/modules/drivers";
import { t } from "@/i18n";

export default async function NewDriverPage() {
  await requirePermission("drivers.personal", "create");
  const options = await loadOptions(["profiles"]);
  return (
    <>
      <PageHeader title={t("drivers.add_driver")} description={t("drivers.description")} />
      <SchemaForm schema={driverPersonalSchema} record={{ is_active: true }} options={options} cancelHref="/drivers" afterSave={(id) => `/drivers/${id}`} revalidate={["/drivers"]} />
    </>
  );
}
