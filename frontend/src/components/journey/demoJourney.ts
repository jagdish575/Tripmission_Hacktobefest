import type { Itinerary, TimelineEvent } from "../../types/api";

/**
 * The landing page's worked example: the journey the demo dataset produces for Indore → Manyata Tech Park,
 * Bengaluru (interview at 10:00, 60-minute buffer). It is shown only as a labelled demonstration — results pages
 * always render the traveller's own itinerary from the API.
 */
const DAY_BEFORE = "2026-11-12";
const DAY = "2026-11-13";
const ev = (date: string, time: string, kind: TimelineEvent["kind"], title: string, mode: string | null, detail: string | null = null): TimelineEvent => ({
  time: `${date}T${time}:00`, kind, title, detail, mode_to_next: mode, duration_to_next_minutes: null, distance_to_next_km: null,
});

export const DEMO_MISSION = { origin: "Indore", venue: "Manyata Tech Park", city: "Bengaluru", date: DAY, required: 60, total: 9342 };

export const DEMO_JOURNEY = {
  id: "demo", mode: "flight", strategy: "night_before",
  main: { departure_time: `${DAY_BEFORE}T13:10:00`, arrival_time: `${DAY_BEFORE}T15:15:00` },
  flight: { often_delayed: false },
  legs: [],
  cost: { ticket: null, ticket_source: "live" },
  timeline: [
    ev(DAY_BEFORE, "11:34", "depart", "Leave home in Indore", "Taxi", "Cab to Devi Ahilya Bai Holkar Airport"),
    ev(DAY_BEFORE, "11:55", "transfer", "Arrive at Indore airport (IDR)", "Check-in & security"),
    ev(DAY_BEFORE, "13:10", "depart", "Take off · Akasa Air QP 1384", "Direct flight", "Direct, no changes"),
    ev(DAY_BEFORE, "15:15", "land", "Land at Bengaluru (BLR)", "Deplane & exit"),
    ev(DAY_BEFORE, "15:40", "exit", "Leave the airport", "Taxi", "Cab to the hotel near the venue"),
    ev(DAY_BEFORE, "16:31", "hotel", "Check in · Lakeview Residency Hebbal", "Overnight", "Rest before the big day"),
    ev(DAY, "08:38", "leave", "Leave the hotel", "Taxi", "A 7-minute ride to the venue"),
    ev(DAY, "08:45", "arrive", "Arrive at Manyata Tech Park", "Buffer"),
    ev(DAY, "10:00", "deadline", "Interview", null),
  ],
  arrival: { venue_arrival: `${DAY}T08:45:00`, deadline: `${DAY}T10:00:00`, buffer_minutes: 75 },
} as unknown as Itinerary;
