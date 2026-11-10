import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadCompanyRows } from "../shared";
import { CompaniesTable } from "./companies-table";
import { t } from "@/i18n";

export default async function CompaniesPage() {
  await requirePermission("platform.companies", "view");
  const supabase = await createClient();
  const rows = await loadCompanyRows(supabase);
  return (
    <>
      <PageHeader
        title={t("platform.companies.title")}
        description={t("platform.companies.description")}
        actions={
          <Button asChild className="h-10">
            <Link href="/platform/companies/new">
              <Plus /> {t("platform.companies.new")}
            </Link>
          </Button>
        }
      />
      <CompaniesTable rows={rows} />
    </>
  );
}
