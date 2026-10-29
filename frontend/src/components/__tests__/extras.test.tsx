import { render, screen } from "@testing-library/react";
import { BookingPanel } from "../results/BookingPanel";
import { ReturnPanel } from "../results/ReturnPanel";
import { TravelConditionsPanel } from "../results/TravelConditionsPanel";

describe("BookingPanel", () => {
  it("lists steps in order with external links", () => {
    render(<BookingPanel steps={[
      { key: "train", title: "Train · 12919 Malwa Exp", detail: "Board at Indore at 22:10.", when: "Book this first.",
        links: [{ label: "IRCTC", url: "https://www.irctc.co.in/x", kind: "seller" }] },
      { key: "hotel", title: "Hotel Blue", detail: "Check in 13 Nov, 1 night.", when: null, links: [] },
    ]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("12919");
    expect(items[1]).toHaveTextContent("Hotel Blue");
    const link = screen.getByRole("link", { name: /IRCTC/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders nothing without steps", () => {
    const { container } = render(<BookingPanel steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TravelConditionsPanel", () => {
  it("shows a travel-relevant forecast and headlines", () => {
    render(<TravelConditionsPanel city="Delhi" conditions={{
      weather: { date: "2026-12-20", summary: "Dense fog", high: 18, low: 7, unit: "°C", precipitation: 0, kind: "fog",
                 label: "Fog", location: "Delhi", source: "Google weather (via Google Search)" },
      weather_note: null, checked_at: "2026-12-18T10:00:00Z",
      alerts: [{ title: "Delhi bandh on Friday", url: "https://news.example/a", source: "Daily", published_at: "2026-12-18T05:00:00Z", word: "bandh" }],
    }} />);
    expect(screen.getByText(/Dense fog/)).toBeInTheDocument();
    expect(screen.getByText(/included in the risk score/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Delhi bandh/ })).toHaveAttribute("href", "https://news.example/a");
  });

  it("explains when there is no forecast yet", () => {
    render(<TravelConditionsPanel city="Pune" conditions={{ weather: null, alerts: [], checked_at: "2026-10-22T10:00:00Z",
      weather_note: "Forecasts are published about a week ahead — check again closer to the date." }} />);
    expect(screen.getByText(/about a week ahead/)).toBeInTheDocument();
    expect(screen.getByText(/No strikes, closures/)).toBeInTheDocument();
  });
});

describe("ReturnPanel", () => {
  it("shows options with leave-by times, tags and the round-trip total", () => {
    render(<ReturnPanel currency="INR" plan={{
      date: "2026-11-14", leave_after: "15:00", round_trip_total: 9800, message: null,
      options: [{ id: "r1", mode: "train", title: "Indian Railways 12920", departure_label: "Bengaluru", arrival_label: "Indore",
        leave_venue_at: "2026-11-14T16:05:00", departure_time: "2026-11-14T17:10:00", arrival_time: "2026-11-15T19:30:00",
        duration_minutes: 1580, fare: 1450, fare_source: "live", note: null, tags: ["earliest_home", "cheapest"],
        links: [{ label: "IRCTC", url: "https://www.irctc.co.in/x", kind: "seller" }] }],
    }} />);
    expect(screen.getByText(/Leave venue 16:05/)).toHaveTextContent("(+1 day)");
    expect(screen.getByText("Home earliest")).toBeInTheDocument();
    expect(screen.getByText(/Round trip/)).toHaveTextContent("9,800");
  });
});
