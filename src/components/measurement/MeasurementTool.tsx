"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as turf from "@turf/turf";
import { useCesiumViewer } from "@/src/hooks/Usecesiumviewer";

type MeasureMode = "distance" | "polyline" | "area" | "point" | null;

interface DistanceResult {
  distanceM: number;
  bearingDeg: number;
}

interface PolylineResult {
  totalM: number;
  segments: number;
}

interface AreaResult {
  areaM2: number;
  perimeterM: number;
}

interface PinnedPoint {
  id: string;
  lon: number;
  lat: number;
}

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(1)} m`;
}

function formatBearing(deg: number): string {
  const normalized = (deg + 360) % 360;
  const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round(normalized / 45) % 8;
  return `${normalized.toFixed(1)}° (${compass[idx]})`;
}

function formatArea(m2: number): string {
  return m2 >= 1_000_000 ? `${(m2 / 1_000_000).toFixed(4)} km²` : `${m2.toFixed(1)} m²`;
}

function formatLonLat(lon: number, lat: number): string {
  const lonStr = `${Math.abs(lon).toFixed(6)}° ${lon < 0 ? "W" : "E"}`;
  const latStr = `${Math.abs(lat).toFixed(6)}° ${lat < 0 ? "S" : "N"}`;
  return `${latStr}, ${lonStr}`;
}

export default function MeasurementTool() {
  const { containerRef, viewerRef, cesiumRef, ready } = useCesiumViewer();

  const [mode, setMode] = useState<MeasureMode>(null);
  const [distanceResult, setDistanceResult] = useState<DistanceResult | null>(null);
  const [polylineResult, setPolylineResult] = useState<PolylineResult | null>(null);
  const [areaResult, setAreaResult] = useState<AreaResult | null>(null);
  const [pinnedPoints, setPinnedPoints] = useState<PinnedPoint[]>([]);

  const handlerRef = useRef<import("cesium").ScreenSpaceEventHandler | null>(null);
  const mousePositionRef = useRef<import("cesium").Cartesian3 | null>(null);
  const pointsRef = useRef<import("cesium").Cartesian3[]>([]);
  const finishedRef = useRef(false);
  const entityIdsRef = useRef<string[]>([]);
  const pinCounterRef = useRef(0);

  useEffect(() => {
    return () => {
      handlerRef.current?.destroy();
      handlerRef.current = null;
    };
  }, []);

  const cartesianToLonLat = useCallback(
    (c: import("cesium").Cartesian3): [number, number] => {
      const Cesium = cesiumRef.current!;
      const carto = Cesium.Cartographic.fromCartesian(c);
      return [Cesium.Math.toDegrees(carto.longitude), Cesium.Math.toDegrees(carto.latitude)];
    },
    [cesiumRef]
  );

  const labelStyle = useCallback(() => {
    const Cesium = cesiumRef.current!;
    return {
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#111827").withAlpha(0.85),
      backgroundPadding: new Cesium.Cartesian2(8, 6),
      pixelOffset: new Cesium.Cartesian2(0, -16),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    };
  }, [cesiumRef]);

  const clearEntities = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    entityIdsRef.current.forEach((id) => viewer.entities.removeById(id));
    entityIdsRef.current = [];
    viewer.scene.requestRender();
  }, [viewerRef]);

  const reset = useCallback(() => {
    handlerRef.current?.destroy();
    handlerRef.current = null;
    clearEntities();
    pointsRef.current = [];
    mousePositionRef.current = null;
    finishedRef.current = false;
    setDistanceResult(null);
    setPolylineResult(null);
    setAreaResult(null);
    setPinnedPoints([]);
  }, [clearEntities]);

  // ---------- Distance (2-point) ----------
  const startDistance = useCallback(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    reset();
    setMode("distance");

    const lineColor = Cesium.Color.fromCssColorString("#00c4a1");
    const lineId = "measure-distance-line";
    const labelId = "measure-distance-label";
    entityIdsRef.current.push(lineId, labelId);

    viewer.entities.add({
      id: lineId,
      polyline: {
        positions: new Cesium.CallbackProperty(() => {
          const start = pointsRef.current[0];
          const end = pointsRef.current[1] ?? mousePositionRef.current;
          return start && end ? [start, end] : [];
        }, false),
        width: 3,
        material: lineColor,
        clampToGround: true,
      },
    });

    viewer.entities.add({
      id: labelId,
      position: new Cesium.CallbackPositionProperty(() => {
        const start = pointsRef.current[0];
        const end = pointsRef.current[1] ?? mousePositionRef.current;
        if (!start || !end) return start ?? undefined;
        return Cesium.Cartesian3.midpoint(start, end, new Cesium.Cartesian3());
      }, false, Cesium.ReferenceFrame.FIXED),
      label: {
        text: new Cesium.CallbackProperty(() => {
          const start = pointsRef.current[0];
          const end = pointsRef.current[1] ?? mousePositionRef.current;
          if (!start || !end) return "";
          const a = cartesianToLonLat(start);
          const b = cartesianToLonLat(end);
          return `${formatDistance(turf.distance(a, b, { units: "meters" }))}\n${formatBearing(turf.bearing(a, b))}`;
        }, false),
        ...labelStyle(),
      },
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;
    const pick = (p: import("cesium").Cartesian2) =>
      viewer.camera.pickEllipsoid(p, viewer.scene.globe.ellipsoid) ?? undefined;

    handler.setInputAction((m: { endPosition: import("cesium").Cartesian2 }) => {
      mousePositionRef.current = pick(m.endPosition) ?? null;
      viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click: { position: import("cesium").Cartesian2 }) => {
      const cartesian = pick(click.position);
      if (!cartesian) return;

      if (finishedRef.current) {
        startDistance(); // this click clears; the next click starts fresh
        return;
      }
      if (pointsRef.current.length === 0) {
        pointsRef.current = [cartesian];
        return;
      }
      pointsRef.current = [pointsRef.current[0], cartesian];
      finishedRef.current = true;
      const a = cartesianToLonLat(pointsRef.current[0]);
      const b = cartesianToLonLat(pointsRef.current[1]);
      setDistanceResult({
        distanceM: turf.distance(a, b, { units: "meters" }),
        bearingDeg: turf.bearing(a, b),
      });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef, cesiumRef, cartesianToLonLat, labelStyle, reset]);

  // ---------- Polyline distance (multi-segment) ----------
  const startPolyline = useCallback(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    reset();
    setMode("polyline");

    const lineColor = Cesium.Color.fromCssColorString("#00c4a1");
    const lineId = "measure-polyline-line";
    const totalLabelId = "measure-polyline-total-label";
    entityIdsRef.current.push(lineId, totalLabelId);

    const previewPositions = () => {
      const pts = [...pointsRef.current];
      if (!finishedRef.current && mousePositionRef.current) pts.push(mousePositionRef.current);
      return pts;
    };

    viewer.entities.add({
      id: lineId,
      polyline: {
        positions: new Cesium.CallbackProperty(previewPositions, false),
        width: 3,
        material: lineColor,
        clampToGround: true,
      },
    });

    viewer.entities.add({
      id: totalLabelId,
      position: new Cesium.CallbackPositionProperty(() => {
        const pts = previewPositions();
        return pts.length > 0 ? pts[pts.length - 1] : undefined;
      }, false, Cesium.ReferenceFrame.FIXED),
      label: {
        text: new Cesium.CallbackProperty(() => {
          const pts = previewPositions();
          if (pts.length < 2) return "Click to add points";
          const lonLat = pts.map(cartesianToLonLat);
          const line = turf.lineString(lonLat);
          return `total: ${formatDistance(turf.length(line, { units: "kilometers" }) * 1000)}`;
        }, false),
        ...labelStyle(),
      },
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;
    const pick = (p: import("cesium").Cartesian2) =>
      viewer.camera.pickEllipsoid(p, viewer.scene.globe.ellipsoid) ?? undefined;

    handler.setInputAction((m: { endPosition: import("cesium").Cartesian2 }) => {
      mousePositionRef.current = pick(m.endPosition) ?? null;
      viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click: { position: import("cesium").Cartesian2 }) => {
      const cartesian = pick(click.position);
      if (!cartesian) return;

      if (finishedRef.current) {
        startPolyline();
        return;
      }

      // Per-segment label, added once and then static — mirrors the
      // reference's addPoint() behavior of freezing each completed
      // segment's distance rather than recomputing it every frame.
      if (pointsRef.current.length > 0) {
        const prev = pointsRef.current[pointsRef.current.length - 1];
        const segId = `measure-polyline-segment-${pointsRef.current.length}`;
        entityIdsRef.current.push(segId);
        const segDistance = turf.distance(
          cartesianToLonLat(prev),
          cartesianToLonLat(cartesian),
          { units: "meters" }
        );
        viewer.entities.add({
          id: segId,
          position: Cesium.Cartesian3.midpoint(prev, cartesian, new Cesium.Cartesian3()),
          label: { text: formatDistance(segDistance), scale: 0.85, ...labelStyle() },
        });
      }

      pointsRef.current = [...pointsRef.current, cartesian];
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(() => {
      if (pointsRef.current.length < 2) return;
      finishedRef.current = true;
      const lonLat = pointsRef.current.map(cartesianToLonLat);
      const line = turf.lineString(lonLat);
      setPolylineResult({
        totalM: turf.length(line, { units: "kilometers" }) * 1000,
        segments: pointsRef.current.length - 1,
      });
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef, cesiumRef, cartesianToLonLat, labelStyle, reset]);

  // ---------- Area ----------
  const startArea = useCallback(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    reset();
    setMode("area");

    const fillColor = Cesium.Color.fromCssColorString("#00c4a1").withAlpha(0.25);
    const lineColor = Cesium.Color.fromCssColorString("#00c4a1");
    const polygonId = "measure-area-polygon";
    const labelId = "measure-area-label";
    entityIdsRef.current.push(polygonId, labelId);

    const previewPositions = () => {
      const pts = [...pointsRef.current];
      if (!finishedRef.current && mousePositionRef.current) pts.push(mousePositionRef.current);
      return pts;
    };

    viewer.entities.add({
      id: polygonId,
      polygon: {
        hierarchy: new Cesium.CallbackProperty(
          () => new Cesium.PolygonHierarchy(previewPositions()),
          false
        ),
        material: fillColor,
        outline: true,
        outlineColor: lineColor,
      },
    });

    viewer.entities.add({
      id: labelId,
      position: new Cesium.CallbackPositionProperty(() => {
        const pts = previewPositions();
        if (pts.length === 0) return undefined;
        const sum = pts.reduce((acc, p) => Cesium.Cartesian3.add(acc, p, acc), new Cesium.Cartesian3());
        return Cesium.Cartesian3.multiplyByScalar(sum, 1 / pts.length, sum);
      }, false, Cesium.ReferenceFrame.FIXED),
      label: {
        text: new Cesium.CallbackProperty(() => {
          const pts = previewPositions();
          if (pts.length < 3) return `${pts.length} point(s) — need 3+`;
          const ring = pts.map(cartesianToLonLat);
          ring.push(ring[0]);
          try {
            const poly = turf.polygon([ring]);
            return `${formatArea(turf.area(poly))}\nperimeter ${formatDistance(turf.length(turf.lineString(ring), { units: "kilometers" }) * 1000)}`;
          } catch {
            return "Invalid polygon";
          }
        }, false),
        ...labelStyle(),
      },
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;
    const pick = (p: import("cesium").Cartesian2) =>
      viewer.camera.pickEllipsoid(p, viewer.scene.globe.ellipsoid) ?? undefined;

    handler.setInputAction((m: { endPosition: import("cesium").Cartesian2 }) => {
      mousePositionRef.current = pick(m.endPosition) ?? null;
      viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click: { position: import("cesium").Cartesian2 }) => {
      const cartesian = pick(click.position);
      if (!cartesian) return;
      if (finishedRef.current) {
        startArea();
        return;
      }
      pointsRef.current = [...pointsRef.current, cartesian];
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    handler.setInputAction(() => {
      if (pointsRef.current.length < 3) return;
      finishedRef.current = true;
      const ring = pointsRef.current.map(cartesianToLonLat);
      ring.push(ring[0]);
      try {
        const poly = turf.polygon([ring]);
        setAreaResult({
          areaM2: turf.area(poly),
          perimeterM: turf.length(turf.lineString(ring), { units: "kilometers" }) * 1000,
        });
      } catch {
        setAreaResult(null);
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerRef, cesiumRef, cartesianToLonLat, labelStyle, reset]);

  // ---------- Point coordinates (continuous hover readout + pin on click) ----------
  const startPoint = useCallback(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium) return;

    reset();
    setMode("point");

    const cursorId = "measure-point-cursor";
    const cursorLabelId = "measure-point-cursor-label";
    entityIdsRef.current.push(cursorId, cursorLabelId);

    viewer.entities.add({
      id: cursorId,
      position: new Cesium.CallbackPositionProperty(
        () => mousePositionRef.current ?? undefined,
        false,
        Cesium.ReferenceFrame.FIXED
      ),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString("#00c4a1"),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
    });

    viewer.entities.add({
      id: cursorLabelId,
      position: new Cesium.CallbackPositionProperty(
        () => mousePositionRef.current ?? undefined,
        false,
        Cesium.ReferenceFrame.FIXED
      ),
      label: {
        text: new Cesium.CallbackProperty(() => {
          if (!mousePositionRef.current) return "";
          const [lon, lat] = cartesianToLonLat(mousePositionRef.current);
          return formatLonLat(lon, lat);
        }, false),
        ...labelStyle(),
      },
    });

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;
    const pick = (p: import("cesium").Cartesian2) =>
      viewer.camera.pickEllipsoid(p, viewer.scene.globe.ellipsoid) ?? undefined;

    handler.setInputAction((m: { endPosition: import("cesium").Cartesian2 }) => {
      mousePositionRef.current = pick(m.endPosition) ?? null;
      viewer.scene.requestRender();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction((click: { position: import("cesium").Cartesian2 }) => {
      const cartesian = pick(click.position);
      if (!cartesian) return;
      const [lon, lat] = cartesianToLonLat(cartesian);
      pinCounterRef.current += 1;
      const id = `measure-point-pin-${pinCounterRef.current}`;
      entityIdsRef.current.push(id);
      viewer.entities.add({
        id,
        position: cartesian,
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString("#facc15"),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
      });
      setPinnedPoints((prev) => [...prev, { id, lon, lat }]);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }, [viewerRef, cesiumRef, cartesianToLonLat, labelStyle, reset]);

  const stopMeasuring = useCallback(() => {
    reset();
    setMode(null);
  }, [reset]);

  const statusText =
    mode === "distance"
      ? finishedRef.current
        ? "Click anywhere to start a new distance measurement."
        : "Click a start point, move the mouse, click an end point."
      : mode === "polyline"
      ? finishedRef.current
        ? "Click anywhere to start a new line measurement."
        : "Click to add points, double-click to finish."
      : mode === "area"
      ? finishedRef.current
        ? "Click anywhere to start a new area measurement."
        : "Click to add vertices, double-click to finish."
      : mode === "point"
      ? "Move the mouse to read coordinates; click to pin a point."
      : "Choose a measurement type, then draw on the globe.";

  return (
    <div className="flex h-screen min-h-0 flex-col bg-gray-950">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Measurement</h1>
          <p className="text-sm text-gray-400">{statusText}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={startDistance}
            disabled={!ready}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "distance" ? "bg-white text-gray-900" : "bg-[#00c4a1] text-white hover:bg-[#00b394]"
            }`}
          >
            Distance
          </button>
          <button
            onClick={startPolyline}
            disabled={!ready}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "polyline" ? "bg-white text-gray-900" : "bg-[#00c4a1] text-white hover:bg-[#00b394]"
            }`}
          >
            Polyline Distance
          </button>
          <button
            onClick={startArea}
            disabled={!ready}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "area" ? "bg-white text-gray-900" : "bg-[#00c4a1] text-white hover:bg-[#00b394]"
            }`}
          >
            Area
          </button>
          <button
            onClick={startPoint}
            disabled={!ready}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mode === "point" ? "bg-white text-gray-900" : "bg-[#00c4a1] text-white hover:bg-[#00b394]"
            }`}
          >
            Point Coordinates
          </button>

          {/* Terrain-dependent tools: shown, not hidden, but genuinely disabled */}
          <button
            disabled
            title="Needs a loaded terrain provider — coming with Terrain Lab"
            className="cursor-not-allowed rounded-lg border border-gray-800 bg-gray-900 px-4 py-2 text-sm text-gray-600"
          >
            Height / Slope (Terrain Lab)
          </button>

          {mode && (
            <button
              onClick={stopMeasuring}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:bg-gray-800"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Globe + result panel */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />

        {(distanceResult || polylineResult || areaResult || pinnedPoints.length > 0) && (
          <div className="absolute right-5 top-5 max-h-[80%] w-80 overflow-y-auto rounded-xl border border-gray-700 bg-gray-900/95 p-4 text-sm shadow-xl">
            <h2 className="mb-2 font-semibold text-white">Result</h2>

            {distanceResult && (
              <div className="space-y-1 text-gray-300">
                <p>
                  <span className="text-gray-500">Distance: </span>
                  <span className="text-[#00c4a1]">{formatDistance(distanceResult.distanceM)}</span>
                </p>
                <p>
                  <span className="text-gray-500">Bearing: </span>
                  <span className="text-[#00c4a1]">{formatBearing(distanceResult.bearingDeg)}</span>
                </p>
              </div>
            )}

            {polylineResult && (
              <div className="space-y-1 text-gray-300">
                <p>
                  <span className="text-gray-500">Total length: </span>
                  <span className="text-[#00c4a1]">{formatDistance(polylineResult.totalM)}</span>
                </p>
                <p>
                  <span className="text-gray-500">Segments: </span>
                  <span className="text-[#00c4a1]">{polylineResult.segments}</span>
                </p>
              </div>
            )}

            {areaResult && (
              <div className="space-y-1 text-gray-300">
                <p>
                  <span className="text-gray-500">Area: </span>
                  <span className="text-[#00c4a1]">{formatArea(areaResult.areaM2)}</span>
                </p>
                <p>
                  <span className="text-gray-500">Perimeter: </span>
                  <span className="text-[#00c4a1]">{formatDistance(areaResult.perimeterM)}</span>
                </p>
              </div>
            )}

            {pinnedPoints.length > 0 && (
              <div className="space-y-1">
                <p className="text-gray-500">Pinned points:</p>
                {pinnedPoints.map((p, i) => (
                  <p key={p.id} className="text-[#00c4a1]">
                    {i + 1}. {formatLonLat(p.lon, p.lat)}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="absolute bottom-5 left-5 max-w-sm rounded-lg border border-gray-700 bg-gray-900/90 px-3 py-2 text-xs text-gray-500">
          Height, horizontal/vertical component distance, and slope profile all
          need real terrain elevation data (not just the ellipsoid) — these
          arrive once Terrain Lab is built.
        </p>
      </div>
    </div>
  );
}