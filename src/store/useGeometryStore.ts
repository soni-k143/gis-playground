import { create } from "zustand";
import type { Feature } from "geojson";

export type GeometryType = "point" | "polyline" | "polygon" | "circle" | "rectangle";

export interface StoredFeature {
  id: string;
  type: GeometryType;
  /**
   * Raw click points as [longitude, latitude] degree pairs, in draw order.
   * Circle = [center, edgePoint]; Rectangle = [corner1, corner2]. Kept
   * alongside `geojson` because a circle's `geojson` is only a polygon
   * approximation (GeoJSON has no native circle type) — re-deriving an
   * ellipse to render in Cesium needs the exact center + radius, not the
   * approximation.
   */
  controlPoints: [number, number][];
  /** Turf-compatible GeoJSON Feature. This is what Measurement, Spatial
   *  Analysis, and GeoJSON Lab should read — none of them need to know
   *  Cesium exists. */
  geojson: Feature;
  valid: boolean;
  errors: string[];
  measurement?: string;
}

interface GeometryStoreState {
  features: StoredFeature[];
  /** Assigns a unique id and appends; returns the id so the caller can add
   *  a matching Cesium entity right away without waiting for a re-render. */
  addFeature: (feature: Omit<StoredFeature, "id">) => string;
  removeFeature: (id: string) => void;
  clearFeatures: () => void;
}

let idCounter = 0;

export const useGeometryStore = create<GeometryStoreState>((set: any) => ({
  features: [],
  addFeature: (feature: any) => {
    idCounter += 1;
    const id = `${feature.type}-${idCounter}`;
    set((state: any) => ({ features: [...state.features, { ...feature, id }] }));
    return id;
  },
  removeFeature: (id: any) =>
    set((state: any) => ({ features: state.features.filter((f: any) => f.id !== id) })),
  clearFeatures: () => set({ features: [] }),
}));