// ─────────────────────────────────────────────────────────────────────────────
// Fetches a driving route between two points using OSRM's free public demo
// server. NOTE: router.project-osrm.org is explicitly rate-limited and
// intended for light/demo use only — same caveat as the OSM tile server.
// If this app sees real production traffic, budget for self-hosting OSRM
// or switching to a paid provider (Mapbox Directions, GraphHopper, etc.)
// later — this function's shape wouldn't need to change, just the base URL.
// ─────────────────────────────────────────────────────────────────────────────

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  coordinates: [number, number][];  // [lat, lng] pairs, ready for Leaflet's Polyline
  distanceKm: number;
  durationMin: number;
}

export async function fetchRoute(
  from: RoutePoint,
  to: RoutePoint
): Promise<RouteResult | null> {
  // OSRM expects lng,lat order (opposite of how we usually think of it)
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;

    // GeoJSON coordinates come as [lng, lat] — flip to [lat, lng] for Leaflet
    const coordinates: [number, number][] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    return {
      coordinates,
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    };
  } catch (err) {
    console.error("[routing] fetchRoute failed:", err);
    return null;
  }
}