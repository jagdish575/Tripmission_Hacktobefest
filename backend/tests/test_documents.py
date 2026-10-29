from __future__ import annotations

from datetime import date

import pytest

from app.integrations.cloudinary import CloudinaryCredentials, OcrResult, OcrUnavailableError
from app.integrations.cloudinary.client import _ocr_text
from app.services.documents import extract_mission_fields
from app.services.documents.service import set_cloudinary_client, sniff_type

TODAY = date(2026, 10, 21)

ADMIT_CARD = """NATIONAL TESTING AGENCY
ADMIT CARD - COMMON ENTRANCE TEST 2026
Candidate Name: RAHUL VERMA
Roll No: 2611045522
Date of Birth: 04/07/2007
Date of Exam: 14/11/2026
Reporting Time: 08:30 AM
Gate Closing Time: 09:00 AM
Exam Timing: 09:30 AM to 12:30 PM
Test Centre Name & Address: iON Digital Zone iDZ 1,
Plot No. A-12, Sector 62,
Noida, Uttar Pradesh 201309
Candidate Address: 12 MG Road, Indore, Madhya Pradesh 452001
Admit card generated on 10/10/2026
"""

INTERVIEW = """ACME Technologies Pvt Ltd
Interview Call Letter
Dear Aditi, you are invited for the final round interview.
Date: 9th October 2026
Interview Time: 10:00 AM
Please arrive by 9:30 a.m. at the reception.
Venue: Manyata Tech Park, Block D, Nagavara,
Bengaluru, Karnataka 560045
"""

HOSPITAL = """All India Institute of Medical Sciences
OPD Appointment Slip
Patient: Kamla Devi   UHID: 1029384
Department of Cardiology - Dr. S. Mehta
Appointment Date: 2026-11-03
Appointment Time: 11:15 AM
Report by 10:45 AM at Registration Counter 4
Hospital Address: Ansari Nagar, New Delhi, Delhi 110029
"""


def values(result: dict) -> dict[str, str]:
    return {k: v["value"] for k, v in result["fields"].items()}


def test_admit_card_fields():
    result = extract_mission_fields(ADMIT_CARD, today=TODAY)
    v = values(result)
    assert result["document_kind"] == "Admit card"
    assert v["mission_type"] == "exam"
    assert v["travel_date"] == "2026-11-14"           # not the date of birth, not the "generated on" date
    assert v["arrival_deadline"] == "08:30"           # reporting time beats gate closing and exam start
    assert result["fields"]["arrival_deadline"]["label"] == "Reporting time"
    assert v["event_time"] == "09:30"
    assert v["venue"].startswith("iON Digital Zone") and "201309" in v["venue"]
    assert "MG Road" not in v["venue"]                # the candidate's home address is never the venue
    assert v["destination"] == "Noida"                # unknown city: taken from the part before state / PIN
    assert result["missing"] == []
    assert any("reporting time" in n for n in result["notes"])


def test_every_field_has_evidence_from_the_document():
    result = extract_mission_fields(ADMIT_CARD, today=TODAY)
    for field in result["fields"].values():
        first_line = field["evidence"].split(" / ")[0]
        assert first_line in ADMIT_CARD.replace("\n", " ") or first_line in ADMIT_CARD


def test_interview_letter():
    v = values(extract_mission_fields(INTERVIEW, today=date(2026, 10, 1)))
    assert v["mission_type"] == "interview"
    assert v["travel_date"] == "2026-10-09"
    assert v["arrival_deadline"] == "09:30"           # "Please arrive by 9:30 a.m."
    assert v["event_time"] == "10:00"
    assert v["destination"] == "Bengaluru"
    assert "Manyata Tech Park" in v["venue"]


def test_hospital_slip():
    v = values(extract_mission_fields(HOSPITAL, today=TODAY))
    assert v["mission_type"] == "medical"
    assert v["travel_date"] == "2026-11-03"
    assert v["arrival_deadline"] == "10:45"
    assert v["destination"] == "Delhi"


def test_no_labels_means_no_guesses():
    result = extract_mission_fields("Hello world\nSome text 12 MG Road Indore 452001", today=TODAY)
    assert result["fields"] == {}
    assert set(result["missing"]) == {"travel_date", "arrival_deadline", "venue", "destination"}


