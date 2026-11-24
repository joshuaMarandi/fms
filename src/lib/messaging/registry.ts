import { renderEmail, type EmailBrand, type EmailContent, type Tone } from "@/lib/email/layout";

/**
 * Every email and SMS the system sends. Admins may change the wording; the values (placeholders such
 * as {name}) and the details table always come from the record. Pure module: used by the sender on the
 * server and by the template editor in the browser for the live preview.
 */

export type Vars = Record<string, unknown>;
export type Placeholder = { key: string; label: string };

export type EmailFields = { subject: string; heading: string; greeting: string; paragraphs: string; button: string; note: string };
export type SmsFields = { text: string };
export type TemplateContent = Partial<EmailFields & SmsFields>;

type Base = {
  key: string;
  /** company: each company may reword it; platform: only the owner (registration emails). */
  scope: "company" | "platform";
  name: string;
  description: string;
  /** Who receives it, in plain words. */
  audience: string;
  placeholders: Placeholder[];
  /** Placeholders that must stay in the wording (for example the link in an SMS). */
  required: string[];
  sample: Vars;
};

export type EmailTemplateDef = Base & {
  channel: "email";
  defaults: EmailFields;
  details?: (v: Vars) => { label: string; value: string }[];
  items?: (v: Vars) => NonNullable<EmailContent["items"]>;
  buttonUrl?: (v: Vars) => string | undefined;
};

export type SmsTemplateDef = Base & { channel: "sms"; defaults: SmsFields };
export type TemplateDef = EmailTemplateDef | SmsTemplateDef;

const P = {
  name: { key: "name", label: "First name of the person receiving it" },
  company: { key: "company", label: "Company name" },
  app: { key: "app", label: "System name" },
  request: { key: "request", label: "Kind of request (leave request, vehicle request)" },
  step: { key: "step", label: "Step waiting for a decision" },
  requester: { key: "requester", label: "Person who made the request" },
  summary: { key: "summary", label: "One-line summary of the request" },
  approver: { key: "approver", label: "Person who decided" },
  reason: { key: "reason", label: "Reason given for the rejection" },
  expires: { key: "expires", label: "Date the link stops working" },
  link: { key: "link", label: "Direct link to the request" },
  copied: { key: "copied", label: "People copied in for information" },
} satisfies Record<string, Placeholder>;

const detailsFrom = (v: Vars) => (Array.isArray(v.details) ? (v.details as { label: string; value: string }[]).filter((d) => d && d.value) : []);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

const SAMPLE_REQUEST: Vars = {
  name: "Amani",
  company: "Demo Company",
  app: "Fleet Management System",
  request: "vehicle request",
  step: "Approval",
  requester: "Peter Mollel",
  summary: "Long trip to Arusha on 02 Dec 2026",
  approver: "Amani Mushi",
  reason: "The route plan has no rest stops. Add them and send it again.",
  expires: "26 Nov 2026",
  url: "https://fms.example.com/a/3f9c2b7e1d4a4c8e9b0f6a2d5e7c1b3a",
  link: "https://fms.example.com/a/3f9c2b7e1d4a4c8e9b0f6a2d5e7c1b3a",
  details: [
    { label: "Requested by", value: "Peter Mollel" },
    { label: "Trip", value: "Long trip" },
    { label: "Date", value: "02 Dec 2026 to 04 Dec 2026" },
    { label: "Time", value: "06:00 to 18:00" },
    { label: "Destination", value: "Arusha" },
    { label: "Purpose", value: "Site supervision visit" },
    { label: "People", value: "2" },
  ],
};

const PKG = {
  from: { key: "from_package", label: "Current package" },
  to: { key: "to_package", label: "Package asked for" },
  note: { key: "note", label: "Message from the company" },
} satisfies Record<string, Placeholder>;

const SAMPLE_PACKAGE: Vars = {
  name: "Neema",
  company: "Demo Company",
  requester: "Amani Mushi",
  from_package: "Standard",
  to_package: "Enterprise",
  note: "We are adding six trucks next month.",
  url: "https://fms.example.com/platform/companies/sample",
  link: "https://fms.example.com/platform/companies/sample",
};

const DIGEST_KIND: Record<string, { label: string; tone: Tone }> = {
  reminder: { label: "Reminder", tone: "warning" },
  approval: { label: "Approved", tone: "success" },
  rejection: { label: "Rejected", tone: "danger" },
  anomaly: { label: "Anomaly", tone: "danger" },
  system: { label: "Update", tone: "neutral" },
};

