import "server-only";
import sharp from "sharp";

// MapTiler's `satellite-v2` source returns 512×512 tiles by default; older
// docs / other providers use 256. We probe the first tile and use whatever it
// actually returns instead of hardcoding either.
const MAPTILER_TPL = (z: number, x: number, y: number, key: string) =>
  `https://api.maptiler.com/tiles/satellite-v2/${z}/${x}/${y}.jpg?key=${key}`;

// Web Mercator tile coords (XYZ scheme), with sub-tile precision.
function lngLatToTile(lng: number, lat: number, zoom: number) {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/**
 * Pick a zoom level that yields a roughly 1024–2048 px wide stitch for the
 * given bbox at this latitude. Caps the zoom so we never request hundreds of
 * tiles.
 */
function chooseZoom(bbox: [number, number, number, number]): number {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2;
  const widthM =
    (maxLng - minLng) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  // pixel size at zoom z, lat L = 156543.03 * cos(L) / 2^z m/px
  // We target ~1.5 m/px (similar to Esri/MapTiler's native sat clarity at z18).
  const targetPxPerM = 1 / 1.5;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  // Solve for zoom so widthM * targetPxPerM ≈ tile pixels covering bbox.
  // Approximation: pxPerM = 2^z / (156543.03 * cos(lat))
  const z = Math.log2((1 / 1.5) * 156543.03 * cosLat);
  return Math.max(15, Math.min(19, Math.round(z)));
  // suppress unused-var warning when building
  void widthM;
  void targetPxPerM;
}

export type Bbox = [number, number, number, number];

/**
 * Tight bbox for visual context: enough padding to show the parcel in
 * surroundings, but the parcel itself dominates the frame. No 500 m minimum
 * — tiny parcels stay tiny but they're the focus.
 */
export function bboxForContext(
  poly: GeoJSON.Polygon,
  paddingPct = 0.5,
): Bbox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of poly.coordinates[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cosLat = Math.cos((cy * Math.PI) / 180);

  // Padding in degrees from the polygon extents.
  let halfX = (maxX - minX) / 2 + (maxX - minX) * paddingPct;
  let halfY = (maxY - minY) / 2 + (maxY - minY) * paddingPct;

  // Tiny floor — 30 m total side — so a 0-area degenerate input doesn't break.
  const minHalfXDeg = 15 / (111_320 * cosLat);
  const minHalfYDeg = 15 / 110_540;
  if (halfX < minHalfXDeg) halfX = minHalfXDeg;
  if (halfY < minHalfYDeg) halfY = minHalfYDeg;

  // Square the bbox at the center so the output isn't lopsided in latitude.
  const half = Math.max(halfX, halfY);
  // halfX / halfY are in degrees but on different ground scales. Convert
  // both to metres and equalise.
  const halfXm = halfX * 111_320 * cosLat;
  const halfYm = halfY * 110_540;
  const halfM = Math.max(halfXm, halfYm);
  halfX = halfM / (111_320 * cosLat);
  halfY = halfM / 110_540;
  void half;

  return [cx - halfX, cy - halfY, cx + halfX, cy + halfY];
}

/**
 * SVG overlay drawing the polygon outline within a given bbox. Returned as a
 * Buffer ready for sharp.composite().
 */
export function polygonOverlaySvg(
  poly: GeoJSON.Polygon,
  bbox: Bbox,
  width: number,
  height: number,
): Buffer {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const w = maxLng - minLng;
  const h = maxLat - minLat;
  const points = poly.coordinates[0]
    .map(([x, y]) => {
      const px = ((x - minLng) / w) * width;
      const py = ((maxLat - y) / h) * height;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <polygon points="${points}"
             fill="rgba(239,68,68,0.18)"
             stroke="#fca5a5"
             stroke-width="3"
             stroke-linejoin="round" />
  </svg>`;
  return Buffer.from(svg);
}

export async function stitchSatellite(
  bbox: Bbox,
  opts: { zoom?: number; overlay?: GeoJSON.Polygon } = {},
): Promise<{ png: Buffer; width: number; height: number; zoom: number }> {
  const key = process.env.MAPTILER_API_KEY;
  if (!key) throw new Error("MAPTILER_API_KEY not set");

  const zoom = opts.zoom ?? chooseZoom(bbox);
  const [minLng, minLat, maxLng, maxLat] = bbox;

  // top-left = (minLng, maxLat), bottom-right = (maxLng, minLat)
  const tl = lngLatToTile(minLng, maxLat, zoom);
  const br = lngLatToTile(maxLng, minLat, zoom);

  const tileX0 = Math.floor(tl.x);
  const tileY0 = Math.floor(tl.y);
  const tileX1 = Math.floor(br.x);
  const tileY1 = Math.floor(br.y);

  const numX = tileX1 - tileX0 + 1;
  const numY = tileY1 - tileY0 + 1;

  if (numX * numY > 64) {
    throw new Error(
      `Bbox too large for stitcher at zoom ${zoom} (would need ${numX * numY} tiles)`,
    );
  }

  const rawBuffers = await Promise.all(
    Array.from({ length: numX * numY }, async (_, i) => {
      const dx = i % numX;
      const dy = Math.floor(i / numX);
      const url = MAPTILER_TPL(zoom, tileX0 + dx, tileY0 + dy, key);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Tile fetch failed: ${zoom}/${tileX0 + dx}/${tileY0 + dy} → ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    }),
  );

  // Normalize every tile to a known fixed pixel size so we can lay them out
  // on a deterministic canvas. MapTiler returns 512×512 for satellite-v2;
  // this resize is a no-op in that case but defensive against any tile that
  // comes back differently sized.
  const TILE_PX = 512;
  const tiles = await Promise.all(
    rawBuffers.map((buf) =>
      sharp(buf)
        .resize(TILE_PX, TILE_PX, { fit: "fill" })
        .removeAlpha()
        .png()
        .toBuffer(),
    ),
  );

  const composite = tiles.map((input, i) => ({
    input,
    left: (i % numX) * TILE_PX,
    top: Math.floor(i / numX) * TILE_PX,
  }));

  const fullWidth = numX * TILE_PX;
  const fullHeight = numY * TILE_PX;

  // Sub-tile crop so the final image matches the bbox exactly (not just
  // tile-aligned).
  const cropLeft = Math.max(0, Math.round((tl.x - tileX0) * TILE_PX));
  const cropTop = Math.max(0, Math.round((tl.y - tileY0) * TILE_PX));
  const cropWidth = Math.min(
    fullWidth - cropLeft,
    Math.max(1, Math.round((br.x - tl.x) * TILE_PX)),
  );
  const cropHeight = Math.min(
    fullHeight - cropTop,
    Math.max(1, Math.round((br.y - tl.y) * TILE_PX)),
  );

  // Step 1: composite tiles onto canvas, save full stitched buffer.
  const stitched = await sharp({
    create: {
      width: fullWidth,
      height: fullHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composite)
    .png()
    .toBuffer();

  // Step 2: crop to the bbox.
  const cropped = await sharp(stitched)
    .extract({
      left: cropLeft,
      top: cropTop,
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();

  // Read back the actual size of the cropped buffer — sharp rounds in some
  // edge cases, so we trust the metadata over the values we asked for.
  const croppedMeta = await sharp(cropped).metadata();
  const finalW = croppedMeta.width ?? cropWidth;
  const finalH = croppedMeta.height ?? cropHeight;

  // Step 3 (optional): rasterize the polygon overlay to the exact final
  // dimensions and composite on top.
  let png = cropped;
  if (opts.overlay) {
    const svg = polygonOverlaySvg(opts.overlay, bbox, finalW, finalH);
    const overlayRaster = await sharp(svg)
      .resize(finalW, finalH, { fit: "fill" })
      .png()
      .toBuffer();
    png = await sharp(cropped)
      .composite([{ input: overlayRaster, top: 0, left: 0 }])
      .png({ compressionLevel: 8 })
      .toBuffer();
  } else {
    png = await sharp(cropped).png({ compressionLevel: 8 }).toBuffer();
  }

  return { png, width: finalW, height: finalH, zoom };
}
