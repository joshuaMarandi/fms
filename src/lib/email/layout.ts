import "server-only";

/**
 * One email layout for every message: brand bar, white card, heading, short paragraphs,
 * an optional button, an optional details table and an optional item list, then a quiet footer.
 * Table-based with inline styles so it renders the same in Gmail, Outlook and phone mail apps.
 * Flat colours only, no images, no emoji. A plain-text version is produced alongside.
 */

const C = {
  page: "#f4f3ee",
  brand: "#0f3d34",
  primary: "#0f5c4d",
  text: "#17211e",
  muted: "#55625e",
  border: "#dddcd4",
  card: "#ffffff",
  soft: "#f4f3ee",
  success: "#0b4a3d",
  successBg: "#ddefe7",
  warning: "#6b4300",
  warningBg: "#fbefd5",
  danger: "#8a1c12",
  dangerBg: "#f9e1de",
  neutral: "#3f4a46",
  neutralBg: "#e8e7e1",
};

export type Tone = "success" | "warning" | "danger" | "neutral";

export type EmailContent = {
  /** Inbox preview text (hidden in the body). */
  preheader: string;
  heading: string;
  greeting?: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  details?: { label: string; value: string }[];
  items?: { title: string; meta?: string; status?: { label: string; tone: Tone }; url?: string }[];
  itemsHeading?: string;
  /** Small print under the button, for example link expiry. */
  note?: string;
  /** Shown in the footer, for example the company name. */
  company?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const font = "font-family:Arial,Helvetica,sans-serif;";

function toneColors(t: Tone) {
  return t === "success" ? [C.success, C.successBg] : t === "warning" ? [C.warning, C.warningBg] : t === "danger" ? [C.danger, C.dangerBg] : [C.neutral, C.neutralBg];
}

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const appName = process.env.MAIL_FROM_NAME ?? "Fleet Management System";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  const paragraphs = c.paragraphs.map((p) => `<p style="margin:0 0 16px;${font}font-size:15px;line-height:24px;color:${C.text};">${esc(p)}</p>`).join("");

  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;">
        <tr><td bgcolor="${C.primary}" style="border-radius:8px;">
          <a href="${esc(c.button.url)}" target="_blank" style="display:inline-block;padding:14px 28px;${font}font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(c.button.label)}</a>
        </td></tr>
      </table>
      <p style="margin:12px 0 0;${font}font-size:12px;line-height:18px;color:${C.muted};">If the button does not work, copy this link into your browser:<br><a href="${esc(c.button.url)}" style="color:${C.primary};word-break:break-all;">${esc(c.button.url)}</a></p>`
    : "";

  const note = c.note ? `<p style="margin:16px 0 0;${font}font-size:13px;line-height:20px;color:${C.muted};">${esc(c.note)}</p>` : "";

  const details = c.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;">
        ${c.details
          .map(
            (d, i) => `<tr>
              <td style="padding:10px 14px;${font}font-size:13px;color:${C.muted};width:40%;${i ? `border-top:1px solid ${C.border};` : ""}">${esc(d.label)}</td>
              <td style="padding:10px 14px;${font}font-size:14px;color:${C.text};font-weight:bold;${i ? `border-top:1px solid ${C.border};` : ""}">${esc(d.value)}</td>
            </tr>`,
          )
          .join("")}
      </table>`
    : "";

  const items = c.items?.length
    ? `${c.itemsHeading ? `<p style="margin:8px 0 8px;${font}font-size:13px;font-weight:bold;color:${C.muted};text-transform:uppercase;letter-spacing:0.5px;">${esc(c.itemsHeading)}</p>` : ""}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid ${C.border};border-radius:8px;border-collapse:separate;">
        ${c.items
          .map((it, i) => {
            const [fg, bg] = toneColors(it.status?.tone ?? "neutral");
            const title = it.url ? `<a href="${esc(it.url)}" style="color:${C.text};text-decoration:none;">${esc(it.title)}</a>` : esc(it.title);
            return `<tr>
              <td style="padding:12px 14px;${i ? `border-top:1px solid ${C.border};` : ""}">
                <p style="margin:0;${font}font-size:14px;line-height:20px;color:${C.text};font-weight:bold;">${title}</p>
                ${it.meta ? `<p style="margin:2px 0 0;${font}font-size:13px;line-height:18px;color:${C.muted};">${esc(it.meta)}</p>` : ""}
              </td>
              <td align="right" valign="middle" style="padding:12px 14px;white-space:nowrap;${i ? `border-top:1px solid ${C.border};` : ""}">
                ${it.status ? `<span style="display:inline-block;padding:3px 10px;border-radius:6px;background:${bg};color:${fg};${font}font-size:12px;font-weight:bold;">${esc(it.status.label)}</span>` : ""}
              </td>
            </tr>`;
          })
          .join("")}
      </table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(c.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
      <tr><td bgcolor="${C.brand}" style="padding:20px 28px;border-radius:12px 12px 0 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td bgcolor="${C.primary}" width="32" height="32" align="center" style="border-radius:8px;${font}font-size:14px;font-weight:bold;color:#ffffff;">F</td>
          <td style="padding-left:12px;${font}font-size:16px;font-weight:bold;color:#ffffff;">${esc(appName)}</td>
        </tr></table>
      </td></tr>
      <tr><td bgcolor="${C.card}" style="padding:32px 28px;border:1px solid ${C.border};border-top:0;border-radius:0 0 12px 12px;">
        <h1 style="margin:0 0 16px;${font}font-size:22px;line-height:30px;color:${C.text};">${esc(c.heading)}</h1>
        ${c.greeting ? `<p style="margin:0 0 16px;${font}font-size:15px;line-height:24px;color:${C.text};">${esc(c.greeting)}</p>` : ""}
        ${paragraphs}
        ${details}
        ${items}
        ${button}
        ${note}
      </td></tr>
      <tr><td style="padding:20px 28px;${font}font-size:12px;line-height:18px;color:${C.muted};" align="center">
        ${c.company ? `${esc(c.company)} &middot; ` : ""}${esc(appName)}<br>
        ${appUrl ? `<a href="${esc(appUrl)}" style="color:${C.muted};">${esc(appUrl.replace(/^https?:\/\//, ""))}</a><br>` : ""}
        You receive this email because of your account in ${esc(appName)}.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const lines: string[] = [c.heading, ""];
  if (c.greeting) lines.push(c.greeting, "");
  for (const p of c.paragraphs) lines.push(p, "");
  for (const d of c.details ?? []) lines.push(`${d.label}: ${d.value}`);
  if (c.details?.length) lines.push("");
  if (c.items?.length) {
    if (c.itemsHeading) lines.push(c.itemsHeading.toUpperCase());
    for (const it of c.items) lines.push(`- ${it.title}${it.status ? ` [${it.status.label}]` : ""}${it.meta ? `: ${it.meta}` : ""}${it.url ? ` ${it.url}` : ""}`);
    lines.push("");
  }
  if (c.button) lines.push(`${c.button.label}: ${c.button.url}`, "");
  if (c.note) lines.push(c.note, "");
  lines.push("--", `${c.company ? `${c.company} - ` : ""}${appName}`);
  if (appUrl) lines.push(appUrl);

  return { html, text: lines.join("\n") };
}
