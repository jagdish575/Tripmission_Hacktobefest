import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getPreferences } from "../api/account";
import { useAuth } from "../auth/AuthContext";
import { validateMission, type FieldErrors } from "../components/mission/fields";
import { MissionBrief, MissionBriefCompact } from "../components/mission/MissionBrief";
import { MissionForm } from "../components/mission/MissionForm";
import { RoutePreview } from "../components/mission/RoutePreview";
import { ScanDocument } from "../components/mission/ScanDocument";
import { Button } from "../components/ui/Button";
import { ErrorState } from "../components/ui/States";
import { useHealth, useStartMission } from "../hooks/useMission";
import type { MissionRequest } from "../types/api";
import { defaultMission, loadDraft } from "../utils/mission";

export function PlanPage() {
  const hadDraft = useRef(loadDraft() !== null);
  const [draft, setDraft] = useState<MissionRequest>(() => loadDraft() ?? defaultMission());
  const [errors, setErrors] = useState<FieldErrors>({});
  const start = useStartMission();
  const health = useHealth();
  const { user, openLogin } = useAuth();
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: getPreferences, enabled: Boolean(user) && !hadDraft.current,
                           staleTime: 60_000 });

  useEffect(() => {
    document.title = "Plan a mission · TripMission";
  }, []);

  // A fresh form starts from the traveller's saved travel preferences.
  useEffect(() => {
    const travel = prefs.data?.preferences.travel;
    if (!travel || hadDraft.current) return;
    hadDraft.current = true;
    setDraft((d) => ({ ...d, origin: travel.home_city || d.origin, priority: travel.priority, modes: travel.modes,
                       min_buffer_minutes: travel.buffer_minutes }));
  }, [prefs.data]);

  const error = start.visibleError;
  useEffect(() => {
    const field = error?.field as keyof MissionRequest | undefined;
    if (field) setErrors((e) => ({ ...e, [field]: error?.message }));
  }, [error]);

  const set = <K extends keyof MissionRequest>(key: K, value: MissionRequest[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateMission(draft);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(Object.keys(found)[0])?.focus();
      return;
    }
    start.start(draft);
  };

  const notReady = health.data && !health.data.ready && !user?.is_demo;
  const formError = error && !error.field ? error : null;

  return (
    <form onSubmit={submit} noValidate className="container-page pb-32 pt-10 sm:pt-14 lg:pb-24">
      <header className="max-w-3xl">
        <p className="eyebrow flex items-center gap-3"><span aria-hidden className="h-px w-6 bg-teal" />Mission setup</p>
        <h1 className="display mt-4 text-[40px] leading-[0.98] sm:text-[52px] lg:text-[60px]">What do you need <span className="italic text-teal-ink">to make it to?</span></h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-[15.5px]">
          Tell us the deadline and the limits. We'll compare every complete door-to-door journey — flight, train, bus or
          road, hotel and transfers — even if your destination has no airport.
        </p>
      </header>

      {notReady && (
        <ErrorState className="mt-8" title="Live journey planning isn't available right now"
          message="You can still explore everything TripMission does with ready-made demo journeys."
          actions={<Button size="sm" variant="secondary" onClick={() => openLogin("plan")}>Continue in Demo Mode</Button>} />
      )}

      <div className="mt-6 space-y-3 lg:hidden">
        <MissionBriefCompact draft={draft} />
        {/* phones: the globe is optional and only loads when opened */}
        <details className="group rounded-lg bg-night px-4 py-3 text-ivory">
          <summary className="flex cursor-pointer list-none items-center justify-between text-[13.5px] font-medium">
            Route preview <span aria-hidden className="text-slate transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-3"><RoutePreview origin={draft.origin} destination={draft.destination} /></div>
        </details>
      </div>

      <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_400px] xl:gap-20">
        <div className="min-w-0">
          {health.data?.document_scan && <div className="mb-10"><ScanDocument set={set} /></div>}
          <MissionForm draft={draft} errors={errors} set={set} />
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-20">
            <MissionBrief draft={draft} pending={start.isPending}
              preview={<RoutePreview origin={draft.origin} destination={draft.destination} />} />
            {formError && (
              <ErrorState className="mt-4" title="We couldn't start this mission" message={formError.message} />
            )}
          </div>
        </div>
      </div>

      {/* mobile & tablet: sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden">
        {formError && <p className="mb-2 text-[13px] text-red-ink" role="alert">{formError.message}</p>}
        <Button type="submit" size="lg" className="w-full" loading={start.isPending}>
          Find my journey {!start.isPending && <ArrowRight className="size-4" aria-hidden />}
        </Button>
      </div>
    </form>
  );
}
