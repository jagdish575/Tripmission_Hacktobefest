/**
 * Illustrative missions for the landing globe. City positions are real city-centre coordinates (the same reference
 * data the backend uses); the routes themselves are examples of the kinds of trip TripMission plans — not live
 * travel data, and labelled as such wherever they appear.
 */
export interface GlobeCity { name: string; lat: number; lng: number }
/** Any great-circle route the globe can draw. */
export interface GlobeArc { from: GlobeCity; to: GlobeCity }
export interface GlobeRoute extends GlobeArc { mission: string; how: string }

const C = {
  indore: { name: "Indore", lat: 22.7196, lng: 75.8577 },
  bengaluru: { name: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  ujjain: { name: "Ujjain", lat: 23.1793, lng: 75.7849 },
  delhi: { name: "Delhi", lat: 28.6139, lng: 77.209 },
  patna: { name: "Patna", lat: 25.5941, lng: 85.1376 },
  bhopal: { name: "Bhopal", lat: 23.2599, lng: 77.4126 },
  mumbai: { name: "Mumbai", lat: 19.076, lng: 72.8777 },
  kolkata: { name: "Kolkata", lat: 22.5726, lng: 88.3639 },
  chennai: { name: "Chennai", lat: 13.0827, lng: 80.2707 },
  jaipur: { name: "Jaipur", lat: 26.9124, lng: 75.7873 },
  hyderabad: { name: "Hyderabad", lat: 17.385, lng: 78.4867 },
} satisfies Record<string, GlobeCity>;

export const GLOBE_ROUTES: GlobeRoute[] = [
  { from: C.indore, to: C.bengaluru, mission: "Job interview", how: "Fly in the day before" },
  { from: C.patna, to: C.delhi, mission: "Entrance exam", how: "Overnight train" },
  { from: C.bhopal, to: C.mumbai, mission: "Hospital appointment", how: "Train + cab" },
  { from: C.kolkata, to: C.chennai, mission: "Medical check-up", how: "Same-morning flight" },
  { from: C.jaipur, to: C.hyderabad, mission: "Campus interview", how: "Flight + metro" },
  { from: C.indore, to: C.ujjain, mission: "Exam centre", how: "62 km by road — no airport needed" },
];

/** The point the globe turns to face: central India. */
export const GLOBE_FOCUS = { lat: 21.5, lng: 79 };

/** How long the hero dwells on each example route before moving on (until the visitor picks one). */
export const ROUTE_SECONDS = 7;
