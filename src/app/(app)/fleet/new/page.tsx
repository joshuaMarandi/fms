import { PageHeader } from "@/components/shell/page-header";
import { SchemaForm } from "@/components/patterns/schema-form";
import { requirePermission } from "@/lib/auth/session";
import { loadOptions } from "@/lib/data/records";
import { vehicleDetailsSchema } from "@/modules/fleet";
import { t } from "@/i18n";

export default async function NewVehiclePage() {
  await requirePermission("fleet.details", "create");
  const options = await loadOptions(["sites"]);
  return (
    <>
      <PageHeader title={t("fleet.add_vehicle")} description={t("fleet.description")} />
      <SchemaForm schema={vehicleDetailsSchema} options={options} cancelHref="/fleet" afterSave={(id) => `/fleet/${id}`} revalidate={["/fleet"]} />
    </>
  );
}
