"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2 } from "lucide-react";

interface MapArtisan {
  user_id: string;
  full_name: string;
  latitude: number;
  longitude: number;
  availability?: "available" | "busy" | "offline" | null;
}

interface DiscoveryMapProps {
  center: { lat: number; lng: number };
  artisans: MapArtisan[];
  selectedId?: string | null;
  onSelectMarker?: (id: string) => void;
  onLocationChange?: (coords: { lat: number; lng: number }) => void;
}

const userIcon = L.divIcon({
  className: "",
  html: `<div style="
    width: 16px; height: 16px; border-radius: 9999px;
    background: #0D9488; border: 3px solid white;
    box-shadow: 0 0 0 2px rgba(13,148,136,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function artisanIcon(isSelected: boolean, availability?: "available" | "busy" | "offline" | null) {
  const size = isSelected ? 22 : 14;
  // available = gold/white as before, busy = amber ring, offline = gray
  // (offline artisans shouldn't normally appear on the map at all since
  // the search already filters them out unless explicitly included, but
  // this keeps the icon sensible if one ever does show up)
  const borderColor =
    availability === "busy" ? "#D97706" :
    availability === "offline" ? "#94A3B8" :
    "#0D9488";

  return L.divIcon({
    className: "",
    html: `<div style="
      width: ${size}px; height: ${size}px;
      border-radius: 9999px;
      background: ${isSelected ? "#F5B700" : "#ffffff"};
      border: 2px solid ${isSelected ? "#0F172A" : borderColor};
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function DiscoveryMap({
  center,
  artisans,
  selectedId,
  onSelectMarker,
  onLocationChange,
}: DiscoveryMapProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // Escape key closes fullscreen — expected behavior for this kind of UI
  useEffect(() => {
    if (!isFullscreen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  if (!hasMounted) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-400">
        Loading map…
      </div>
    );
  }

  const mapContent = (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={12}
      scrollWheelZoom={true}
      className="h-full w-full"
      style={{ zIndex: 0 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <Marker
        position={[center.lat, center.lng]}
        icon={userIcon}
        draggable={!!onLocationChange}
        eventHandlers={{
          dragend: (e) => {
            const marker = e.target;
            const pos = marker.getLatLng();
            onLocationChange?.({ lat: pos.lat, lng: pos.lng });
          },
        }}
      >
        <Popup>{onLocationChange ? "Drag to set your location" : "Your location"}</Popup>
      </Marker>

      {artisans.map((artisan) => (
        <Marker
          key={artisan.user_id}
          position={[artisan.latitude, artisan.longitude]}
          icon={artisanIcon(artisan.user_id === selectedId, artisan.availability)}
          eventHandlers={{
            click: () => onSelectMarker?.(artisan.user_id),
          }}
        >
          <Popup>{artisan.full_name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );

  return (
    <>
      {/* Inline (sidebar) map */}
      <div className="relative h-full min-h-[300px] w-full overflow-hidden rounded-xl">
        {mapContent}
        <button
          onClick={() => setIsFullscreen(true)}
          className="absolute right-3 top-3 z-[1000] flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-md ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50"
          aria-label="Expand map"
        >
          <Maximize2 size={15} className="text-slate-600" />
        </button>
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-[2000] bg-white">
          <div className="relative h-full w-full">
            <MapContainer
              center={[center.lat, center.lng]}
              zoom={12}
              scrollWheelZoom={true}
              className="h-full w-full"
              style={{ zIndex: 0 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Marker
                position={[center.lat, center.lng]}
                icon={userIcon}
                draggable={!!onLocationChange}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target;
                    const pos = marker.getLatLng();
                    onLocationChange?.({ lat: pos.lat, lng: pos.lng });
                  },
                }}
              >
                <Popup>{onLocationChange ? "Drag to set your location" : "Your location"}</Popup>
              </Marker>
              {artisans.map((artisan) => (
                <Marker
                  key={artisan.user_id}
                  position={[artisan.latitude, artisan.longitude]}
                  icon={artisanIcon(artisan.user_id === selectedId, artisan.availability)}
                  eventHandlers={{
                    click: () => onSelectMarker?.(artisan.user_id),
                  }}
                >
                  <Popup>{artisan.full_name}</Popup>
                </Marker>
              ))}
            </MapContainer>

            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute right-4 top-4 z-[2001] flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-lg ring-1 ring-slate-900/10 transition-colors hover:bg-slate-50"
              aria-label="Exit fullscreen"
            >
              <Minimize2 size={18} className="text-slate-700" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}