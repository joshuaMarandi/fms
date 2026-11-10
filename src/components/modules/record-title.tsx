"use client";

import { useRecordTitle } from "@/components/shell/breadcrumbs";

export function RecordTitle({ title }: { title: string | null }) {
  useRecordTitle(title);
  return null;
}
