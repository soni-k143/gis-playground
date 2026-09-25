"use client";

import { useCesiumViewer } from "@/src/hooks/Usecesiumviewer";
import { useDrawing } from "@/src/hooks/useDrawing";
import { useGeometryStore, type GeometryType } from "@/src/store/useGeometryStore";
import { TOOL_LABELS } from "@/src/lib/geometryBuilder";

export default function GeometryPlayground() {
  const { containerRef, viewerRef, cesiumRef, ready } = useCesiumViewer();
  const features = useGeometryStore((s) => s.features);
  const { activeTool, statusMessage, startTool, cancelDrawing, clearAll, removeFeature } =
    useDrawing(viewerRef, cesiumRef);

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
              disabled={!ready}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
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