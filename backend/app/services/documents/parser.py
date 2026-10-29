"""Turn the text Cloudinary OCR read off an admit card / interview letter / appointment slip into mission fields.

Deterministic and conservative: a field is returned only when a labelled line in the document supports it, and
every field carries the exact line it came from (`evidence`) so the traveller can check it before planning.
Nothing is guessed: no label, no field. Unlabelled addresses are ignored because an admit card also prints the
candidate's home address.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import date, time

from app.services.places_reference import CITY_CENTRES

MONTHS = {m: i for i, m in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"), start=1)}

_MONTH = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATE_PATTERNS = [
    # 2026-11-14
    (re.compile(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b"), "ymd"),
    # 14/11/2026, 14-11-26, 14.11.2026 (Indian day-first)
    (re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b"), "dmy"),
    # 14 November 2026, 14th Nov, 2026, 14-Nov-2026
    (re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?[\s\-]+{_MONTH}[\s,\-]+(\d{{4}})\b", re.I), "d_mon_y"),
    # November 14, 2026
    (re.compile(rf"\b{_MONTH}\s+(\d{{1,2}})(?:st|nd|rd|th)?,?\s+(\d{{4}})\b", re.I), "mon_d_y"),
]
_TIME = re.compile(r"\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?|hrs?|hours)?(?![\d/\-])", re.I)

_DATE_GOOD = re.compile(r"exam|test|interview|appointment|schedul|reporting|date\s*(of|&)?\s*(the\s*)?"
                        r"(exam|test|interview|visit|appointment)|date\s*,?\s*day|event|wedding|function|ceremony|conference", re.I)
_DATE_BAD = re.compile(r"birth|\bdob\b|d\.o\.b|issue|issued|print|generat|download|registration|application|"
                       r"applied|valid|expiry|payment|submitted|ref(erence)?\b", re.I)

# Which time on the document is the one you must arrive by — earlier rank wins.
_TIME_LABELS: list[tuple[str, re.Pattern[str]]] = [
    ("Reporting time", re.compile(r"report(ing)?\s*(time|by|at)|entry\s*time|arrive\s*by|please\s*arrive|"
                                  r"be\s*present|reach\s*(the\s*)?(venue|centre|center)?\s*by", re.I)),
    ("Gate closing time", re.compile(r"gate\s*clos|entry\s*clos|last\s*entry|gate\s*will\s*close", re.I)),
    ("Start time", re.compile(r"(exam|test|interview|appointment|shift|event|ceremony|muhurat|session)\s*"
                              r"(start\s*)?(time|timing|timings|starts|begins|at)|time\s*of\s*(exam|test|interview|"
                              r"appointment)|timings?\s*of\s*(the\s*)?(test|exam(ination)?|interview|appointment)|^\s*time\s*[:\-]|"
                              r"date\s*(and|&)\s*time|timings?\s*[:\-]", re.I)),
]

_VENUE_LABEL = re.compile(
    r"^\s*(?:name\s*(?:and|&)\s*address\s*of\s*(?:the\s*)?(?:test|exam(?:ination)?)?\s*(?:centre|center|venue)|"
    r"(?:test|exam(?:ination)?)\s*(?:centre|center|venue)(?:\s*(?:name|address|details|&|and))*|"
    r"(?:interview|reporting|event|wedding)\s*venue(?:\s*address)?|"
    r"venue\s*of\s*(?:the\s*)?(?:test|exam(?:ination)?|interview|event)(?:\s*address)?|venue(?:\s*(?:address|details))?|"
    r"(?:centre|center)\s*(?:name|address)(?:\s*(?:&|and)\s*address)?|address\s*of\s*(?:the\s*)?(?:venue|centre|center|hospital|office)|"
    r"place\s*of\s*(?:interview|exam(?:ination)?|test)|hospital(?:\s*(?:name|address))?|clinic(?:\s*address)?|"
    r"location|office\s*address)(?!\s*(?:no\b|no\.|number|code|id\b))\s*[:\-–]?\s*", re.I)
# A line that starts a new labelled field ("Roll No: ...") ends a multi-line venue.
_NEW_FIELD = re.compile(r"^\s*[A-Za-z][A-Za-z .&/()]{1,40}(?::|\s[-–]\s)\s*\S")

_KIND_KEYWORDS: list[tuple[str, str, re.Pattern[str]]] = [
    ("exam", "Admit card", re.compile(r"admit\s*card|hall\s*ticket|roll\s*(no|number)|examination|\bexam\b|"
                                      r"test\s*(centre|center)|candidate", re.I)),
    ("interview", "Interview letter", re.compile(r"interview|call\s*letter|walk[\s-]*in|selection\s*process", re.I)),
    ("medical", "Appointment slip", re.compile(r"appointment|hospital|\bopd\b|patient|consult|clinic|\bdr\.?\s|"
                                               r"doctor|department\s*of", re.I)),
    ("wedding", "Invitation", re.compile(r"wedding|marriage|shaadi|reception|invit|muhurat|sangeet", re.I)),
    ("conference", "Event pass", re.compile(r"conference|summit|delegate|registration\s*confirmed|keynote", re.I)),
]

_STATES = ("andhra pradesh|arunachal pradesh|assam|bihar|chhattisgarh|goa|gujarat|haryana|himachal pradesh|"
           "jharkhand|karnataka|kerala|madhya pradesh|maharashtra|manipur|meghalaya|mizoram|nagaland|odisha|"
           "punjab|rajasthan|sikkim|tamil nadu|telangana|tripura|uttar pradesh|uttarakhand|west bengal|delhi|"
           "jammu and kashmir|ladakh|puducherry|chandigarh|u\\.?p\\.?|m\\.?p\\.?")
_STATE_RE = re.compile(rf"\b({_STATES})\b", re.I)
_PIN = re.compile(r"\b\d{3}\s?\d{3}\b")


@dataclass
class Found:
    value: str
    evidence: str
    label: str | None = None


_DANGLING = re.compile(r"(?:\b(?:of|and|the|for|at)|&)$", re.I)


def _lines(text: str) -> list[str]:
    """Non-empty, whitespace-normalised lines. A label wrapped over two lines in a narrow table cell
    ("NAME & ADDRESS OF" / "EXAMINATION CENTRE") is joined back into one."""
    out: list[str] = []
    for line in (re.sub(r"\s+", " ", raw).strip() for raw in text.splitlines()):
        if not line:
            continue
        if out and _DANGLING.search(out[-1]) and len(out[-1]) < 40:
            out[-1] = f"{out[-1]} {line}"
        else:
            out.append(line)
    return out


def _parse_dates(line: str) -> list[date]:
    out: list[date] = []
    for pattern, kind in _DATE_PATTERNS:
        for m in pattern.finditer(line):
            try:
                if kind == "ymd":
                    y, mo, d = int(m[1]), int(m[2]), int(m[3])
                elif kind == "dmy":
                    d, mo, y = int(m[1]), int(m[2]), int(m[3])
                    y += 2000 if y < 100 else 0
                elif kind == "d_mon_y":
                    d, mo, y = int(m[1]), MONTHS[m[2][:3].lower()], int(m[3])
                else:
                    mo, d, y = MONTHS[m[1][:3].lower()], int(m[2]), int(m[3])
                out.append(date(y, mo, d))
            except (ValueError, KeyError):
                continue
    return out


def _parse_times(line: str) -> list[time]:
    """Times written as 08:30 AM, 8.30 a.m., 0830 hrs, 2 PM or 14:00. A bare number is never a time."""
    out: list[time] = []
    without_dates = line
    for pattern, _ in _DATE_PATTERNS:
        without_dates = pattern.sub(" ", without_dates)
    for m in _TIME.finditer(without_dates):
        hour, minute, suffix = int(m[1]), int(m[2] or 0), (m[3] or "").lower().replace(".", "").replace(" ", "")
        if m[2] is None and not suffix:
            continue
        if suffix.startswith("p") and hour < 12:
            hour += 12
        elif suffix.startswith("a") and hour == 12:
            hour = 0
        if 0 <= hour < 24 and 0 <= minute < 60:
            out.append(time(hour, minute))
    return out


def _pick_date(lines: list[str], today: date) -> Found | None:
    """The event date: an upcoming date wins; a past one is returned only when it sits next to an exam/event
    label, marked label="past" so it is shown with a warning but never put into the form."""
    best: tuple[int, date, str] | None = None
    best_past: tuple[date, str] | None = None
    for line in lines:
        dates = _parse_dates(line)
        if not dates or _DATE_BAD.search(line):
            continue
        good = bool(_DATE_GOOD.search(line))
        for d in dates:
            if d < today:
                if good and (best_past is None or d > best_past[0]):
                    best_past = (d, line)
                continue
            score = 3 if good else 0
            if best is None or score > best[0] or (score == best[0] and d < best[1]):
                best = (score, d, line)
    if best is not None:
        return Found(best[1].isoformat(), best[2])
    if best_past is not None:
        return Found(best_past[0].isoformat(), best_past[1], "past")
    return None


def _pick_times(lines: list[str]) -> tuple[Found | None, Found | None]:
    """(arrive-by time, event start time)."""
    hits: dict[str, Found] = {}
    for label, pattern in _TIME_LABELS:
        for i, line in enumerate(lines):
            if not pattern.search(line):
                continue
            # the time is usually on the same line, sometimes on the next one
            for candidate in (line, lines[i + 1] if i + 1 < len(lines) else ""):
                times = _parse_times(candidate)
                if times:
                    hits.setdefault(label, Found(times[0].strftime("%H:%M"), line if candidate == line
                                                 else f"{line} {candidate}", label))
                    break
            if label in hits:
                break
    arrive = next((hits[label] for label, _ in _TIME_LABELS if label in hits), None)
    return arrive, hits.get("Start time")


def _pick_venue(lines: list[str]) -> Found | None:
    for i, line in enumerate(lines):
        m = _VENUE_LABEL.match(line)
        if not m:
            continue
        parts = [line[m.end():].strip(" :-–")]
        if parts[0] and (_parse_times(parts[0]) or not re.search(r"[A-Za-z]{3,}", parts[0])):
            continue  # "Test Centre: MP0301" or a time — a code, not a place
        for nxt in lines[i + 1:i + 8]:
            if _NEW_FIELD.match(nxt) or _VENUE_LABEL.match(nxt) or _parse_times(nxt) or _parse_dates(nxt):
                break
            parts.append(nxt)
            if _PIN.search(nxt):  # the PIN code closes an Indian address
                break
        parts = [p.strip(" ,") for p in parts if p.strip(" ,")]
        value = re.sub(r"\s*,\s*", ", ", ", ".join(parts))
        if len(value) < 4 or (len(value.split()) < 2 and not _PIN.search(value)):
            continue  # a lone word ("Examination") is a column header, not an address
        if len(value) > 160 and len(parts) > 2:
            # name of the place + the city/PIN line: what a map search needs
            value = f"{parts[0]}, {parts[-1]}"
        return Found(value[:160].rstrip(" ,"), " / ".join([line, *lines[i + 1:i + len(parts)]]))
    return None


def _venue_quality(found: Found | None) -> float:
    if found is None:
        return -1.0
    return (2 if _PIN.search(found.value) else 0) + (2 if _city_from(found.value) else 0) + len(found.value) / 200


def _city_from(address: str) -> str | None:
    lowered = address.casefold()
    best: tuple[int, str] | None = None
    for key, (city, *_rest) in CITY_CENTRES.items():
        for m in re.finditer(rf"\b{re.escape(key)}\b", lowered):
            if best is None or m.start() > best[0]:  # the city sits near the end of an address
                best = (m.start(), city)
    if best:
        return best[1]
    # Not a city we know: the comma-separated part just before the state or the PIN code.
    segments = [s.strip() for s in re.split(r"[,\n]", address) if s.strip()]
    for idx, seg in enumerate(segments):
        if _STATE_RE.search(seg) or _PIN.search(seg):
            name = _PIN.sub("", _STATE_RE.sub("", seg)).strip(" -")
            if len(name) >= 3 and not re.search(r"\d", name):
                return name.title()
            if idx > 0 and not re.search(r"\d", segments[idx - 1]):
                return segments[idx - 1].strip().title()
    return None


def _pick_kind(lines: list[str]) -> tuple[Found | None, str | None]:
    best: tuple[int, str, str, str] | None = None
    for mission_type, title, pattern in _KIND_KEYWORDS:
        matched = [line for line in lines if pattern.search(line)]
        if matched and (best is None or len(matched) > best[0]):
            best = (len(matched), mission_type, title, matched[0])
    if best is None:
        return None, None
    return Found(best[1], best[3]), best[2]


def extract_mission_fields(text: str, *, alternate: str | None = None, today: date | None = None) -> dict:
    """OCR text -> {"fields": {name: {value, evidence, label}}, "document_kind", "missing", "notes"}.

    `text` is the OCR rebuilt row by row (label and value side by side — best for dates and times);
    `alternate` is the OCR's own block order (keeps a multi-line address in one table cell together — often best
    for the venue). Each field comes from whichever reading supports it best."""
    today = today or date.today()
    lines = _lines(text)
    alt_lines = _lines(alternate) if alternate else []
    kind, title = _pick_kind(lines)
    travel_date = _pick_date(lines, today) or (_pick_date(alt_lines, today) if alt_lines else None)
    arrive, start = _pick_times(lines)
    if alt_lines and (arrive is None or start is None):
        alt_arrive, alt_start = _pick_times(alt_lines)
        arrive, start = arrive or alt_arrive, start or alt_start
    venue = max((_pick_venue(lines), _pick_venue(alt_lines) if alt_lines else None), key=_venue_quality)
    destination = None
    if venue:
        city = _city_from(venue.value)
        if city:
            destination = Found(city, venue.evidence)

    fields = {name: asdict(found) for name, found in (
        ("mission_type", kind), ("travel_date", travel_date), ("arrival_deadline", arrive), ("event_time", start),
        ("venue", venue), ("destination", destination)) if found}
    notes: list[str] = []
    if arrive and start and arrive.label != "Start time" and arrive.value != start.value:
        notes.append(f"We planned for the {arrive.label.lower()} ({arrive.value}), not the start time "
                     f"({start.value}) — you need to be there by then.")
    if travel_date and travel_date.label == "past":
        notes.append("The date on this document has already passed, so we didn't add it — choose your travel "
                     "date below.")
    missing = [name for name in ("travel_date", "arrival_deadline", "venue", "destination")
               if name not in fields or (name == "travel_date" and travel_date and travel_date.label == "past")]
    return {"fields": fields, "document_kind": title, "missing": missing, "notes": notes,
            "lines_read": max(len(lines), len(alt_lines))}
