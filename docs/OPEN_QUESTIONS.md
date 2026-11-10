# Open questions

Items where the source document (MDV FMS2.pdf and the build prompt) was unclear. For each one the simplest reading was chosen and built; the owner can confirm or change it.

| # | Question | Reading chosen | Where to change |
| --- | --- | --- | --- |
| 1 | Training matrix format (to be provided by the client) | Placeholder page showing drivers against the four mandatory courses from training records | `src/app/(app)/expenses/trainings/matrix/page.tsx` |
| 2 | JMP layout (printable, signable) | The approved long trip shows the assignment, an attachments box for the completed JMP file and a three-step sign-off panel; Print uses the browser print dialog | `src/components/modules/jmp-review-panel.tsx`, `src/modules/extras.tsx` |
| 3 | Timesheet daily row format ("attached format") | Rows: date, day type, time in, time out, normal hours, special overtime hours, remarks. Hours default from time in/out (8 h normal, rest overtime) | `src/modules/expenses.ts` (timesheets), trigger `timesheet_days_hours` |
| 4 | Leave plan row format ("attached format") | Rows: date from, date to, days (auto), leave category, notes | `src/modules/expenses.ts` (leavePlans) |
| 5 | Target km/L per vehicle | Column `vehicles.target_km_per_l`, editable in Settings, Company; a company default is kept in company settings | Settings, Company |
| 6 | Fuel price source | Company setting `fuel_price_per_litre` is the default; the manager can override the price on each fuel issue | Settings, Company; fuel manager view |
| 7 | Notifications by email only, or also WhatsApp or SMS | Email only, via the `send-reminder-emails` Edge Function (Resend). In-app notifications always. | `supabase/functions/send-reminder-emails` |
| 8 | SQL code blocks for 6.1 (access-control tables) and 6.3 (RLS pattern) were empty in the build prompt | Designed from the prose: see migrations 1 and 3 | `supabase/migrations` |
| 9 | "Department" scope | Rows carry no department except drivers, timesheets and leave plans. Department scope therefore means: same company, and same department where the row has one | `public.row_access` |
| 10 | Who closes anomalies | Anyone with `approve` on Inspections (the Fleet manager / Admin by default) | trigger `inspection_anomalies_guard` |
| 11 | Self-approval | The permission check decides: a user with `approve` can approve any submitted request in scope, including their own; `edit` alone can never approve. Block self-approval if required | `approve_request` |
| 12 | Owner across companies | The Owner switches the active company from the sidebar; data queries always use the active company | `switch_company`, company switcher |
| 13 | Third-party inspection "same form and fields as daily" | Built as its own table with the same controls plus inspector and renewal date; anomalies can attach to either | `third_party_inspections` |
| 14 | Fuel "Fuel log: manager view" | Stored in `fuel_issues`; shown under an approved fuel request and feeds Module 5a Fuel automatically | `fuel_issues_to_expense` trigger |
| 15 | Vehicle status | Values in service, in garage, out of service; a works order with Date OUT and no Date IN puts the vehicle in garage | `work_orders_vehicle_status` |
| 16 | HSE manager, Control room operator, Emergency response commander as roles | Seeded as editable roles with approve on their own JMP step resource | `seed.sql` |
| 17 | Location "Text or Select of sites" | Both: a site dropdown and a free text location | Vehicle details |
| 18 | Driver "Company" select | Free text `employer`, defaulting from the company name, since drivers may be contracted | Driver personal |
| 19 | Incident location "Select (cascading)" | Region is a dropdown of Tanzania regions; district, ward and street are text | `src/modules/expenses.ts` (TZ_REGIONS) |
| 20 | Car wash cost "visible to coordinators and the Fleet manager" | The wash cost report block shows for anyone whose view scope on Car washing is wider than own | `src/modules/extras.tsx` |
| 21 | Payment collection for packages | Not built. Price and billing period are stored and used for revenue figures; the owner extends `subscription_end` after payment | Platform, Companies |
| 22 | What happens when a subscription ends | Access stops the day after `subscription_end` for every user of that company; data is kept; the owner can extend or reactivate | `company_access_ok` |
| 23 | Downgrading below the current vehicle count | Allowed; existing vehicles stay, adding new ones is blocked until the count is under the limit | `enforce_vehicle_limit` |
| 24 | Company without a package | Its users only see Dashboard and Settings until the owner assigns a package | `package_allows` |
| 25 | Self-service sign-up | Registration is a request reviewed by the owner, not an instant account, to avoid spam tenants | `/register`, Platform, Registrations |
