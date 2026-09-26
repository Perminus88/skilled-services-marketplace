import { CheckCircle2, MapPin, Star, Briefcase } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared artisan card — used by both the landing page's preview list and the
// full /discovery list view. Every artisan returned by search_nearby_artisans
// already has verification_status = 'verified' baked into the SQL filter, so
// the checkmark badge is unconditional here rather than driven by a field.
// ─────────────────────────────────────────────────────────────────────────────

export interface ArtisanCardData {
  user_id: string;
  full_name: string;
  bio: string | null;
  availability: "available" | "busy" | "offline" | null;
  starting_price: number | null;
  pricing_type: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  category_name: string | null;
  distance_km: number;
  avatar_url: string | null;
  completed_jobs_count: number;
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  return `${km.toFixed(1)} km away`;
}

function initials(fullName: string): string {
  return fullName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ArtisanListCard({ artisan }: { artisan: ArtisanCardData }) {
  return (
    <a
      href={`/discovery/${artisan.user_id}`}
      className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-900/5 transition-shadow hover:shadow-md"
    >
      <div className="relative flex-shrink-0">
        {artisan.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artisan.avatar_url}
            alt={artisan.full_name}
            className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-base font-bold text-teal-700">
            {initials(artisan.full_name)}
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-bold text-slate-900">{artisan.full_name}</p>
            <CheckCircle2 size={13} className="flex-shrink-0 text-teal-600" />
          </div>
          <div className="flex-shrink-0 text-right">
            {artisan.starting_price != null ? (
              <p className="text-sm font-bold text-slate-900">
                KSh {artisan.starting_price.toLocaleString()}
              </p>
            ) : (
              <p className="text-xs font-semibold text-slate-400">Quote</p>
            )}
            <p className="text-[10px] text-slate-400">
              {artisan.pricing_type === "flat" ? "flat rate" : "per job"}
            </p>
          </div>
        </div>

        {artisan.category_name && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <Briefcase size={11} />
            {artisan.category_name}
          </p>
        )}

        <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
          {artisan.rating_count ? (
            <span className="flex items-center gap-1">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              <span className="font-semibold text-slate-700">{artisan.rating_avg?.toFixed(1)}</span>
              <span>{artisan.completed_jobs_count} jobs</span>
            </span>
          ) : (
            <span>{artisan.completed_jobs_count > 0 ? `${artisan.completed_jobs_count} jobs` : "New artisan"}</span>
          )}
          <span className="flex items-center gap-1">
            <MapPin size={11} className="text-slate-400" />
            {formatDistance(artisan.distance_km)}
          </span>
        </div>
      </div>

      {artisan.availability === "available" && (
        <span className="absolute right-4 top-4 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700 sm:relative sm:right-0 sm:top-0 sm:flex-shrink-0">
          Available
        </span>
      )}
    </a>
  );
}

export function CategoryPills({
  categories,
  selected,
  onSelect,
}: {
  categories: { slug: string; name: string }[];
  selected: string;
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button
        onClick={() => onSelect("")}
        className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
          selected === ""
            ? "bg-teal-600 text-white"
            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
        }`}
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.slug}
          onClick={() => onSelect(c.slug)}
          className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            selected === c.slug
              ? "bg-teal-600 text-white"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          }`}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}