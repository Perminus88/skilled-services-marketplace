import { Zap, Hammer, PaintBucket, Wrench } from "lucide-react";

const SATELLITES = [
  { Icon: Zap,         top: "12%", left: "78%", delay: "0s"   },
  { Icon: Hammer,      top: "68%", left: "85%", delay: "0.4s" },
  { Icon: PaintBucket, top: "78%", left: "22%", delay: "0.8s" },
  { Icon: Wrench,      top: "18%", left: "14%", delay: "1.2s" },
];

export function RadarGraphic() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm select-none">
      {/* Pulse rings — staggered, respects reduced-motion via motion-safe */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="motion-safe:animate-radar-pulse absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-teal-300/50"
          style={{ animationDelay: `${i * 1.05}s` }}
        />
      ))}

      {/* Center pin */}
      <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#F5B700] shadow-lg shadow-black/20">
        <div className="h-3 w-3 rounded-full bg-[#0F172A]" />
      </div>

      {/* Nearby artisan markers */}
      {SATELLITES.map(({ Icon, top, left }, i) => (
        <div
          key={i}
          className="absolute flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md"
          style={{ top, left }}
        >
          <Icon size={16} className="text-teal-700" />
        </div>
      ))}
    </div>
  );
}