export const TEMPLATES: TemplateDef[] = [
  // ---------------------------------------------------------------- approval workflow
  {
    key: "email.approval_request",
    channel: "email",
    scope: "company",
    name: "Request waiting for your decision",
    description: "Sent to each person who may decide the next step of a leave or vehicle request. The button opens the request without signing in.",
    audience: "Approvers (and each JMP reviewer in turn)",
    placeholders: [P.name, P.company, P.request, P.step, P.requester, P.summary, P.expires],
    required: [],
    sample: SAMPLE_REQUEST,
    defaults: {
      subject: "{requester} needs your decision on a {request}",
      heading: "A {request} is waiting for you",
      greeting: "Hello {name},",
      paragraphs: "{requester} sent a {request} and it is waiting for your decision.\n\nStep: {step}",
      button: "Review and decide",
      note: "This link is personal to you and works without signing in until {expires}. Do not forward it.",
    },
    details: (v) => [...detailsFrom(v), ...(str(v.copied) ? [{ label: "Copied for information", value: str(v.copied) }] : [])],
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.approval_copy",
    channel: "email",
    scope: "company",
    name: "Copy of a request waiting for a decision",
    description: "One email to everyone else who may approve, copied in, while one person is asked to act. It has no action button: only that person gets one.",
    audience: "The other approvers (copied in)",
    placeholders: [P.company, P.request, P.step, P.requester, P.summary, P.approver],
    required: [],
    sample: { ...SAMPLE_REQUEST, name: "team" },
    defaults: {
      subject: "For your information: {requester}'s {request}",
      heading: "A {request} is waiting for {approver}",
      greeting: "Hello {name},",
      paragraphs: "{requester} sent a {request} ({summary}). {approver} has been asked to decide it at the step: {step}.\n\nThis copy is for your information. There is nothing for you to do from this email.",
      button: "",
      note: "",
    },
    details: detailsFrom,
  },
  {
    key: "email.finance_notice",
    channel: "email",
    scope: "company",
    name: "Approved, for finance",
    description: "Sent to the finance email addresses (Settings, Company) when the HOD approves a request that has no payment link of its own. Finance has no account: the email holds every detail. (Petty cash and outstation allowance have their own emails, with a link to record the payment.)",
    audience: "Finance (email only)",
    placeholders: [P.company, P.request, P.requester, P.summary, P.approver, { key: "verifier", label: "HOD who approved or verified it" }],
    required: [],
    sample: { ...SAMPLE_REQUEST, name: "Finance team", request: "outstation allowance", summary: "Outstation allowance for Juma Hassan, Mwanza, 02 Dec 2026 to 04 Dec 2026", approver: "Amani Mushi (Approval)", verifier: "Grace Mrema" },
    defaults: {
      subject: "Approved {request}: {summary}",
      heading: "An approved {request} for payment",
      greeting: "Hello {name},",
      paragraphs: "{requester} requested this {request}. It was approved by {approver} and finally approved by {verifier}.\n\nThe details are below. Please arrange the payment.",
      button: "",
      note: "You receive this email because your address is set for finance in the company settings.",
    },
    details: detailsFrom,
  },
  {
    key: "email.work_order",
    channel: "email",
    scope: "company",
    name: "Work order to a service provider",
    description: "Sent to the service provider when someone presses Send on a work order (Maintenance and repair). The provider has no account: the email holds the vehicle and the work to be done.",
    audience: "The service provider (email only)",
    placeholders: [P.company, { key: "order", label: "Work order number" }, { key: "vehicle", label: "Vehicle registration" }, { key: "sender", label: "Person who sent it" }, { key: "sender_contact", label: "Their position, phone and email" }],
    required: [],
    sample: { name: "Mwanza Auto Garage", company: "MDV Fleet", order: "WO-2026-0001", vehicle: "T 123 ABC", sender: "Amani Mushi", sender_contact: "Fleet Manager, +255 700 000 000", details: [{ label: "Work order", value: "WO-2026-0001" }, { label: "Vehicle", value: "T 123 ABC" }, { label: "Work to be done", value: "Front brakes squeal; check pads and discs." }] },
    defaults: {
      subject: "Work order {order} from {company}: {vehicle}",
      heading: "Work order {order}",
      greeting: "Hello {name},",
      paragraphs: "{company} asks you to carry out the work below on vehicle {vehicle}.\n\nPlease reply to confirm, and send the job card and invoice when the work is done.",
      button: "",
      note: "Sent by {sender} ({sender_contact}).",
    },
    details: detailsFrom,
  },
  {
    key: "email.travel_notice",
    channel: "email",
    scope: "company",
    name: "Travel: pickup details to the traveller",
    description: "Sent to the traveller's email when someone presses Send on a local departure or arrival (Travel coordination). It holds the pickup time and place, the terminal, the trip number, the driver and the vehicle.",
    audience: "The traveller (email only, no account)",
    placeholders: [P.name, P.company, { key: "trip", label: "departure or arrival" }, P.summary],
    required: [],
    sample: { name: "Peter", company: "MDV Fleet", trip: "departure", summary: "Pickup on 25 Nov 2026 at 05:30 from Mikocheni office to JNIA Terminal 3 (Dar es Salaam) for flight PW 714 (departs 09:00). Driver: Juma Hassan, +255 700 000 001. Vehicle: Toyota Land Cruiser T 123 ABC.", details: [{ label: "Pickup time", value: "05:30" }, { label: "Driver", value: "Juma Hassan, +255 700 000 001" }] },
    defaults: {
      subject: "Your {trip} pickup: {summary}",
      heading: "Your {trip} pickup",
      greeting: "Hello {name},",
      paragraphs: "{summary}\n\nThe details are below. If anything changes, please tell us.",
      button: "",
      note: "Sent by {company}.",
    },
    details: detailsFrom,
  },
  {
    key: "sms.travel_notice",
    channel: "sms",
    scope: "company",
    name: "Travel: pickup details to the traveller (SMS)",
    description: "Text message to the traveller's phone with the pickup details of a local departure or arrival.",
    audience: "The traveller (no account)",
    placeholders: [P.company, P.summary],
    required: [],
    sample: { company: "MDV Fleet", summary: "Pickup on 25 Nov 2026 at 05:30 from Mikocheni office to JNIA Terminal 3 for flight PW 714. Driver: Juma Hassan, +255 700 000 001." },
    defaults: { text: "{company}: {summary}" },
  },
  {
    key: "email.petty_cash_finance",
    channel: "email",
    scope: "company",
    name: "Petty cash verified, for finance to give",
    description: "Sent to the finance email addresses (Settings, Company) when the HOD verifies a petty cash request. The button opens it without signing in: finance records the amount given and uploads the proof of payment, and the requester is told.",
    audience: "Finance (email only)",
    placeholders: [P.company, P.requester, P.summary, { key: "amount", label: "Amount verified" }, { key: "approver", label: "Who verified it" }, { key: "verifier", label: "HOD who verified it" }, P.expires],
    required: [],
    sample: { ...SAMPLE_REQUEST, name: "Finance team", summary: "Petty cash for Asha Mushi: office supplies", amount: "TZS 45,000", approver: "Amani Mushi (Fleet manager verification)", verifier: "Grace Mrema" },
    defaults: {
      subject: "Petty cash to give: {summary}",
      heading: "Verified petty cash to give",
      greeting: "Hello {name},",
      paragraphs: "{requester} asked for petty cash. It was verified by {approver} and finally by {verifier}, for {amount}.\n\nPlease give the money, then open the request to record the amount given and upload the proof of payment.",
      button: "Record payment and upload proof",
      note: "You receive this email because your address is set for finance in the company settings. The link works without signing in until {expires}. Do not forward it.",
    },
    details: detailsFrom,
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.outstation_finance",
    channel: "email",
    scope: "company",
    name: "Outstation allowance approved, for finance to pay",
    description: "Sent to the finance email addresses (Settings, Company) when the HOD approves an outstation allowance. The button opens it without signing in: finance records the amount paid and uploads the proof of payment, and the person who recorded it is told.",
    audience: "Finance (email only)",
    placeholders: [P.company, P.requester, P.summary, { key: "amount", label: "Total to pay" }, { key: "approver", label: "Who approved it" }, { key: "verifier", label: "HOD who approved it" }, P.expires],
    required: [],
    sample: { ...SAMPLE_REQUEST, name: "Finance team", summary: "Outstation allowance for Juma Hassan, Mwanza, 02 Dec 2026 to 04 Dec 2026", amount: "TZS 180,000", approver: "Amani Mushi (Approval)", verifier: "Grace Mrema" },
    defaults: {
      subject: "Outstation allowance to pay: {summary}",
      heading: "An approved outstation allowance to pay",
      greeting: "Hello {name},",
      paragraphs: "{requester} recorded this outstation allowance. It was approved by {approver} and finally by {verifier}, for {amount}.\n\nPlease pay it, then open it to record the amount paid and upload the proof of payment.",
      button: "Record payment and upload proof",
      note: "You receive this email because your address is set for finance in the company settings. The link works without signing in until {expires}. Do not forward it.",
    },
    details: detailsFrom,
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.timesheet_confirm",
    channel: "email",
    scope: "company",
    name: "Employee: sign your monthly timesheet",
    description: "Sent to the employee on the last day of the month (from 16:00), or when the coordinator presses Send. The button opens the month's days without signing in, to check and sign. Their signature sends it to the fleet manager, then the HOD.",
    audience: "The employee (driver or staff) the timesheet is for",
    placeholders: [P.name, P.company, { key: "month", label: "Month of the timesheet" }, { key: "summary", label: "Days, hours and overtime" }, P.expires],
    required: [],
    sample: { name: "Juma", company: "MDV Fleet", month: "November 2026", summary: "22 days, 176 hours, 12 hours overtime", expires: "07 Dec 2026" },
    defaults: {
      subject: "Please sign your timesheet for {month}",
      heading: "Your timesheet for {month}",
      greeting: "Hello {name},",
      paragraphs: "Your timesheet for {month} is ready: {summary}.\n\nOpen it, check your days and hours, then sign. After you sign, it goes to the fleet manager and the HOD. If something is wrong, do not sign: tell your coordinator.",
      button: "Check and sign",
      note: "This link is personal to you and works without signing in until {expires}. Do not forward it.",
    },
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "sms.timesheet_confirm",
    channel: "sms",
    scope: "company",
    name: "Employee: sign your monthly timesheet (SMS)",
    description: "Text message to the employee with the link to check and sign their timesheet for the month.",
    audience: "The employee (driver or staff) the timesheet is for",
    placeholders: [P.company, { key: "month", label: "Month of the timesheet" }, { key: "summary", label: "Days, hours and overtime" }, P.link],
    required: ["link"],
    sample: { company: "MDV Fleet", month: "November 2026", summary: "22 days, 176 hours, 12 hours overtime", link: "https://fms.example.com/c/3f9c2b7e1d4a4c8e9b0f6a2d5e7c1b3a" },
    defaults: { text: "{company}: your timesheet for {month} is ready ({summary}). Check and sign: {link}" },
  },
  {
    key: "email.invoice_approved",
    channel: "email",
    scope: "company",
    name: "Invoice approved, to the service provider",
    description: "Sent to the service provider's email on a maintenance invoice (Maintenance and repair) when the HOD gives the final approval. The provider has no account: the email holds the invoice details.",
    audience: "The service provider (email only)",
    placeholders: [P.company, { key: "invoice", label: "Invoice number" }, { key: "vehicle", label: "Vehicle registration" }, { key: "amount", label: "Amount approved" }, { key: "approver", label: "Person who approved it" }, { key: "approver_contact", label: "Their position, phone and email" }],
    required: [],
    sample: { name: "Mwanza Auto Garage", company: "MDV Fleet", invoice: "INV-2026-117", vehicle: "T 123 ABC", amount: "TZS 450,000", approver: "Grace Mrema", approver_contact: "Head of Department, +255 700 000 000", details: [{ label: "Invoice", value: "INV-2026-117" }, { label: "Vehicle", value: "T 123 ABC" }, { label: "Amount approved", value: "TZS 450,000" }] },
    defaults: {
      subject: "Invoice {invoice} approved: {vehicle}",
      heading: "Your invoice {invoice} is approved",
      greeting: "Hello {name},",
      paragraphs: "{company} has approved your invoice {invoice} for vehicle {vehicle}, for {amount}.\n\nThe details are below. Payment follows the company's usual terms.",
      button: "",
      note: "Approved by {approver} ({approver_contact}).",
    },
    details: detailsFrom,
  },
  {
    key: "email.request_approved",
    channel: "email",
    scope: "company",
    name: "Request approved",
    description: "Sent to the person who made the request when the last step approves it.",
    audience: "The person who made the request",
    placeholders: [P.name, P.company, P.request, P.summary, P.approver],
    required: [],
    sample: { ...SAMPLE_REQUEST, name: "Peter", step: "Emergency response commander sign-off" },
    defaults: {
      subject: "Your {request} was approved",
      heading: "Your {request} was approved",
      greeting: "Hello {name},",
      paragraphs: "Good news: your {request} ({summary}) was approved by {approver}.",
      button: "Open the request",
      note: "",
    },
    details: detailsFrom,
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.request_rejected",
    channel: "email",
    scope: "company",
    name: "Request rejected",
    description: "Sent to the person who made the request when a step rejects it. After changes it is sent again and continues at the step that rejected it.",
    audience: "The person who made the request",
    placeholders: [P.name, P.company, P.request, P.step, P.summary, P.approver, P.reason],
    required: ["reason"],
    sample: { ...SAMPLE_REQUEST, name: "Peter", step: "HSE manager sign-off (journey management plan)" },
    defaults: {
      subject: "Your {request} was rejected",
      heading: "Your {request} was rejected",
      greeting: "Hello {name},",
      paragraphs: "{approver} rejected your {request} ({summary}) at the step: {step}.\n\nReason: {reason}\n\nMake the changes and send it again. It continues from the step that rejected it.",
      button: "Change and send again",
      note: "",
    },
    details: detailsFrom,
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.jmp_task",
    channel: "email",
    scope: "company",
    name: "Journey management plan step to do",
    description: "Manual JMP: asks the person for the next step (prepare and upload, requester signs, HSE signs and attaches). The button opens the request in the app, where the file is uploaded.",
    audience: "The person doing the next JMP step",
    placeholders: [P.name, P.company, P.step, P.requester, P.summary],
    required: [],
    sample: { ...SAMPLE_REQUEST, step: "Requester signs the journey management plan" },
    defaults: {
      subject: "Journey management plan: {step}",
      heading: "A journey management plan needs you",
      greeting: "Hello {name},",
      paragraphs: "The long trip {summary} needs the next step of its journey management plan.\n\nStep: {step}\n\nOpen the request, download the plan where needed, then upload your copy and sign.",
      button: "Open the request",
      note: "You will be asked to sign in.",
    },
    details: (v) => [...detailsFrom(v), ...(str(v.copied) ? [{ label: "Copied for information", value: str(v.copied) }] : [])],
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.jmp_monitor",
    channel: "email",
    scope: "company",
    name: "Long trip to monitor",
    description: "Sent to the control room and the emergency response commander once a long trip's journey management plan is complete. They do not sign.",
    audience: "Control room and emergency response commander",
    placeholders: [P.name, P.company, P.requester, P.summary, { key: "role", label: "Their role on the trip" }],
    required: [],
    sample: { ...SAMPLE_REQUEST, role: "Control room" },
    defaults: {
      subject: "Long trip to monitor: {summary}",
      heading: "A long trip is cleared to go",
      greeting: "Hello {name},",
      paragraphs: "The journey management plan for {summary} is complete and signed.\n\nYou are informed as: {role}. Please monitor the journey and keep the emergency response ready.",
      button: "Open the request",
      note: "",
    },
    details: detailsFrom,
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "sms.jmp_task",
    channel: "sms",
    scope: "company",
    name: "Journey management plan step to do (SMS)",
    description: "Text message for the next manual JMP step.",
    audience: "The person doing the next JMP step",
    placeholders: [P.company, P.step, P.summary, P.link],
    required: ["link"],
    sample: SAMPLE_REQUEST,
    defaults: { text: "{company}: JMP step for {summary}: {step}. Open: {link}" },
  },
  {
    key: "sms.jmp_monitor",
    channel: "sms",
    scope: "company",
    name: "Long trip to monitor (SMS)",
    description: "Text message to the control room and the emergency response commander.",
    audience: "Control room and emergency response commander",
    placeholders: [P.company, P.summary, P.link],
    required: [],
    sample: SAMPLE_REQUEST,
    defaults: { text: "{company}: long trip cleared to go, please monitor: {summary}. {link}" },
  },
  {
    key: "email.driver_confirm",
    channel: "email",
    scope: "company",
    name: "Driver: confirm a request made for you",
    description: "Sent to the driver when someone else makes a fuel or maintenance request for them. The button opens the request without signing in, to confirm and sign it. It cannot be approved before.",
    audience: "The driver the request is for",
    placeholders: [P.name, P.company, P.request, P.requester, P.summary, P.expires],
    required: [],
    sample: { ...SAMPLE_REQUEST, request: "fuel request", summary: "Fuel request for T123ABC on 19 Nov 2026" },
    defaults: {
      subject: "Please confirm the {request} made for you",
      heading: "Confirm your {request}",
      greeting: "Hello {name},",
      paragraphs: "{requester} made a {request} for you: {summary}.\n\nOpen it, check the details, then confirm and sign. It cannot be approved until you do.",
      button: "Confirm and sign",
      note: "This link is personal to you and works without signing in until {expires}. Do not forward it.",
    },
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "sms.driver_confirm",
    channel: "sms",
    scope: "company",
    name: "Driver: confirm a request made for you (SMS)",
    description: "Text message to the driver with the link to confirm and sign a request made for them.",
    audience: "The driver the request is for",
    placeholders: [P.company, P.requester, P.summary, P.link],
    required: ["link"],
    sample: { ...SAMPLE_REQUEST, summary: "Fuel request for T123ABC on 19 Nov 2026" },
    defaults: { text: "{company}: {requester} made a request for you ({summary}). Confirm and sign: {link}" },
  },
  {
    key: "sms.approval_request",
    channel: "sms",
    scope: "company",
    name: "Request waiting for your decision (SMS)",
    description: "Text message to each person who may decide the next step. The link opens the request without signing in.",
    audience: "Approvers (and each JMP reviewer in turn)",
    placeholders: [P.company, P.request, P.step, P.requester, P.summary, P.link],
    required: ["link"],
    sample: SAMPLE_REQUEST,
    defaults: { text: "{company}: {requester} needs your decision on a {request} ({step}). Open: {link}" },
  },
  {
    key: "sms.request_approved",
    channel: "sms",
    scope: "company",
    name: "Request approved (SMS)",
    description: "Text message to the person who made the request when it is approved.",
    audience: "The person who made the request",
    placeholders: [P.company, P.request, P.summary, P.approver, P.link],
    required: [],
    sample: SAMPLE_REQUEST,
    defaults: { text: "{company}: your {request} ({summary}) was approved by {approver}. {link}" },
  },
  {
    key: "sms.request_rejected",
    channel: "sms",
    scope: "company",
    name: "Request rejected (SMS)",
    description: "Text message to the person who made the request when a step rejects it.",
    audience: "The person who made the request",
    placeholders: [P.company, P.request, P.step, P.summary, P.approver, P.reason, P.link],
    required: ["reason"],
    sample: SAMPLE_REQUEST,
    defaults: { text: "{company}: your {request} was rejected by {approver}. Reason: {reason}. Change and send again: {link}" },
  },

  // ---------------------------------------------------------------- accounts and digest
  {
    key: "email.invite",
    channel: "email",
    scope: "company",
    name: "Invitation to a new user",
    description: "Sent when an administrator adds a user. The button sets the password.",
    audience: "New users",
    placeholders: [P.name, P.company, P.app, { key: "invited_by", label: "Person who added the user" }, { key: "role", label: "Role given" }, { key: "email", label: "Sign-in email" }],
    required: [],
    sample: { name: "Neema", company: "Demo Company", app: "Fleet Management System", invited_by: "Amani Mushi", role: "Fleet coordinator", email: "neema@example.com", url: "https://fms.example.com/auth/callback?token_hash=sample&type=invite" },
    defaults: {
      subject: "Your {company} account on {app}",
      heading: "You are invited to {company}",
      greeting: "Hello {name},",
      paragraphs: "{invited_by} has created an account for you in {app}, the system {company} uses for its vehicles, drivers, inspections, requests and records.\n\nSet your password to sign in. It takes less than a minute.",
      button: "Set your password",
      note: "For your security this link works once and expires in 24 hours. If you were not expecting this email you can ignore it.",
    },
    details: (v) => [
      { label: "Company", value: str(v.company) },
      { label: "Your role", value: str(v.role) },
      { label: "Sign-in email", value: str(v.email) },
    ],
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.reset",
    channel: "email",
    scope: "company",
    name: "Password reset",
    description: "Sent when someone asks to reset their password.",
    audience: "Any user",
    placeholders: [P.name, P.app],
    required: [],
    sample: { name: "Juma", app: "Fleet Management System", url: "https://fms.example.com/auth/callback?token_hash=sample&type=recovery" },
    defaults: {
      subject: "Reset your {app} password",
      heading: "Reset your password",
      greeting: "Hello {name},",
      paragraphs: "We received a request to reset the password for your account. Choose a new password with the button below.",
      button: "Choose a new password",
      note: "This link works once and expires in 1 hour. If you did not ask for a reset, ignore this email: your password stays the same.",
    },
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.digest",
    channel: "email",
    scope: "company",
    name: "Daily updates",
    description: "One email a day with reminders, anomalies and other updates not emailed yet.",
    audience: "Every user with email updates on",
    placeholders: [P.name, P.company, P.app, { key: "count", label: "Number of updates" }],
    required: [],
    sample: {
      name: "Amani",
      company: "Demo Company",
      app: "Fleet Management System",
      count: 4,
      url: "https://fms.example.com/notifications",
      items: [
        { kind: "reminder", title: "Insurance expires: T123ABC", body: "Due on 30 Nov 2026 (20 days left)" },
        { kind: "reminder", title: "Driving licence expires: Rehema Ally", body: "Due on 05 Dec 2026 (25 days left)" },
        { kind: "anomaly", title: "Vehicle T321JKL is not safe for use", body: "Brake pedal travels to the floor before biting." },
        { kind: "rejection", title: "Tyres rejected", body: "Reason: tread depth is still within limits." },
      ],
    },
    defaults: {
      subject: "Updates in {app}: {count}",
      heading: "New updates: {count}",
      greeting: "Hello {name},",
      paragraphs: "Here is what needs your attention.",
      button: "Open notifications",
      note: "You can turn these emails off under My profile, Notification settings.",
    },
    items: (v) =>
      (Array.isArray(v.items) ? (v.items as { kind: string; title: string; body?: string | null; url?: string | null }[]) : []).slice(0, 25).map((i) => ({
        title: i.title,
        meta: i.body ?? undefined,
        status: DIGEST_KIND[i.kind] ?? DIGEST_KIND.system,
        url: i.url ?? undefined,
      })),
    buttonUrl: (v) => str(v.url) || undefined,
  },

  {
    key: "sms.invite",
    channel: "sms",
    scope: "company",
    name: "Invitation to a new user (SMS)",
    description: "Text message sent with the invitation email when the new user has a phone number. The link sets the password.",
    audience: "New users with a phone number",
    placeholders: [P.name, P.company, P.app, { key: "invited_by", label: "Person who added the user" }, { key: "role", label: "Role given" }, { key: "email", label: "Sign-in email" }, { key: "link", label: "Link to set the password" }],
    required: ["link"],
    sample: { name: "Neema", company: "Demo Company", app: "FMS", invited_by: "Amani Mushi", role: "Driver", email: "neema@example.com", link: "https://fms.example.com/auth/callback?token_hash=sample&type=invite" },
    defaults: { text: "{company}: {invited_by} added you to {app} as {role}. Sign in with {email}. Set your password (link works once, 24 hours): {link}" },
  },

  // ---------------------------------------------------------------- platform (owner only)
  {
    key: "email.package_request",
    channel: "email",
    scope: "platform",
    name: "Package change requested (to the owner)",
    description: "Sent to the system owner when a company administrator asks for another package.",
    audience: "System owner",
    placeholders: [P.name, P.company, P.requester, PKG.from, PKG.to, PKG.note],
    required: [],
    sample: SAMPLE_PACKAGE,
    defaults: {
      subject: "{company} asks to change to {to_package}",
      heading: "Package change request",
      greeting: "Hello {name},",
      paragraphs: "{requester} at {company} asks to change the package from {from_package} to {to_package}.\n\nMessage: {note}\n\nApprove it and the new package applies at once.",
      button: "Review the request",
      note: "",
    },
    details: (v) => [
      { label: "Company", value: str(v.company) },
      { label: "Asked by", value: str(v.requester) },
      { label: "Current package", value: str(v.from_package) },
      { label: "New package", value: str(v.to_package) },
    ],
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "sms.package_request",
    channel: "sms",
    scope: "platform",
    name: "Package change requested (SMS to the owner)",
    description: "Text message to the system owner when a company asks for another package.",
    audience: "System owner",
    placeholders: [P.company, P.requester, PKG.from, PKG.to, P.link],
    required: [],
    sample: SAMPLE_PACKAGE,
    defaults: { text: "{company} asks to change package from {from_package} to {to_package}. Review: {link}" },
  },
  {
    key: "email.package_approved",
    channel: "email",
    scope: "platform",
    name: "Package change approved",
    description: "Sent to the company administrator who asked, when the owner approves. The new package already applies.",
    audience: "Company administrator who asked",
    placeholders: [P.name, P.company, PKG.from, PKG.to],
    required: [],
    sample: { ...SAMPLE_PACKAGE, name: "Amani" },
    defaults: {
      subject: "{company} is now on {to_package}",
      heading: "Your package was changed",
      greeting: "Hello {name},",
      paragraphs: "Your request was approved: {company} moved from {from_package} to {to_package}. The new modules and vehicle limit apply now.\n\nGive your users access to new modules under Settings, Roles.",
      button: "Open company settings",
      note: "",
    },
    details: (v) => [
      { label: "Previous package", value: str(v.from_package) },
      { label: "New package", value: str(v.to_package) },
    ],
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "sms.package_approved",
    channel: "sms",
    scope: "platform",
    name: "Package change approved (SMS)",
    description: "Text message to the company administrator when the package change is approved.",
    audience: "Company administrator who asked",
    placeholders: [P.company, PKG.from, PKG.to, P.link],
    required: [],
    sample: SAMPLE_PACKAGE,
    defaults: { text: "{company} is now on the {to_package} package. The new modules apply now. {link}" },
  },
  {
    key: "email.package_rejected",
    channel: "email",
    scope: "platform",
    name: "Package change not approved",
    description: "Sent to the company administrator who asked, when the owner rejects the change.",
    audience: "Company administrator who asked",
    placeholders: [P.name, P.company, PKG.from, PKG.to, P.reason],
    required: ["reason"],
    sample: { ...SAMPLE_PACKAGE, name: "Amani", reason: "Please settle the open invoice first, then ask again." },
    defaults: {
      subject: "Your package change for {company}",
      heading: "Package change not approved",
      greeting: "Hello {name},",
      paragraphs: "Your request to move {company} from {from_package} to {to_package} was not approved.\n\nReason: {reason}\n\nYour current package stays as it is. You can ask again from company settings.",
      button: "Open company settings",
      note: "",
    },
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "sms.package_rejected",
    channel: "sms",
    scope: "platform",
    name: "Package change not approved (SMS)",
    description: "Text message to the company administrator when the package change is rejected.",
    audience: "Company administrator who asked",
    placeholders: [P.company, PKG.to, P.reason, P.link],
    required: ["reason"],
    sample: { ...SAMPLE_PACKAGE, reason: "Please settle the open invoice first." },
    defaults: { text: "{company}: the change to {to_package} was not approved. Reason: {reason} {link}" },
  },
  {
    key: "email.registration_received",
    channel: "email",
    scope: "platform",
    name: "Registration received",
    description: "Sent to a company that registered from the website.",
    audience: "Companies that register",
    placeholders: [P.name, P.company, { key: "package", label: "Package requested" }],
    required: [],
    sample: { name: "Daudi", company: "Ruvuma Agro Supplies", package: "Standard" },
    defaults: {
      subject: "We received your registration for {company}",
      heading: "Registration received",
      greeting: "Hello {name},",
      paragraphs: "Thank you for registering {company}. We review every registration and will reply soon.\n\nOnce it is approved you receive a separate email with a link to set up your administrator account.",
      button: "",
      note: "",
    },
    details: (v) => [
      { label: "Company", value: str(v.company) },
      { label: "Package requested", value: str(v.package) },
    ],
  },
  {
    key: "email.registration_alert",
    channel: "email",
    scope: "platform",
    name: "New registration (to the owner)",
    description: "Sent to the system owner when a company registers.",
    audience: "System owner",
    placeholders: [P.company, { key: "contact", label: "Contact person" }, { key: "message", label: "Message from the company" }],
    required: [],
    sample: { company: "Ruvuma Agro Supplies", contact: "Daudi Ngonyani", email: "daudi@example.com", phone: "+255 700 000 301", package: "Standard", vehicles: "12", message: "We run 12 pickups and two trucks.", url: "https://fms.example.com/platform/registrations" },
    defaults: {
      subject: "New registration: {company}",
      heading: "New company registration",
      greeting: "",
      paragraphs: "{company} registered from the website and is waiting for your review.\n\nMessage: {message}",
      button: "Review registration",
      note: "",
    },
    details: (v) => [
      { label: "Company", value: str(v.company) },
      { label: "Contact", value: str(v.contact) },
      { label: "Email", value: str(v.email) },
      { label: "Phone", value: str(v.phone) },
      { label: "Package", value: str(v.package) },
      { label: "Vehicles", value: str(v.vehicles) },
    ],
    buttonUrl: (v) => str(v.url) || undefined,
  },
  {
    key: "email.registration_rejected",
    channel: "email",
    scope: "platform",
    name: "Registration not approved",
    description: "Sent to a company whose registration is rejected.",
    audience: "Companies that register",
    placeholders: [P.name, P.company, P.reason],
    required: ["reason"],
    sample: { name: "Daudi", company: "Ruvuma Agro Supplies", reason: "We could not verify the company details. Please register again with your TIN number." },
    defaults: {
      subject: "Your registration for {company}",
      heading: "Registration not approved",
      greeting: "Hello {name},",
      paragraphs: "Thank you for your interest. We could not approve the registration for {company} at this time.\n\nReason: {reason}\n\nYou are welcome to reply to this email if you have questions or want to register again.",
      button: "",
      note: "",
    },
  },
];