def test_past_dates_are_never_used_for_planning():
    result = extract_mission_fields("Exam Date: 01/01/2025\nReporting Time: 9:00 AM", today=TODAY)
    assert result["fields"]["travel_date"]["label"] == "past" and "travel_date" in result["missing"]
    # an upcoming date always wins over a past one
    result = extract_mission_fields("Exam Date: 01/01/2025\nRevised Exam Date: 05/12/2026", today=TODAY)
    assert result["fields"]["travel_date"]["value"] == "2026-12-05" and result["fields"]["travel_date"]["label"] is None
    # an unlabelled past date is ignored entirely
    assert "travel_date" not in extract_mission_fields("Printed 01/01/2025", today=TODAY)["fields"]


def test_bare_numbers_are_not_times():
    result = extract_mission_fields("Reporting time: see Roll No 2611 below", today=TODAY)
    assert "arrival_deadline" not in result["fields"]


def test_sniff_type():
    assert sniff_type(b"\xff\xd8\xff\xe0rest") == "image/jpeg"
    assert sniff_type(b"%PDF-1.7") == "application/pdf"
    assert sniff_type(b"\x00\x00\x00\x18ftypheic....") == "image/heic"
    assert sniff_type(b"\x00\x00\x00\x18ftypmp42") is None   # a video is not a photo
    assert sniff_type(b"<html>") is None


def test_credentials_and_ocr_payload():
    creds = CloudinaryCredentials.from_url("cloudinary://123:abc-def@democloud")
    assert creds and creds.cloud_name == "democloud" and creds.api_key == "123" and creds.api_secret == "abc-def"
    assert CloudinaryCredentials.from_url("cloudinary://<key>@x") is None
    payload = {"info": {"ocr": {"adv_ocr": {"status": "complete", "data": [
        {"textAnnotations": [{"description": "ADMIT CARD\nDate of Exam: 14/11/2026"}, {"description": "ADMIT"}]}]}}}}
    assert _ocr_text(payload) == "ADMIT CARD\nDate of Exam: 14/11/2026"
    assert _ocr_text({}) == ""


def test_real_ocr_table_card_is_read_row_by_row():
    """Recorded Cloudinary OCR response for a tilted, noisy, table-layout admit card (synthetic data).
    The OCR's own text lists every label before every value; rows must be rebuilt from the word boxes."""
    import json
    from pathlib import Path

    payload = json.loads((Path(__file__).parent / "fixtures" / "cloudinary_ocr_table_admit_card.json").read_text())
    text = _ocr_text(payload)
    assert "Reporting / Entry Time at Centre: 07:30 AM" in text
    assert "Venue of Test: lon Digital Zone" in text
    v = values(extract_mission_fields(text, today=TODAY))
    assert v == {"mission_type": "exam", "travel_date": "2026-11-14", "arrival_deadline": "07:30",
                 "event_time": "09:00", "destination": "Indore",
                 "venue": "lon Digital Zone iDZ Pithampur Road, Near Rau Circle, Rau, Indore, Madhya Pradesh 453331"}


# A real 3-column admit card (personal details replaced). Row reading pairs labels with values but splits the
# address cell; the OCR's own block order keeps the address together.
REAL_ROWS = """E - ADMIT CARD
NAME OF THE CANDIDATE: Post Applied: Junior Assistant (Fire Service) NE - 4
TEST PERSON
NAME & ADDRESS OF: Date, Day and Time of: 15th November 2026, Tuesday: Shaffer
EXAMINATION CENTRE: Examination
iON Digital Zone iDZ Kovilambakkam: 12:30 PM 2:30 PM
Fortune Towers, 1st and 2nd Floor, SH: Reporting Time: 11:00 AM
(XXXX Session)
109, 200 Feet Thoraipakkam
Pallavaram Radial Road, Near: J. Edmontory
Eachangadu signal, Kovilambakkam,: Gate Closing Time
Chennai, Tamil Nadu, India - 600117: (No late coming will be allowed): 12:00 PM
"""
REAL_RAW = """E - ADMIT CARD
NAME OF THE CANDIDATE
TEST PERSON
D.O.B.
01-01-2000
NAME & ADDRESS OF
EXAMINATION CENTRE
iON Digital Zone iDZ Kovilambakkam
Fortune Towers, 1st and 2nd Floor, SH
109, 200 Feet Thoraipakkam
Pallavaram Radial Road, Near
Eachangadu signal, Kovilambakkam,
Chennai, Tamil Nadu, India - 600117
Date, Day and Time of
Examination
Reporting Time
(XXXX Session)
Gate Closing Time
15th November 2026, Tuesday
12:30 PM 2:30 PM
11:00 AM
12:00 PM
"""


