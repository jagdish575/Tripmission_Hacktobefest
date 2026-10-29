# Build log — TripMission

Decisions, challenges and fixes, newest entries first.

## 22 Oct 2026 — Weather & disruption risk, booking links, the way home, "I'm running late"

**Why.** Closing the biggest real-life gaps: a plan that ignores fog or a bandh, a plan you can't act on, a
one-way plan for a two-way trip, and a plan that stops helping the moment something goes wrong.

| Feature | How it works | Data |
|--|--|--|
| Weather & disruption risk | Mission-day forecast and fresh local headlines become risk factors (fog/storm hits a same-day flight harder than a night-before one) | `google` weather answer box, `google_news` — run in parallel, optional |
| Booking links | Per journey, scarcest first: train → flight → bus → hotel → cab, with ticket-seller links Google lists for that exact route (IRCTC etc.), Google Flights / redBus / Google Hotels searches, and Tatkal timing advice | No extra searches |
| The way home | "Plan my way home too": reverse flight search + the train/bus fares box, filtered to options you can still reach after you're free; round-trip total | `google_flights`, `google` transport options |
| I'm running late | Phone location or typed town → a new linked mission from there, only journeys leaving ≥15 min from now, smaller buffer accepted; "you're already in the city — take a cab, ~N min" when that's the answer | Same engine |

**Challenges**
- *"No trains" on a route with ten a day.* A live Indore → Bhopal search showed only a cab. Google Maps transit
  had no rail schedule for the route, and the engine used Google Search's transport-options box only to add
  fares to Maps results — so the box's ten real departures (06:10 → 09:10, ₹856 …) were discarded. Now, when
  Maps has nothing for a mode, each Search departure becomes a door-to-venue option: the train's times, duration,
  fare and sellers as Google lists them, plus labelled estimates for getting to the station (30 min + 20 min on
  the platform) and from the station to the venue. The recorded Indore → Bhopal box is a regression test.
  Comparing with MakeMyTrip exposed three more gaps, all fixed: (1) only the mission day was searched, so the
  overnight *23:15 → 05:10* train — the best option for a 10:00 start — was never seen; the day before is now
  searched too; (2) the shortlist kept the two *shortest* journeys, which suits city buses, not intercity rail —
  it now keeps the quickest, the one arriving closest to the buffer, the best overnight service, and evening
  arrivals for night-before plans; (3) all Search-built trains shared one itinerary id and collapsed into one.
  A 01:20 am arrival with no hotel is now a medium risk ("hours to wait with nothing open").
  Result for the real search: *overnight train, LOW risk, ₹1,213* recommended; the 06:10 Shatabdi as fastest.
- *"Bird strike" is not a strike.* The first live news check flagged "Air India flight reports bird strike in
  Bengaluru" as a transport strike — three times, from three outlets. Matching moved from single words to
  disruption phrases ("auto strike", "strike called", "bandh", "roads closed", "trains cancelled") with an
  exclusion list, and near-duplicate headlines are merged. On the same live data it then surfaced one genuine
  alert: a heavy-rain warning for Bengaluru, matching the thunderstorm forecast.
- *Weather units* came back as "Celsius" rather than "°C" — normalised.
- *Optional means optional.* Weather, news and return searches run beside the main search; any failure is
  logged and shown as a soft notice, never a failed mission (tested with a 500 from the news API).
- *Time zones for "now".* The browser sends its local wall-clock time; the server rejects clocks more than
  36 h off and plans in local time like the rest of the engine.

**Tests:** 23 new backend tests (parsing on real-shaped payloads, risk factors end to end, booking order and
links, return timing, re-plan from a town / phone location / already-in-city / wrong clock / not the owner) and
5 frontend tests. Totals: 196 backend, 21 frontend.

## 22 Oct 2026 — Scan to plan (Cloudinary OCR)

**Problem it solves.** The people TripMission is for — exam candidates from small towns, patients travelling
for treatment, first-time job seekers — already hold the one document that says exactly where and when they must
be: an admit card, an interview call letter, a hospital appointment slip. Typing it into a form is slow on a phone
and easy to get wrong (the *reporting time* is not the *exam start time*). So: photograph it, and we fill the
form.

