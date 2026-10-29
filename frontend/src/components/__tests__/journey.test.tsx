import { fireEvent, render, screen } from "@testing-library/react";
import { layoutBoard } from "../../three/boardLayout";
import { haversineKm, projectToBoard, separate } from "../../three/geo";
import type { Itinerary, MissionSummary, TimelineEvent } from "../../types/api";
import { buildRunway, clockAt, journeyStages } from "../../utils/journey";
import { JourneyInstrument } from "../journey/JourneyInstrument";
import { DeadlineRunway } from "../results/DeadlineRunway";
import { journeyStops } from "../results/JourneyOverview";

const D = "2026-11-14";
const ev = (time: string, kind: TimelineEvent["kind"], mode: string | null): TimelineEvent => ({
  time: `${D}T${time}:00`, kind, title: kind, detail: null, duration_to_next_minutes: null, mode_to_next: mode, distance_to_next_km: null,
});

function itinerary(venueArrival = "10:10"): Itinerary {
  const buffer = (Date.parse(`${D}T11:00:00`) - Date.parse(`${D}T${venueArrival}:00`)) / 60000;
  return {
    id: "it1", mode: "flight", strategy: "same_day",
    main: { departure_time: `${D}T07:00:00`, arrival_time: `${D}T09:00:00` },
    flight: { departure_airport: "IDR", arrival_airport: "BLR", often_delayed: true },
    hotel: null, hotel_check_in: null,
    legs: [{ depart_at: `${D}T09:20:00`, duration_minutes: 50, typical_max_minutes: 80 }],
    timeline: [
      ev("05:00", "depart", "Taxi"), ev("05:40", "transfer", "Check-in & security"), ev("07:00", "depart", "Flight"),
      ev("09:00", "land", "Deplane & exit"), ev("09:20", "exit", "Taxi"), ev(venueArrival, "arrive", "Buffer"), ev("11:00", "deadline", null),
    ],
    arrival: { venue_arrival: `${D}T${venueArrival}:00`, deadline: `${D}T11:00:00`, buffer_minutes: buffer },
  } as unknown as Itinerary;
}

describe("door-to-venue runway", () => {
  it("turns the timeline into stages that end with the buffer", () => {
    const r = buildRunway(itinerary(), 60)!;
    expect(r.segments.map((s) => s.label)).toEqual(["Taxi", "Check-in & security", "Flight", "Deplane & exit", "Taxi", "Buffer"]);
    expect(r.segments.map((s) => s.kind)).toEqual(["travel", "wait", "travel", "wait", "travel", "buffer"]);
    expect(r.segments.at(-1)!.minutes).toBe(50);
    expect(r.segments.reduce((x, s) => x + s.weight, 0)).toBeCloseTo(1);
  });

  it("only adds extra minutes from traffic ranges and delay flags in the data", () => {
    const r = buildRunway(itinerary(), 60)!;
    expect(r.segments[4].extraMinutes).toBe(30);   // 80-minute typical maximum on a 50-minute taxi
    expect(r.segments[2].extraReason).toMatch(/often delayed/i);
    expect(r.segments[0].extraMinutes).toBe(0);    // no range known for the first taxi
    expect(clockAt(r.worstArrive!)).toBe("11:10");
  });

  it("shows minutes late instead of a buffer after the deadline", () => {
    const r = buildRunway(itinerary("11:20"), 60)!;
    expect(r.segments.at(-1)).toMatchObject({ kind: "late", minutes: 20 });
  });

  it("renders readable labels, not just colour", () => {
    render(<DeadlineRunway itinerary={itinerary()} requiredMinutes={60} />);
    expect(screen.getByRole("figure")).toHaveAccessibleName(/50 minutes of buffer, 60 required/);
    expect(screen.getByText(/50 min buffer/)).toBeInTheDocument();
    expect(screen.getByText(/at venue 11:10 — after the deadline/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Stages" })).toHaveTextContent("Check-in & security");
  });
});

describe("route geometry", () => {
  const indore = { lat: 22.7196, lng: 75.8577 };
  const bengaluru = { lat: 12.9716, lng: 77.5946 };

  it("measures great-circle distance", () => {
    const km = haversineKm(indore, bengaluru);
    expect(km).toBeGreaterThan(1050);
    expect(km).toBeLessThan(1150);
  });

  it("keeps north up and fits the board", () => {
    const [a, b] = projectToBoard([indore, bengaluru], 4.4, 2.8);
    expect(a.z).toBeLessThan(b.z); // Indore is north of Bengaluru
    for (const p of [a, b]) expect(Math.abs(p.z)).toBeLessThanOrEqual(1.4);
  });

  it("spreads overlapping pins and says so", () => {
    const pts = [{ x: 0, z: 0 }, { x: 0, z: 0 }];
    expect(separate(pts, 0.28)).toBe(true);
    expect(Math.hypot(pts[1].x - pts[0].x, pts[1].z - pts[0].z)).toBeGreaterThanOrEqual(0.27);
    const layout = layoutBoard([
      { id: "a", label: "A", point: indore, kind: "origin" }, { id: "b", label: "B", point: bengaluru, kind: "venue" },
    ]);
    expect(layout.spread).toBe(false);
    expect(layout.cellKm).toBeGreaterThan(0);
  });

  it("places only stops with real coordinates, in travel order", () => {
    const mission = {
      origin: { city: "Indore", location: indore, airports: [{ code: "IDR", location: { lat: 22.72, lng: 75.8 } }], nearby_airports: [] },
      destination: { city: "Bengaluru", location: bengaluru, airports: [{ code: "BLR", location: { lat: 13.2, lng: 77.7 } }], nearby_airports: [] },
      origin_airport: null, destination_airport: null,
      venue: { name: "Manyata Tech Park", location: { lat: 13.04, lng: 77.62 } },
    } as unknown as MissionSummary;
    const { stops, legs } = journeyStops(itinerary(), mission);
    expect(stops.map((s) => s.label)).toEqual(["Indore", "IDR", "BLR", "Manyata Tech Park"]);
    expect(legs.map((l) => l.kind)).toEqual(["ground", "air", "ground"]);
  });
});

describe("journey instrument", () => {
  it("builds stages from the timeline only, with the main leg identified", () => {
    const { nodes, links } = journeyStages(itinerary());
    expect(nodes.map((n) => n.kind)).toEqual(["depart", "transfer", "depart", "land", "exit", "arrive"]);
    expect(links.map((l) => l.kind)).toEqual(["ground", "wait", "main", "wait", "ground"]);
    expect(links[2].extraReason).toMatch(/often delayed/i);
    expect(links[4].extraReason).toMatch(/up to 30 min/);
  });

  it("reveals a stop's real details and moves with the arrow keys", async () => {
    render(<JourneyInstrument itinerary={itinerary()} requiredMinutes={60} travelDate={D} />);
    // starts on the arrival: the deadline and the buffer
    expect(screen.getByText("Report by")).toBeInTheDocument();
    expect(screen.getByText(/50 min to spare/)).toBeInTheDocument();
    const first = screen.getByRole("button", { name: /05:00/ });
    fireEvent.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText(/^Taxi/)).toBeInTheDocument(); // the readout swaps in after its exit transition
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: /05:40/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("figure", { name: /50 minutes of buffer before 11:00; 60 required/ })).toBeInTheDocument();
  });
});
