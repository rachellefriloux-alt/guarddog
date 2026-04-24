import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { join } from 'path';
import { readFileSync } from 'fs';

@Injectable()
export class EseecloudAdapter {
  private readonly log = new Logger(EseecloudAdapter.name);
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;
  private readonly placeholder: Buffer;

  constructor() {
    this.baseUrl =
      process.env.ESEECLOUD_ADAPTER_BASE || 'http://localhost:6000';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 5000,
      responseType: 'arraybuffer',
      headers: { 'User-Agent': 'GuardDog-EseecloudAdapter/1.0' },
    });

    // Load a small placeholder JPEG shipped with the backend if available,
    // otherwise use a minimal embedded 1x1 JPEG hex fallback.
    let placeholder: Buffer;
    try {
      const p = join(__dirname, '..', '..', 'assets', 'placeholder.jpg');
      placeholder = readFileSync(p);
    } catch {
      // 1x1 JPEG fallback
      placeholder = Buffer.from(
        'ffd8ffe000104a46494600010101006000600000ffd9',
        'hex',
      );
    }
    this.placeholder = placeholder;
  }

  /**
   * Fetch the latest JPEG frame for a given device key from the adapter.
   * Returns a Buffer containing JPEG bytes.
   */
  async getFrame(deviceKey: string): Promise<Buffer> {
    try {
      const url = `/internal/devices/${encodeURIComponent(deviceKey)}/frame`;
      this.log.debug(`Fetching frame from EseeCloud adapter ${url}`);
      const resp = await this.client.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
      });
      const buf = Buffer.from(resp.data);
      if (buf.length === 0) {
        this.log.warn(
          `Empty frame returned for device ${deviceKey}; returning placeholder`,
        );
        return this.placeholder;
      }
      return buf;
    } catch (err: any) {
      this.log.warn(
        `Failed to fetch frame for ${deviceKey}: ${err?.message || err}`,
      );
      return this.placeholder;
    }
  }

  /**
   * Trigger start of talk for a device.
   * Adapter should map deviceKey to the correct UI control.
   */
  async startTalk(
    deviceKey: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = `/internal/devices/${encodeURIComponent(deviceKey)}/talk/start`;
      this.log.debug(`POST ${url}`);
      await this.client.post(url);
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message || 'unknown';
      this.log.warn(`startTalk failed for ${deviceKey}: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  /**
   * Trigger stop of talk for a device.
   */
  async stopTalk(
    deviceKey: string,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const url = `/internal/devices/${encodeURIComponent(deviceKey)}/talk/stop`;
      this.log.debug(`POST ${url}`);
      await this.client.post(url);
      return { ok: true };
    } catch (err: any) {
      const msg = err?.message || 'unknown';
      this.log.warn(`stopTalk failed for ${deviceKey}: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