**What we built**
- `POST /api/v1/documents/scan` — the photo is uploaded to Cloudinary as a **private** asset with the
  **OCR Text Detection and Extraction** add-on (`ocr: "adv_ocr"`), the text is read from the upload response, and
  the asset is **destroyed immediately**, whether reading worked or not.
- A deterministic parser (`backend/app/services/documents/parser.py`) turns the text into mission fields:
  mission type, date, *be-there-by* time, event start time, venue, city.
- A "Scan a document" card on the Plan page shows every value with the line of the document it came from,
  and fills the form only when the traveller clicks **Use these details**.

**Technical decisions**
| Decision | Why |
|--|--|
| Upload goes through our backend, not straight from the browser | The OCR text must come from Cloudinary's response to *us*, so a user can't forge it; the API secret stays server-side |
| `type: "private"` + `destroy` straight after | Admit cards carry personal data (name, roll number, photo, DOB). We never store the image or the text |
| Rules, not an LLM, for extraction | Every field must be traceable to the document. No label → no field. The UI shows the evidence line for each value |
| Reporting time beats gate-closing time beats start time | Arriving at the exam *start* time means being turned away at the gate |
| Dates next to "birth", "issued", "generated", "registration" are ignored; past dates are never chosen | An admit card has 3–4 dates; only one is the exam |
| Unlabelled addresses are ignored | Admit cards also print the candidate's *home* address |
| File type checked from the first bytes (JPEG/PNG/WebP/HEIC/PDF), 8 MB cap, 6 scans/min, sign-in required | Uploads are the riskiest input in the app |
| Cloudinary secret added to log redaction | Same treatment as every other key |

**Challenges**
- *Tables are read column by column (the biggest one).* On a real, table-layout admit card the OCR text listed
  every label first and every value after ("Reporting Time … Gate Closing Time … 07:30 AM … 08:30 AM"), so the
  venue came out as "of Test, Address (Candidate), 09:00 AM…". Fix: use the per-word bounding boxes Cloudinary
  returns, take the median word angle to undo the photo's tilt, group words into visual rows, and join the wide
  gap between the label column and the value column with ":". The same photo now yields all six fields. A
  recorded Cloudinary response (synthetic card, tilted 2.5°, noisy, low-quality JPEG) is a regression test.
- *Three-column cards break row reading.* A real AAI admit card has the centre address wrapped over 7 lines in
  the left column, beside "Reporting Time" in the middle column. Row reading paired the times correctly but cut
  the address into pieces; the OCR's own block order kept the address together but separated the times. Fix:
  parse **both** readings and pick per field — times from rows, venue from whichever reading has a PIN code or a
  known city. Labels wrapped over two lines ("NAME & ADDRESS OF / EXAMINATION CENTRE") are joined first, and a
  6-line address is shortened to *place name + city/PIN line*, which is what a map search needs.
- *Old documents.* A past exam date is now shown with "already passed · not added" instead of silently
  disappearing, so the user understands why the date field is empty.
- *Codes that look like venues* — "Test Centre No.: MP0301" matched the "Test Centre" label. Codes and times are
  now rejected as venues.
- *OCR add-on not active by default* — Cloudinary returns "You don't have an active subscription for OCR Text
  Detection and Extraction". The API now maps this to a clear `ocr_unavailable` message instead of a crash.
- *Address lines that look like fields* — "Plot No. A-12" was read as a new "Plot No" field and cut the venue
  short. Field breaks now need a colon or a spaced dash.
- *Labels with "&"* — "Test Centre Name & Address:" wasn't recognised as a venue label.

**Tests** — 15 new backend tests (admit card, interview letter, hospital slip, no-guess cases, file sniffing,
auth, size limit, add-on missing, secret redaction). Full suite: 173 backend + 16 frontend passing.

**Cloudinary features used:** Upload API (signed, server-side), private delivery type, OCR Text Detection add-on,
Destroy API with CDN invalidation, tags and folders.

## 21 Oct 2026 — Direction

- Chose to build on TripMission (door-to-door, deadline-aware journey planning) and re-frame it for social good:
  people for whom a missed journey costs a year (exam), a job (interview) or treatment (hospital).
- Cloudinary plan: ① scan to plan (OCR), ② shareable trip pass (overlay transformations), ③ low-bandwidth images
  (`f_auto,q_auto` fetch delivery).
- Compared with Milo (Telegram group trip planner, same theme): different problem; borrowed the idea of meeting
  users in chat apps and of re-planning when running late.
