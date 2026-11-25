/**
 * Post-crash response: the five steps (I to V), done one by one, with the questions and documents of
 * each. Mirrors public.incident_step_missing, which checks a step before it is closed.
 */
export type PcrStepKey = "escalation" | "mobilization" | "investigation" | "vehicle_recovery" | "insurance_recovery";

export type PcrField = {
  key: string;
  /** i18n key */
  label: string;
  type: "text" | "tel" | "email" | "textarea" | "checkbox" | "number" | "datetime" | "select";
  options?: { value: string; label: string }[];
  /** Shown only when this checkbox (or select value) is set. */
  when?: { key: string; equals?: string };
  /** A heading above this field (i18n key). */
  group?: string;
  /** Half width (default) or full width. */
  wide?: boolean;
};

/** Documents of a step: the label is stored with the file and checked by the database. */
export type PcrDoc = { label: string; when?: { key: string; equals?: string } };

export type PcrStep = { key: PcrStepKey; numeral: string; title: string; hint: string; fields: PcrField[]; docs: PcrDoc[] };

const person = (prefix: string, when: string): PcrField[] => [
  { key: `${prefix}_name`, label: "pcr.f.name", type: "text", when: { key: when } },
  { key: `${prefix}_title`, label: "pcr.f.title", type: "text", when: { key: when } },
  { key: `${prefix}_phone`, label: "pcr.f.phone", type: "tel", when: { key: when } },
  { key: `${prefix}_at`, label: "pcr.f.reported_at", type: "datetime", when: { key: when } },
];

