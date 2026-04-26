import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bakeContextImage } from "@/lib/context-bake";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const r = await bakeContextImage(id);
  if (!r.ok) {
    return NextResponse.json({ error: r.reason }, { status: 502 });
  }
  return NextResponse.json(r);
}