def test_three_column_card_combines_both_readings():
    result = extract_mission_fields(REAL_ROWS, alternate=REAL_RAW, today=TODAY)
    v = values(result)
    assert v["travel_date"] == "2026-11-15"
    assert v["arrival_deadline"] == "11:00"
    # 6-line address is too long for the form: keep the place name and the city/PIN line
    assert v["venue"] == "iON Digital Zone iDZ Kovilambakkam, Chennai, Tamil Nadu, India - 600117"
    assert v["destination"] == "Chennai"
    assert result["missing"] == []


def test_rows_alone_would_take_a_column_header_as_venue():
    assert "venue" not in extract_mission_fields(REAL_ROWS, today=TODAY)["fields"]


def test_past_exam_date_is_shown_but_flagged():
    result = extract_mission_fields(REAL_ROWS.replace("2026", "2022"), alternate=REAL_RAW.replace("2026", "2022"),
                                    today=TODAY)
    assert result["fields"]["travel_date"] == {"value": "2022-11-15", "evidence": result["fields"]["travel_date"]["evidence"],
                                               "label": "past"}
    assert "travel_date" in result["missing"]
    assert any("already passed" in n for n in result["notes"])


def test_wrapped_labels_are_joined():
    result = extract_mission_fields("NAME & ADDRESS OF\nEXAMINATION CENTRE\nAbc College, Civil Lines,\nJaipur 302006",
                                    today=TODAY)
    assert values(result)["venue"] == "Abc College, Civil Lines, Jaipur 302006"


def test_centre_codes_are_not_venues():
    result = extract_mission_fields("Test Centre No.: MP0301\nTest Centre: TC-1142", today=TODAY)
    assert "venue" not in result["fields"]


class FakeCloudinary:
    def __init__(self, text: str = ADMIT_CARD, error: Exception | None = None):
        self.text, self.error, self.calls = text, error, 0

    async def read_document(self, data: bytes, filename: str) -> OcrResult:
        self.calls += 1
        if self.error:
            raise self.error
        return OcrResult(text=self.text, deleted=True)


@pytest.fixture
def fake_cloudinary():
    fake = FakeCloudinary()
    set_cloudinary_client(fake)  # type: ignore[arg-type]
    yield fake
    set_cloudinary_client(None)


JPEG = b"\xff\xd8\xff\xe0" + b"0" * 2048


def test_scan_endpoint(api, fake_cloudinary):
    response = api.post("/api/v1/documents/scan", files={"file": ("admit.jpg", JPEG, "image/jpeg")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["document_deleted"] is True and body["read_by"] == "Cloudinary OCR"
    assert body["fields"]["arrival_deadline"]["value"] == "08:30"
    assert "debug_text" not in body
    assert fake_cloudinary.calls == 1


def test_scan_requires_sign_in(anon_api, fake_cloudinary):
    response = anon_api.post("/api/v1/documents/scan", files={"file": ("admit.jpg", JPEG, "image/jpeg")})
    assert response.status_code == 401
    assert fake_cloudinary.calls == 0


def test_scan_rejects_non_images(api, fake_cloudinary):
    response = api.post("/api/v1/documents/scan", files={"file": ("x.jpg", b"<script>", "image/jpeg")})
    assert response.status_code == 422 and response.json()["error"]["details"]["field"] == "file"
    assert fake_cloudinary.calls == 0


def test_scan_rejects_large_files(api, fake_cloudinary, settings, monkeypatch):
    monkeypatch.setattr(settings, "document_max_bytes", 1024)
    response = api.post("/api/v1/documents/scan", files={"file": ("big.jpg", JPEG, "image/jpeg")})
    assert response.status_code in (413, 422)
    assert fake_cloudinary.calls == 0


def test_scan_without_ocr_addon(api, fake_cloudinary):
    fake_cloudinary.error = OcrUnavailableError("Document reading isn't switched on yet.")
    response = api.post("/api/v1/documents/scan", files={"file": ("admit.jpg", JPEG, "image/jpeg")})
    assert response.status_code == 503 and response.json()["error"]["code"] == "ocr_unavailable"


def test_cloudinary_secret_is_redacted(settings, monkeypatch):
    monkeypatch.setattr(settings, "cloudinary_url", "cloudinary://1234567:super-secret-value@democloud")
    assert "super-secret-value" in settings.secret_values()
