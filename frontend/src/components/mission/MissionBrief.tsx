import { ArrowRight, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import type { MissionRequest } from "../../types/api";
import { formatDate, formatMoney } from "../../utils/format";
import { MODE_META, missionMeta, PRIORITIES } from "../../utils/mission";
import { Button } from "../ui/Button";

function rows(draft: MissionRequest): [string, string][] {
  return [
    ["Venue", draft.venue?.trim() || "City centre"],
    ["Budget", `${formatMoney(draft.budget, draft.currency)} total`],
    ["Priority", PRIORITIES.find((p) => p.id === draft.priority)?.label ?? "Balanced"],
    ["Modes", draft.modes.map((m) => MODE_META[m].label).join(", ")],
    ["Buffer", `≥ ${draft.min_buffer_minutes} min before`],
    ["Ground travel", `≤ ${draft.max_ground_minutes} min`],
    ["Flights", draft.max_stops === 0 ? "Direct only" : `≤ ${draft.max_stops} stop${draft.max_stops > 1 ? "s" : ""}`],
    ["Hotel", draft.hotel_required ? `${draft.stay_nights} night${draft.stay_nights > 1 ? "s" : ""} · ≥ ${draft.min_hotel_rating || "any"}★` : "Only if arriving the day before"],
    ["Food", `${formatMoney(draft.food_per_day, draft.currency)}/day (est.)`],
    ["Travellers", String(draft.travelers)],
  ];
}

/** Mobile / tablet: a one-line summary that expands to the full brief. */
export function MissionBriefCompact({ draft }: { draft: MissionRequest }) {
  const meta = missionMeta(draft.mission_type);
  return (
    <details className="group card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="min-w-0">
          <span className="eyebrow block text-[10.5px]">Mission brief</span>
          <span className="block truncate text-[15px] font-semibold text-ink">
            {draft.origin || "—"} → {draft.destination || "—"}
            <span className="font-normal text-muted"> · {meta.label} by {draft.arrival_deadline || "—"} · {formatMoney(draft.budget, draft.currency)}</span>
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <dl className="divide-y divide-line border-t border-line px-4">
        {rows(draft).map(([label, value]) => <Row key={label} label={label} value={value} />)}
      </dl>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-right text-[14px] font-medium text-ink tnum">{value}</dd>
    </div>
  );
}

/** Desktop: the persistent mission summary — route, the spatial preview, the constraints, and the one action. */
export function MissionBrief({ draft, pending, preview }: { draft: MissionRequest; pending: boolean; preview?: ReactNode }) {
  const meta = missionMeta(draft.mission_type);
  const Icon = meta.icon;
  return (
    <aside aria-label="Mission brief" className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-lift)]">
      <div className="relative isolate bg-night px-6 pb-6 pt-5 text-ivory">
        <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_45%,rgb(16_44_82_/_0.9),transparent_75%)]" />
        <p className="eyebrow flex items-center gap-3 !text-slate"><span aria-hidden className="h-px w-6 bg-teal-bright" />Mission brief</p>
        <p className="display mt-3 break-words text-[30px] leading-[1.02] text-ivory">
          {draft.origin || "—"} <span className="text-ivory/35">→</span> {draft.destination || "—"}
        </p>
        <p className="mt-2 inline-flex items-center gap-2 text-[13.5px] text-ivory/75">
          <Icon className="size-4 text-teal-bright" aria-hidden />
          {meta.label} · report by <span className="mono">{draft.arrival_deadline || "—"}</span>
          {draft.travel_date && <> · {formatDate(draft.travel_date, { weekday: "short", day: "numeric", month: "short" })}</>}
        </p>
        {preview && <div className="mt-4">{preview}</div>}
      </div>
      <dl className="grid grid-cols-2 gap-x-5 px-6 py-4">
        {rows(draft).map(([label, value]) => (
          <div key={label} className="min-w-0 border-b border-line py-2">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</dt>
            <dd className="mt-0.5 truncate text-[13.5px] font-medium text-ink tnum" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="px-6 pb-6">
        <Button type="submit" size="lg" className="w-full" loading={pending}>
          Find my journey {!pending && <ArrowRight className="size-4" aria-hidden />}
        </Button>
        <p className="mt-3 text-center text-[12px] text-muted">Compares flight, train, bus and road — door to door, all-in.</p>
      </div>
    </aside>
  );
}
