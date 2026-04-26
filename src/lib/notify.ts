import "server-only";

export type AlertEmailContext = {
  recipients: string[];
  parcelName: string;
  parcelLocation: string;
  parcelLink: string;
  changeScore: number;
  severity: "low" | "medium" | "high";
  diffImageUrl?: string;
};

export async function sendAlertEmail(
  ctx: AlertEmailContext,
): Promise<{ sent: boolean; reason?: string }> {
  if (ctx.recipients.length === 0) return { sent: false, reason: "no recipients" };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev fallback — log so the developer can still test the trigger flow
    // end-to-end without a Resend account.
    console.log(
      `[notify] RESEND_API_KEY not set; would email ${ctx.recipients.join(", ")} about change at ${ctx.parcelName} (score=${(ctx.changeScore * 100).toFixed(1)}%)`,
    );
    return { sent: false, reason: "RESEND_API_KEY not set" };
  }

  const subject = `[${ctx.severity.toUpperCase()}] Possible change at ${ctx.parcelName}`;
  const scorePct = (ctx.changeScore * 100).toFixed(1);
  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;color:#0f172a;background:#f8fafc;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden">
    <div style="background:#0d6e54;color:#fff;padding:16px 20px">
      <div style="font-size:12px;opacity:.85">Nilakaaval — Tamil Nadu Land Guard</div>
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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL || "Nilakaaval <onboarding@resend.dev>",
      to: ctx.recipients,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    return { sent: false, reason: `resend ${res.status}: ${await res.text()}` };
  }
  return { sent: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
