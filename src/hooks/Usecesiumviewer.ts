"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface CesiumDestination {
  longitude: number;
  latitude: number;
  height: number;
}

export interface UseCesiumViewerOptions {
  /** Camera position on first load. Defaults to the same view every tool page has used so far. */
  initialDestination?: CesiumDestination;
  /** Extra/overriding options merged into the Cesium.Viewer constructor call. */
  viewerOptions?: Partial<import("cesium").Viewer.ConstructorOptions>;
}

export interface UseCesiumViewerResult {
  /** Attach this to the div that should host the globe. */
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Refs, not state — every tool needs to read the current viewer/Cesium
   * synchronously from inside Cesium event callbacks (ScreenSpaceEventHandler
   * handlers, CallbackProperty callbacks, etc.), where waiting on a re-render
   * would mean acting on stale values. `ready` is the only thing that should
   * drive render output (e.g. disabling toolbar buttons until it's true).
   */
  viewerRef: RefObject<import("cesium").Viewer | null>;
  cesiumRef: RefObject<typeof import("cesium") | null>;
  ready: boolean;
}

const DEFAULT_DESTINATION: CesiumDestination = {
  longitude: 77.209,
  latitude: 28.6139,
  height: 1500000,
};

/**
 * Bootstraps a Cesium.Viewer into containerRef and keeps it alive for the
 * life of the component. Safe under React 18 Strict Mode in dev, where every
 * effect runs mount -> cleanup -> mount before settling: without the
 * `cancelled` guard below, both the aborted first init and the real second
 * init can finish their `await import("cesium")` and each create a full
 * Viewer in the same container, leaving two overlapping canvases where only
 * one receives your event handlers (this was the original
 * "clicks-do-nothing" bug in Geometry Playground).
 *
 * Pass options once — they're read at mount time only, matching the
 * behavior every tool page already relied on (a fixed initial camera
 * position and a fixed set of viewer flags). If a tool ever needs the
 * camera destination to change after mount, do that with
 * `viewer.camera.flyTo(...)` from the caller instead of via this hook.
 */
export function useCesiumViewer(
  options: UseCesiumViewerOptions = {}
): UseCesiumViewerResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const cesiumRef = useRef<typeof import("cesium") | null>(null);
  const [ready, setReady] = useState(false);

  // Capture the options passed on the mounting render only; see the
  // "read at mount time only" note above.
  const optionsRef = useRef(options);

  useEffect(() => {
    let cancelled = false;
    let localViewer: import("cesium").Viewer | undefined;

    const initialize = async () => {
      const Cesium = await import("cesium");

      if (cancelled) return; // unmounted before the import resolved — bail out

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
        ...optionsRef.current.viewerOptions,
      });

      cesiumRef.current = Cesium;
      viewerRef.current = localViewer;

      const dest = optionsRef.current.initialDestination ?? DEFAULT_DESTINATION;
      localViewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          dest.longitude,
          dest.latitude,
          dest.height
        ),
      });

      localViewer.scene.requestRender();
      setReady(true);
    };

    initialize().catch((error) => {
      console.error("Cesium initialization failed:", error);
    });

    return () => {
      cancelled = true;
      localViewer?.destroy();
      if (viewerRef.current === localViewer) {
        viewerRef.current = null;
      }
      cesiumRef.current = null;
      setReady(false);
    };
  }, []);

  return { containerRef, viewerRef, cesiumRef, ready };
}