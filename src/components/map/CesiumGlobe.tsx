"use client";

import { useEffect, useRef } from "react";

export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: import("cesium").Viewer | undefined;

    const initializeCesium = async () => {
      window.CESIUM_BASE_URL = "/_next/static/cesium/";

      const Cesium = await import("cesium");

      Cesium.Ion.defaultAccessToken =
        process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN ?? "";

      if (!containerRef.current) {
        return;
      }

      viewer = new Cesium.Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
      });

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          77.209,
          28.6139,
          1500000
        ),
      });
    };

    initializeCesium();

    return () => {
      viewer?.destroy();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}