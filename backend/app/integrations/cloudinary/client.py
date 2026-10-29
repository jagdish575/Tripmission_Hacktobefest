"""Cloudinary: OCR for uploaded travel documents.

Documents are uploaded as `private` assets (no public URL), read with the OCR Text Detection add-on, and destroyed
straight after — whether reading succeeded or not. We never store the image or the text.
The SDK is synchronous, so calls run in a worker thread.
"""

from __future__ import annotations

import asyncio
import io
import math
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import cloudinary.uploader
from cloudinary.exceptions import Error as CloudinarySdkError

from app.core.errors import SetupRequiredError, UpstreamError
from app.core.logging import get_logger

log = get_logger(__name__)


@dataclass(frozen=True)
class CloudinaryCredentials:
    cloud_name: str
    api_key: str
    api_secret: str

    @classmethod
    def from_url(cls, url: str) -> CloudinaryCredentials | None:
        """cloudinary://<api_key>:<api_secret>@<cloud_name>"""
        parsed = urlparse(url.strip())
        if parsed.scheme != "cloudinary" or not (parsed.username and parsed.password and parsed.hostname):
            return None
        return cls(parsed.hostname, parsed.username, parsed.password)

    def options(self) -> dict[str, str]:
        return {"cloud_name": self.cloud_name, "api_key": self.api_key, "api_secret": self.api_secret}


@dataclass
class OcrResult:
    text: str            # rebuilt row by row (labels next to their values)
    deleted: bool
    raw_text: str = ""   # the OCR's own block order (keeps a multi-line table cell together)


class OcrUnavailableError(SetupRequiredError):
    code = "ocr_unavailable"


def _rows_from_words(words: list[dict]) -> str | None:
    """Rebuild visual rows from word boxes.

    The OCR's own text runs column by column on tabular documents (every label, then every value), which
    separates "Reporting Time" from "08:30 AM". Admit cards are almost always tables, so we de-skew the word
    boxes, group them into rows by height, and join a wide horizontal gap (label column -> value column) with
    " : ". Returns None when the boxes are unusable, so the caller falls back to the OCR's text.
    """
    boxes = []
    for word in words:
        vs = (word.get("boundingPoly") or {}).get("vertices") or []
        text = (word.get("description") or "").strip()
        if len(vs) != 4 or not text:
            continue
        pts = [(v.get("x", 0), v.get("y", 0)) for v in vs]  # top-left, top-right, bottom-right, bottom-left
        boxes.append((text, pts))
    if len(boxes) < 3:
        return None

    angles = sorted(math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]) for _, p in boxes)
    angle = angles[len(angles) // 2]
    cos, sin = math.cos(angle), math.sin(angle)
    heights = sorted(math.dist(p[0], p[3]) for _, p in boxes)
    height = max(heights[len(heights) // 2], 1.0)

    placed = []  # (row_y, left_x, right_x, text) in de-skewed coordinates
    for text, pts in boxes:
        rot = [(x * cos + y * sin, -x * sin + y * cos) for x, y in pts]
        placed.append((sum(r[1] for r in rot) / 4, min(r[0] for r in rot), max(r[0] for r in rot), text))
    placed.sort()

    rows: list[list[tuple[float, float, float, str]]] = []
    for word in placed:
        if rows and abs(word[0] - sum(w[0] for w in rows[-1]) / len(rows[-1])) < height * 0.6:
            rows[-1].append(word)
        else:
            rows.append([word])

    lines = []
    for row in rows:
        row.sort(key=lambda w: w[1])
        line, prev_right = "", None
        for _, left, right, text in row:
            if prev_right is not None:
                line += " : " if left - prev_right > height * 2.2 and not line.endswith(":") else " "
            line += text
            prev_right = right
        lines.append(re.sub(r"\(\s+", "(", re.sub(r"\s+([,.:;)])", r"\1", line)).replace(": :", ":"))
    return "\n".join(lines)


def _ocr_pages(upload: dict) -> list[list[dict]]:
    pages = ((upload.get("info") or {}).get("ocr") or {}).get("adv_ocr", {}).get("data") or []
    return [page["textAnnotations"] for page in pages if page.get("textAnnotations")]


def _ocr_text(upload: dict) -> str:
    texts = []
    for annotations in _ocr_pages(upload):
        rebuilt = _rows_from_words(annotations[1:])  # [0] is the whole text; the rest are single words
        texts.append(rebuilt or annotations[0].get("description") or "")
    return "\n".join(t for t in texts if t)


def _ocr_raw_text(upload: dict) -> str:
    return "\n".join(a[0].get("description") or "" for a in _ocr_pages(upload))


class CloudinaryClient:
    def __init__(self, credentials: CloudinaryCredentials, folder: str = "tripmission") -> None:
        self.credentials = credentials
        self.folder = folder.strip("/")

    def _upload(self, data: bytes, filename: str) -> dict:
        stream = io.BytesIO(data)
        stream.name = filename
        return cloudinary.uploader.upload(
            stream, type="private", folder=f"{self.folder}/documents", ocr="adv_ocr", resource_type="image",
            unique_filename=True, overwrite=False, tags=["tripmission-document"], **self.credentials.options())

    def _destroy(self, public_id: str) -> bool:
        result = cloudinary.uploader.destroy(public_id, type="private", resource_type="image", invalidate=True,
                                             **self.credentials.options())
        return result.get("result") in ("ok", "not found")

    async def read_document(self, data: bytes, filename: str) -> OcrResult:
        try:
            upload = await asyncio.to_thread(self._upload, data, filename)
        except CloudinarySdkError as exc:
            message = str(exc)
            if "subscription" in message.lower() and "ocr" in message.lower():
                raise OcrUnavailableError(
                    "Document reading isn't switched on yet. Fill in the form, or try again later.") from exc
            log.warning("cloudinary upload failed", extra={"context": {"error": type(exc).__name__}})
            raise UpstreamError("We couldn't read that document right now. Please try again.") from exc

        deleted = False
        try:
            text, raw_text = _ocr_text(upload), _ocr_raw_text(upload)
        finally:
            try:
                deleted = await asyncio.to_thread(self._destroy, upload["public_id"])
            except Exception as exc:  # deletion is retried by nothing — log loudly, never fail the user
                log.error("cloudinary document delete failed",
                          extra={"context": {"public_id": upload.get("public_id"), "error": type(exc).__name__}})
        return OcrResult(text=text, deleted=deleted, raw_text=raw_text)
