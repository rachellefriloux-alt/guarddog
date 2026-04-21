/**
 * Camera vendor presets
 *
 * URL templates for the most common camera vendors so users only have to
 * enter the IP/port/credentials and never the (vendor-specific, often
 * undocumented) RTSP path.
 *
 * `{ip}`, `{port}`, `{user}`, `{pass}`, `{channel}` are substituted by the
 * caller. The client UI uses these to populate the "Stream URL" field in the
 * camera-add wizard.
 */

export interface CameraPreset {
  id: string;
  label: string;
  /** Default RTSP/HTTP URL template. */
  urlTemplate: string;
  /** Optional sub-stream template (lower bitrate) — recommended for cloud sync. */
  subStreamTemplate?: string;
  defaultPort: number;
  defaultUsername?: string;
  notes?: string;
}

export const cameraPresets: CameraPreset[] = [
  {
    id: "generic-onvif",
    label: "Generic ONVIF",
    urlTemplate: "rtsp://{user}:{pass}@{ip}:{port}/onvif1",
    subStreamTemplate: "rtsp://{user}:{pass}@{ip}:{port}/onvif2",
    defaultPort: 554,
    defaultUsername: "admin",
    notes: "Most modern IP cameras expose an /onvif1 (main) and /onvif2 (sub) stream.",
  },
  {
    id: "esee-cloud",
    label: "eSeeCloud / IPCam Pro",
    urlTemplate: "rtsp://{user}:{pass}@{ip}:{port}/h264/ch{channel}/main/av_stream",
    subStreamTemplate: "rtsp://{user}:{pass}@{ip}:{port}/h264/ch{channel}/sub/av_stream",
    defaultPort: 554,
    defaultUsername: "admin",
    notes: "Channel index is usually 1 for the first camera on the NVR.",
  },
  {
    id: "hikvision",
    label: "Hikvision",
    urlTemplate: "rtsp://{user}:{pass}@{ip}:{port}/Streaming/Channels/{channel}01",
    subStreamTemplate: "rtsp://{user}:{pass}@{ip}:{port}/Streaming/Channels/{channel}02",
    defaultPort: 554,
    defaultUsername: "admin",
    notes: "Replace {channel} with 1, 2, 3… for multi-camera NVRs.",
  },
  {
    id: "dahua",
    label: "Dahua / Lorex / Amcrest",
    urlTemplate: "rtsp://{user}:{pass}@{ip}:{port}/cam/realmonitor?channel={channel}&subtype=0",
    subStreamTemplate:
      "rtsp://{user}:{pass}@{ip}:{port}/cam/realmonitor?channel={channel}&subtype=1",
    defaultPort: 554,
    defaultUsername: "admin",
  },
  {
    id: "reolink",
    label: "Reolink",
    urlTemplate: "rtsp://{user}:{pass}@{ip}:{port}/h264Preview_{channel}_main",
    subStreamTemplate: "rtsp://{user}:{pass}@{ip}:{port}/h264Preview_{channel}_sub",
    defaultPort: 554,
    defaultUsername: "admin",
    notes: "Use channel '01' for the only camera on a single-cam Reolink device.",
  },
  {
    id: "ring",
    label: "Ring (via ring-client-api)",
    urlTemplate: "ring://{ip}",
    defaultPort: 0,
    notes: "Ring devices are managed via the Ring API; use the Ring tab in Settings to link your account.",
  },
  {
    id: "tp-link-tapo",
    label: "TP-Link Tapo / Kasa",
    urlTemplate: "rtsp://{user}:{pass}@{ip}:{port}/stream1",
    subStreamTemplate: "rtsp://{user}:{pass}@{ip}:{port}/stream2",
    defaultPort: 554,
    notes: "You must enable 'Camera Account' in the Tapo app first.",
  },
];

/** Substitute placeholders in a template URL. */
export function applyPreset(
  template: string,
  values: { ip?: string; port?: number | string; user?: string; pass?: string; channel?: number | string }
): string {
  return template
    .replace(/{ip}/g, values.ip ?? "")
    .replace(/{port}/g, String(values.port ?? ""))
    .replace(/{user}/g, encodeURIComponent(values.user ?? ""))
    .replace(/{pass}/g, encodeURIComponent(values.pass ?? ""))
    .replace(/{channel}/g, String(values.channel ?? 1));
}
