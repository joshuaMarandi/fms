"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/patterns/status-chip";
import { DocButton, type DocRef } from "@/components/patterns/doc-button";
import { callRpc } from "@/lib/data/records";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";

export type CoverageTopic = { id: string; title: string; covered: boolean; subtopics: { id: string; title: string; covered: boolean }[] };

/**
 * A toolbox talk's topics and subtopics, ticked as they are covered. Ticking a topic ticks all its
 * subtopics; a topic shows as covered only when every subtopic is. The proof goes on each topic.
 */
export function ToolboxCoverage({ planId, topics, docs, canTick, canAttach }: { planId: string; topics: CoverageTopic[]; docs: Record<string, DocRef[]>; canTick: boolean; canAttach: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function cover(kind: "topic" | "subtopic", id: string, covered: boolean) {
    setBusy(id);
    const res = await callRpc<boolean>("toolbox_cover", { p_kind: kind, p_id: id, p_covered: covered }, ["/expenses/trainings/toolbox", `/expenses/trainings/toolbox/${planId}`]);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">{t("toolbox.coverage_title")}</CardTitle>
        <CardDescription>{t("toolbox.coverage_hint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("toolbox.no_topics")}</p>
        ) : (
          <ol className="space-y-3">
            {topics.map((topic, i) => {
              const done = topic.subtopics.filter((s) => s.covered).length;
              const proof = docs[topic.id] ?? [];
              const partly = topic.subtopics.length > 0 && done > 0 && !topic.covered;
              return (
                <li key={topic.id} className={cn("rounded-xl border p-3", topic.covered ? "border-success/40 bg-success-bg/40" : "")}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={topic.covered ? true : partly ? "indeterminate" : false}
                        disabled={!canTick || busy === topic.id}
                        onCheckedChange={(c) => cover("topic", topic.id, c === true)}
                        aria-label={`${t("toolbox.topic")} ${i + 1}: ${topic.title}`}
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">
                          {i + 1}. {topic.title}
                        </span>
                        {topic.subtopics.length ? (
                          <span className="block text-xs text-muted-foreground">{t("toolbox.subtopics_done", { done, total: topic.subtopics.length })}</span>
                        ) : null}
                      </span>
                    </label>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusChip status={topic.covered ? "done" : "open"} tone={topic.covered ? "success" : partly ? "warning" : "neutral"} label={topic.covered ? t("toolbox.covered") : partly ? t("toolbox.partly") : t("toolbox.not_covered")} />
                      {topic.covered && proof.length === 0 ? <StatusChip status="missing" tone="danger" label={t("toolbox.proof_missing")} /> : null}
                      <DocButton
                        docs={proof}
                        compact
                        upload={canAttach ? { table: "toolbox_topics", rowId: topic.id, resource: "expenses.trainings.toolbox", bucket: "forms", label: t("toolbox.proof"), labels: [t("toolbox.proof")] } : null}
                      />
                    </div>
                  </div>
                  {topic.subtopics.length ? (
                    <ul className="mt-2 grid gap-1.5 pl-8 sm:grid-cols-2">
                      {topic.subtopics.map((s) => (
                        <li key={s.id}>
                          <label className={cn("flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm", s.covered ? "text-success" : "")}>
                            <Checkbox className="mt-0.5" checked={s.covered} disabled={!canTick || busy === s.id || busy === topic.id} onCheckedChange={(c) => cover("subtopic", s.id, c === true)} />
                            <span>{s.title}</span>
                            {s.covered ? <CheckCircle2 className="mt-0.5 ml-auto size-4 shrink-0" aria-hidden="true" /> : <Circle className="mt-0.5 ml-auto size-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />}
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
