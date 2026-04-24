import React from "react";

export type MultiCamDevice = {
  id: string;
  name: string;
  type: "ESEECLOUD" | "RING";
  isOnline: boolean;
};

type Props = {
  devices: MultiCamDevice[];
  onSelectDevice: (id: string) => void;
};

/**
 * Multi-camera dashboard grid (per ARCHITECTURE.md Phase 6 / README "Multi-Cam Dashboard").
 *
 * Renders a responsive grid of camera tiles (auto-fits 6 cameras across
 * 2x2 / 3x3 / 4x4 breakpoints). Each tile shows a live thumbnail
 * placeholder, the device name, and an online/offline indicator.
 *
 * The actual HLS/WebRTC player is intentionally stubbed here — it should
 * be supplied by the page that consumes this component, which knows how
 * to resolve `GET /api/devices/:id/live` to a stream URL.
 */
export const MultiCamGrid: React.FC<Props> = ({ devices, onSelectDevice }) => {
  return (
    <div className="h-full w-full bg-slate-950 p-4 text-slate-100">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">GuardDog Dashboard</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {devices.map((device) => (
          <button
            key={device.id}
            onClick={() => onSelectDevice(device.id)}
            className="relative aspect-video overflow-hidden rounded-lg border border-slate-700 bg-black transition hover:border-teal-400"
            data-testid={`multi-cam-tile-${device.id}`}
          >
            <div className="absolute inset-0">
              {/* TODO: HLS/WebRTC player goes here (thumbnail/live). */}
              <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-400">
                Live: {device.name}
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-xs">
              <span>{device.name}</span>
              <span
                className={
                  "h-2 w-2 rounded-full " +
                  (device.isOnline ? "bg-emerald-400" : "bg-red-500")
                }
              />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MultiCamGrid;
