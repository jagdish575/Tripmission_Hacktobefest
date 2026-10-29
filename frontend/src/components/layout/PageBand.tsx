import type { ReactNode } from "react";

/** A page's title band: the night bar continues down into it, then the page opens onto ivory paper. */
export function PageBand({ eyebrow, title, description, actions, before }: {
  eyebrow: string; title: ReactNode; description?: ReactNode; actions?: ReactNode; before?: ReactNode;
}) {
  return (
    <header className="bg-night text-ivory">
      <div className="container-page pb-12 pt-10 sm:pb-14 sm:pt-12">
        {before}
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate">
              <span aria-hidden className="h-px w-6 bg-teal-bright" />{eyebrow}
            </p>
            <h1 className="display mt-4 text-[42px] leading-[0.98] !text-ivory sm:text-[58px]">{title}</h1>
            {description && <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-slate">{description}</p>}
          </div>
          {actions}
        </div>
      </div>
    </header>
  );
}
