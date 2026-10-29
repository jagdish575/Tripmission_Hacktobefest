import type { Itinerary, TimelineEvent } from "../types/api";

export type SegmentKind = "travel" | "wait" | "overnight" | "buffer" | "late";

export interface Segment {
  kind: SegmentKind;
  label: string;
  start: number;
  end: number;
  minutes: number;
  /** Share of the bar (0–1). Overnight stays are drawn compressed; every label keeps the real duration. */
  weight: number;
  /** Extra minutes this stage can take in practice: a traffic range, or a flight flagged as often delayed. */
  extraMinutes: number;
  extraReason: string | null;
}

export interface Runway {
  segments: Segment[];
  start: number;
  arrive: number;
  deadline: number;
  bufferMinutes: number;
  requiredMinutes: number;
  /** Arrival if every stage ran to its typical maximum (traffic ranges, delay flags), when that's known. */
  worstArrive: number | null;
  /** 0–1 position of a moment on the bar. */
  at: (t: number) => number;
}

/**
 * "HH:MM" for a timestamp built with Date.parse from the engine's times. Those are naive local times (no offset),
 * which Date.parse reads as browser-local, so local hours and minutes give back the same clock reading.
 */
export function clockAt(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WAITS = /check-in|security|deplane|exit|freshen|wait/i;
const DELAY_FLAG_MINUTES = 30; // Google Flights' "often delayed by 30+ min"

/**
 * Turns an itinerary's timeline (real event times from the engine) into the stages of a door-to-venue bar, ending
 * with the buffer before the deadline — or the minutes late after it. Nothing is invented: stage boundaries are the
 * timeline's own times, and "extra" minutes only come from traffic ranges and delay flags in the data.
 */
export function buildRunway(it: Itinerary, requiredMinutes: number): Runway | null {
  const events = it.timeline.filter((e) => e.kind !== "deadline");
  const arriveIdx = events.findIndex((e) => e.kind === "arrive");
  const path = arriveIdx >= 0 ? events.slice(0, arriveIdx + 1) : events;
  if (path.length < 2) return null;
  const arrive = Date.parse(it.arrival.venue_arrival);
  const deadline = Date.parse(it.arrival.deadline);
  const start = Date.parse(path[0].time);
  if (![arrive, deadline, start].every(Number.isFinite)) return null;

  const raw: Omit<Segment, "weight">[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = Date.parse(path[i].time);
    const b = Date.parse(path[i + 1].time);
    if (!(b > a)) continue;
    const label = path[i].mode_to_next ?? "Wait";
    const kind: SegmentKind = label === "Overnight" ? "overnight" : WAITS.test(label) || !path[i].mode_to_next ? "wait" : "travel";
    let extraMinutes = 0;
    let extraReason: string | null = null;
    const leg = it.legs.find((l) => Date.parse(l.depart_at) === a);
    if (kind === "travel" && leg?.typical_max_minutes && leg.typical_max_minutes > leg.duration_minutes) {
      extraMinutes = leg.typical_max_minutes - leg.duration_minutes;
      extraReason = `Traffic can add up to ${extraMinutes} min`;
    } else if (kind === "travel" && /flight/i.test(label) && it.flight?.often_delayed) {
      extraMinutes = DELAY_FLAG_MINUTES;
      extraReason = "Often delayed by 30+ min";
    }
    raw.push({ kind, label, start: a, end: b, minutes: Math.round((b - a) / 60000), extraMinutes, extraReason });
  }
  if (arrive <= deadline) {
    raw.push({ kind: "buffer", label: "Buffer", start: arrive, end: deadline, minutes: Math.round((deadline - arrive) / 60000), extraMinutes: 0, extraReason: null });
  } else {
    raw.push({ kind: "late", label: "Late", start: deadline, end: arrive, minutes: Math.round((arrive - deadline) / 60000), extraMinutes: 0, extraReason: null });
  }

  // overnight stays would swallow the bar: draw them at most 90 min wide; very short stages stay visible
  const visual = raw.map((s) => Math.max(s.kind === "overnight" ? Math.min(s.minutes, 90) : s.minutes, 4));
  const total = visual.reduce((x, y) => x + y, 0);
  const segments: Segment[] = raw.map((s, i) => ({ ...s, weight: visual[i] / total }));

  const at = (t: number) => {
    let acc = 0;
    for (const s of segments) {
      if (t <= s.end || s === segments[segments.length - 1]) {
        const f = s.end > s.start ? Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start))) : 0;
        return Math.min(1, Math.max(0, acc + f * s.weight));
      }
      acc += s.weight;
    }
    return 1;
  };

  const extra = segments.reduce((x, s) => x + s.extraMinutes, 0);
  return {
    segments, start, arrive, deadline, at, requiredMinutes,
    bufferMinutes: it.arrival.buffer_minutes,
    worstArrive: extra > 0 ? arrive + extra * 60000 : null,
  };
}

export interface StageNode {
  kind: TimelineEvent["kind"];
  title: string;
  detail: string | null;
  time: string;
}

export interface StageLink {
  label: string;
  /** main = the flight / train / bus itself; ground = taxis, metro, walks; wait = check-in, exits; overnight = a stay */
  kind: "main" | "ground" | "wait" | "overnight";
  minutes: number;
  distanceKm: number | null;
  /** Cost of this stage when the data has one (a ground leg's fare, or the main ticket). */
  cost: number | null;
  costEstimated: boolean;
  extraReason: string | null;
}

/**
 * The journey as the engine timed it: one node per timeline event up to arrival at the venue, one link per gap.
 * Costs and risk notes are attached only where the itinerary carries them — nothing is filled in.
 */
export function journeyStages(it: Itinerary): { nodes: StageNode[]; links: StageLink[] } {
  const events = it.timeline.filter((e) => e.kind !== "deadline");
  const arriveIdx = events.findIndex((e) => e.kind === "arrive");
  const path = arriveIdx >= 0 ? events.slice(0, arriveIdx + 1) : events;
  const mainStart = Date.parse(it.main.departure_time);
  const nodes = path.map((e) => ({ kind: e.kind, title: e.title, detail: e.detail, time: e.time }));
  const links: StageLink[] = path.slice(0, -1).map((e, i) => {
    const a = Date.parse(e.time);
    const b = Date.parse(path[i + 1].time);
    const label = e.mode_to_next ?? "Wait";
    const kind: StageLink["kind"] = label === "Overnight" ? "overnight"
      : WAITS.test(label) || !e.mode_to_next ? "wait"
      : a === mainStart ? "main" : "ground";
    const leg = it.legs.find((l) => Date.parse(l.depart_at) === a);
    let extraReason: string | null = null;
    if (leg?.typical_max_minutes && leg.typical_max_minutes > leg.duration_minutes) {
      extraReason = `Traffic can add up to ${leg.typical_max_minutes - leg.duration_minutes} min`;
    } else if (kind === "main" && it.flight?.often_delayed) {
      extraReason = "Often delayed by 30+ min";
    }
    const cost = kind === "main" ? it.cost?.ticket ?? null : leg && leg.cost > 0 ? leg.cost : null;
    return {
      label, kind, extraReason, cost,
      costEstimated: kind === "main" ? it.cost?.ticket_source === "estimated" : Boolean(leg?.estimated),
      minutes: Math.max(0, Math.round((b - a) / 60000)),
      distanceKm: e.distance_to_next_km,
    };
  });
  return { nodes, links };
}