export const PCR_STEPS: PcrStep[] = [
  {
    key: "escalation",
    numeral: "I",
    title: "pcr.escalation",
    hint: "pcr.escalation_hint",
    fields: [
      { key: "internal_reported", label: "pcr.f.internal_reported", type: "checkbox", group: "pcr.g.internal", wide: true },
      ...person("internal", "internal_reported"),
      { key: "police_reported", label: "pcr.f.police_reported", type: "checkbox", group: "pcr.g.police", wide: true },
      ...person("police", "police_reported"),
      { key: "police_station", label: "pcr.f.police_station", type: "text", when: { key: "police_reported" } },
      { key: "police_rb", label: "pcr.f.police_rb", type: "text", when: { key: "police_reported" } },
      { key: "insurance_reported", label: "pcr.f.insurance_reported", type: "checkbox", group: "pcr.g.insurance", wide: true },
      { key: "insurance_company", label: "pcr.f.insurance_company", type: "text", when: { key: "insurance_reported" } },
      ...person("insurance", "insurance_reported"),
      { key: "insurance_claim_no", label: "pcr.f.claim_no", type: "text", when: { key: "insurance_reported" } },
    ],
    docs: [],
  },
  {
    key: "mobilization",
    numeral: "II",
    title: "pcr.mobilization",
    hint: "pcr.mobilization_hint",
    fields: [
      { key: "team_name", label: "pcr.f.team_name", type: "text", group: "pcr.g.team" },
      { key: "team_title", label: "pcr.f.title", type: "text" },
      { key: "team_phone", label: "pcr.f.phone", type: "tel" },
      { key: "equipment", label: "pcr.f.equipment", type: "text" },
      { key: "from_place", label: "pcr.f.from", type: "text" },
      { key: "to_place", label: "pcr.f.to", type: "text" },
      { key: "facility", label: "pcr.f.facility", type: "text", group: "pcr.g.medical" },
      { key: "doctor_name", label: "pcr.f.doctor_name", type: "text" },
      { key: "doctor_phone", label: "pcr.f.doctor_phone", type: "tel" },
      { key: "doctor_email", label: "pcr.f.email", type: "email" },
    ],
    docs: [{ label: "Mobilization report" }],
  },
  {
    key: "investigation",
    numeral: "III",
    title: "pcr.investigation",
    hint: "pcr.investigation_hint",
    fields: [
      { key: "internal_done", label: "pcr.f.internal_done", type: "checkbox", group: "pcr.g.internal_investigation", wide: true },
      { key: "internal_investigator", label: "pcr.f.investigator", type: "text", when: { key: "internal_done" } },
      { key: "internal_title", label: "pcr.f.title", type: "text", when: { key: "internal_done" } },
      { key: "internal_phone", label: "pcr.f.phone", type: "tel", when: { key: "internal_done" } },
      {
        key: "internal_by",
        label: "pcr.f.internal_by",
        type: "select",
        when: { key: "internal_done" },
        options: [
          { value: "hse", label: "pcr.o.hse" },
          { value: "other", label: "pcr.o.other" },
        ],
      },
      { key: "internal_by_other", label: "pcr.f.internal_by_other", type: "text", when: { key: "internal_by", equals: "other" } },
      { key: "internal_names", label: "pcr.f.names", type: "textarea", when: { key: "internal_done" }, wide: true },
      { key: "external_done", label: "pcr.f.external_done", type: "checkbox", group: "pcr.g.external_investigation", wide: true },
      { key: "police_investigator", label: "pcr.f.police_investigator", type: "text", when: { key: "external_done" } },
      { key: "police_rank", label: "pcr.f.rank", type: "text", when: { key: "external_done" } },
      { key: "police_phone", label: "pcr.f.phone", type: "tel", when: { key: "external_done" } },
      { key: "police_station", label: "pcr.f.police_station", type: "text", when: { key: "external_done" } },
    ],
    docs: [
      { label: "Internal investigation report", when: { key: "internal_done" } },
      { label: "Particulars of accident", when: { key: "external_done" } },
      { label: "Inspection report", when: { key: "external_done" } },
    ],
  },
  {
    key: "vehicle_recovery",
    numeral: "IV",
    title: "pcr.vehicle_recovery",
    hint: "pcr.vehicle_recovery_hint",
    fields: [
      { key: "company", label: "pcr.f.company", type: "text" },
      { key: "contact_name", label: "pcr.f.contact_person", type: "text" },
      { key: "phone", label: "pcr.f.phone", type: "tel" },
      { key: "email", label: "pcr.f.email", type: "email" },
      { key: "from_place", label: "pcr.f.from", type: "text" },
      { key: "to_place", label: "pcr.f.to", type: "text" },
    ],
    docs: [],
  },
  {
    key: "insurance_recovery",
    numeral: "V",
    title: "pcr.insurance_recovery",
    hint: "pcr.insurance_recovery_hint",
    fields: [
      { key: "garage_name", label: "pcr.f.garage_name", type: "text", group: "pcr.g.garage" },
      { key: "garage_address", label: "pcr.f.address", type: "text" },
      { key: "garage_phone", label: "pcr.f.phone", type: "tel" },
      { key: "garage_email", label: "pcr.f.email", type: "email" },
      { key: "estimate_tzs", label: "pcr.f.estimate", type: "number", group: "pcr.g.repair" },
      { key: "authorization_issued", label: "pcr.f.authorization_issued", type: "checkbox", wide: true },
      {
        key: "repair_status",
        label: "pcr.f.repair_status",
        type: "select",
        options: [
          { value: "not_started", label: "pcr.o.not_started" },
          { value: "in_progress", label: "pcr.o.in_progress" },
          { value: "completed", label: "pcr.o.completed" },
        ],
      },
      {
        key: "insurance_status",
        label: "pcr.f.insurance_status",
        type: "select",
        options: [
          { value: "pending", label: "pcr.o.pending" },
          { value: "in_progress", label: "pcr.o.in_progress" },
          { value: "recovered", label: "pcr.o.recovered" },
          { value: "declined", label: "pcr.o.declined" },
        ],
      },
    ],
    docs: [
      { label: "Repair estimate" },
      { label: "Repair authorization letter", when: { key: "authorization_issued" } },
      { label: "Release authorization letter" },
    ],
  },
];

/** Whether a field or document applies, from the step's answers. */
export function pcrApplies(when: { key: string; equals?: string } | undefined, values: Record<string, unknown>) {
  if (!when) return true;
  const v = values[when.key];
  return when.equals === undefined ? v === true || v === "true" : v === when.equals;
}
