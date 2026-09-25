import * as turf from "@turf/turf";
import type { Feature } from "geojson";
import type { GeometryType } from "@/src/store/useGeometryStore";

export const TOOL_LABELS: Record<GeometryType, string> = {
  point: "Point",
  polyline: "Line",
  polygon: "Polygon",
  circle: "Circle",
  rectangle: "Rectangle",
};

export const MIN_POINTS: Record<GeometryType, number> = {
  point: 1,
  polyline: 2,
  polygon: 3,
  circle: 2,
  rectangle: 2,
};

export interface BuiltGeometry {
  controlPoints: [number, number][];
  geojson: Feature;
  valid: boolean;
  errors: string[];
  measurement?: string;
}

/**
 * Collapses points closer than ~0.5m together. This is what cleans up the
 * extra vertex a double-click injects: a double-click fires two ordinary
 * click events at nearly the same screen position before the actual
 * double-click handler runs, so the last two points of a finished
 * line/polygon are almost always a near-duplicate pair rather than user intent.
 */
function dedupe(points: [number, number][]): [number, number][] {
  const result: [number, number][] = [];
  for (const p of points) {
    const last = result[result.length - 1];
    if (!last || turf.distance(last, p, { units: "meters" }) > 0.5) {
      result.push(p);
    }
  }
  return result;
}

/**
 * Turns raw click points (as [lon, lat] pairs) into a validated GeoJSON
 * feature. Pure Turf — no Cesium types in or out, so this can run on the
 * server, in a test, or in a tool page that never touches the globe.
 */
export function buildGeometryFeature(
  type: GeometryType,
  rawControlPoints: [number, number][]
): BuiltGeometry {
  const controlPoints = dedupe(rawControlPoints);
  const errors: string[] = [];
  let measurement: string | undefined;
  let geojson: Feature | any;

  if (controlPoints.length < MIN_POINTS[type]) {
    errors.push(
      `Needs at least ${MIN_POINTS[type]} point(s), got ${controlPoints.length}.`
    );
    geojson = turf.point(controlPoints[0] ?? [0, 0]);
    return { controlPoints, geojson, valid: false, errors, measurement };
  }

  if (type === "point") {
    geojson = turf.point(controlPoints[0]);
  } else if (type === "polyline") {
    geojson = turf.lineString(controlPoints);
    const lengthKm = turf.length(geojson, { units: "kilometers" });
    if (lengthKm <= 0) errors.push("Line has zero length.");
    measurement = `${(lengthKm * 1000).toFixed(1)} m`;
  } else if (type === "polygon") {
    const ring = [...controlPoints, controlPoints[0]];
    try {
      geojson = turf.polygon([ring]);
      const kinks = turf.kinks(geojson);
      if (kinks.features.length > 0) {
        errors.push("Polygon edges self-intersect.");
      }
      const areaM2 = turf.area(geojson);
      if (areaM2 <= 0) errors.push("Polygon has zero area.");
      measurement = `${(areaM2 / 1_000_000).toFixed(4)} km²`;
    } catch {
      errors.push("Could not build a valid polygon from these points.");
      geojson = turf.point(controlPoints[0]);
    }
  } else if (type === "circle") {
    const [center, edge] = controlPoints;
    const radiusM = turf.distance(center, edge, { units: "meters" });
    if (radiusM <= 0) errors.push("Circle has zero radius.");
    geojson = turf.circle(center, Math.max(radiusM, 1) / 1000, {
      units: "kilometers",
      steps: 64,
    });
    measurement = `radius ${radiusM.toFixed(1)} m`;
  } else {
    // rectangle
    const [c1, c2] = controlPoints;
    const west = Math.min(c1[0], c2[0]);
    const east = Math.max(c1[0], c2[0]);
    const south = Math.min(c1[1], c2[1]);
    const north = Math.max(c1[1], c2[1]);
    if (west === east || south === north) {
      errors.push("Rectangle has zero width or height.");
    }
    geojson = turf.bboxPolygon([west, south, east, north]);
    const diagonalM = turf.distance(c1, c2, { units: "meters" });
    measurement = `diagonal ${diagonalM.toFixed(1)} m`;
  }

  return { controlPoints, geojson, valid: errors.length === 0, errors, measurement };
}