export function Marquee({
  items,
  duration = 30,
  className = "",
  separator = "·",
}: {
  items: string[];
  duration?: number;
  className?: string;
  separator?: string;
}) {
  return (
    <div className={`marquee ${className}`}>
      <div className="marquee-track" style={{ ["--marquee-duration" as string]: `${duration}s` }}>
        {[...items, ...items].map((item, i) => (
          <span key={i} className="flex items-center gap-12">
            <span>{item}</span>
            <span className="text-violet-500/40">{separator}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
