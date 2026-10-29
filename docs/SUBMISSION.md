# TripMission — evaluator's guide

A one-page map from what a judge looks for to where it is in the code, how to verify it, and what doesn't work
yet. Every claim links to a file or a test. Submitted to **BUILDX 2026** by Code-A-Nova — a 36-hour
international online hackathon, theme *Build Without Limit* (1 October – 10 November 2026). Team: Jagdish
Prajapati and Sumit Meena.

## In one paragraph

For an exam candidate from a small town, a patient travelling for treatment or a first-time job seeker, a missed
train isn't an inconvenience — it's a lost year, a missed operation, a lost job. Travel sites list flights and
hotels; none of them checks whether the *whole chain* — home → station → train → cab → venue — gets you there
before the reporting time, within your budget. TripMission does: you **photograph your admit card** (Cloudinary
OCR reads the date, reporting time and venue, then the image is deleted), and it compares every complete
door-to-venue journey by flight, train, bus and road using live Google data via SerpApi, scores each one, says
what could go wrong (including fog and strikes in today's news), tells you what to book first, and re-plans from
where you are if you're running late.

## Judging criteria → evidence

### 1. Real-world problem & social impact
| Claim | Evidence |
|--|--|
| Built around people for whom a missed journey can't be undone | Personas in [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) §4; mission templates for exam / interview / medical in [backend/app/core/templates.py](../backend/app/core/templates.py) |
| Uses the document the traveller already has instead of a long form | Scan to plan — [ScanDocument.tsx](../frontend/src/components/mission/ScanDocument.tsx) |
| Plans for the *reporting* time, not the start time (arriving at the start time means being turned away) | [parser.py](../backend/app/services/documents/parser.py) `_TIME_LABELS` ranking; test `test_admit_card_fields` in [test_documents.py](../backend/tests/test_documents.py) |
| Works for towns without an airport and for short trips where flying makes no sense | Route intelligence in [route_intelligence.py](../backend/app/services/route_intelligence.py); Indore → Ujjain demo |
| Helps on the day, not just before: "I'm running late" re-plans from the phone's location | `MissionService.replan` in [mission_service.py](../backend/app/services/mission_service.py); [RunningLate.tsx](../frontend/src/components/results/RunningLate.tsx); 5 tests in [test_trip_extras.py](../backend/tests/test_trip_extras.py) |
| Privacy for sensitive documents (admit cards carry name, roll number, photo, DOB) | Private upload + immediate destroy in [cloudinary/client.py](../backend/app/integrations/cloudinary/client.py); no document or OCR text is stored |

### 2. Use of Cloudinary
| What | Where |
|--|--|
| **Upload API** (server-side, signed with the API secret — never sent to the browser) | `CloudinaryClient._upload` — [client.py](../backend/app/integrations/cloudinary/client.py) |
| **Private delivery type** — the admit card never gets a public URL | `type="private"` in `_upload` |
| **OCR Text Detection and Extraction add-on** (`ocr="adv_ocr"`) | `_upload`; parsed by `_ocr_text` / `_ocr_raw_text` |
| **Word bounding boxes** from the OCR response to rebuild table rows on tilted photos | `_rows_from_words` — the real-world fix for column-ordered OCR on tabular admit cards |
| **Destroy API with CDN invalidation**, always — even if parsing fails | `_destroy`, called in a `finally` block in `read_document` |
| **Folders and tags** for housekeeping | `folder="tripmission/documents"`, `tags=["tripmission-document"]` |
| Graceful handling when the add-on isn't enabled | `OcrUnavailableError` → `ocr_unavailable` API error; test `test_scan_without_ocr_addon` |
| Recorded **real Cloudinary OCR response** used as a regression test | [cloudinary_ocr_table_admit_card.json](../backend/tests/fixtures/cloudinary_ocr_table_admit_card.json) (synthetic card, real OCR output) |

### 3. Technical depth
| Area | Where |
|--|--|
| Deterministic decision engine: build → score → risk → categorise → explain | [mission_engine.py](../backend/app/engines/mission_engine.py), [itinerary_engine.py](../backend/app/engines/itinerary_engine.py), [scoring_engine.py](../backend/app/engines/scoring_engine.py), [risk_engine.py](../backend/app/engines/risk_engine.py) |
| 9 SerpApi engines, run in parallel, cached, with retries and user-safe errors | [integrations/serpapi/](../backend/app/integrations/serpapi/), [client.py](../backend/app/integrations/serpapi/client.py) |
| When Google Maps has no rail timetable, real departures from Google Search become door-to-venue journeys (incl. overnight trains from the day before) | `transit_from_reported` in [mission_engine.py](../backend/app/engines/mission_engine.py); recorded Indore → Bhopal fixture [serpapi_trains_idr_bpl.json](../backend/tests/fixtures/serpapi_trains_idr_bpl.json) |
| Weather and disruption news as risk factors, with phrase matching that rejects false alarms ("bird strike") found on real data | [conditions.py](../backend/app/integrations/serpapi/conditions.py); tests `test_disruption_phrases_not_words`, `test_same_story_from_several_outlets_is_shown_once` |
| Return journey timed from the venue | [return_journey.py](../backend/app/services/return_journey.py) |
| Booking hand-off ordered by scarcity, with Tatkal timing | [booking.py](../backend/app/services/booking.py) |
| AI is optional and only explains — any number not in the engine's data is rejected | [explanation.py](../backend/app/services/explanation.py) |
| Security: Google ID tokens verified server-side, owner-only missions, CSRF origin check, per-route body limits, upload type sniffed from bytes, secrets redacted from logs | [auth.py](../backend/app/services/auth.py), [main.py](../backend/app/main.py), [documents/service.py](../backend/app/services/documents/service.py), [config.py](../backend/app/core/config.py) `secret_values` |

### 4. Design & user experience
* Results lead with the answer — a verdict chip ("You'll make it — at the venue 4 h 23 min before"), an animated
  route strip and a minute-by-minute timeline. [ResultsPage.tsx](../frontend/src/pages/ResultsPage.tsx),
  [Verdict.tsx](../frontend/src/components/results/Verdict.tsx), [RouteHero.tsx](../frontend/src/components/results/RouteHero.tsx)
* Every number is labelled LIVE / ESTIMATED / YOUR INPUT / CALCULATED; nothing is called a confirmed ticket.
* Scan by button, drag and drop, or Ctrl+V paste, with a scanning preview.
* Accessibility: keyboard focus styles, ARIA roles on tabs and live regions, and all motion disabled under
  `prefers-reduced-motion`. [index.css](../frontend/src/styles/index.css)

### 5. Completeness & quality
| | |
|--|--|
| Backend tests | **199** (pytest; SerpApi and Cloudinary are mocked or replayed from recorded responses — tests never spend credits) |
| Frontend tests | **24** (Vitest + Testing Library), strict TypeScript |
| Demo without any keys | "Continue in Demo Mode" — labelled dataset, never mixed with live data |
| Build journey | [BUILD_LOG.md](BUILD_LOG.md) — decisions, the bugs real data exposed, and how each was fixed |

## Verify it in five minutes

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
.venv/Scripts/python -m pytest -q                      # 199 passed — no API keys needed
cd ../frontend && npm install && npm test              # 24 passed
```
To use the app without keys: set `DEMO_MODE=true` in `.env`, run both servers (see the README), open
http://localhost:5173 and choose **Continue in Demo Mode**. Live mode needs `SERPAPI_API_KEY`; scan to plan needs
`CLOUDINARY_URL` with the OCR add-on enabled.

## Known limitations (stated, not hidden)

* **No seat availability or exact train fares.** SerpApi has no IRCTC/bus inventory API. Train times and "from"
  fares come from Google; booking links go to IRCTC / redBus, where seats are shown.
* **Station transfers are estimated** when Google Search names the station but not where it is (30 min to the
  station, 20 min on the platform) — always labelled as estimated.
* **Weather** only exists about 8 days ahead; further out the app says so rather than guessing.
* **Disruption news is headline-only** — we show the headline and a link, and never infer beyond it.
* **OCR works on clear photos of printed documents**; handwriting and very blurry photos give partial results,
  and the user always confirms before anything is planned.
* **Demo mode covers two routes** (Indore → Bengaluru, Indore → Ujjain).
