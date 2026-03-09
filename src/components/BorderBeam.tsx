import { cn } from "@/lib/utils";

interface BorderBeamProps {
  className?: string;
  size?: number;
  borderWidth?: number;
  color?: string;
}

export function BorderBeam({
  className,
  size = 200,
  borderWidth = 2,
  color = "rgb(34, 211, 238)",
}: BorderBeamProps) {
  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden rounded-xl", className)}
    >
      <div
        className="absolute animate-border-beam"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          opacity: 0.6,
          top: -borderWidth,
          left: "-100%",
          filter: "blur(1px)",
        }}
      />
    </div>
  );
}
