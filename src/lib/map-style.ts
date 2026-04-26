import type { StyleSpecification } from "maplibre-gl";

// Esri World Imagery — free public tiles, no API key required.
// Attribution required: "Esri, Maxar, Earthstar Geographics, and the GIS User Community".
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Carto Voyager labels — vector-ish raster fallback that overlays place / road
// names so the satellite imagery is actually navigable.
const CARTO_LABELS =
  "https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png";

export function satelliteStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      sat: {
        type: "raster",
        tiles: [ESRI_IMAGERY],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          "Imagery © Esri, Maxar, Earthstar Geographics · Labels © Carto, OSM",
      },
      labels: {
        type: "raster",
        tiles: [CARTO_LABELS.replace("{a-d}", "a")],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      { id: "sat", type: "raster", source: "sat" },
      { id: "labels", type: "raster", source: "labels", paint: { "raster-opacity": 0.9 } },
    ],
  };
}

export function streetsStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}
