"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { createClient } from "@/lib/supabase/client";
import { TN_CENTER, TN_DISTRICTS, RESTRICTION_TYPES } from "@/lib/tn-data";
import { satelliteStyle, streetsStyle } from "@/lib/map-style";
import { useRouter } from "next/navigation";

type Parcel = {
  id: string;
  name: string;
  district: string;
  taluk: string;
  village: string;
  restriction_type: string;
  geom: GeoJSON.Polygon;
};

type DrawState = "idle" | "drawing" | "complete";

type LngLat = [number, number];

export default function MapClient({
  isAuthority,
  initialParcels,
}: {
  isAuthority: boolean;
  initialParcels: Parcel[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const router = useRouter();

  // Refs hold "live" values so the map event handlers (registered once on
  // load) can read the latest state without being re-registered.
  const drawStateRef = useRef<DrawState>("idle");
  const verticesRef = useRef<LngLat[]>([]);
  const hoverRef = useRef<LngLat | null>(null);

  const [drawState, setDrawState] = useState<DrawState>("idle");
  const [vertexCount, setVertexCount] = useState(0);
  const [polygon, setPolygon] = useState<GeoJSON.Polygon | null>(null);

  const [form, setForm] = useState<{
    name: string;
    district: string;
    taluk: string;
    village: string;
    survey_no: string;
    restriction_type: string;
    notes: string;
  }>({
    name: "",
    district: TN_DISTRICTS[0],
    taluk: "",
    village: "",
    survey_no: "",
    restriction_type: RESTRICTION_TYPES[0].value,
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<"satellite" | "streets">("satellite");

  const updateDrawSources = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const verts = verticesRef.current;
    const hover = hoverRef.current;

    // Vertex circles.
    (map.getSource("draw-vertices") as maplibregl.GeoJSONSource | undefined)?.setData(
      {
        type: "FeatureCollection",
        features: verts.map((v, i) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: v },
          properties: { idx: i },
        })),
      },
    );

    // Solid line connecting vertices in order.
    const lineCoords = verts.length >= 2 ? verts : [];
    (map.getSource("draw-line") as maplibregl.GeoJSONSource | undefined)?.setData(
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: lineCoords },
        properties: {},
      },
    );

    // Dashed rubber-band: from last vertex → cursor, plus cursor → first vertex
    // (closing hint) once we have ≥ 2 vertices.
    const rubber: LngLat[] = [];
    if (drawStateRef.current === "drawing" && hover && verts.length >= 1) {
      rubber.push(verts[verts.length - 1], hover);
      if (verts.length >= 2) rubber.push(hover, verts[0]);
    }
    (map.getSource("draw-rubber") as maplibregl.GeoJSONSource | undefined)?.setData(
      {
        type: "Feature",
        geometry: {
          type: "MultiLineString",
          coordinates: rubber.length === 2
            ? [rubber]
            : rubber.length === 4
              ? [[rubber[0], rubber[1]], [rubber[2], rubber[3]]]
              : [],
        },
        properties: {},
      },
    );

    // Filled preview polygon (closed) once we have ≥ 3 vertices.
    const fill =
      verts.length >= 3
        ? {
            type: "Feature" as const,
            geometry: {
              type: "Polygon" as const,
              coordinates: [[...verts, verts[0]]],
            },
            properties: {},
          }
        : null;
    (map.getSource("draw-fill") as maplibregl.GeoJSONSource | undefined)?.setData(
      fill ?? { type: "FeatureCollection", features: [] },
    );
  }, []);

  // (Re-)add app-specific sources, layers, and layer-scoped event handlers.
  // Called every time `style.load` fires — i.e. on initial load AND after
  // setStyle, since setStyle wipes all custom sources/layers.
  const addAppLayers = useCallback(
    (map: maplibregl.Map) => {
      map.addSource("parcels", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: initialParcels.map((p) => ({
            type: "Feature",
            geometry: p.geom,
            properties: {
              id: p.id,
              name: p.name,
              restriction_type: p.restriction_type,
            },
          })),
        },
      });
      map.addLayer({
        id: "parcels-fill",
        type: "fill",
        source: "parcels",
        paint: { "fill-color": "#ef4444", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "parcels-outline",
        type: "line",
        source: "parcels",
        paint: { "line-color": "#fca5a5", "line-width": 2 },
      });

      map.on("click", "parcels-fill", (e) => {
        if (drawStateRef.current === "drawing") return;
        const f = e.features?.[0];
        if (!f) return;
        new maplibregl.Popup({ closeButton: true })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-family:inherit"><div style="font-weight:600">${escapeHtml(
              f.properties?.name ?? "",
            )}</div><div style="font-size:12px;color:#475569">${escapeHtml(
              labelFor(String(f.properties?.restriction_type ?? "")),
            )}</div><a href="/parcels/${f.properties?.id}" style="font-size:12px;color:#0d6e54">Open detail →</a></div>`,
          )
          .addTo(map);
      });
      map.on("mouseenter", "parcels-fill", () => {
        if (drawStateRef.current !== "drawing")
          map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "parcels-fill", () => {
        if (drawStateRef.current !== "drawing")
          map.getCanvas().style.cursor = "";
      });

      map.addSource("draw-fill", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "draw-fill",
        type: "fill",
        source: "draw-fill",
        paint: { "fill-color": "#22d3a8", "fill-opacity": 0.25 },
      });
      map.addSource("draw-line", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: "draw-line",
        type: "line",
        source: "draw-line",
        paint: { "line-color": "#22d3a8", "line-width": 2 },
      });
      map.addSource("draw-rubber", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "MultiLineString", coordinates: [] },
          properties: {},
        },
      });
      map.addLayer({
        id: "draw-rubber",
        type: "line",
        source: "draw-rubber",
        paint: {
          "line-color": "#22d3a8",
          "line-width": 1.5,
          "line-dasharray": [2, 2],
          "line-opacity": 0.85,
        },
      });
      map.addSource("draw-vertices", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "draw-vertices",
        type: "circle",
        source: "draw-vertices",
        paint: {
          "circle-radius": 5,
          "circle-color": "#ffffff",
          "circle-stroke-color": "#0d6e54",
          "circle-stroke-width": 2,
        },
      });

      // Restore any in-progress / completed drawing onto the new style.
      updateDrawSources();
    },
    [initialParcels, updateDrawSources],
  );

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: satelliteStyle(),
      center: TN_CENTER,
      zoom: 7,
      doubleClickZoom: false, // we use dblclick to finish a polygon
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    // Map-level event handlers survive setStyle (they're on the map, not on
    // layers), so register them once.
    if (isAuthority) {
      map.on("click", (e) => {
        if (drawStateRef.current !== "drawing") return;
        const pt: LngLat = [e.lngLat.lng, e.lngLat.lat];
        verticesRef.current = [...verticesRef.current, pt];
        setVertexCount(verticesRef.current.length);
        updateDrawSources();
      });
      map.on("mousemove", (e) => {
        if (drawStateRef.current !== "drawing") return;
        hoverRef.current = [e.lngLat.lng, e.lngLat.lat];
        updateDrawSources();
      });
      map.on("dblclick", (e) => {
        if (drawStateRef.current !== "drawing") return;
        e.preventDefault();
        finishDrawing();
      });
    }

    // Re-add custom sources/layers on every style load (initial + setStyle).
    map.on("style.load", () => addAppLayers(map));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialParcels, isAuthority]);

  // Toggle basemap by swapping the entire style. style.load handler re-adds
  // our custom layers automatically.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) return;
    map.setStyle(basemap === "satellite" ? satelliteStyle() : streetsStyle());
  }, [basemap]);

  const startDrawing = useCallback(() => {
    drawStateRef.current = "drawing";
    verticesRef.current = [];
    hoverRef.current = null;
    setDrawState("drawing");
    setVertexCount(0);
    setPolygon(null);
    setError(null);
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "crosshair";
    updateDrawSources();
  }, [updateDrawSources]);

  const cancelDrawing = useCallback(() => {
    drawStateRef.current = "idle";
    verticesRef.current = [];
    hoverRef.current = null;
    setDrawState("idle");
    setVertexCount(0);
    setPolygon(null);
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    updateDrawSources();
  }, [updateDrawSources]);

  const finishDrawing = useCallback(() => {
    if (verticesRef.current.length < 3) return;
    drawStateRef.current = "complete";
    hoverRef.current = null;
    const ring: LngLat[] = [...verticesRef.current, verticesRef.current[0]];
    const poly: GeoJSON.Polygon = { type: "Polygon", coordinates: [ring] };
    setPolygon(poly);
    setDrawState("complete");
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    updateDrawSources();
  }, [updateDrawSources]);

  // Esc cancels, Enter finishes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (drawStateRef.current !== "drawing") return;
      if (e.key === "Escape") cancelDrawing();
      else if (e.key === "Enter") finishDrawing();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancelDrawing, finishDrawing]);

  async function onSave() {
    if (!polygon) return;
    setSaving(true);
    setError(null);
    let supabase;
    try {
      supabase = createClient();
    } catch (e) {
      setSaving(false);
      setError((e as Error).message);
      return;
    }
    const { error } = await supabase.from("parcels").insert({
      ...form,
      geom: polygon,
      area_hectares: approxHectares(polygon),
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    cancelDrawing();
    setForm({
      name: "",
      district: TN_DISTRICTS[0],
      taluk: "",
      village: "",
      survey_no: "",
      restriction_type: RESTRICTION_TYPES[0].value,
      notes: "",
    });
    router.refresh();
  }

  return (
    <div className="flex-1 flex">
      <div className="flex-1 relative" ref={containerRef}>
        {drawState === "drawing" && (
          <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded bg-[var(--foreground)] px-3 py-1.5 text-xs text-[var(--background)] shadow">
            Click to add a vertex · Double-click or Enter to finish · Esc to cancel
          </div>
        )}
        <div className="absolute bottom-3 left-3 z-10 flex rounded-md overflow-hidden border border-[var(--border)] bg-[var(--background)] shadow-sm text-xs font-medium">
          <BasemapBtn
            active={basemap === "satellite"}
            onClick={() => setBasemap("satellite")}
          >
            Satellite
          </BasemapBtn>
          <BasemapBtn
            active={basemap === "streets"}
            onClick={() => setBasemap("streets")}
          >
            Streets
          </BasemapBtn>
        </div>
      </div>

      {isAuthority ? (
        <aside className="w-96 border-l border-[var(--border)] bg-[var(--background)] overflow-y-auto">
          <div className="p-5 border-b border-[var(--border)]">
            <h2 className="font-semibold">Mark restricted area</h2>
            <p className="mt-1 text-sm text-[var(--muted-fg)]">
              Start drawing, then click points on the map to define the parcel
              boundary.
            </p>
          </div>

          <div className="p-5 space-y-4">
            <DrawControls
              state={drawState}
              vertexCount={vertexCount}
              polygon={polygon}
              onStart={startDrawing}
              onFinish={finishDrawing}
              onCancel={cancelDrawing}
            />

            <Field label="Name" required>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="e.g. Anaikatti Reserved Forest — block A"
              />
            </Field>

            <Field label="Restriction type" required>
              <select
                value={form.restriction_type}
                onChange={(e) =>
                  setForm({ ...form, restriction_type: e.target.value })
                }
                className={inputCls}
              >
                {RESTRICTION_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="District" required>
                <select
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  className={inputCls}
                >
                  {TN_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Taluk" required>
                <input
                  value={form.taluk}
                  onChange={(e) => setForm({ ...form, taluk: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Village" required>
                <input
                  value={form.village}
                  onChange={(e) => setForm({ ...form, village: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="Survey no.">
                <input
                  value={form.survey_no}
                  onChange={(e) => setForm({ ...form, survey_no: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. 142/3B"
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className={inputCls}
                rows={3}
              />
            </Field>

            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

            <button
              disabled={
                !polygon ||
                !form.name ||
                !form.taluk ||
                !form.village ||
                saving
              }
              onClick={onSave}
              className="w-full rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save restricted parcel"}
            </button>
          </div>
        </aside>
      ) : (
        <aside className="w-80 border-l border-[var(--border)] bg-[var(--background)] p-5">
          <h2 className="font-semibold">Viewer mode</h2>
          <p className="mt-2 text-sm text-[var(--muted-fg)]">
            You don&apos;t have authority to mark restricted areas. Existing
            parcels are visible on the map. Contact your district admin to be
            granted the <code>authority</code> role.
          </p>
        </aside>
      )}
    </div>
  );
}

function BasemapBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 ${
        active
          ? "bg-[var(--primary)] text-[var(--primary-fg)]"
          : "hover:bg-[var(--muted)]"
      }`}
    >
      {children}
    </button>
  );
}

