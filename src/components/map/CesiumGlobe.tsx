"use client";

import { useEffect, useRef } from "react";

export default function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let viewer: import("cesium").Viewer | undefined;

    const initializeCesium = async () => {
      window.CESIUM_BASE_URL = "/cesium/";

      const Cesium = await import("cesium");

      const token = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN;

      console.log("Cesium token exists:", !!token);

      Cesium.Ion.defaultAccessToken = token ?? "";

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

        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
      });

      // viewerRef.current = viewer;

      viewer.scene.requestRender();

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          77.209,
          28.6139,
          1500000
        ),
      });
    };

    initializeCesium().catch((error) => {
      console.error("Cesium initialization failed:", error);
      console.error("Cesium error details:", JSON.stringify(error, null, 2));
    });

    return () => {
      viewer?.destroy();
    };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}