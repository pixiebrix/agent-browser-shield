// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

import type { DetectionPayload } from "../lib/detection-messages";
import { useTabDetections } from "./use-tab-detections";

const DIFFICULTY_LABEL: Record<"hard" | "very-hard" | "impossible", string> = {
  hard: "hard",
  "very-hard": "very hard",
  impossible: "effectively impossible",
};

const SOURCE_LABEL: Record<"curated" | "justdeleteme", string> = {
  curated: "FTC enforcement / consumer-press list",
  justdeleteme: "JustDeleteMe directory",
};

export function DetectionsSection() {
  const detections = useTabDetections();
  if (detections === null || detections.length === 0) {
    return null;
  }
  return (
    <section className="detections">
      <h2 className="detections__heading">Heads up</h2>
      <ul className="detections__list">
        {detections.map((detection) => (
          <DetectionItem key={detection.kind} detection={detection} />
        ))}
      </ul>
    </section>
  );
}

function DetectionItem({ detection }: { detection: DetectionPayload }) {
  if (detection.kind === "roach-motel") {
    return (
      <li className="detection">
        <strong>Hard to cancel</strong>
        <p className="detection__host">{detection.host}</p>
        <p className="detection__detail">
          Cancellation is {DIFFICULTY_LABEL[detection.difficulty]} on this site.
        </p>
        {detection.cancellationUrl !== null && (
          <a
            className="detection__cancel"
            href={detection.cancellationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            How to cancel
          </a>
        )}
        <p className="detection__source">
          Source: {SOURCE_LABEL[detection.source]}
        </p>
      </li>
    );
  }
  return (
    <li className="detection">
      <strong>navigator.webdriver read</strong>
      <p className="detection__host">{detection.host}</p>
      <p className="detection__detail">
        This site can distinguish AI-agent traffic from human traffic and may
        serve different content to agents.
      </p>
    </li>
  );
}
