import "server-only";
import nodemailer from "nodemailer";

export type AlertEmailContext = {
  recipients: string[];
  parcelName: string;
  parcelLocation: string;
  parcelLink: string;
  changeScore: number;
  severity: "low" | "medium" | "high";
  diffImageUrl?: string;
};

type SendOutcome = {
  sent: boolean;
  reason?: string;
  recipients: string[];
  via?: "gmail" | "resend";
};

/**
 * Try, in order: Gmail SMTP → Resend → console log fallback.
 *
 * Gmail SMTP needs only a Gmail account + an "app password"
 * (https://myaccount.google.com/apppasswords) — no verified domain
 * required, ~500 messages/day. Resend's free tier requires a verified
 * domain to send to anyone except yourself.
 */
async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string[];
  subject: string;
  html: string;
}): Promise<{ sent: boolean; reason?: string; via?: "gmail" | "resend" }> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (gmailUser && gmailPass) {
    try {
      const transport = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
      });
      const info = await transport.sendMail({
        from: process.env.ALERT_FROM_EMAIL || `Nilakaaval <${gmailUser}>`,
        to,
        subject,
        html,
      });
      console.log(
        `[notify] gmail ok messageId=${info.messageId} → ${to.join(", ")}`,
      );
      return { sent: true, via: "gmail" };
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[notify] gmail send failed:", msg);
      return { sent: false, reason: `gmail: ${msg}`, via: "gmail" };
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const from =
      process.env.ALERT_FROM_EMAIL || "Nilakaaval <onboarding@resend.dev>";
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(
          `[notify] resend rejected ${res.status} from=${from} to=${to.join(",")} body=${body}`,
        );
        return {
          sent: false,
          reason: `resend ${res.status}: ${body.slice(0, 200)}`,
          via: "resend",
        };
      }
      console.log(`[notify] resend ok → ${to.join(", ")}`);
      return { sent: true, via: "resend" };
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[notify] resend fetch failed:", msg);
      return { sent: false, reason: `network: ${msg}`, via: "resend" };
    }
  }

  console.log(
    `[notify] no email backend configured (set GMAIL_USER+GMAIL_APP_PASSWORD or RESEND_API_KEY); would have emailed ${to.join(", ")}`,
  );
  return { sent: false, reason: "no email backend configured" };
}

export async function sendAlertEmail(
  ctx: AlertEmailContext,
): Promise<SendOutcome> {
  if (ctx.recipients.length === 0) {
    console.log(
      "[notify] no recipients — alert created but no one to email. Add one under Settings → Alert recipients.",
    );
    return { sent: false, reason: "no recipients", recipients: [] };
  }

  const subject = `[${ctx.severity.toUpperCase()}] Possible change at ${ctx.parcelName}`;
  const scorePct = (ctx.changeScore * 100).toFixed(1);
  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden">
    <div style="background:#0d6e54;color:#fff;padding:16px 20px">
      <div style="font-size:12px;opacity:.85">Nilakaaval — Land Guard</div>
      <div style="font-size:18px;font-weight:600;margin-top:2px">Possible change detected</div>
    </div>
    <div style="padding:20px">
      <p style="margin:0 0 12px"><strong>${escapeHtml(ctx.parcelName)}</strong><br/>
      <span style="color:#475569;font-size:13px">${escapeHtml(ctx.parcelLocation)}</span></p>
      <p style="margin:0 0 16px;font-size:14px">
        Change score: <strong>${scorePct}%</strong><br/>
        Severity: <strong style="color:${ctx.severity === "high" ? "#b91c1c" : ctx.severity === "medium" ? "#b45309" : "#0f172a"}">${ctx.severity}</strong>
      </p>
      ${
        ctx.diffImageUrl
          ? `<img src="${ctx.diffImageUrl}" alt="Change visualization" style="display:block;width:100%;max-width:520px;border-radius:6px;border:1px solid #cbd5e1"/>`
          : ""
      }
      <p style="margin:20px 0 0">
        <a href="${ctx.parcelLink}" style="display:inline-block;background:#0d6e54;color:#fff;text-decoration:none;font-weight:500;padding:10px 18px;border-radius:6px">Review in Nilakaaval →</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#64748b">
        This is an automated alert. Verify before acting on it — the system
        flags pixel-level changes which may include cloud cover, lighting
        differences, or imagery refresh artefacts in addition to genuine
        construction.
      </p>
    </div>
  </div>
</body></html>`;

  const r = await sendEmail({ to: ctx.recipients, subject, html });
  return { ...r, recipients: ctx.recipients };
}

/** One-shot test email — Settings → Send test. */
export async function sendTestEmail(
  to: string,
): Promise<{ sent: boolean; reason?: string; via?: "gmail" | "resend" }> {
  return sendEmail({
    to: [to],
    subject: "Nilakaaval — test email",
    html: `<p>This is a test email from Nilakaaval.</p><p>If you received this, alert delivery is working.</p>`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
