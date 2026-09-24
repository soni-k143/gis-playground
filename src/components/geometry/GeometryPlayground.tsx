"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as turf from "@turf/turf";

type GeometryType = "point" | "polyline" | "polygon" | "circle" | "rectangle";

interface DrawnFeature {
  id: string;
  type: GeometryType;
  positions: import("cesium").Cartesian3[]; // raw click points (control points)
  valid: boolean;
  errors: string[];
  measurement?: string;
}

const ACCENT = "#00c4a1";

const TOOL_LABELS: Record<GeometryType, string> = {
  point: "Point",
  polyline: "Line",
  polygon: "Polygon",
  circle: "Circle",
  rectangle: "Rectangle",
};

const MIN_POINTS: Record<GeometryType, number> = {
  point: 1,
  polyline: 2,
  polygon: 3,
  circle: 2,
  rectangle: 2,
};

export default function GeometryPlayground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const handlerRef = useRef<import("cesium").ScreenSpaceEventHandler | null>(null);
  const cesiumRef = useRef<typeof import("cesium") | null>(null);
  const idCounterRef = useRef(0);
  const mousePositionRef = useRef<import("cesium").Cartesian3 | null>(null);
  const previewEntityRef = useRef<import("cesium").Entity | null>(null);

  const [activeTool, setActiveTool] = useState<GeometryType | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<
    import("cesium").Cartesian3[]
  >([]);
  const [features, setFeatures] = useState<DrawnFeature[]>([]);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const drawingPointsRef = useRef(drawingPoints);
  drawingPointsRef.current = drawingPoints;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  // ---------- Viewer bootstrap (Strict-Mode safe) ----------
  useEffect(() => {
    let cancelled = false;
    let localViewer: import("cesium").Viewer | undefined;

    const initialize = async () => {
      const Cesium = await import("cesium");

      if (cancelled) return; // unmounted before import resolved — do nothing

      Cesium.Ion.defaultAccessToken =
        process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

      if (!containerRef.current) return;

      localViewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
      });

      cesiumRef.current = Cesium;
      viewerRef.current = localViewer;

      localViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(77.209, 28.6139, 1500000),
      });

      localViewer.scene.requestRender();
    };

    initialize().catch((error) => {
      console.error("Cesium initialization failed:", error);
    });

    return () => {
      cancelled = true;
      handlerRef.current?.destroy();
      handlerRef.current = null;
      previewEntityRef.current = null;
      localViewer?.destroy();
      if (viewerRef.current === localViewer) {
        viewerRef.current = null;
      }
    };
  }, []);

  // ---------- Helpers ----------
  const cartesianToLonLat = useCallback(
    (c: import("cesium").Cartesian3): [number, number] => {
      const Cesium = cesiumRef.current!;
      const carto = Cesium.Cartographic.fromCartesian(c);
      return [
        Cesium.Math.toDegrees(carto.longitude),
        Cesium.Math.toDegrees(carto.latitude),
      ];
    },
    []
  );

  const geodesicDistance = useCallback(
    (a: import("cesium").Cartesian3, b: import("cesium").Cartesian3) => {
      const Cesium = cesiumRef.current!;
      const cartoA = Cesium.Cartographic.fromCartesian(a);
      const cartoB = Cesium.Cartographic.fromCartesian(b);
      const geodesic = new Cesium.EllipsoidGeodesic(cartoA, cartoB);
      return geodesic.surfaceDistance; // meters
    },
    []
  );

  // Collapses consecutive points closer than ~0.5m together. This is what
  // cleans up the extra vertex a double-click injects (a double-click fires
  // two ordinary LEFT_CLICK events at nearly the same screen position before
  // the LEFT_DOUBLE_CLICK handler ever runs), so it's applied unconditionally
  // rather than treated as a validation error.
  const dedupePositions = useCallback(
    (positions: import("cesium").Cartesian3[]) => {
      const Cesium = cesiumRef.current!;
      const result: import("cesium").Cartesian3[] = [];
      for (const p of positions) {
        const last = result[result.length - 1];
        if (!last || Cesium.Cartesian3.distance(last, p) > 0.5) {
          result.push(p);
        }
      }
      return result;
    },
    []
  );

  // Adds exactly one feature's entity, tagged with the feature's id so it
  // can be removed individually later. We deliberately never do a full
  // removeAll()+rebuild on every change: ground-clamped polylines use
  // GroundPolylinePrimitive under the hood, which rebatches asynchronously,
  // so tearing one down and recreating it (even when it didn't change)
  // produces a visible blink while it rebuilds.
  const addFeatureEntity = useCallback(
    (f: DrawnFeature) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return;

      const color = f.valid
        ? Cesium.Color.fromCssColorString(ACCENT)
        : Cesium.Color.fromCssColorString("#ef4444");

      if (f.type === "point") {
        viewer.entities.add({
          id: f.id,
          position: f.positions[0],
          point: {
            pixelSize: 14,
            color,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
          },
        });
      } else if (f.type === "polyline") {
        viewer.entities.add({
          id: f.id,
          polyline: {
            positions: f.positions,
            width: 4,
            material: color,
            clampToGround: true,
          },
        });
      } else if (f.type === "polygon") {
        viewer.entities.add({
          id: f.id,
          polygon: {
            hierarchy: f.positions,
            material: color.withAlpha(0.35),
            outline: true,
            outlineColor: color,
          },
        });
      } else if (f.type === "circle") {
        const radius = geodesicDistance(f.positions[0], f.positions[1]);
        viewer.entities.add({
          id: f.id,
          position: f.positions[0],
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: color.withAlpha(0.35),
            outline: true,
            outlineColor: color,
          },
        });
      } else if (f.type === "rectangle") {
        const [lon1, lat1] = cartesianToLonLat(f.positions[0]);
        const [lon2, lat2] = cartesianToLonLat(f.positions[1]);
        const rect = Cesium.Rectangle.fromDegrees(
          Math.min(lon1, lon2),
          Math.min(lat1, lat2),
          Math.max(lon1, lon2),
          Math.max(lat1, lat2)
        );
        viewer.entities.add({
          id: f.id,
          rectangle: {
            coordinates: rect,
            material: color.withAlpha(0.35),
            outline: true,
            outlineColor: color,
          },
        });
      }

      viewer.scene.requestRender();
    },
    [cartesianToLonLat, geodesicDistance]
  );

  const removeFeatureEntity = useCallback((id: string) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.entities.removeById(id);
    viewer.scene.requestRender();
  }, []);

  // ---------- Validation ----------
  const validateFeature = useCallback(
    (
      type: GeometryType,
      positions: import("cesium").Cartesian3[]
    ): { valid: boolean; errors: string[]; measurement?: string } => {
      const errors: string[] = [];
      let measurement: string | undefined;

      if (positions.length < MIN_POINTS[type]) {
        errors.push(
          `Needs at least ${MIN_POINTS[type]} point(s), got ${positions.length}.`
        );
        return { valid: false, errors };
      }

      if (type === "point") {
        // Always valid once we have 1 point
      } else if (type === "polyline") {
        const lonLat = positions.map(cartesianToLonLat);
        const line = turf.lineString(lonLat);
        const lengthKm = turf.length(line, { units: "kilometers" });
        if (lengthKm <= 0) errors.push("Line has zero length.");
        measurement = `${(lengthKm * 1000).toFixed(1)} m`;
      } else if (type === "polygon") {
        const lonLat = positions.map(cartesianToLonLat);
        const ring = [...lonLat, lonLat[0]]; // close the ring
        try {
          const poly = turf.polygon([ring]);
          const kinks = turf.kinks(poly);
          if (kinks.features.length > 0) {
            errors.push("Polygon edges self-intersect.");
          }
          const areaM2 = turf.area(poly);
          if (areaM2 <= 0) errors.push("Polygon has zero area.");
          measurement = `${(areaM2 / 1_000_000).toFixed(4)} km²`;
        } catch {
          errors.push("Could not build a valid polygon from these points.");
        }
      } else if (type === "circle") {
        const radius = geodesicDistance(positions[0], positions[1]);
        if (radius <= 0) errors.push("Circle has zero radius.");
        measurement = `radius ${radius.toFixed(1)} m`;
      } else if (type === "rectangle") {
        const [lon1, lat1] = cartesianToLonLat(positions[0]);
        const [lon2, lat2] = cartesianToLonLat(positions[1]);
        if (lon1 === lon2 || lat1 === lat2) {
          errors.push("Rectangle has zero width or height.");
        }
        const wKm = geodesicDistance(positions[0], positions[1]);
        measurement = `diagonal ${wKm.toFixed(1)} m`;
      }

      return { valid: errors.length === 0, errors, measurement };
    },
    [cartesianToLonLat, geodesicDistance]
  );

  const removePreviewEntity = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer && previewEntityRef.current) {
      viewer.entities.remove(previewEntityRef.current);
    }
    previewEntityRef.current = null;
  }, []);

  const finishDrawing = useCallback(
    (rawPositions: import("cesium").Cartesian3[]) => {
      const tool = activeToolRef.current;
      if (!tool || rawPositions.length === 0) return;

      const positions = dedupePositions(rawPositions);
      if (positions.length === 0) return;

      idCounterRef.current += 1;

      const result = validateFeature(tool, positions);
      const feature: DrawnFeature = {
        id: `${tool}-${idCounterRef.current}`,
        type: tool,
        positions,
        valid: result.valid,
        errors: result.errors,
        measurement: result.measurement,
      };

      setFeatures((prev) => [...prev, feature]);
      addFeatureEntity(feature);

      setStatusMessage(
        result.valid
          ? `${TOOL_LABELS[tool]} added${result.measurement ? ` — ${result.measurement}` : ""}.`
          : `${TOOL_LABELS[tool]} added with issues: ${result.errors.join(" ")}`
      );

      setDrawingPoints([]);
      setActiveTool(null);
      handlerRef.current?.destroy();
      handlerRef.current = null;
      removePreviewEntity();
      mousePositionRef.current = null;
    },
    [validateFeature, addFeatureEntity, dedupePositions, removePreviewEntity]
  );

  // ---------- Tool activation ----------
  const startTool = useCallback(
    (tool: GeometryType) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return;

      handlerRef.current?.destroy();
      removePreviewEntity();
      mousePositionRef.current = null;
      setDrawingPoints([]);
      setActiveTool(tool);
      setStatusMessage(
        tool === "point"
          ? "Click on the globe to place a point."
          : `Click to add points (min ${MIN_POINTS[tool]}). Double-click to finish.`
      );

      const previewColor = Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.6);
      const previewFill = Cesium.Color.fromCssColorString(ACCENT).withAlpha(0.2);

      // Builds the "current points + live mouse position" array each frame.
      const previewPositions = () => {
        const pts = [...drawingPointsRef.current];
        if (mousePositionRef.current) pts.push(mousePositionRef.current);
        return pts;
      };

      if (tool === "polyline") {
        previewEntityRef.current = viewer.entities.add({
          polyline: {
            positions: new Cesium.CallbackProperty(previewPositions, false),
            width: 3,
            material: new Cesium.PolylineDashMaterialProperty({ color: previewColor }),
          },
        });
      } else if (tool === "polygon") {
        previewEntityRef.current = viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.CallbackProperty(
              () => new Cesium.PolygonHierarchy(previewPositions()),
              false
            ),
            material: previewFill,
            outline: true,
            outlineColor: previewColor,
          },
        });
      } else if (tool === "circle") {
        previewEntityRef.current = viewer.entities.add({
          position: new Cesium.CallbackPositionProperty(
            () => drawingPointsRef.current[0] ?? mousePositionRef.current,
            false,
            Cesium.ReferenceFrame.FIXED
          ),
          ellipse: {
            semiMajorAxis: new Cesium.CallbackProperty(() => {
              const center = drawingPointsRef.current[0];
              if (!center || !mousePositionRef.current) return 1;
              return Math.max(geodesicDistance(center, mousePositionRef.current), 1);
            }, false),
            semiMinorAxis: new Cesium.CallbackProperty(() => {
              const center = drawingPointsRef.current[0];
              if (!center || !mousePositionRef.current) return 1;
              return Math.max(geodesicDistance(center, mousePositionRef.current), 1);
            }, false),
            material: previewFill,
            outline: true,
            outlineColor: previewColor,
          },
        });
      } else if (tool === "rectangle") {
        previewEntityRef.current = viewer.entities.add({
          rectangle: {
            coordinates: new Cesium.CallbackProperty(() => {
              const corner = drawingPointsRef.current[0];
              if (!corner || !mousePositionRef.current) {
                return Cesium.Rectangle.fromDegrees(0, 0, 0, 0);
              }
              const [lon1, lat1] = cartesianToLonLat(corner);
              const [lon2, lat2] = cartesianToLonLat(mousePositionRef.current);
              return Cesium.Rectangle.fromDegrees(
                Math.min(lon1, lon2),
                Math.min(lat1, lat2),
                Math.max(lon1, lon2),
                Math.max(lat1, lat2)
              );
            }, false),
            material: previewFill,
            outline: true,
            outlineColor: previewColor,
          },
        });
      }

      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handlerRef.current = handler;

      const pick = (screenPos: import("cesium").Cartesian2) =>
        viewer.camera.pickEllipsoid(screenPos, viewer.scene.globe.ellipsoid) ??
        undefined;

      handler.setInputAction((movement: { endPosition: import("cesium").Cartesian2 }) => {
        mousePositionRef.current = pick(movement.endPosition) ?? null;
        viewer.scene.requestRender();
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction((click: { position: import("cesium").Cartesian2 }) => {
        const cartesian = pick(click.position);
        if (!cartesian) return; // click missed the globe

        if (tool === "point") {
          finishDrawing([cartesian]);
          return;
        }

        const next = [...drawingPointsRef.current, cartesian];

        // circle & rectangle only need 2 clicks — finish immediately.
        // (Deliberately not done inside a setDrawingPoints updater: React
        // Strict Mode double-invokes updater functions in dev, and
        // finishDrawing has side effects — calling it from there duplicated
        // every circle/rectangle.)
        if ((tool === "circle" || tool === "rectangle") && next.length === 2) {
          finishDrawing(next);
        } else {
          setDrawingPoints(next);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      handler.setInputAction(() => {
        // Double-click finishes polyline / polygon
        if (tool === "polyline" || tool === "polygon") {
          finishDrawing(drawingPointsRef.current);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    },
    [finishDrawing, removePreviewEntity, geodesicDistance, cartesianToLonLat]
  );

  const cancelDrawing = useCallback(() => {
    handlerRef.current?.destroy();
    handlerRef.current = null;
    removePreviewEntity();
    mousePositionRef.current = null;
    setActiveTool(null);
    setDrawingPoints([]);
    setStatusMessage("Cancelled.");
  }, [removePreviewEntity]);

  const clearAll = useCallback(() => {
    const viewer = viewerRef.current;
    setFeatures([]);
    viewer?.entities.removeAll();
    viewer?.scene.requestRender();
    setStatusMessage("");
  }, []);

  const removeFeature = useCallback(
    (id: string) => {
      setFeatures((prev) => prev.filter((f) => f.id !== id));
      removeFeatureEntity(id);
    },
    [removeFeatureEntity]
  );

  return (
    <div className="flex h-screen min-h-0 flex-col bg-gray-950">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Geometry Playground</h1>
          <p className="text-sm text-gray-400">
            {statusMessage || "Draw and validate geometries on the globe"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(TOOL_LABELS) as GeometryType[]).map((tool) => (
            <button
              key={tool}
              onClick={() => startTool(tool)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTool === tool
                  ? "bg-white text-gray-900"
                  : "bg-[#00c4a1] text-white hover:bg-[#00b394]"
              }`}
            >
              {TOOL_LABELS[tool]}
            </button>
          ))}

          {activeTool && (
            <button
              onClick={cancelDrawing}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
            >
              Cancel
            </button>
          )}

          <button
            onClick={clearAll}
            className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Globe + side panel */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />

        {features.length > 0 && (
          <div className="absolute right-5 top-5 max-h-[70%] w-72 overflow-y-auto rounded-xl border border-gray-700 bg-gray-900/95 p-4 text-sm shadow-xl">
            <h2 className="mb-3 font-semibold text-white">
              Geometries ({features.length})
            </h2>
            <div className="space-y-2">
              {features.map((f) => (
                <div
                  key={f.id}
                  className={`rounded-lg border px-3 py-2 ${
                    f.valid
                      ? "border-gray-700 bg-gray-800/60"
                      : "border-red-500/60 bg-red-950/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">
                      {TOOL_LABELS[f.type]}
                    </span>
                    <button
                      onClick={() => removeFeature(f.id)}
                      className="text-xs text-gray-400 hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                  {f.measurement && (
                    <p className="mt-1 text-gray-300">{f.measurement}</p>
                  )}
                  {!f.valid && (
                    <ul className="mt-1 list-disc pl-4 text-red-400">
                      {f.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}