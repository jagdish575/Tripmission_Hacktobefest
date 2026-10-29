"""Scan to plan: a photo of an admit card / interview letter / appointment slip -> pre-filled mission fields."""

from __future__ import annotations

from typing import Any

from app.core.config import Settings, get_settings
from app.core.errors import SetupRequiredError, ValidationAppError
from app.integrations.cloudinary import CloudinaryClient, CloudinaryCredentials
from app.services.documents.parser import extract_mission_fields

# What a phone camera or a downloaded admit card produces. Checked against the file's first bytes, not its name.
_SIGNATURES: list[tuple[str, bytes, int]] = [
    ("image/jpeg", b"\xff\xd8\xff", 0),
    ("image/png", b"\x89PNG\r\n\x1a\n", 0),
    ("application/pdf", b"%PDF-", 0),
    ("image/webp", b"WEBP", 8),
    *[("image/heic", b"ftyp" + brand, 4) for brand in (b"heic", b"heix", b"mif1", b"heif")],
]

_client: CloudinaryClient | None = None


def set_cloudinary_client(client: CloudinaryClient | None) -> None:
    global _client
    _client = client


def sniff_type(data: bytes) -> str | None:
    for mime, magic, offset in _SIGNATURES:
        if data[offset:offset + len(magic)] == magic:
            return mime
    return None


class DocumentService:
    def __init__(self, settings: Settings | None = None, client: CloudinaryClient | None = None) -> None:
        self.settings = settings or get_settings()
        self.client = client or _client or self._from_settings()

    def _from_settings(self) -> CloudinaryClient | None:
        creds = CloudinaryCredentials.from_url(self.settings.cloudinary_url)
        return CloudinaryClient(creds, self.settings.cloudinary_folder) if creds else None

    async def scan(self, data: bytes, filename: str) -> dict[str, Any]:
        if self.client is None:
            raise SetupRequiredError("Document scanning isn't set up on this server. Fill in the form instead.")
        if not data:
            raise ValidationAppError("That file is empty.", details={"field": "file"})
        if len(data) > self.settings.document_max_bytes:
            limit_mb = self.settings.document_max_bytes // (1024 * 1024)
            raise ValidationAppError(f"That file is larger than {limit_mb} MB. Try a smaller photo.",
                                     details={"field": "file"})
        if sniff_type(data) is None:
            raise ValidationAppError("Upload a photo (JPG, PNG, WebP, HEIC) or a PDF.", details={"field": "file"})

        result = await self.client.read_document(data, filename or "document")
        parsed = extract_mission_fields(result.text, alternate=result.raw_text or None)
        out: dict[str, Any] = {**parsed, "document_deleted": result.deleted, "read_by": "Cloudinary OCR"}
        if not (result.text.strip() or result.raw_text.strip()):
            out["notes"] = ["We couldn't find any text. Try a sharper, well-lit photo with the whole page in view."]
        if self.settings.debug_mode:
            out["debug_text"] = result.text
        return out
