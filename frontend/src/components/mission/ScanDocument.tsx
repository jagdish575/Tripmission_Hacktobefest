import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, CircleDashed, FileScan, FileText, Info, RotateCcw, ShieldCheck, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { scanDocument } from "../../api/documents";
import type { ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { MissionRequest, MissionType, ScannedFieldName, ScanResult } from "../../types/api";
import { cx, formatDate } from "../../utils/format";
import { missionMeta } from "../../utils/mission";
import { Button } from "../ui/Button";
import { useApplyTemplate } from "./MissionForm";

type Setter = <K extends keyof MissionRequest>(key: K, value: MissionRequest[K]) => void;

const ROWS: { name: ScannedFieldName; label: string }[] = [
  { name: "mission_type", label: "Mission" },
  { name: "travel_date", label: "Date" },
  { name: "arrival_deadline", label: "Be there by" },
  { name: "event_time", label: "Starts at" },
  { name: "venue", label: "Venue" },
  { name: "destination", label: "City" },
];

const MISSING_COPY: Partial<Record<ScannedFieldName, string>> = {
  travel_date: "date", arrival_deadline: "reporting time", venue: "venue", destination: "city",
};

function display(name: ScannedFieldName, value: string): string {
  if (name === "mission_type") return missionMeta(value as MissionType).label;
  if (name === "travel_date") return formatDate(value, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  return value;
}

const MAX_BYTES = 8 * 1024 * 1024;

/** Client-side check before anything is uploaded; the server checks again from the file's bytes. */
function problemWith(file: File): string | null {
  if (!(file.type.startsWith("image/") || file.type === "application/pdf" || /\.(pdf|heic|heif)$/i.test(file.name)))
    return "That isn't a photo or a PDF. Try a JPG, PNG, HEIC or PDF of your document.";
  if (file.size > MAX_BYTES) return "That file is larger than 8 MB. Try a smaller photo.";
  return null;
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

const STEPS = ["Received", "Reading", "Review", "Added to form"];

/** Where the scan is: received → being read → details to review → confirmed into the form. */
function ScanSteps({ stage }: { stage: number }) {
  return (
    <ol aria-label="Scan progress" className="mt-5 grid grid-cols-4 gap-2">
      {STEPS.map((label, i) => {
        const done = i < stage || (i === stage && i === STEPS.length - 1);
        const current = i === stage && !done;
        return (
          <li key={label} aria-current={current ? "step" : undefined} className="min-w-0">
            <span className={cx("block h-1 rounded-full transition-colors duration-500",
              done ? "bg-teal" : current ? "bg-teal/40" : "bg-line")}>
              {current && <span className="block h-full w-1/2 animate-pulse rounded-full bg-teal" />}
            </span>
            <span className={cx("mt-1.5 flex items-center gap-1 truncate text-[11.5px] font-medium",
              done ? "text-teal-ink" : current ? "text-ink" : "text-subtle")}>
              {done && <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden />}{label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Scan to plan: photo of an admit card / interview letter / appointment slip -> pre-filled form.
 * Pick a file, drag one onto the card, or paste a screenshot with Ctrl+V. */
export function ScanDocument({ set }: { set: Setter }) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);  // dragenter/leave fire for every child element — count them
  const { requireAuth } = useAuth();
  const applyTemplate = useApplyTemplate(set);
  const [applied, setApplied] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string | null; name: string } | null>(null);
  const scan = useMutation<ScanResult, ApiError, File>({ mutationFn: scanDocument, onSuccess: () => setApplied(false) });

  // free the preview's object URL when it's replaced or the card goes away
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  const start = (file: File) => {
    const problem = problemWith(file);
    setLocalError(problem);
    if (problem) return;
    requireAuth(() => {
      setPreview({ url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, name: file.name || "Pasted image" });
      scan.mutate(file);
    }, "plan");
  };

  // Ctrl+V a screenshot anywhere on the page (text pastes into the form's fields are left alone)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? [])[0];
      if (!file || scan.isPending) return;
      e.preventDefault();
      start(file);
    };
    // A file dropped next to the card would otherwise open in the tab and throw the form away — read it instead.
    const isFileDrag = (e: globalThis.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onWindowDragOver = (e: globalThis.DragEvent) => { if (isFileDrag(e)) e.preventDefault(); };
    const onWindowDrop = (e: globalThis.DragEvent) => {
      if (!isFileDrag(e) || e.defaultPrevented) return;
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file && !scan.isPending) start(file);
    };
    window.addEventListener("paste", onPaste);
    window.addEventListener("dragover", onWindowDragOver);
    window.addEventListener("drop", onWindowDrop);
    return () => {
      window.removeEventListener("paste", onPaste);
      window.removeEventListener("dragover", onWindowDragOver);
      window.removeEventListener("drop", onWindowDrop);
    };
  });

  const pick = () => requireAuth(() => input.current?.click(), "plan");
  const onFile = (file: File | undefined) => {
    if (file) start(file);
    if (input.current) input.current.value = "";
  };
  const drag = {
    onDragEnter: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current += 1; setDragging(true); },
    onDragOver: (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && !scan.isPending) start(file);
    },
  };

  const apply = (result: ScanResult) => {
    const f = result.fields;
    if (f.mission_type) applyTemplate(f.mission_type.value as MissionType);
    if (f.destination) set("destination", f.destination.value);
    if (f.venue) set("venue", f.venue.value);
    if (f.travel_date && f.travel_date.label !== "past") set("travel_date", f.travel_date.value);
    if (f.arrival_deadline) set("arrival_deadline", f.arrival_deadline.value);
    setApplied(true);
    document.getElementById(result.missing.includes("destination") ? "destination" : "origin")?.focus();
  };

  const result = scan.data;
  const found = result ? ROWS.filter((r) => result.fields[r.name]) : [];
  const stage = scan.isPending ? 1 : result ? (applied ? 3 : 2) : -1;

  return (
    <section aria-labelledby="scan-title" {...drag}
      className={cx("relative rounded-md border bg-surface p-5 transition-[border-color,box-shadow,background-color] duration-200 sm:p-6",
        dragging ? "border-2 border-dashed border-blue bg-blue-wash/60 shadow-[0_0_0_6px_rgb(37_99_235_/_0.08)]" : "border-line")}>
      <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" tabIndex={-1}
        aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />

      <AnimatePresence>
        {dragging && (
          <motion.div key="drop" aria-hidden className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-md bg-blue-wash/85 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="flex flex-col items-center gap-2 text-blue-ink">
              <motion.span animate={{ y: [0, -6, 0] }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                className="grid size-12 place-items-center rounded-full bg-surface shadow-[var(--shadow-float)]">
                <UploadCloud className="size-6" />
              </motion.span>
              <p className="text-[15px] font-semibold">Drop to read it</p>
              <p className="text-[12.5px] text-blue-ink/80">Photo or PDF · up to 8 MB</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-teal-wash text-teal-ink">
            <FileScan className="size-5" aria-hidden />
          </span>
          <div>
            <h2 id="scan-title" className="text-[16px] font-semibold tracking-[-0.01em]">Have an admit card, interview letter or appointment slip?</h2>
            <p className="mt-1 max-w-prose text-[13.5px] leading-relaxed text-muted">
              Take a photo and we'll fill in the date, reporting time and venue for you.
              <span className="hidden sm:inline"> Or drag it here, or paste a screenshot with <kbd className="rounded-xs border border-line-strong bg-paper px-1 py-px font-sans text-[11.5px] text-fg">Ctrl</kbd>+<kbd className="rounded-xs border border-line-strong bg-paper px-1 py-px font-sans text-[11.5px] text-fg">V</kbd>.</span>
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted">
              <ShieldCheck className="size-3.5 text-green-ink" aria-hidden />
              Read by Cloudinary OCR, then deleted right away. We never keep your document.
            </p>
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={pick} loading={scan.isPending} className="shrink-0"
          icon={!scan.isPending ? <FileScan className="size-4" aria-hidden /> : undefined}>
          {scan.isPending ? "Reading…" : result ? "Scan another" : "Scan a document"}
        </Button>
      </div>

      {stage >= 0 && <ScanSteps stage={stage} />}

      {(localError || scan.isError) && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-sm bg-paper px-3 py-2.5 text-[13.5px] text-fg">
          <Info className="mt-0.5 size-4 shrink-0 text-red-ink" aria-hidden />{localError ?? scan.error?.message}
        </p>
      )}

      {/* while Cloudinary reads it: the document with a scan line passing over it */}
      {scan.isPending && preview && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="mt-5 flex items-center gap-4 border-t border-line pt-5" aria-live="polite">
          {/* the preview is a local object URL — it never leaves this browser tab and is released when replaced */}
          <div className="relative h-36 w-28 shrink-0 rounded-sm bg-night p-1.5 shadow-[var(--shadow-float)]">
            <div className="relative size-full overflow-hidden rounded-[3px] bg-paper">
              {preview.url
                ? <img src={preview.url} alt="" className="size-full object-cover opacity-90" />
                : <div className="grid size-full place-items-center text-muted"><FileText className="size-8" aria-hidden /></div>}
              <motion.span aria-hidden className="absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-teal/50 to-transparent"
                initial={{ top: "-30%" }} animate={{ top: ["-30%", "100%"] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
            </div>
            {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-b-2 border-r-2"].map((c) => (
              <span key={c} aria-hidden className={cx("absolute size-3 border-teal-bright", c)} />
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-ink">Reading your document…</p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted">{preview.name}</p>
            <p className="mt-2 text-[12.5px] text-muted">Cloudinary OCR is finding the date, times and venue. It's deleted as soon as we're done.</p>
            <div aria-hidden className="mt-3 space-y-1.5">
              {["w-3/4", "w-1/2", "w-2/3"].map((w, i) => (
                <span key={w} className={cx("block h-2 animate-pulse rounded-full bg-paper-2", w)} style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {result && (
        <div className="mt-5 border-t border-line pt-5" aria-live="polite">
          <p className="text-[13px] font-medium text-muted">
            {result.document_kind ? `${result.document_kind} · ` : ""}
            {found.length ? `Found ${found.length} detail${found.length === 1 ? "" : "s"}` : "Nothing we could use"}
            {result.document_deleted && " · document deleted"}
          </p>

          {found.length > 0 && (
            <motion.dl className="mt-3 grid gap-2" initial="hidden" animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
              {found.map(({ name, label }) => {
                const field = result.fields[name]!;
                return (
                  <motion.div key={name} variants={{ hidden: { opacity: 0, y: 4 }, show: { opacity: 1, y: 0 } }}
                    className="grid gap-x-4 gap-y-0.5 rounded-sm border-l-2 border-teal bg-paper px-3 py-2.5 sm:grid-cols-[110px_1fr]">
                    <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
                      <CheckCircle2 className="size-3.5 text-green-ink" aria-hidden />{label}
                    </dt>
                    <dd className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{display(name, field.value)}
                        {field.label && name === "arrival_deadline" && (
                          <span className="ml-2 text-[12px] font-normal text-muted">({field.label.toLowerCase()})</span>
                        )}
                        {field.label === "past" && (
                          <span className="ml-2 text-[12px] font-medium text-amber-ink">already passed · not added</span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-subtle" title={field.evidence}>
                        From your document: “{field.evidence}”
                      </p>
                    </dd>
                  </motion.div>
                );
              })}
            </motion.dl>
          )}

          {result.missing.length > 0 && (
            <p className="mt-3 flex items-start gap-2 text-[13px] text-muted">
              <CircleDashed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Couldn't find the {result.missing.map((m) => MISSING_COPY[m]).filter(Boolean).join(", ")} — please fill
              {result.missing.length === 1 ? " it" : " them"} in below.
            </p>
          )}
          {result.notes.map((note) => (
            <p key={note} className="mt-2 flex items-start gap-2 text-[13px] text-fg">
              <Info className="mt-0.5 size-3.5 shrink-0 text-amber-ink" aria-hidden />{note}
            </p>
          ))}

          {found.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" onClick={() => apply(result)} disabled={applied}
                icon={applied ? <CheckCircle2 className="size-3.5" aria-hidden /> : undefined}>
                {applied ? "Added to the form" : "Use these details"}
              </Button>
              {applied && (
                <button type="button" onClick={() => scan.reset()}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-fg">
                  <RotateCcw className="size-3.5" aria-hidden />Close
                </button>
              )}
              <p className="w-full text-[12.5px] text-muted">Check everything below — add where you're starting from, then find your journey.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
