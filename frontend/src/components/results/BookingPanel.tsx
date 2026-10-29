import { BedDouble, Bus, CarTaxiFront, ExternalLink, Plane, TrainFront, TramFront, type LucideIcon } from "lucide-react";
import type { BookingStep } from "../../types/api";

const ICONS: Record<BookingStep["key"], LucideIcon> = {
  flight: Plane, train: TrainFront, bus: Bus, transit: TramFront, hotel: BedDouble, cab: CarTaxiFront,
};

/** What to book for this journey, scarcest first, with links out. TripMission never books anything itself. */
export function BookingPanel({ steps }: { steps: BookingStep[] | undefined }) {
  if (!steps?.length) return null;
  return (
    <section aria-labelledby="booking-title" className="card p-5 sm:p-6">
      <h3 id="booking-title" className="text-[17px] font-semibold tracking-[-0.01em]">Book this journey</h3>
      <p className="mt-1 text-[13.5px] text-muted">In this order — the thing most likely to sell out comes first.</p>
      <ol className="mt-5 space-y-4">
        {steps.map((step, i) => {
          const Icon = ICONS[step.key];
          return (
            <li key={`${step.key}-${i}`} className="grid grid-cols-[28px_1fr] gap-3">
              <span className="tnum grid size-7 place-items-center rounded-full bg-paper text-[12.5px] font-semibold text-ink">{i + 1}</span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                  <Icon className="size-4 shrink-0 text-muted" aria-hidden /><span className="min-w-0 truncate">{step.title}</span>
                </p>
                <p className="mt-0.5 text-[13.5px] text-fg tnum">{step.detail}</p>
                {step.when && <p className="mt-1 text-[12.5px] text-muted">{step.when}</p>}
                {step.links.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {step.links.map((link) => (
                      <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-line-strong bg-surface px-2.5 text-[12.5px] font-semibold text-fg hover:border-teal/40 hover:bg-teal-wash">
                        {link.label}<ExternalLink className="size-3" aria-hidden />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-5 border-t border-line pt-3 text-[12px] text-subtle">
        Links open the seller's or a search site in a new tab. We don't book or hold seats — check the details match before you pay.
      </p>
    </section>
  );
}
