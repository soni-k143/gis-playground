"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import * as turf from "@turf/turf";
import { useGeometryStore, type GeometryType, type StoredFeature } from "@/src/store/useGeometryStore";
import { buildGeometryFeature, MIN_POINTS, TOOL_LABELS } from "@/src/lib/geometryBuilder";

const ACCENT = "#00c4a1";

export interface UseDrawingResult {
  activeTool: GeometryType | null;
  statusMessage: string;
  /** Begins drawing a new geometry of this type. Any drawing already in
   *  progress is discarded. */
  startTool: (tool: GeometryType) => void;
  /** Abandons the geometry currently being drawn, if any. */
  cancelDrawing: () => void;
  /** Removes every stored feature and its Cesium entity. */
  clearAll: () => void;
  /** Removes one stored feature (and its entity) by id. */
  removeFeature: (id: string) => void;
}

/**
 * Owns the full "click on the globe to build a geometry" workflow: live
 * preview while drawing, finishing on the right gesture per geometry type,
 * validating and persisting the result to useGeometryStore, and rendering it
 * as a Cesium entity. Reusable by any tool page that wants to let the user
 * draw a new geometry — not just Geometry Playground.
 *
 * Pass the viewer/Cesium refs from useCesiumViewer(); this hook doesn't
 * bootstrap a viewer itself; it draws into whichever one you already have.
 */
