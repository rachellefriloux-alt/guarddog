import { describe, it, expect, beforeEach } from "vitest";

import {
  RingDirectStreamer,
  buildHlsOutputArgs,
  type RingCameraLike,
  type RingStreamingSessionLike,
} from "../services/ring-direct-streamer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Recorded {
  mkdirCalls: Array<{ dir: string }>;
  rmCalls: Array<{ dir: string }>;
}

function makeFs(): { fs: NonNullable<ConstructorParameters<typeof RingDirectStreamer>[0]["fs"]>; recorded: Recorded } {
  const recorded: Recorded = { mkdirCalls: [], rmCalls: [] };
  return {
    recorded,
    fs: {
      mkdir: async (dir) => {
        recorded.mkdirCalls.push({ dir });
      },
      rm: async (dir) => {
        recorded.rmCalls.push({ dir });
      },
    },
  };
}

interface FakeSession extends RingStreamingSessionLike {
  stopped: boolean;
  /** Trigger Ring's "call ended" event. */
  endCall(): void;
}

function makeFakeSession(): FakeSession {
  let listener: (() => void) | null = null;
  const session: FakeSession = {
    stopped: false,
    onCallEnded: {
      subscribe(fn) {
        listener = fn;
        return { unsubscribe: () => { listener = null; } };
      },
    },
    stop() {
      this.stopped = true;
    },
    endCall() {
      listener?.();
    },
  };
  return session;
}

interface FakeCamera extends RingCameraLike {
  streamCalls: number;
  lastOutput: Array<string | number> | null;
  /** The session returned by the next call. */
  nextSession: FakeSession;
}

function makeFakeCamera(id: string): FakeCamera {
  const cam: FakeCamera = {
    id,
    streamCalls: 0,
    lastOutput: null,
    nextSession: makeFakeSession(),
    async streamVideo(opts) {
      this.streamCalls += 1;
      this.lastOutput = opts.output;
      return this.nextSession;
    },
  };
  return cam;
}

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

describe("buildHlsOutputArgs", () => {
  it("includes -hls_segment_filename + final playlist path", () => {
    const args = buildHlsOutputArgs({ hlsDir: "/var/hls/ring_42" });
    const i = args.indexOf("-hls_segment_filename");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("/var/hls/ring_42/segment_%05d.ts");
    // Final arg is the playlist path — that's what ffmpeg uses as the output.
    expect(args[args.length - 1]).toBe("/var/hls/ring_42/playlist.m3u8");
  });

  it("uses safe defaults and clamps non-positive overrides", () => {
    const a = buildHlsOutputArgs({ hlsDir: "/x" });
    expect(a).toContain("-hls_time");
    expect(a[a.indexOf("-hls_time") + 1]).toBe("2");
    expect(a[a.indexOf("-hls_list_size") + 1]).toBe("6");
    const b = buildHlsOutputArgs({ hlsDir: "/x", hlsSeconds: 0, hlsListSize: -5 });
    expect(b[b.indexOf("-hls_time") + 1]).toBe("1");
    expect(b[b.indexOf("-hls_list_size") + 1]).toBe("1");
  });

  it("requests segment deletion so the recordings dir doesn't grow unbounded", () => {
    const args = buildHlsOutputArgs({ hlsDir: "/x" });
    const flags = args[args.indexOf("-hls_flags") + 1] as string;
    expect(flags).toContain("delete_segments");
  });
});

// ---------------------------------------------------------------------------
// Streamer
// ---------------------------------------------------------------------------

