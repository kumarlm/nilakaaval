// ─────────────────────────────────────────────────────────────────────────
// Sentinel Hub integration is currently DISABLED.
//
// We switched the scan pipeline to MapTiler (see src/lib/tile-stitcher.ts +
// src/lib/scan.ts) for sub-meter visuals. The code below is preserved as a
// reference / future option — Sentinel-2's dated, scientifically-grounded
// imagery is still the right answer if you want a proper reproducible
// change-detection signal.
//
// To re-enable:
//   1. Uncomment the block below.
//   2. Set SENTINEL_HUB_CLIENT_ID / SENTINEL_HUB_CLIENT_SECRET in env.
//   3. Switch scan.ts back to import bboxFromPolygon + fetchTrueColor from here.
// ─────────────────────────────────────────────────────────────────────────

export {};

/*
import "server-only";

// Copernicus Data Space Sentinel Hub endpoints (free tier).
const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process";

type Token = { access_token: string; expires_at: number };
let cached: Token | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expires_at > now + 30_000) return cached.access_token;

  const id = process.env.SENTINEL_HUB_CLIENT_ID;
  const secret = process.env.SENTINEL_HUB_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      "SENTINEL_HUB_CLIENT_ID / SENTINEL_HUB_CLIENT_SECRET not set",
    );
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Sentinel Hub auth failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    access_token: json.access_token,
    expires_at: now + json.expires_in * 1000,
  };
  return cached.access_token;
}

export type Bbox = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

const MIN_SIDE_M = 500;

export function bboxFromPolygon(poly: GeoJSON.Polygon, paddingPct = 0.2): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly.coordinates[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cosLat = Math.cos((cy * Math.PI) / 180);
  let halfX = (maxX - minX) / 2 + (maxX - minX) * paddingPct;
  let halfY = (maxY - minY) / 2 + (maxY - minY) * paddingPct;
  const minHalfXDeg = MIN_SIDE_M / 2 / (111_320 * cosLat);
  const minHalfYDeg = MIN_SIDE_M / 2 / 110_540;
  if (halfX < minHalfXDeg) halfX = minHalfXDeg;
  if (halfY < minHalfYDeg) halfY = minHalfYDeg;
  return [cx - halfX, cy - halfY, cx + halfX, cy + halfY];
}

function dimsFromBbox(bbox: Bbox): { width: number; height: number } {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2;
  const widthM = (maxLng - minLng) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  const heightM = (maxLat - minLat) * 110_540;
  const clamp = (v: number) => Math.max(256, Math.min(1024, Math.round(v / 5)));
  return { width: clamp(widthM), height: clamp(heightM) };
}

const TRUE_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02","B03","B04","CLM"] }],
    output: { bands: 3, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  const g = 2.5;
  return [g*s.B04, g*s.B03, g*s.B02];
}`;

export type FetchedImage = {
  png: ArrayBuffer;
  width: number;
  height: number;
  bbox: Bbox;
};

export async function fetchTrueColor(
  bbox: Bbox,
  opts: { lookbackDays?: number; maxCloud?: number } = {},
): Promise<FetchedImage> {
  const lookbackDays = opts.lookbackDays ?? 30;
  const maxCloud = opts.maxCloud ?? 30;
  const { width, height } = dimsFromBbox(bbox);
  const to = new Date();
  const from = new Date(to.getTime() - lookbackDays * 24 * 3600 * 1000);

  const token = await getToken();
  const res = await fetch(PROCESS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({
      input: {
        bounds: {
          bbox,
          properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" },
        },
        data: [
          {
            type: "sentinel-2-l2a",
            dataFilter: {
              timeRange: { from: from.toISOString(), to: to.toISOString() },
              maxCloudCoverage: maxCloud,
              mosaickingOrder: "leastCC",
            },
          },
        ],
      },
      output: {
        width,
        height,
        responses: [{ identifier: "default", format: { type: "image/png" } }],
      },
      evalscript: TRUE_COLOR_EVALSCRIPT,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sentinel Hub process failed: ${res.status} ${text}`);
  }

  const png = await res.arrayBuffer();
  return { png, width, height, bbox };
}
*/
