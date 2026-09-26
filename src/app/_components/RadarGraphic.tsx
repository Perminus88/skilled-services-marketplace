import { Zap, Hammer, PaintBucket, Wrench } from "lucide-react";

// Warm brown/dark skin tones, varied slightly per avatar so the four
// floating bubbles don't look identical/cloned.
const SATELLITES = [
  { Icon: Zap,         top: "12%", left: "78%", delay: "0s",   skin: "#5C3A21" },
  { Icon: Hammer,      top: "68%", left: "85%", delay: "0.4s", skin: "#8D5524" },
  { Icon: PaintBucket, top: "78%", left: "22%", delay: "0.8s", skin: "#3B2416" },
  { Icon: Wrench,      top: "18%", left: "14%", delay: "1.2s", skin: "#6F4A2E" },
];

/**
 * Simple flat-illustration head-and-shoulders silhouette. Deliberately
 * abstract/geometric (not a stock photo, not a caricature) — just a clean
 * person shape in a given skin tone, matching the app's icon-based visual
 * language elsewhere.
 */
function PersonSilhouette({ skin }: { skin: string }) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full">
      <circle cx="20" cy="20" r="20" fill="white" />
      {/* Shoulders */}
      <path d="M4 34c0-8.837 7.163-14 16-14s16 5.163 16 14v6H4v-6z" fill={skin} />
      {/* Head */}
      <circle cx="20" cy="15" r="8" fill={skin} />
    </svg>
  );
}

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

      {/* Nearby artisan markers — illustrated avatar + trade badge */}
      {SATELLITES.map(({ Icon, top, left, skin }, i) => (
        <div
          key={i}
          className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full shadow-md"
          style={{ top, left }}
        >
          <PersonSilhouette skin={skin} />
          <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 ring-2 ring-white">
            <Icon size={9} className="text-white" />
          </div>
        </div>
      ))}
    </div>
  );
}