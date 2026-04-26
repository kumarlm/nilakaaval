import "server-only";
import sharp from "sharp";

export type DiffResult = {
  score: number;          // 0..1 — mean RGB diff inside the polygon mask
  maskedFraction: number; // fraction of pixels considered (inside polygon)
  diffPng: Buffer;        // visualization: after image with red heatmap overlay
  width: number;
  height: number;
};

/**
 * Build a single-channel binary mask buffer where pixels INSIDE the polygon
 * are 255 and outside are 0. Polygon coordinates are lng/lat; the bbox is
 * the same lng/lat extent the imagery covers; output is sized to width×height.
 */
async function rasterizePolygonMask(
  poly: GeoJSON.Polygon,
  bbox: [number, number, number, number],
  width: number,
  height: number,
): Promise<Buffer> {
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
    <rect width="${width}" height="${height}" fill="black"/>
    <polygon points="${points}" fill="white"/>
  </svg>`;
  return sharp(Buffer.from(svg))
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
}

export type DiffInput = {
  before: Buffer;
  after: Buffer;
  /** If both polygon and bbox are provided, the diff is masked to the polygon. */
  polygon?: GeoJSON.Polygon;
  bbox?: [number, number, number, number];
};

export async function diffSnapshots(input: DiffInput): Promise<DiffResult> {
  const { before, after, polygon, bbox } = input;

  // Use the BEFORE image's dimensions as the reference. After is resized to
  // match — it almost always already matches because both come from the same
  // bbox via stitchSatellite, but we don't want sharp's composite to fail on
  // a 1-pixel rounding difference.
  const beforeMeta = await sharp(before).metadata();
  const W = beforeMeta.width ?? 0;
  const H = beforeMeta.height ?? 0;
  if (!W || !H) throw new Error("invalid before image");

  const beforeRgb = await sharp(before)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const afterRgb = await sharp(after)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  const mask =
    polygon && bbox ? await rasterizePolygonMask(polygon, bbox, W, H) : null;

  const numPixels = W * H;
  const heatRgba = Buffer.alloc(numPixels * 4);
  let totalChange = 0;
  let counted = 0;

  for (let i = 0; i < numPixels; i++) {
    const j = i * 3;
    const dr = Math.abs(beforeRgb[j] - afterRgb[j]);
    const dg = Math.abs(beforeRgb[j + 1] - afterRgb[j + 1]);
    const db = Math.abs(beforeRgb[j + 2] - afterRgb[j + 2]);
    const d = (dr + dg + db) / 3; // 0..255

    const inMask = mask ? mask[i] > 128 : true;
    if (inMask) {
      totalChange += d;
      counted++;
    }

    // Visualization — red overlay only inside the mask.
    const k = i * 4;
    heatRgba[k] = 255;       // R
    heatRgba[k + 1] = 50;    // G (slightly orange so it's visible on green)
    heatRgba[k + 2] = 50;    // B
    heatRgba[k + 3] = inMask ? Math.min(255, Math.round(d * 1.6)) : 0;
  }

  const meanDiff = counted > 0 ? totalChange / counted : 0;
  const score = meanDiff / 255;

  const heatPng = await sharp(heatRgba, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png()
    .toBuffer();

  // Composite the heatmap onto the after-image as the visualization.
  const afterPng = await sharp(after)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .png()
    .toBuffer();

  const diffPng = await sharp(afterPng)
    .composite([{ input: heatPng, top: 0, left: 0 }])
    .png({ compressionLevel: 8 })
    .toBuffer();

  return {
    score,
    maskedFraction: counted / numPixels,
    diffPng,
    width: W,
    height: H,
  };
}

export function severityFor(score: number): "low" | "medium" | "high" | null {
  if (score < 0.05) return null;
  if (score < 0.10) return "low";
  if (score < 0.20) return "medium";
  return "high";
}
