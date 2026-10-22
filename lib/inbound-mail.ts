// Rules for forwarding mail sent to the community's own domain (for example
// matt@cabal.city) on to a real inbox. Kept free of Resend and server-only
// imports so the rules can be tested on their own.

export const FORWARDED_HEADER = "X-Cabal-Forwarded";

// Gmail refuses messages over 25 MB once attachments are encoded (about a
// third bigger than the files), so keep the files comfortably under that.
export const MAX_ATTACHMENT_BYTES = 17 * 1024 * 1024;

export type Sender = { name: string; address: string };

export function parseSender(from: string): Sender {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), address: match[2].trim() };
  return { name: "", address: from.trim() };
}

export function forwardTargets(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(e));
}

function header(headers: Record<string, string> | null, name: string) {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return String(value);
  }
  return undefined;
}

export type SkipReason = "already-forwarded" | "spam" | "virus";

export function skipReason(
  headers: Record<string, string> | null,
): SkipReason | null {
  // Our own forwarded copy coming back (say, through a Gmail filter) would
  // otherwise bounce between the two inboxes forever.
  if (header(headers, FORWARDED_HEADER)) return "already-forwarded";
  if (header(headers, "X-SES-Virus-Verdict")?.toUpperCase() === "FAIL")
    return "virus";
  if (header(headers, "X-SES-Spam-Verdict")?.toUpperCase() === "FAIL")
    return "spam";
  return null;
}

// Display name only: the address stays our own so the forward passes the
// receiving inbox's sender checks, and Reply goes to the real sender.
export function forwardFrom(sender: Sender, ownAddress: string) {
  const name = (sender.name || sender.address)
    .replace(/["<>\r\n\\]/g, "")
    .trim()
    .slice(0, 60);
  return `${name || "Someone"} via Cabal <${ownAddress}>`;
}

export function ownAddress(fromSetting: string | undefined) {
  const value = (fromSetting ?? "").trim();
  if (!value) return null;
  return parseSender(value).address || null;
}

type AttachmentInfo = { id: string; filename?: string | null; size: number };

export function pickAttachments<T extends AttachmentInfo>(
  list: T[],
  maxBytes = MAX_ATTACHMENT_BYTES,
) {
  const keep: T[] = [];
  const dropped: T[] = [];
  let total = 0;
  for (const item of list) {
    if (total + item.size <= maxBytes) {
      keep.push(item);
      total += item.size;
    } else {
      dropped.push(item);
    }
  }
  return { keep, dropped };
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function forwardNote(input: {
  from: string;
  to: string[];
  dropped: string[];
}) {
  const lines = [`From ${input.from} to ${input.to.join(", ")}`];
  if (input.dropped.length > 0) {
    lines.push(
      `Too big to forward: ${input.dropped.join(", ")}. Open it in Resend → Emails → Receiving.`,
    );
  }
  return {
    text: `${lines.join("\n")}\n\n`,
    html: `<div style="font:12px/1.5 ui-sans-serif,system-ui,sans-serif;color:#6b6e76;margin:0 0 12px">${lines
      .map(escapeHtml)
      .join("<br>")}</div>`,
  };
}

export function withNote(html: string, note: string) {
  const body = html.match(/<body[^>]*>/i);
  if (!body || body.index === undefined) return note + html;
  const at = body.index + body[0].length;
  return html.slice(0, at) + note + html.slice(at);
}