function DrawControls({
  state,
  vertexCount,
  polygon,
  onStart,
  onFinish,
  onCancel,
}: {
  state: DrawState;
  vertexCount: number;
  polygon: GeoJSON.Polygon | null;
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  if (state === "idle") {
    return (
      <button
        onClick={onStart}
        className="w-full rounded border border-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)] hover:text-[var(--primary-fg)]"
      >
        ✏ Start drawing polygon
      </button>
    );
  }
  if (state === "drawing") {
    return (
      <div className="space-y-2">
        <div className="rounded bg-amber-100 px-3 py-2 text-xs text-amber-900">
          → Click points on the map. {vertexCount} {vertexCount === 1 ? "vertex" : "vertices"} so far.
          {vertexCount >= 3 && " Double-click or press Enter to finish."}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onFinish}
            disabled={vertexCount < 3}
            className="flex-1 rounded bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-fg)] disabled:opacity-50"
          >
            Finish
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  // complete
  return (
    <div className="space-y-2">
      <div className="rounded bg-emerald-100 px-3 py-2 text-xs text-emerald-900">
        ✓ Polygon ready · ~{polygon ? approxHectares(polygon).toFixed(2) : "0"} ha
      </div>
      <button
        onClick={onCancel}
        className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm"
      >
        Clear &amp; redraw
      </button>
    </div>
  );
}

const inputCls =
  "mt-1 block w-full rounded border border-[var(--border)] bg-transparent px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--muted-fg)]">
        {label}
        {required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function labelFor(value: string) {
  return RESTRICTION_TYPES.find((r) => r.value === value)?.label ?? value;
}

// Spherical-excess area approximation good enough for sub-100 ha parcels.
function approxHectares(poly: GeoJSON.Polygon): number {
  const ring = poly.coordinates[0];
  if (!ring || ring.length < 4) return 0;
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    area +=
      ((lng2 - lng1) * Math.PI) / 180 *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  area = (area * R * R) / 2;
  return Math.abs(area) / 10_000;
}
