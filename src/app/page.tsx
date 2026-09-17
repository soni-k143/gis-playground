export default function Home() {
  return (
    <main className="min-h-screen">
      <section className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-emerald-500">
          GIS Playground
        </p>

        <h1 className="max-w-3xl text-5xl font-bold tracking-tight">
          Explore GIS through interactive experiments
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-gray-500">
          A browser-based playground for geometry, spatial analysis,
          GeoJSON, terrain, and 3D geospatial visualization.
        </p>

        <button className="mt-8 rounded-lg bg-emerald-500 px-6 py-3 font-medium text-white">
          Start Exploring
        </button>
      </section>
    </main>
  );
}