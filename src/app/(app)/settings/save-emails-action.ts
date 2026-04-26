"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function saveNotificationEmails(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  count?: number;
}> {
  const supabase = await createClient();
  if (!supabase) return { ok: false, error: "not configured" };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };

  const raw = String(formData.get("emails") ?? "");
  const emails = raw
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Basic email shape check.
  const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (bad) return { ok: false, error: `invalid email: ${bad}` };

  // De-dupe, preserve order.
  const seen = new Set<string>();
  const unique = emails.filter((e) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const { error } = await supabase
    .from("profiles")
    .update({ notification_emails: unique })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true, count: unique.length };
}
