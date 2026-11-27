import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapPin,
  X,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Layers,
  School,
  Users,
  Clock,
  Navigation,
} from 'lucide-react';

export interface AttendanceMapPinItem {
  id: string;
  studentId: string;
  studentName: string;
  admissionNumber: string;
  classNumber: string;
  section: string;
  date: string;
  formattedTime: string;
  status: string;
  latitude: number;
  longitude: number;
  distanceMeters?: number;
  accuracyMeters?: number;
  isLocationVerified?: boolean;
  deviceId?: string;
  cameraDetectMs?: number;
  scanToDbMs?: number;
}

interface AttendanceScanMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate: string;
  allScanPins: AttendanceMapPinItem[];
  schoolName: string;
  schoolLatitude?: number;
  schoolLongitude?: number;
  geofenceRadiusMeters?: number;
}

export const AttendanceScanMapModal: React.FC<AttendanceScanMapModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  allScanPins,
  schoolName,
  schoolLatitude,
  schoolLongitude,
  geofenceRadiusMeters = 250,
}) => {
  const [selectedMapDate, setSelectedMapDate] = useState<string>(initialDate);
  const [mapStyle, setMapStyle] = useState<'osm' | 'topo' | 'radar'>('osm');
  const [focusedPinId, setFocusedPinId] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());

  useEffect(() => {
    setSelectedMapDate(initialDate);
  }, [initialDate, isOpen]);

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    allScanPins.forEach((p) => {
      if (p.date) set.add(p.date);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [allScanPins]);

  const filteredPins = useMemo(() => {
    if (!selectedMapDate) return allScanPins;
    return allScanPins.filter((p) => p.date === selectedMapDate);
  }, [allScanPins, selectedMapDate]);

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markerMapRef.current.clear();
    }

    if (mapStyle === 'radar') return;

    try {
      const defaultCenter: [number, number] =
        filteredPins.length > 0
          ? [filteredPins[0].latitude, filteredPins[0].longitude]
          : schoolLatitude !== undefined && schoolLongitude !== undefined
          ? [schoolLatitude, schoolLongitude]
          : [34.0837, 74.7973]; // Srinagar, J&K fallback

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 16,
        zoomControl: true,
        scrollWheelZoom: true,
      });

      const tileUrl =
        mapStyle === 'topo'
          ? 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
          : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const boundsPoints: Array<[number, number]> = [];

      if (schoolLatitude !== undefined && schoolLongitude !== undefined) {
        boundsPoints.push([schoolLatitude, schoolLongitude]);
        L.circle([schoolLatitude, schoolLongitude], {
          radius: geofenceRadiusMeters,
          color: '#10b981',
          weight: 2,
          fillColor: '#10b981',
          fillOpacity: 0.12,
          dashArray: '5, 8',
        }).addTo(map);

        const schoolIcon = L.divIcon({
          className: 'bg-transparent',
          html: `<div style="background:#0f172a;color:#fff;width:30px;height:30px;border-radius:9999px;border:2px solid #6366f1;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;box-shadow:0 4px 10px rgba(0,0,0,0.35);">S</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        L.marker([schoolLatitude, schoolLongitude], { icon: schoolIcon })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:11px;"><strong>${schoolName}</strong><br/><span style="color:#059669;">Campus Geofence: ${geofenceRadiusMeters}m</span></div>`
          );
      }

      filteredPins.forEach((pin, index) => {
        boundsPoints.push([pin.latitude, pin.longitude]);
        const pinColor = pin.isLocationVerified ? '#10b981' : '#f59e0b';
        const icon = L.divIcon({
          className: 'bg-transparent',
          html: `<div style="width:26px;height:26px;border-radius:9999px;background:${pinColor};color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:10px;box-shadow:0 3px 10px rgba(0,0,0,0.3);">${index + 1}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const marker = L.marker([pin.latitude, pin.longitude], { icon }).addTo(map);
        marker.bindPopup(`
          <div style="font-size:11px;line-height:1.4;">
            <div style="font-weight:800;color:#0f172a;">${pin.studentName}</div>
            <div style="color:#64748b;">Class ${pin.classNumber}-${pin.section} • ${pin.admissionNumber}</div>
            <div style="margin-top:3px;font-family:monospace;color:#334155;">${pin.date} · ${pin.formattedTime}</div>
            <div style="color:${pin.isLocationVerified ? '#059669' : '#d97706'};font-weight:700;margin-top:2px;">
              ${pin.isLocationVerified ? '✓ Campus Verified' : '⚠ Captured Location'}${
          pin.distanceMeters !== undefined ? ` (${Math.round(pin.distanceMeters)}m)` : ''
        }
            </div>
            ${
              pin.cameraDetectMs !== undefined
                ? `<div style="color:#475569;font-size:10px;margin-top:2px;">Latency: ${pin.cameraDetectMs}ms detect / ${pin.scanToDbMs ?? '—'}ms DB</div>`
                : ''
            }
          </div>
        `);
        markerMapRef.current.set(pin.id, marker);
      });

      if (boundsPoints.length > 1) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [36, 36], maxZoom: 18 });
      } else if (boundsPoints.length === 1) {
        map.setView(boundsPoints[0], 17);
      }

      mapInstanceRef.current = map;
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);

      return () => {
        clearTimeout(timer);
        map.remove();
        mapInstanceRef.current = null;
        markerMapRef.current.clear();
      };
    } catch (err) {
      console.warn('AttendanceScanMapModal map error:', err);
    }
  }, [isOpen, filteredPins, mapStyle, schoolLatitude, schoolLongitude, geofenceRadiusMeters, schoolName]);

  const handleFocusPin = (pin: AttendanceMapPinItem) => {
    setFocusedPinId(pin.id);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([pin.latitude, pin.longitude], 18, { animate: true });
      const marker = markerMapRef.current.get(pin.id);
      marker?.openPopup();
    }
  };

  if (!isOpen) return null;

  const verifiedCount = filteredPins.filter((p) => p.isLocationVerified).length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendance-scan-map-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm"
    >
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="attendance-scan-map-title" className="text-sm sm:text-base font-extrabold text-white truncate">
                QR Attendance Scan Locations Map
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {schoolName} • Interactive multi-pin GPS verification across scanned check-ins
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-slate-200">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <input
                type="date"
                value={selectedMapDate}
                onChange={(e) => setSelectedMapDate(e.target.value)}
                aria-label="Filter scan map by date"
                className="bg-transparent text-xs font-mono text-white focus:outline-none"
              />
            </label>
            {selectedMapDate && (
              <button
                type="button"
                onClick={() => setSelectedMapDate('')}
                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition-colors"
              >
                All Dates
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close scan locations map"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <div className="inline-flex rounded-lg bg-white p-0.5 border border-slate-200">
              {(['osm', 'topo', 'radar'] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setMapStyle(style)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    mapStyle === style
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {style === 'osm' ? 'Street Map' : style === 'topo' ? 'Topographic' : 'Geofence Radar'}
                </button>
              ))}
            </div>
            {availableDates.length > 0 && (
              <select
                value={selectedMapDate}
                onChange={(e) => setSelectedMapDate(e.target.value)}
                aria-label="Quick pick scan date"
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-mono text-slate-700"
              >
                <option value="">All Dates ({allScanPins.length} pins)</option>
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d} ({allScanPins.filter((p) => p.date === d).length} pins)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              {verifiedCount} Verified
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              {filteredPins.length} Total Pins
            </span>
          </div>
        </div>

        {/* Main Split Layout: Map + Pin Sidebar */}
        <div className="flex-1 min-h-[380px] grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          <div className="lg:col-span-8 relative min-h-[320px] bg-slate-950">
            {mapStyle === 'radar' ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-white relative">
                <div className="relative w-72 h-72 rounded-full border border-slate-800 flex items-center justify-center">
                  <div className="absolute inset-8 rounded-full border border-dashed border-slate-700" />
                  <div className="absolute inset-16 rounded-full border-2 border-emerald-500/60 bg-emerald-500/10 flex items-center justify-center">
                    <span className="text-[10px] font-mono text-emerald-400 absolute top-1.5 font-bold">
                      Geofence ({geofenceRadiusMeters}m)
                    </span>
                  </div>
                  <div className="relative z-10 w-9 h-9 rounded-full bg-indigo-600 border-2 border-white flex items-center justify-center shadow-lg">
                    <School className="w-4 h-4" />
                  </div>
                  {filteredPins.slice(0, 18).map((pin, idx) => {
                    const angle = (idx / Math.max(1, Math.min(filteredPins.length, 18))) * Math.PI * 2;
                    const dist = pin.distanceMeters ?? 40;
                    const ratio = Math.min(dist / (geofenceRadiusMeters * 2), 0.85);
                    const x = Math.cos(angle) * ratio * 125;
                    const y = Math.sin(angle) * ratio * 125;
                    return (
                      <div
                        key={pin.id}
                        style={{ transform: `translate(${x}px, ${y}px)` }}
                        title={`${pin.studentName} (${pin.formattedTime})`}
                        className={`absolute w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center border border-white shadow ${
                          pin.isLocationVerified ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      >
                        {idx + 1}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400 mt-4">
                  Offline Geofence Radar displaying {filteredPins.length} scan pin(s) relative to {schoolName}.
                </p>
              </div>
            ) : (
              <div ref={mapContainerRef} className="w-full h-full min-h-[340px] z-0" />
            )}
          </div>

          {/* Clickable Scan List */}
          <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col max-h-[360px] lg:max-h-full overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-extrabold text-slate-700 flex items-center justify-between">
              <span>GPS-Tagged Scans ({filteredPins.length})</span>
              <span className="font-mono text-[10px] text-slate-500">{selectedMapDate || 'All Dates'}</span>
            </div>

            {filteredPins.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 space-y-2 my-auto">
                <AlertTriangle className="w-7 h-7 text-amber-400 mx-auto" />
                <p className="font-bold text-slate-700">No GPS-tagged QR scans for this date</p>
                <p>Select another date above or acquire a GPS fix before scanning student ID cards.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 overflow-y-auto flex-1 text-xs">
                {filteredPins.map((pin, idx) => (
                  <li key={pin.id}>
                    <button
                      type="button"
                      onClick={() => handleFocusPin(pin)}
                      className={`w-full text-left px-4 py-3 hover:bg-indigo-50/60 transition-colors flex items-start gap-2.5 ${
                        focusedPinId === pin.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full text-[10px] font-extrabold text-white flex items-center justify-center shrink-0 mt-0.5 ${
                          pin.isLocationVerified ? 'bg-emerald-600' : 'bg-amber-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 truncate">{pin.studentName}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                          <span>Class {pin.classNumber}-{pin.section}</span>
                          <span>·</span>
                          <span className="font-mono">{pin.admissionNumber}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-indigo-500" />
                            {pin.formattedTime}
                          </span>
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Navigation className="w-3 h-3" />
                            {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
