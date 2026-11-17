"use client";

import * as React from "react";
import type { DocRef } from "./doc-button";

/** Files to show in a form's file field (by field name) when the record has no file of its own. */
export const FileFallbackContext = React.createContext<Record<string, DocRef[]>>({});

export function useFileFallback(fieldName: string): DocRef[] {
  return React.useContext(FileFallbackContext)[fieldName] ?? [];
}
