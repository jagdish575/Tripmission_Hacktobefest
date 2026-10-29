import { motion } from "framer-motion";
import { Info } from "lucide-react";
import type { Category, Itinerary, MissionResult, ModeSummary } from "../../types/api";
import { cx, formatClock, formatDayLabel, formatMinutes, formatMoney } from "../../utils/format";
import { CATEGORY_META, CATEGORY_ORDER, MODE_META } from "../../utils/mission";
import { RiskBadge } from "../ui/Badge";
import { BufferBar } from "./BufferBar";
import { MissionScore } from "./MissionScore";

const CARD_IN = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 24 } },
};

function categoriesOf(result: MissionResult, id: string): Category[] {
  return CATEGORY_ORDER.filter((c) => result.categories[c] === id);
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" | "good" }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-subtle">{label}</dt>
      <dd className={cx("mt-0.5 truncate text-[14px] font-semibold tnum", tone === "bad" ? "text-red-ink" : "text-ink")}>{value}</dd>
    </div>
  );
}

function AvailableCard({ summary, itin, result, selected, onSelect }: {
  summary: ModeSummary; itin: Itinerary; result: MissionResult; selected: boolean; onSelect: (id: string) => void;
}) {
  const meta = MODE_META[itin.mode];
  const Icon = meta.icon;
  const cats = categoriesOf(result, itin.id);
  const best = cats.includes("recommended");
  const remaining = itin.cost.budget_remaining;
  const changes = itin.mode === "flight"
    ? (itin.main.stops === 0 ? "Direct" : `${itin.main.stops} stop${itin.main.stops > 1 ? "s" : ""}`)
    : itin.main.transfers === 0 ? "No changes" : `${itin.main.transfers} change${itin.main.transfers > 1 ? "s" : ""}`;
  return (
    <motion.button type="button" variants={CARD_IN}
      onClick={() => onSelect(itin.id)} aria-pressed={selected}
      className={cx("group relative flex h-full flex-col rounded-md border bg-surface p-4 text-left transition-[border-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-1 sm:p-5",
        selected ? "border-ink shadow-[var(--shadow-float)]" : "border-line hover:border-line-strong hover:shadow-[var(--shadow-float)]",
        best && "ring-1 ring-amber/40 shadow-[0_0_0_4px_rgb(245_158_11_/_0.08),0_18px_40px_-22px_rgb(245_158_11_/_0.55)]")}>
      {selected && <motion.span layoutId="mode-picked" aria-hidden className="absolute inset-x-4 -top-px h-0.5 rounded-full bg-blue"
        transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className={cx("grid size-9 shrink-0 place-items-center overflow-hidden rounded-sm transition-colors duration-300",
            selected ? "bg-ink text-white" : "bg-paper-2 text-ink group-hover:bg-teal-wash group-hover:text-teal-ink")}>
            {/* the vehicle edges forward on hover, as if setting off */}
            <Icon className="size-[18px] transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-rotate-6"
              strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-ink">{meta.label}</p>
            <p className="truncate text-[12.5px] text-muted">
              {itin.mode === "flight" ? `${itin.main.provider ?? ""} ${itin.main.references[0] ?? ""}` : itin.main.provider ?? itin.main.title}
            </p>
          </div>
        </div>
        <MissionScore score={itin.scores.overall} size={52} label={`${meta.label} score`} className="-my-1 shrink-0" />
      </div>

      {cats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {cats.map((c) => {
            const CatIcon = CATEGORY_META[c].icon;
            return (
              <span key={c} className={cx("inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em]",
                c === "recommended" ? "bg-amber/15 text-amber-ink" : "bg-paper-2 text-fg")}>
                <CatIcon className="size-3" aria-hidden />{CATEGORY_META[c].label}
              </span>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[13px] text-muted tnum">
        {formatDayLabel(itin.main.departure_time, result.mission.travel_date)} {formatClock(itin.main.departure_time)} →{" "}
        {formatDayLabel(itin.main.arrival_time, result.mission.travel_date).toLowerCase()} {formatClock(itin.main.arrival_time)}
        {" · "}{formatMinutes(itin.total_travel_minutes)} · {changes}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4">
        <Stat label={itin.cost.ticket_source === "estimated" ? "Ticket (est.)" : "Ticket"} value={formatMoney(itin.cost.ticket, itin.cost.currency)} />
        <Stat label="Total trip" value={formatMoney(itin.cost.total, itin.cost.currency)} />
        <Stat label={remaining !== null && remaining < 0 ? "Over budget" : "Budget left"}
          value={remaining === null ? "—" : formatMoney(Math.abs(remaining), itin.cost.currency)}
          tone={remaining !== null && remaining < 0 ? "bad" : undefined} />
        <Stat label="Buffer" value={`${itin.arrival.buffer_minutes} min`} tone={itin.arrival.buffer_minutes < result.mission.min_buffer_minutes ? "bad" : undefined} />
      </dl>
      <BufferBar buffer={itin.arrival.buffer_minutes} required={result.mission.min_buffer_minutes} className="mt-3" />
      <div className="mt-4 flex items-center justify-between gap-2 pt-1">
        <RiskBadge level={itin.risk.level} compact />
        <span className="text-[11.5px] text-subtle">{summary.options} option{summary.options === 1 ? "" : "s"} · {summary.reason}</span>
      </div>
    </motion.button>
  );
}

function UnavailableCard({ summary }: { summary: ModeSummary }) {
  const meta = MODE_META[summary.mode];
  const Icon = meta.icon;
  return (
    <motion.div variants={CARD_IN}
      className="flex h-full flex-col rounded-md border border-dashed border-line-strong bg-paper/60 p-4 opacity-80 transition-opacity duration-300 hover:opacity-100 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-sm bg-paper-2 text-subtle"><Icon className="size-[18px]" strokeWidth={1.8} aria-hidden /></span>
        <div>
          <p className="text-[15px] font-semibold text-muted">{meta.label}</p>
          <p className="text-[12.5px] text-subtle">Not available</p>
        </div>
      </div>
      <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{summary.reason}
      </p>
    </motion.div>
  );
}

export function ModeOptions({ result, selectedId, onSelect }: {
  result: MissionResult; selectedId: string | undefined; onSelect: (id: string) => void;
}) {
  const byId = new Map(result.itineraries.map((i) => [i.id, i]));
  const summaries = result.modes;
  const selected = selectedId ? byId.get(selectedId) : undefined;
  if (!summaries.length) return null;
  return (
    <motion.div initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className={cx("grid grid-cols-1 gap-3 sm:grid-cols-2", summaries.length >= 4 ? "xl:grid-cols-4" : summaries.length === 3 ? "lg:grid-cols-3" : "")}>
      {summaries.map((s) => {
        const best = s.best_id ? byId.get(s.best_id) : undefined;
        if (!best || !s.available) return <UnavailableCard key={s.mode} summary={s} />;
        // The card shows the mode's best journey — or the selected one, when the selection is of this mode
        const isSelectedMode = selected?.mode === best.mode;
        return <AvailableCard key={s.mode} summary={s} itin={isSelectedMode ? selected! : best} result={result}
          selected={isSelectedMode} onSelect={onSelect} />;
      })}
    </motion.div>
  );
}