export const TEMPLATE_BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));

export function templateDef(key: string): TemplateDef {
  const def = TEMPLATE_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown message template ${key}`);
  return def;
}

/** Saved wording over the defaults; empty saved fields fall back to the default. */
export function mergeContent(def: TemplateDef, ...layers: (TemplateContent | null | undefined)[]): TemplateContent {
  const out: TemplateContent = { ...def.defaults };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (typeof v === "string" && k in def.defaults && (v.trim() !== "" || k === "button" || k === "note" || k === "greeting")) (out as Record<string, string>)[k] = v;
    }
  }
  return out;
}

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function fill(text: string, v: Vars) {
  return text.replace(PLACEHOLDER, (m, k: string) => (k in v ? str(v[k]) : m)).replace(/([.!?])\.(?=\s|$)/g, "$1");
}

/** Placeholders used in some wording. */
export function placeholdersIn(text: string) {
  return Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]!);
}

export type ContentErrors = Partial<Record<keyof EmailFields | keyof SmsFields | "_", string>>;

/** Wording may change; placeholders must be known ones and the required ones must stay. */
export function validateContent(def: TemplateDef, content: TemplateContent): ContentErrors {
  const errors: ContentErrors = {};
  const allowed = new Set(def.placeholders.map((p) => p.key));
  const fields = Object.keys(def.defaults) as (keyof EmailFields | keyof SmsFields)[];
  const used = new Set<string>();
  for (const f of fields) {
    const text = (content as Record<string, string | undefined>)[f] ?? "";
    for (const p of placeholdersIn(text)) {
      used.add(p);
      if (!allowed.has(p)) errors[f] = `{${p}} is not a value this message has.`;
    }
    if (/[{}]/.test(text.replace(PLACEHOLDER, ""))) errors[f] = errors[f] ?? "Curly brackets are only for values such as {name}.";
  }
  if (def.channel === "email" && !(content.subject ?? "").trim()) errors.subject = "The subject is required.";
  if (def.channel === "email" && !(content.heading ?? "").trim()) errors.heading = "The heading is required.";
  if (def.channel === "sms" && !(content.text ?? "").trim()) errors.text = "The message is required.";
  const missing = def.required.filter((r) => !used.has(r));
  if (missing.length) errors._ = `Keep ${missing.map((m) => `{${m}}`).join(", ")} in the wording: it carries information the reader needs.`;
  return errors;
}

/** A paragraph that names a value the record does not have (for example no message) is left out. */
function paragraphsOf(text: string, v: Vars) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && placeholdersIn(p).every((k) => str(v[k]).trim() !== ""))
    .map((p) => fill(p, v).replace(/\s*\n\s*/g, " "));
}

export function renderEmailTemplate(def: EmailTemplateDef, content: TemplateContent, v: Vars, brand: EmailBrand = {}) {
  const vars: Vars = { app: brand.appName ?? "Fleet Management System", ...v };
  const c = { ...def.defaults, ...content };
  const paragraphs = paragraphsOf(c.paragraphs, vars);
  const url = def.buttonUrl?.(vars);
  const { html, text } = renderEmail(
    {
      preheader: paragraphs[0] ?? fill(c.heading, vars),
      heading: fill(c.heading, vars),
      greeting: c.greeting.trim() ? fill(c.greeting, vars) : undefined,
      paragraphs,
      details: def.details?.(vars).filter((d) => d.value),
      items: def.items?.(vars),
      itemsHeading: def.items ? "Updates" : undefined,
      button: url && c.button.trim() ? { label: fill(c.button, vars), url } : undefined,
      note: c.note.trim() ? fill(c.note, vars) : undefined,
      company: str(vars.company) || undefined,
    },
    brand,
  );
  return { subject: fill(c.subject, vars).replace(/\s+/g, " ").trim(), html, text };
}

export function renderSmsTemplate(def: SmsTemplateDef, content: TemplateContent, v: Vars) {
  const c = { ...def.defaults, ...content };
  return fill(c.text, v).replace(/\s+/g, " ").trim();
}

/** SMS length: 160 characters in one message with the basic alphabet, 70 otherwise; longer ones are split. */
export function smsSegments(text: string) {
  const gsm = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/.test(text);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const length = text.length;
  return { length, gsm, segments: length <= single ? 1 : Math.ceil(length / multi) };
}
