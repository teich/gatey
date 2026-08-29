import "server-only";

import { spawn } from "node:child_process";

export const cameraNames = ["person", "road"] as const;
export type CameraName = typeof cameraNames[number];

type CachedSnapshot = {
  image: Buffer;
  capturedAt: number;
  expiresAt: number;
};

const SNAPSHOT_TTL_MS = 3_000;
const CAPTURE_TIMEOUT_MS = 12_000;
const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

const globalForCameraSnapshots = globalThis as unknown as {
  gateyCameraSnapshots?: Map<CameraName, CachedSnapshot>;
  gateyCameraCapturePromises?: Map<CameraName, Promise<CachedSnapshot>>;
};

const snapshots = globalForCameraSnapshots.gateyCameraSnapshots ?? new Map<CameraName, CachedSnapshot>();
const captures = globalForCameraSnapshots.gateyCameraCapturePromises ?? new Map<CameraName, Promise<CachedSnapshot>>();

if (process.env.NODE_ENV !== "production") {
  globalForCameraSnapshots.gateyCameraSnapshots = snapshots;
  globalForCameraSnapshots.gateyCameraCapturePromises = captures;
}

function cameraUrl(camera: CameraName) {
  return camera === "person" ? process.env.GATEY_CAMERA_PERSON_RTSPS_URL : process.env.GATEY_CAMERA_ROAD_RTSPS_URL;
}

function usesPrivateCertificate() {
  return ["1", "true", "yes"].includes((process.env.GATEY_CAMERA_INSECURE_TLS || "").toLowerCase());
}

export function isCameraName(value: string): value is CameraName {
  return cameraNames.some((camera) => camera === value);
}

export function camerasConfigured() {
  return cameraNames.every((camera) => Boolean(cameraUrl(camera)));
}

async function captureSnapshot(camera: CameraName): Promise<CachedSnapshot> {
  const url = cameraUrl(camera);
  if (!url) throw new Error("Camera is not configured.");

  const args = [
    "-hide_banner",
    "-loglevel", "error",
    "-rtsp_transport", "tcp",
    ...(usesPrivateCertificate() ? ["-tls_verify", "0"] : []),
    // An HEVC stream can begin on a predicted frame whose references were sent
    // before ffmpeg connected. Waiting for the next keyframe prevents a valid
    // but visibly corrupt JPEG from being returned as the snapshot.
    "-skip_frame", "nokey",
    "-i", url,
    "-frames:v", "1",
    "-an",
    "-q:v", "4",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "pipe:1",
  ];

  return new Promise((resolve, reject) => {
    const captureProcess = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let byteCount = 0;
    let stderr = "";
    let timedOut = false;
    let overLimit = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      captureProcess.kill("SIGKILL");
    }, CAPTURE_TIMEOUT_MS);

    captureProcess.stdout.on("data", (chunk: Buffer) => {
      byteCount += chunk.length;
      if (byteCount > MAX_SNAPSHOT_BYTES) {
        overLimit = true;
        captureProcess.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });
    captureProcess.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    captureProcess.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("Camera capture could not start."));
    });
    captureProcess.on("close", (code) => {
      clearTimeout(timeout);
      const image = Buffer.concat(chunks);
      const isCompleteJpeg = image.length >= 4
        && image[0] === 0xff
        && image[1] === 0xd8
        && image[image.length - 2] === 0xff
        && image[image.length - 1] === 0xd9;
      if (code === 0 && isCompleteJpeg) {
        const capturedAt = Date.now();
        resolve({ image, capturedAt, expiresAt: capturedAt + SNAPSHOT_TTL_MS });
        return;
      }
      if (timedOut) reject(new Error("Camera capture timed out."));
      else if (overLimit) reject(new Error("Camera snapshot was too large."));
      else if (byteCount > 0) reject(new Error("Camera returned an incomplete image."));
      else reject(new Error(stderr ? "Camera capture failed." : "Camera did not return an image."));
    });
  });
}

export async function getCameraSnapshot(camera: CameraName) {
  const cached = snapshots.get(camera);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const existingCapture = captures.get(camera);
  if (existingCapture) return existingCapture;

  const capture = captureSnapshot(camera)
    .then((snapshot) => {
      snapshots.set(camera, snapshot);
      return snapshot;
    })
    .finally(() => captures.delete(camera));
  captures.set(camera, capture);
  return capture;
}
