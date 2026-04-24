import React from "react";

type Props = {
  deviceId: string;
  deviceName: string;
  onBack: () => void;
  onOpenEvents: () => void;
  onSnapshot: () => void;
  onToggleTalk: () => void;
  isTalking: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onFullscreen?: () => void;
  /**
   * Whether this device supports two-way talk. Per the ARCHITECTURE spec
   * only EseeCloud cameras (routed through the desktop app adapter) can
   * Talk; Ring devices should hide / disable the button.
   */
  canTalk?: boolean;
};

/**
 * Single-camera full-screen view (per ARCHITECTURE.md Phase 6 / README
 * "Single-Cam View").
 *
 * Shows a placeholder for the live HLS/WebRTC player and the standard
 * control row: Back · Mute · Talk · Snapshot · Events · Fullscreen.
 *
 * Talk wiring contract (caller is responsible):
 *   - Press Talk  → POST /api/devices/:id/talk/start
 *   - Press Stop  → POST /api/devices/:id/talk/stop
 */
export const SingleCamView: React.FC<Props> = ({
  deviceId,
  deviceName,
  onBack,
  onOpenEvents,
  onSnapshot,
  onToggleTalk,
  isTalking,
  isMuted,
  onToggleMute,
  onFullscreen,
  canTalk = true,
}) => {
  return (
    <div className="flex h-full w-full flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
        <button
          onClick={onBack}
          className="text-sm text-slate-300 hover:text-teal-300"
          data-testid="single-cam-back"
        >
          ← Back
        </button>
        <h2 className="text-sm font-semibold">{deviceName}</h2>
        <div className="w-10" />
      </div>

      <div className="flex flex-1 items-center justify-center bg-black">
        {/* TODO: HLS/WebRTC player for this deviceId. */}
        <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-400">
          Live stream: {deviceName} ({deviceId})
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
        <button
          onClick={onToggleMute}
          className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700"
          data-testid="single-cam-mute"
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>
        {canTalk && (
          <button
            onClick={onToggleTalk}
            className={
              "rounded px-3 py-1 text-xs " +
              (isTalking
                ? "bg-red-600 hover:bg-red-500"
                : "bg-teal-600 hover:bg-teal-500")
            }
            data-testid="single-cam-talk"
          >
            {isTalking ? "Stop Talk" : "Talk"}
          </button>
        )}
        <button
          onClick={onSnapshot}
          className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700"
          data-testid="single-cam-snapshot"
        >
          Snapshot
        </button>
        <button
          onClick={onOpenEvents}
          className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700"
          data-testid="single-cam-events"
        >
          Events
        </button>
        <button
          onClick={onFullscreen}
          className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700"
          data-testid="single-cam-fullscreen"
        >
          Fullscreen
        </button>
      </div>
    </div>
  );
};

export default SingleCamView;
