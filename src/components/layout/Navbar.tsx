import Link from "next/link";

export default function Navbar() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-gray-900"
        >
          GIS <span className="text-[#00c4a1]">Playground</span>
        </Link>

        <nav className="flex items-center gap-8 text-sm font-medium text-gray-600">
          <Link
            href="/"
            className="transition-colors hover:text-[#00c4a1]"
          >
            Explore
          </Link>

          <a
            href="#about"
            className="transition-colors hover:text-[#00c4a1]"
          >
            About
          </a>

          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[#00c4a1]"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}