/**
 * ONVIF / WS-Discovery scaffold.
 *
 * Sends a single WS-Discovery probe over UDP multicast (239.255.255.250:3702)
 * and collects responses for a short window. Devices that answer expose their
 * XAddrs (the SOAP endpoint we'd use to negotiate the RTSP URL).
 *
 * This implementation is intentionally minimal — it does NOT depend on the
 * heavy `onvif` npm package because that pulls in extra native deps. It
 * returns enough structured info for the UI to show "X devices found" and
 * pre-fill IPs into the camera-add wizard. Full credential negotiation and
 * profile selection is delegated to the user (with the wizard's URL tester)
 * for the first release.
 *
 * Safe in sandboxed environments: any error is swallowed and we resolve with
 * an empty array, so the UI just shows "no devices found" instead of
 * crashing.
 */

import dgram from "node:dgram";
import { randomUUID } from "node:crypto";

export interface DiscoveredDevice {
  /** IP of the responding device. */
  address: string;
  /** SOAP endpoints advertised by the device, if any. */
  xAddrs: string[];
  /** Device hardware/scope hints from the WS-Discovery response. */
  scopes: string[];
  /** Best-guess camera label derived from the scopes. */
  label?: string;
}

const WS_DISCOVERY_ADDRESS = "239.255.255.250";
const WS_DISCOVERY_PORT = 3702;

/** Build a probe envelope targeting NetworkVideoTransmitter devices. */
function buildProbeMessage(): Buffer {
  const messageId = `urn:uuid:${randomUUID()}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>${messageId}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>`;
  return Buffer.from(xml, "utf8");
}

/**
 * Pull the contents of a tag from a WS-Discovery response. The responses are
 * tiny SOAP envelopes; we keep parsing simple to avoid a XML dependency.
 */
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}[^>]*>([^<]*)</(?:[a-zA-Z0-9]+:)?${tag}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function parseResponse(address: string, xml: string): DiscoveredDevice {
  const xAddrsRaw = extractTag(xml, "XAddrs");
  const scopesRaw = extractTag(xml, "Scopes");
  const xAddrs = xAddrsRaw ? xAddrsRaw.split(/\s+/).filter(Boolean) : [];
  const scopes = scopesRaw ? scopesRaw.split(/\s+/).filter(Boolean) : [];

  // Try to surface a friendly label from the scopes (e.g.
  // onvif://www.onvif.org/name/HikvisionDS-2CD2042FWD).
  let label: string | undefined;
  for (const scope of scopes) {
    const m = scope.match(/\/name\/(.+)$/);
    if (m) {
      label = decodeURIComponent(m[1]);
      break;
    }
  }

  return { address, xAddrs, scopes, label };
}

export interface DiscoverOptions {
  /** Reserved — currently ignored to prevent client-controlled timer values. */
  timeoutMs?: number;
}

/**
 * Run WS-Discovery and resolve with the unique devices that replied. Always
 * resolves; never throws. Returns empty array if multicast is blocked.
 */
export function discoverOnvifDevices(_opts: DiscoverOptions = {}): Promise<DiscoveredDevice[]> {
  // Fixed timeout. We deliberately do not honor a client-supplied value so a
  // hostile or buggy caller can't tie up server resources with long timers.
  const timeout = 4000;

  return new Promise((resolve) => {
    const devicesByAddress = new Map<string, DiscoveredDevice>();
    let socket: dgram.Socket | null = null;
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
      resolve(Array.from(devicesByAddress.values()));
    };

    try {
      socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    } catch (err) {
      console.warn("[ONVIF discovery] could not create UDP socket:", (err as Error).message);
      resolve([]);
      return;
    }

    socket.on("error", (err) => {
      console.warn("[ONVIF discovery] socket error:", err.message);
      cleanup();
    });

    socket.on("message", (msg, rinfo) => {
      const xml = msg.toString("utf8");
      if (!xml.includes("ProbeMatch")) return;
      const device = parseResponse(rinfo.address, xml);
      const existing = devicesByAddress.get(rinfo.address);
      if (existing) {
        // Merge xAddrs/scopes if a device replies more than once.
        const xAddrs = Array.from(new Set([...existing.xAddrs, ...device.xAddrs]));
        const scopes = Array.from(new Set([...existing.scopes, ...device.scopes]));
        devicesByAddress.set(rinfo.address, { ...existing, xAddrs, scopes, label: existing.label || device.label });
      } else {
        devicesByAddress.set(rinfo.address, device);
      }
    });

    socket.bind(0, () => {
      try {
        socket!.setBroadcast(true);
        socket!.setMulticastTTL(2);
      } catch {
        // ignore — best-effort
      }
      const probe = buildProbeMessage();
      socket!.send(probe, 0, probe.length, WS_DISCOVERY_PORT, WS_DISCOVERY_ADDRESS, (err) => {
        if (err) {
          console.warn("[ONVIF discovery] probe send failed:", err.message);
          cleanup();
        }
      });
    });

    timer = setTimeout(cleanup, timeout);
  });
}
