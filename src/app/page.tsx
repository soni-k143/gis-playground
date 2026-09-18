import Navbar from "@/src/components/layout/Navbar";
import ToolCard from "@/src/components/ui/ToolCard";

const tools = [
  {
    title: "Geometry Playground",
    description:
      "Create and explore points, lines, polygons, circles, and rectangles.",
    href: "/geometry",
    icon: "◈",
  },
  {
    title: "Measurement",
    description:
      "Measure distances, areas, lengths, bearings, and elevations.",
    href: "/measurement",
    icon: "⌁",
  },
  {
    title: "Spatial Analysis",
    description:
      "Experiment with buffers, intersections, unions, and spatial relationships.",
    href: "/spatial-analysis",
    icon: "◎",
  },
  {
    title: "GeoJSON Lab",
    description:
      "Create, edit, visualize, and inspect GeoJSON directly on the globe.",
    href: "/geojson",
    icon: "{}",
  },
  {
    title: "Terrain Lab",
    description:
      "Explore terrain elevation and other 3D terrain-based experiments.",
    href: "/terrain",
    icon: "△",
  },
  {
    title: "3D Tiles",
    description:
      "Load and experiment with 3D Tiles and geospatial 3D datasets.",
    href: "/3d-tiles",
    icon: "▣",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main>
        {/* Hero */}
        <section className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-5xl px-6 py-24 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#00c4a1]">
              GIS Playground
            </p>

            <h1 className="mx-auto mt-5 max-w-3xl text-5xl font-bold tracking-tight text-gray-950 sm:text-6xl">
              Explore GIS through interactive experiments
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-500">
              Create, analyze, and visualize geospatial data directly in
              your browser using modern web technologies.
            </p>

            <a
              href="#tools"
              className="mt-8 inline-flex rounded-lg bg-[#00c4a1] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#00ae91]"
            >
              Start Exploring
            </a>
          </div>
        </section>

        {/* Tools */}
        <section id="tools" className="mx-auto max-w-7xl px-6 py-20">
          <div className="mb-10">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#00c4a1]">
              Explore
            </p>

            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
              GIS Tools
            </h2>

            <p className="mt-3 max-w-2xl text-gray-500">
              Interactive experiments covering geometry, analysis,
              GeoJSON, terrain, and 3D geospatial visualization.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool) => (
              <ToolCard
                key={tool.href}
                title={tool.title}
                description={tool.description}
                href={tool.href}
                icon={tool.icon}
              />
            ))}
          </div>
        </section>

        {/* About */}
        <section
          id="about"
          className="border-y border-gray-200 bg-white"
        >
          <div className="mx-auto max-w-5xl px-6 py-20 text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#00c4a1]">
              Built to Learn
            </p>

            <h2 className="mt-3 text-3xl font-bold text-gray-900">
              Learn by building
            </h2>

            <p className="mx-auto mt-5 max-w-2xl leading-7 text-gray-500">
              GIS Playground is a learning and experimentation project
              built around modern frontend and geospatial technologies.
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {[
                "Next.js",
                "React",
                "TypeScript",
                "Tailwind CSS",
                "CesiumJS",
                "Turf.js",
                "Zustand",
              ].map((technology) => (
                <span
                  key={technology}
                  className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-600"
                >
                  {technology}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-gray-950 px-6 py-8 text-center text-sm text-gray-400">
        GIS Playground · Built for learning and experimentation
      </footer>
    </div>
  );
}