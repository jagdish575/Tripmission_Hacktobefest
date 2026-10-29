import { useMutation } from "@tanstack/react-query";
import { Clock3, LocateFixed, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { ApiError } from "../../api/client";
import { replanMission } from "../../api/missions";
import { Button } from "../ui/Button";

/** The traveller's local wall-clock time as "YYYY-MM-DDTHH:MM" (journeys are planned in local time). */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "I'm running late / I missed it": plan again from where the traveller is right now. */
export function RunningLate({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState("");
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const replan = useMutation<{ mission_id: string }, ApiError, { location?: string; lat?: number; lng?: number }>({
    mutationFn: (where) => replanMission(missionId, { ...where, now: localNow() }),
    onSuccess: (data) => navigate(`/analyzing/${data.mission_id}`),
  });

  const shareLocation = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Your browser can't share your location — type the town instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); replan.mutate({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { setLocating(false); setGeoError("We couldn't get your location — type the town instead."); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
    );
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (place.trim()) replan.mutate({ location: place.trim() });
  };

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}
        icon={<Clock3 className="size-3.5" aria-hidden />}>
        Running late?
      </Button>
    );
  }

  return (
    <section aria-labelledby="late-title" className="w-full rounded-md border border-amber/40 bg-amber-wash/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="late-title" className="text-[16px] font-semibold text-ink">Running late or missed a connection?</h2>
          <p className="mt-1 text-[13.5px] text-fg">
            We'll plan again from where you are now — same venue and deadline, only journeys that still leave after
            you can get moving.
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-fg">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="sm" onClick={shareLocation} loading={locating || (replan.isPending && !place)}
          icon={<LocateFixed className="size-3.5" aria-hidden />}>
          Use my location
        </Button>
        <span className="self-center text-[12.5px] text-muted">or</span>
        <input aria-label="Where are you now?" className="field-input h-9 flex-1" placeholder="Type the town you're in, e.g. Ujjain"
          value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} />
        <Button type="submit" size="sm" variant="secondary" disabled={!place.trim()} loading={replan.isPending && Boolean(place)}>
          Re-plan
        </Button>
      </form>
      {(geoError || replan.error) && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-red-ink">{geoError ?? replan.error?.message}</p>
      )}
    </section>
  );
}
