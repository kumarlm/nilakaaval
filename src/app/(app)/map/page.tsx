import { createClient } from "@/lib/supabase/server";
import MapClient from "./map-client";

export default async function MapPage() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .maybeSingle();

  const { data: parcels } = await supabase
    .from("parcels")
    .select("id, name, district, taluk, village, restriction_type, geom")
    .eq("status", "active");

  return (
    <MapClient
      isAuthority={profile?.role === "authority"}
      initialParcels={parcels ?? []}
    />
  );
}