export function useDrawing(
  viewerRef: RefObject<import("cesium").Viewer | null>,
  cesiumRef: RefObject<typeof import("cesium") | null>
): UseDrawingResult {
  const addFeature = useGeometryStore((s) => s.addFeature);
  const removeFeatureFromStore = useGeometryStore((s) => s.removeFeature);
  const clearFeatures = useGeometryStore((s) => s.clearFeatures);

  const handlerRef = useRef<import("cesium").ScreenSpaceEventHandler | null>(null);
  const mousePositionRef = useRef<import("cesium").Cartesian3 | null>(null);
  const previewEntityRef = useRef<import("cesium").Entity | null>(null);

  const [activeTool, setActiveTool] = useState<GeometryType | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<
    import("cesium").Cartesian3[]
  >([]);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const drawingPointsRef = useRef(drawingPoints);
  drawingPointsRef.current = drawingPoints;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  // Clean up the drawing handler / preview entity this hook owns if the
  // consuming component unmounts mid-draw. The viewer itself is someone
  // else's responsibility (useCesiumViewer).
  useEffect(() => {
    return () => {
      handlerRef.current?.destroy();
      handlerRef.current = null;
      previewEntityRef.current = null;
    };
  }, []);

  // ---------- Cesium <-> lon/lat boundary ----------
  const cartesianToLonLat = useCallback(
    (c: import("cesium").Cartesian3): [number, number] => {
      const Cesium = cesiumRef.current!;
      const carto = Cesium.Cartographic.fromCartesian(c);
      return [
        Cesium.Math.toDegrees(carto.longitude),
        Cesium.Math.toDegrees(carto.latitude),
      ];
    },
    [cesiumRef]
  );

  // Used only for the live circle preview while drawing (still driven by
  // Cesium positions for efficiency). The finished circle's radius is
  // recomputed via turf.distance from the stored [lon, lat] points instead.
  const geodesicDistance = useCallback(
    (a: import("cesium").Cartesian3, b: import("cesium").Cartesian3) => {
      const Cesium = cesiumRef.current!;
      const cartoA = Cesium.Cartographic.fromCartesian(a);
      const cartoB = Cesium.Cartographic.fromCartesian(b);
      const geodesic = new Cesium.EllipsoidGeodesic(cartoA, cartoB);
      return geodesic.surfaceDistance; // meters
    },
    [cesiumRef]
  );

  // Adds exactly one feature's entity, tagged with its id so it can be
  // removed individually. Never do a full removeAll()+rebuild on every
  // change: ground-clamped polylines use GroundPolylinePrimitive, which
  // rebatches asynchronously, so tearing one down and recreating it (even
  // unchanged) produces a visible blink while it rebuilds.
  const addFeatureEntity = useCallback(
    (f: Pick<StoredFeature, "id" | "type" | "controlPoints" | "valid">) => {
      const viewer = viewerRef.current;
      const Cesium = cesiumRef.current;
      if (!viewer || !Cesium) return;

      const color = f.valid
        ? Cesium.Color.fromCssColorString(ACCENT)
        : Cesium.Color.fromCssColorString("#ef4444");

      const cartesianPositions = f.controlPoints.map(([lon, lat]) =>
        Cesium.Cartesian3.fromDegrees(lon, lat)
      );

      if (f.type === "point") {
        viewer.entities.add({
          id: f.id,
          position: cartesianPositions[0],
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
            positions: cartesianPositions,
            width: 4,
            material: color,
            clampToGround: true,
          },
        });
      } else if (f.type === "polygon") {
        viewer.entities.add({
          id: f.id,
          polygon: {
            hierarchy: cartesianPositions,
            material: color.withAlpha(0.35),
            outline: true,
            outlineColor: color,
          },
        });
      } else if (f.type === "circle") {
        const [center, edge] = f.controlPoints;
        const radius = Math.max(turf.distance(center, edge, { units: "meters" }), 1);
        viewer.entities.add({
          id: f.id,
          position: cartesianPositions[0],
          ellipse: {
            semiMajorAxis: radius,
            semiMinorAxis: radius,
            material: color.withAlpha(0.35),
            outline: true,
            outlineColor: color,
          },
        });
      } else if (f.type === "rectangle") {
        const [[lon1, lat1], [lon2, lat2]] = f.controlPoints;
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
    [viewerRef, cesiumRef]
  );

  const removeFeatureEntity = useCallback(
    (id: string) => {
      const viewer = viewerRef.current;
      if (!viewer) return;
      viewer.entities.removeById(id);
      viewer.scene.requestRender();
    },
    [viewerRef]
  );

  const removePreviewEntity = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer && previewEntityRef.current) {
      viewer.entities.remove(previewEntityRef.current);
    }
    previewEntityRef.current = null;
  }, [viewerRef]);

  const finishDrawing = useCallback(
    (rawPositions: import("cesium").Cartesian3[]) => {
      const tool = activeToolRef.current;
      if (!tool || rawPositions.length === 0) return;

      const controlPoints = rawPositions.map(cartesianToLonLat);
      const built = buildGeometryFeature(tool, controlPoints);
      if (built.controlPoints.length === 0) return;

      const id = addFeature({
        type: tool,
        controlPoints: built.controlPoints,
        geojson: built.geojson,
        valid: built.valid,
        errors: built.errors,
        measurement: built.measurement,
      });

      addFeatureEntity({
        id,
        type: tool,
        controlPoints: built.controlPoints,
        valid: built.valid,
      });

      setStatusMessage(
        built.valid
          ? `${TOOL_LABELS[tool]} added${built.measurement ? ` — ${built.measurement}` : ""}.`
          : `${TOOL_LABELS[tool]} added with issues: ${built.errors.join(" ")}`
      );

      setDrawingPoints([]);
      setActiveTool(null);
      handlerRef.current?.destroy();
      handlerRef.current = null;
      removePreviewEntity();
      mousePositionRef.current = null;
    },
    [cartesianToLonLat, addFeature, addFeatureEntity, removePreviewEntity]
  );

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
        if (tool === "polyline" || tool === "polygon") {
          finishDrawing(drawingPointsRef.current);
        }
      }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    },
    [viewerRef, cesiumRef, finishDrawing, removePreviewEntity, geodesicDistance, cartesianToLonLat]
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
    clearFeatures();
    viewer?.entities.removeAll();
    viewer?.scene.requestRender();
    setStatusMessage("");
  }, [viewerRef, clearFeatures]);

  const removeFeature = useCallback(
    (id: string) => {
      removeFeatureFromStore(id);
      removeFeatureEntity(id);
    },
    [removeFeatureFromStore, removeFeatureEntity]
  );

  return { activeTool, statusMessage, startTool, cancelDrawing, clearAll, removeFeature };
}