describe("RingDirectStreamer", () => {
  let fs: ReturnType<typeof makeFs>;
  beforeEach(() => {
    fs = makeFs();
  });

  function makeStreamer(cameras: Map<string, RingCameraLike | null>) {
    return new RingDirectStreamer({
      hlsRoot: "/var/recordings",
      resolveCamera: async (id) => cameras.get(id) ?? null,
      fs: fs.fs,
    });
  }

  it("creates a session, returns a stable hlsUrl shape, and writes to a per-device dir", async () => {
    const cam = makeFakeCamera("12345");
    const streamer = makeStreamer(new Map([["12345", cam]]));

    const handle = await streamer.start("12345");

    expect(cam.streamCalls).toBe(1);
    expect(handle.deviceId).toBe("12345");
    expect(handle.hlsDir).toBe("/var/recordings/ring_12345");
    expect(handle.hlsUrl).toBe("/api/stream/ring/12345/playlist.m3u8");
    // Stale dir is wiped, then re-created.
    expect(fs.recorded.rmCalls[0]?.dir).toBe("/var/recordings/ring_12345");
    expect(fs.recorded.mkdirCalls[0]?.dir).toBe("/var/recordings/ring_12345");
    // ffmpeg was given a real output path, not the broken "no destination" form.
    expect(cam.lastOutput?.[cam.lastOutput.length - 1]).toBe("/var/recordings/ring_12345/playlist.m3u8");
  });

  it("is idempotent: re-calling start() reuses the existing session", async () => {
    const cam = makeFakeCamera("1");
    const streamer = makeStreamer(new Map([["1", cam]]));

    const a = await streamer.start("1");
    const b = await streamer.start("1");

    expect(b).toBe(a);
    expect(cam.streamCalls).toBe(1); // Critical: don't open a 2nd WebRTC session
    expect(streamer.active()).toEqual(["1"]);
  });

  it("throws when the deviceId isn't in the Ring account", async () => {
    const streamer = makeStreamer(new Map());
    await expect(streamer.start("ghost")).rejects.toThrow(/not found/i);
    expect(streamer.active()).toEqual([]);
  });

  it("stop() tears down the underlying session and removes the dir", async () => {
    const cam = makeFakeCamera("9");
    const streamer = makeStreamer(new Map([["9", cam]]));
    await streamer.start("9");

    await streamer.stop("9");

    expect(cam.nextSession.stopped).toBe(true);
    expect(streamer.isActive("9")).toBe(false);
    // 1st rm = pre-create wipe, 2nd rm = teardown cleanup.
    expect(fs.recorded.rmCalls.length).toBe(2);
  });

  it("stop() is a no-op when the device isn't streaming", async () => {
    const streamer = makeStreamer(new Map());
    await expect(streamer.stop("nope")).resolves.toBeUndefined();
  });

  it("auto-cleans the session when Ring fires onCallEnded", async () => {
    const cam = makeFakeCamera("7");
    const streamer = makeStreamer(new Map([["7", cam]]));
    await streamer.start("7");
    expect(streamer.isActive("7")).toBe(true);

    cam.nextSession.endCall();
    // teardown is async; let microtasks flush.
    await new Promise((r) => setImmediate(r));

    expect(streamer.isActive("7")).toBe(false);
    // After auto-cleanup, the next start() must negotiate a fresh session.
    cam.nextSession = makeFakeSession();
    await streamer.start("7");
    expect(cam.streamCalls).toBe(2);
  });

  it("stopAll() tears down every active session", async () => {
    const a = makeFakeCamera("a");
    const b = makeFakeCamera("b");
    const streamer = makeStreamer(new Map<string, RingCameraLike>([
      ["a", a],
      ["b", b],
    ]));
    await streamer.start("a");
    await streamer.start("b");

    await streamer.stopAll();

    expect(streamer.active()).toEqual([]);
    expect(a.nextSession.stopped).toBe(true);
    expect(b.nextSession.stopped).toBe(true);
  });

  it("swallows errors from session.stop() and from fs.rm during teardown", async () => {
    const cam = makeFakeCamera("flaky");
    cam.nextSession.stop = () => { throw new Error("already gone"); };
    const flakyFs = makeFs();
    flakyFs.fs.rm = async () => { throw new Error("EBUSY"); };
    const streamer = new RingDirectStreamer({
      hlsRoot: "/r",
      resolveCamera: async () => cam,
      fs: flakyFs.fs,
    });

    // start() does an initial rm — it must also tolerate failure since we
    // catch in teardown but not pre-create. Verify the streamer surfaces
    // the pre-create rm failure (it's distinct from teardown).
    await expect(streamer.start("flaky")).rejects.toThrow(/EBUSY/);

    // Now build a streamer where rm only fails during teardown.
    let rmCalls = 0;
    const flakyTeardownFs = {
      mkdir: async () => {},
      rm: async () => {
        rmCalls += 1;
        if (rmCalls > 1) throw new Error("EBUSY-teardown");
      },
    };
    const cam2 = makeFakeCamera("flaky2");
    cam2.nextSession.stop = () => { throw new Error("already gone"); };
    const streamer2 = new RingDirectStreamer({
      hlsRoot: "/r",
      resolveCamera: async () => cam2,
      fs: flakyTeardownFs,
    });
    await streamer2.start("flaky2");
    await expect(streamer2.stop("flaky2")).resolves.toBeUndefined();
    expect(streamer2.isActive("flaky2")).toBe(false);
  });

  it("respects a custom publicUrlPrefix", async () => {
    const cam = makeFakeCamera("c");
    const streamer = new RingDirectStreamer({
      hlsRoot: "/r",
      resolveCamera: async () => cam,
      fs: fs.fs,
      publicUrlPrefix: "/streams/ring/",
    });
    const handle = await streamer.start("c");
    expect(handle.hlsUrl).toBe("/streams/ring/c/playlist.m3u8");
  });
});
