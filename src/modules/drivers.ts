import type { FormSchema } from "@/lib/forms/schema";
import { DRIVER_CATEGORY_OPTIONS } from "@/lib/training-matrix";

/** Module 2. Driver details: one profile page per driver with tabs. */
export const driverPersonalSchema: FormSchema = {
  table: "drivers",
  resource: "drivers.personal",
  titleField: "full_name",
  viewGroups: [
    { title: "drivers.view.contact", fields: ["full_name", "phone", "phone_alt", "email"] },
    { title: "drivers.view.employment", fields: ["employer", "job_title", "department", "employment_number", "joining_date", "years_driving", "driver_categories", "is_active", "profile_id"] },
    { title: "drivers.view.personal", fields: ["date_of_birth", "sex"] },
  ],
  sections: [
    {
      title: "drivers.tab.personal",
      fields: [
        { name: "full_name", label: "drivers.names", control: "text", required: true },
        { name: "phone", label: "drivers.phone", control: "tel", required: true },
        { name: "phone_alt", label: "drivers.phone_alt", control: "tel" },
        { name: "email", label: "drivers.email", control: "email" },
        { name: "employer", label: "drivers.company", control: "text", description: "Select or type the company the driver works for" },
        { name: "joining_date", label: "drivers.joining_date", control: "date", required: true },
        { name: "employment_number", label: "drivers.employment_number", control: "text" },
        { name: "job_title", label: "drivers.job_title", control: "text" },
        { name: "department", label: "drivers.department", control: "text" },
        { name: "date_of_birth", label: "drivers.date_of_birth", control: "date" },
        {
          name: "sex",
          label: "drivers.sex",
          control: "radio",
          inline: true,
          options: [
            { value: "male", label: "drivers.sex.male" },
            { value: "female", label: "drivers.sex.female" },
          ],
        },
        { name: "years_driving", label: "drivers.years_driving", control: "number", min: 0, integer: true },
        // What the driver drives: it sets the trainings they need (training matrix).
        { name: "driver_categories", label: "drivers.categories", control: "checkbox_group", options: DRIVER_CATEGORY_OPTIONS, description: "drivers.categories_hint" },
        { name: "profile_id", label: "drivers.linked_user", control: "select", source: "profiles", description: "Links this driver to a user account so they see their own data" },
        { name: "is_active", label: "drivers.active", control: "switch" },
      ],
    },
  ],
};

export const driverCourseSchema: FormSchema = {
  table: "driver_courses",
  resource: "drivers.training",
  sections: [
    {
      title: "drivers.tab.training",
      fields: [
        {
          name: "courses",
          label: "drivers.course",
          control: "checkbox_group",
          required: true,
          options: [
            { value: "advanced_vip2", label: "drivers.course.advanced_vip2" },
            { value: "senior_vip1", label: "drivers.course.senior_vip1" },
            { value: "hgv", label: "drivers.course.hgv" },
            { value: "psv", label: "drivers.course.psv" },
            { value: "other", label: "drivers.course.other" },
          ],
        },
        { name: "course_other", label: "drivers.course_other", control: "text", required: true, showWhen: { field: "courses", includes: "other" } },
        {
          name: "provider",
          label: "drivers.provider",
          control: "radio",
          inline: true,
          required: true,
          options: [
            { value: "nit", label: "drivers.provider.nit" },
            { value: "veta", label: "drivers.provider.veta" },
            { value: "other", label: "drivers.provider.other" },
          ],
        },
        { name: "provider_other", label: "drivers.provider_other", control: "text", required: true, showWhen: { field: "provider", equals: "other" } },
        { name: "date_completed", label: "drivers.date_completed", control: "date", required: true },
      ],
    },
  ],
};

export const driverLicenceSchema: FormSchema = {
  table: "driver_licences",
  resource: "drivers.licence",
  sections: [
    {
      title: "drivers.tab.licence",
      fields: [
        { name: "licence_number", label: "drivers.licence_number", control: "text" },
        { name: "licence_class", label: "drivers.licence_class", control: "text" },
        { name: "date_issued", label: "drivers.date_issued", control: "date", required: true },
        { name: "expiry_date", label: "drivers.expiry_date", control: "date", required: true, description: "Reminder" },
        { name: "licence_file", label: "drivers.doc.licence", control: "file", bucket: "driver-docs", labels: ["drivers.doc.licence"], multiple: false },
      ],
    },
  ],
};

export const driverOshaSchema: FormSchema = {
  table: "driver_osha",
  resource: "drivers.osha",
  sections: [
    {
      title: "drivers.tab.osha",
      fields: [
        { name: "date_conducted", label: "drivers.osha_date", control: "date", required: true },
        { name: "redo_date", label: "drivers.osha_redo", control: "date", required: true, description: "Reminder" },
        { name: "result", label: "drivers.osha_result", control: "text" },
        { name: "report", label: "drivers.doc.osha_report", control: "file", bucket: "driver-docs", labels: ["drivers.doc.osha_report"], multiple: false, sensitive: true },
      ],
    },
  ],
};

