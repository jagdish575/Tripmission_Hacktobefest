from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.core.config import get_settings
from app.core.rate_limit import client_key, limiter
from app.services.auth import CurrentUser, mission_user
from app.services.documents import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/scan")
async def scan_document(request: Request, file: UploadFile = File(...),
                        _user: CurrentUser | None = Depends(mission_user)) -> dict[str, Any]:
    """Read an admit card / interview letter / appointment slip with Cloudinary OCR and return mission fields,
    each with the line of the document it came from. The upload is deleted from Cloudinary straight after."""
    settings = get_settings()
    limiter.check("scan", client_key(request), settings.document_scan_rate_limit_per_minute)
    data = await file.read(settings.document_max_bytes + 1)
    return await DocumentService(settings).scan(data, file.filename or "document")
