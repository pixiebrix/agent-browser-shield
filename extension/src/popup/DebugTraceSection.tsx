// Copyright (c) 2026 PixieBrix, Inc.
// Licensed under PolyForm Shield 1.0.0 — see LICENSE.

// Dev-mode trace viewer. Visible only when the user has enabled the
// "Debug trace" toggle. Renders the IDB-backed trace grouped by segment
// (initial-load / route-change / modal-open / mutation-burst) so the
// reader can see which rule fired where in the page-session timeline,
// and can expand each event to inspect the captured before/after HTML.

import { useState } from "react";
import type {
  DebugTraceEntry,
  RuleApplicationEvent,
  SegmentKind,
  SegmentMarker,
} from "../lib/detection-messages";
import { RULE_LABELS } from "./rule-labels";
import type { TabDebugTrace } from "./use-tab-debug-trace";

// Looks up a rule's human label, falling back to the raw id when the
// trace carries an id not present in RULE_LABELS (e.g. a debug build
// that registered an extra rule). Casts through `Record<string, string
// | undefined>` so the `??` fallback isn't flagged as unreachable by the
// typed RULE_LABELS shape.
function labelFor(ruleId: string): string {
  const label = (RULE_LABELS as Record<string, string | undefined>)[ruleId];
  return label ?? ruleId;
}

const SEGMENT_KIND_LABEL: Record<SegmentKind, string> = {
  "initial-load": "Initial load",
  "route-change": "Route change",
  "modal-open": "Modal opened",
  "mutation-burst": "Mutation burst",
};

interface SegmentGroup {
  segmentId: number;
  marker: SegmentMarker | null;
  events: RuleApplicationEvent[];
}

// Group events by their `segmentId`. The synthetic "segment 0" group
// catches events emitted before the first segment marker — rare in
// practice (the segment-tracker stamps `initial-load` at startup) but
// possible if a rule fires before the tracker has run.
function groupBySegment(entries: DebugTraceEntry[]): SegmentGroup[] {
  const groups = new Map<number, SegmentGroup>();
  function ensure(segmentId: number): SegmentGroup {
    let group = groups.get(segmentId);
    if (!group) {
      group = { segmentId, marker: null, events: [] };
      groups.set(segmentId, group);
    }
    return group;
  }
  for (const entry of entries) {
    if (entry.type === "segment") {
      ensure(entry.segmentId).marker = entry;
    } else {
      ensure(entry.segmentId).events.push(entry);
    }
  }
  return [...groups.values()].toSorted((a, b) => a.segmentId - b.segmentId);
}

export function DebugTraceSection({ trace }: { trace: TabDebugTrace }) {
  const groups = groupBySegment(trace.entries);
  const totalEvents = trace.entries.filter(
    (entry) => entry.type === "rule-application",
  ).length;
  return (
    <section className="debug-trace">
      <header className="debug-trace__header">
        <h2 className="debug-trace__heading">Debug trace</h2>
        <div className="debug-trace__actions">
          <button
            type="button"
            className="debug-trace__action"
            onClick={trace.reload}
            disabled={trace.loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="debug-trace__action"
            onClick={() => {
              const payload = JSON.stringify(trace.entries, null, 2);
              void navigator.clipboard.writeText(payload);
            }}
            disabled={trace.entries.length === 0}
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="debug-trace__action"
            onClick={() => {
              void trace.clear();
            }}
            disabled={trace.entries.length === 0}
          >
            Clear
          </button>
        </div>
      </header>
      {trace.loading && <p className="debug-trace__empty">Loading trace…</p>}
      {!trace.loading && trace.entries.length === 0 && (
        <p className="debug-trace__empty">
          No trace events for this tab yet. Reload the page with the toggle on
          to capture.
        </p>
      )}
      {!trace.loading && trace.entries.length > 0 && (
        <p className="debug-trace__meta">
          {totalEvents} event{totalEvents === 1 ? "" : "s"} across{" "}
          {groups.length} segment{groups.length === 1 ? "" : "s"}.
        </p>
      )}
      <ol className="debug-trace__segments">
        {groups.map((group) => (
          <SegmentBlock key={group.segmentId} group={group} />
        ))}
      </ol>
    </section>
  );
}

function SegmentBlock({ group }: { group: SegmentGroup }) {
  const label = group.marker
    ? SEGMENT_KIND_LABEL[group.marker.kind]
    : "Pre-segment";
  const meta = group.marker?.meta ?? {};
  const metaText = Object.entries(meta)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  return (
    <li className="segment">
      <div className="segment__header">
        <span className="segment__label">{label}</span>
        {metaText && <span className="segment__meta">{metaText}</span>}
      </div>
      {group.events.length === 0 ? (
        <p className="segment__empty">No rule activity in this segment.</p>
      ) : (
        <ul className="segment__events">
          {group.events.map((event) => (
            <RuleApplicationItem
              key={`${event.segmentId}:${event.timestamp}:${event.ruleId}`}
              event={event}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RuleApplicationItem({ event }: { event: RuleApplicationEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="trace-event">
      <button
        type="button"
        className="trace-event__row"
        onClick={() => {
          setExpanded((value) => !value);
        }}
        aria-expanded={expanded}
      >
        <span className="trace-event__rule">{labelFor(event.ruleId)}</span>
        <span className="trace-event__kind">{event.kind}</span>
      </button>
      {expanded && (
        <div className="trace-event__detail">
          <p className="trace-event__selector">
            <strong>Selector:</strong> {event.selector || "(none)"}
          </p>
          {event.beforeText !== undefined && (
            <p className="trace-event__before-text">
              <strong>Before text:</strong> <code>{event.beforeText}</code>
            </p>
          )}
          {event.beforeHtml && (
            <details>
              <summary>Before HTML</summary>
              <pre className="trace-event__html">{event.beforeHtml}</pre>
            </details>
          )}
          {event.afterHtml && (
            <details>
              <summary>After HTML</summary>
              <pre className="trace-event__html">{event.afterHtml}</pre>
            </details>
          )}
        </div>
      )}
    </li>
  );
}
