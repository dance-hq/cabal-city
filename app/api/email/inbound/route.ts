import { Resend } from "resend";
import type { Attachment } from "resend";
import {
  FORWARDED_HEADER,
  forwardFrom,
  forwardNote,
  forwardTargets,
  ownAddress,
  parseSender,
  pickAttachments,
  skipReason,
  withNote,
} from "@/lib/inbound-mail";

export const runtime = "nodejs";
export const maxDuration = 60;

// Resend calls this when mail arrives for the domain. Each message is
// forwarded once to CABAL_FORWARD_TO; replying goes to the original sender.
export async function POST(req: Request) {
  const key = process.env.RESEND_INBOUND_KEY;
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const targets = forwardTargets(process.env.CABAL_FORWARD_TO);
  const own = ownAddress(process.env.CABAL_EMAIL_FROM);
  if (!key || !secret || targets.length === 0 || !own) {
    return new Response("Mail forwarding is not set up", { status: 503 });
  }

  const resend = new Resend(key);
  const payload = await req.text();
  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    });
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  if (event.type !== "email.received")
    return new Response("Ignored", { status: 200 });

  const emailId = event.data.email_id;
  const { data: email, error } = await resend.emails.receiving.get(emailId, {
    html_format: "cid",
  });
  if (error || !email) {
    console.error(
      "[cabal] inbound: could not read email",
      emailId,
      error?.message,
    );
    return new Response("Could not read email", { status: 500 });
  }

  const skip = skipReason(email.headers);
  if (skip) {
    console.log("[cabal] inbound: not forwarding", emailId, skip);
    return new Response("Skipped", { status: 200 });
  }

  let files: Attachment[] = [];
  let dropped: string[] = [];
  if (email.attachments.length > 0) {
    const { data: list, error: listError } =
      await resend.emails.receiving.attachments.list({ emailId });
    if (listError || !list) {
      console.error(
        "[cabal] inbound: could not list attachments",
        emailId,
        listError?.message,
      );
      return new Response("Could not list attachments", { status: 500 });
    }
    const picked = pickAttachments(list.data);
    dropped = picked.dropped.map((a) => a.filename || "attachment");
    try {
      files = await Promise.all(
        picked.keep.map(async (a) => {
          const res = await fetch(a.download_url, {
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) throw new Error(`download ${res.status}`);
          return {
            filename: a.filename || "attachment",
            content: Buffer.from(await res.arrayBuffer()),
            contentType: a.content_type,
            contentId:
              a.content_disposition === "inline" && a.content_id
                ? a.content_id
                : undefined,
          };
        }),
      );
    } catch (e) {
      console.error(
        "[cabal] inbound: attachment download failed",
        emailId,
        (e as Error).message,
      );
      return new Response("Could not download attachments", { status: 500 });
    }
  }

  const sender = parseSender(email.from);
  const note = forwardNote({ from: email.from, to: email.to, dropped });
  const text = note.text + (email.text ?? "");
  const replyTo = email.reply_to?.length ? email.reply_to : [sender.address];

  const { error: sendError } = await resend.emails.send(
    {
      from: forwardFrom(sender, own),
      to: targets,
      replyTo,
      subject: email.subject || "(no subject)",
      text,
      ...(email.html ? { html: withNote(email.html, note.html) } : {}),
      attachments: files.length > 0 ? files : undefined,
      headers: { [FORWARDED_HEADER]: "1" },
    },
    { idempotencyKey: `forward/${emailId}` },
  );
  if (sendError) {
    console.error(
      "[cabal] inbound: forward failed",
      emailId,
      sendError.message,
    );
    return new Response("Forward failed", { status: 500 });
  }
  return new Response("Forwarded", { status: 200 });
}
