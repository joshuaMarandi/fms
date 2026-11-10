import { Truck } from "lucide-react";
import { t } from "@/i18n";

export function AuthShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <main className="min-h-svh flex flex-col md:flex-row">
      <aside className="bg-sidebar text-sidebar-foreground md:w-[420px] flex flex-col justify-between p-8 md:p-10">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Truck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold leading-tight">{t("app.short_name")}</p>
            <p className="text-xs opacity-80">{t("app.name")}</p>
          </div>
        </div>
        <p className="mt-10 text-lg leading-relaxed md:mt-0">{t("app.tagline")}</p>
        <p className="hidden text-xs opacity-70 md:block">MDV Fleet Management System</p>
      </aside>
      <section className="flex flex-1 items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  );
}
