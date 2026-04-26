-- Cached high-resolution satellite image of the parcel (sourced from
-- MapTiler; visual reference only, not used for change detection).
alter table public.parcels
  add column if not exists context_image_url text;
