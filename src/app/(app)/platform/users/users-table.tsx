"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/patterns/data-table";
import { StatusChip } from "@/components/patterns/status-chip";
import { startNavigationProgress } from "@/components/shell/navigation-progress";
import { setUserActive } from "@/app/(app)/settings/users/actions";
import { enterCompany } from "../actions";
import { formatDate } from "@/lib/utils";
import { t } from "@/i18n";

export type PlatformUser = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  company_id: string | null;
  company_name: string | null;
  roles: string[];
  is_owner: boolean;
  created_at: string;
};

type Row = PlatformUser & { status: string; company: string; role_list: string };

export function PlatformUsersTable({ rows }: { rows: PlatformUser[] }) {
  const router = useRouter();
  const [, start] = React.useTransition();
  const data = React.useMemo<Row[]>(
    () => rows.map((r) => ({ ...r, status: r.is_active ? "active" : "inactive", company: r.is_owner ? t("platform.users.platform") : r.company_name ?? "", role_list: r.roles.join(", ") })),
    [rows],
  );

  const columns = React.useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      { id: "full_name", header: t("platform.users.name"), accessorKey: "full_name", cell: ({ row }) => <span className="font-medium">{row.original.full_name}</span> },
      { id: "email", header: t("platform.users.email"), accessorKey: "email" },
      { id: "phone", header: t("platform.users.phone"), accessorKey: "phone" },
      { id: "company", header: t("platform.users.company"), accessorKey: "company" },
      {
        id: "role_list",
        header: t("platform.users.roles"),
        accessorKey: "role_list",
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.roles.map((r, i) => (
              <Badge key={r} variant={i === 0 ? "default" : "secondary"}>
                {r}
              </Badge>
            ))}
          </span>
        ),
      },
      { id: "status", header: t("platform.users.status"), accessorKey: "status", cell: ({ row }) => <StatusChip status={row.original.status} /> },
      { id: "created_at", header: t("platform.users.created"), accessorKey: "created_at", cell: ({ row }) => formatDate(row.original.created_at) },
    ],
    [],
  );

  async function toggle(r: Row) {
    const res = await setUserActive(r.id, !r.is_active);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success(t("platform.users.updated"));
      router.refresh();
    }
  }

  return (
    <DataTable<Row>
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      searchKeys={["full_name", "email", "phone", "company", "role_list"]}
      statusColumn="status"
      statusOptions={["active", "inactive"]}
      canExport
      exportName="platform-users"
      exportTitle={t("platform.users.title")}
      rowActions={[
        {
          label: t("platform.users.open_company"),
          hidden: (r) => !r.company_id || r.is_owner,
          onSelect: (r) => {
            startNavigationProgress();
            start(() => enterCompany(r.company_id!));
          },
        },
        { label: t("platform.users.deactivate"), destructive: true, hidden: (r) => !r.is_active || r.is_owner, onSelect: toggle },
        { label: t("platform.users.activate"), hidden: (r) => r.is_active, onSelect: toggle },
      ]}
    />
  );
}
