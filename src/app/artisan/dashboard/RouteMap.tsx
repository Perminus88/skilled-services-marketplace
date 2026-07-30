"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchRoute, type RoutePoint } from "@/lib/routing";
import { Loader2, Navigation } from "lucide-react";

interface RouteMapProps {
  from: RoutePoint;   // artisan's location
  to: RoutePoint;     // client's booking location
  clientName: string;
}

const artisanIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 16px; height: 16px; border-radius: 9999px;
    background: #0D9488; border: 3px solid white;
    box-shadow: 0 0 0 2px rgba(13,148,136,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const clientIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 16px; height: 16px; border-radius: 9999px;
    background: #F5B700; border: 3px solid #0F172A;
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function RouteMap({ from, to, clientName }: RouteMapProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [route, setRoute] = useState<Awaited<ReturnType<typeof fetchRoute>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRoute(from, to).then((result) => {
      if (!cancelled) {
        setRoute(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.lat, from.lng, to.lat, to.lng]);

  if (!hasMounted) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
        Loading map…
      </div>
    );
  }

  // Center the map on the midpoint between artisan and client so both
  // markers are reliably visible on load, regardless of distance/direction.
  const midpoint: [number, number] = [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2];

  return (
    <div className="overflow-hidden rounded-xl">
      <MapContainer center={midpoint} zoom={12} scrollWheelZoom={true} className="h-64 w-full" style={{ zIndex: 0 }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Marker position={[from.lat, from.lng]} icon={artisanIcon}>
          <Popup>You</Popup>
        </Marker>
        <Marker position={[to.lat, to.lng]} icon={clientIcon}>
          <Popup>{clientName}</Popup>
        </Marker>

        {route && <Polyline positions={route.coordinates} pathOptions={{ color: "#0D9488", weight: 4 }} />}
      </MapContainer>

      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-3 py-2 text-xs text-slate-600">
        {loading ? (
          <span className="flex items-center gap-1.5 text-slate-400">
            <Loader2 size={12} className="animate-spin" /> Calculating route…
          </span>
        ) : route ? (
          <span className="flex items-center gap-1.5">
            <Navigation size={12} className="text-teal-600" />
            {route.distanceKm.toFixed(1)} km · ~{Math.round(route.durationMin)} min drive
          </span>
        ) : (
          <span className="text-slate-400">Route unavailable</span>
        )}
      </div>
    </div>
  );
}