import { Columns3, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MissionSummary } from "../../types/api";
import { formatDate, formatMoney } from "../../utils/format";
import { missionMeta, PRIORITIES } from "../../utils/mission";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate">{label}</dt>
      <dd className="mt-1 truncate text-[14px] font-medium text-ivory tnum">{children}</dd>
    </div>
  );
}

export function MissionSummaryBar({ mission, mode, onEdit, compareHref, actions }: {
  mission: MissionSummary; mode: "live" | "demo"; onEdit?: () => void; compareHref?: string; actions?: ReactNode;
}) {
  const meta = missionMeta(mission.mission_type);
  const Icon = meta.icon;
  return (
    // the results page's title band continues the night bar above it
    <div className="bg-night text-ivory">
      <div className="container-page pb-7 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              <span aria-hidden className="h-px w-6 bg-teal-bright" />Mission
              {mode === "demo" && <span className="rounded-xs border border-amber/40 px-1.5 py-px text-amber">Demo data</span>}
            </p>
            <p className="display mt-2 text-[34px] leading-none text-ivory sm:text-[44px]">
              {mission.origin.city} <span className="text-ivory/35">→</span> {mission.destination.city}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions}
            {compareHref && (
              <Link to={compareHref} className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-ivory/25 px-3 text-[13px] font-semibold text-ivory hover:border-ivory/60">
                <Columns3 className="size-4" aria-hidden /> Compare options
              </Link>
            )}
            {onEdit && (
              <button type="button" onClick={onEdit} className="inline-flex h-9 items-center gap-2 rounded-[7px] px-3 text-[13px] font-semibold text-ivory/80 hover:bg-ivory/10 hover:text-ivory">
                <Pencil className="size-3.5" aria-hidden /> Edit mission
              </button>
            )}
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ivory/10 pt-5 sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="Date">{formatDate(mission.travel_date, { weekday: "short", day: "numeric", month: "long" })}</Fact>
          <Fact label="Mission"><span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 text-teal-bright" aria-hidden />{meta.label} at {mission.arrival_deadline}</span></Fact>
          <Fact label="Venue">{mission.venue.name}</Fact>
          <Fact label="Budget">{formatMoney(mission.budget, mission.currency)}{mission.travelers > 1 && ` · ${mission.travelers} people`}</Fact>
          <Fact label="Buffer · priority">≥ {mission.min_buffer_minutes} min · {PRIORITIES.find((p) => p.id === mission.priority)?.label ?? "Balanced"}</Fact>
        </dl>
      </div>
    </div>
  );
}
