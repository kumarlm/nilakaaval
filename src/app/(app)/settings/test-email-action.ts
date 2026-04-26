"use server";

import { createClient } from "@/lib/supabase/server";
import { sendTestEmail } from "@/lib/notify";

export async function sendTestEmailAction(
  to: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "not configured" };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const target = (to || user.email || "").trim();
  if (!target) return { ok: false, error: "no recipient address" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
    return { ok: false, error: "invalid email" };
  }

  const r = await sendTestEmail(target);
  if (!r.sent) return { ok: false, error: r.reason ?? "send failed" };
  return { ok: true };
}
