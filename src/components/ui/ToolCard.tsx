import Link from "next/link";

interface ToolCardProps {
  title: string;
  description: string;
  href: string;
  icon: string;
}

export default function ToolCard({
  title,
  description,
  href,
  icon,
}: ToolCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[#00c4a1] hover:shadow-lg"
    >
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-[#00c4a1]/10 text-xl">
        {icon}
      </div>

      <h3 className="text-lg font-semibold text-gray-900 group-hover:text-[#00c4a1]">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-gray-500">
        {description}
      </p>

      <div className="mt-5 text-sm font-medium text-[#00c4a1]">
        Explore →
      </div>
    </Link>
  );
}