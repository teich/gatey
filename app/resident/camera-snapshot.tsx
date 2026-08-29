"use client";

import { useState } from "react";
import type { CameraView } from "@/app/resident/model";

export function CameraSnapshot({
  camera,
  label,
  revision,
  configured,
  onSettled,
}: {
  camera: CameraView;
  label: string;
  revision: number;
  configured: boolean;
  onSettled: (camera: CameraView, revision: number, loaded: boolean) => void;
}) {
  if (!configured) return null;

  return <CameraSnapshotImage key={`${camera}-${revision}`} camera={camera} label={label} revision={revision} onSettled={onSettled} />;
}

function CameraSnapshotImage({ camera, label, revision, onSettled }: { camera: CameraView; label: string; revision: number; onSettled: (camera: CameraView, revision: number, loaded: boolean) => void }) {
  const [available, setAvailable] = useState(true);

  if (!available) return <em className="resident-camera-unavailable">Camera unavailable</em>;

  // This same-origin image request carries the resident's session cookie; Next's image optimizer cannot.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="resident-camera-image" src={`/api/cameras/${camera}/snapshot?refresh=${revision}`} alt={`Latest ${label.toLowerCase()} camera snapshot`} onLoad={() => onSettled(camera, revision, true)} onError={() => { setAvailable(false); onSettled(camera, revision, false); }} />;
}
