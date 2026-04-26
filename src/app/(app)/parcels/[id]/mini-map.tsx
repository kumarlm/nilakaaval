"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { satelliteStyle } from "@/lib/map-style";

export default function ParcelMiniMap({ geom }: { geom: GeoJSON.Polygon }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: satelliteStyle(),
      center: centroid(geom),
      zoom: 14,
      interactive: true,
    });

    map.on("load", () => {
      map.addSource("p", {
        type: "geojson",
        data: { type: "Feature", geometry: geom, properties: {} },
      });
      map.addLayer({
        id: "fill",
        type: "fill",
        source: "p",
        paint: { "fill-color": "#ef4444", "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "line",
        type: "line",
        source: "p",
        paint: { "line-color": "#fca5a5", "line-width": 2 },
      });
      map.fitBounds(bbox(geom), { padding: 30, animate: false });
    });

    return () => map.remove();
  }, [geom]);

  return <div ref={containerRef} className="h-72 w-full" />;
}

function centroid(geom: GeoJSON.Polygon): [number, number] {
  const ring = geom.coordinates[0];
  let lng = 0,
    lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return [lng / ring.length, lat / ring.length];
}

function bbox(geom: GeoJSON.Polygon): [[number, number], [number, number]] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of geom.coordinates[0]) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [[minX, minY], [maxX, maxY]];
}
