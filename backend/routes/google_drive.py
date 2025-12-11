# backend/routes/google_drive.py
from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..db import get_db
from ..models import User
from .google_calendar import _user_from_cookie_or_header

router = APIRouter(prefix="/api/google/drive", tags=["google-drive"])

# -------------------------------------------------------------------
# 1) BACKFILL: list “transcript-ish” files from Google Drive
# -------------------------------------------------------------------

@router.post("/backfill")
async def backfill_drive_transcripts(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Fetch transcript-like files from Google Drive for this user.
    Used by the Uploads page "Backfill transcripts" button.
    """
    user: User = _user_from_cookie_or_header(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    access_token = user.google_access_token
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Google account not connected for this user.",
        )

    # Filter to "transcript-ish" files – tweak naming if you want
    q = (
        "trashed = false and ("
        "mimeType = 'text/plain' or "
        "mimeType = 'application/vnd.google-apps.document' or "
        "mimeType = "
        "'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or "
        "name contains '.vtt' or "
        "name contains '.srt' or "
        "name contains '.txt'"
        ") and "
        "name contains 'transcript'"
    )

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            "https://www.googleapis.com/drive/v3/files",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "q": q,
                "pageSize": 50,
                "orderBy": "modifiedTime desc",
                "fields": "files(id,name,mimeType,modifiedTime,webViewLink,size)",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    files = data.get("files", [])
    return {"files": files}

# -------------------------------------------------------------------
# 2) ATTACH: download Drive file & reuse /upload_transcript
# -------------------------------------------------------------------

GOOGLE_DRIVE_API_BASE = "https://www.googleapis.com/drive/v3/files"
INTERNAL_API_BASE = os.getenv("INTERNAL_API_BASE", "http://127.0.0.1:8000")


class AttachDrivePayload(BaseModel):
    meeting_id: int
    file_id: str
    mime_type: Optional[str] = None
    name: Optional[str] = None


@router.post("/attach_to_meeting")
async def attach_drive_to_meeting(
    payload: AttachDrivePayload,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Download a file from Google Drive and attach it to a meeting
    using the existing /upload_transcript logic.
    """
    user: User = _user_from_cookie_or_header(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    access_token = user.google_access_token
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="User has not connected Google yet.",
        )

    headers = {"Authorization": f"Bearer {access_token}"}
    file_id = payload.file_id
    mime = (payload.mime_type or "").strip()

    # 1) Download from Drive (Google Doc vs normal file)
    async with httpx.AsyncClient(timeout=60.0) as client:
        if mime.startswith("application/vnd.google-apps"):
            # Export Google Doc as plain text
            url = f"{GOOGLE_DRIVE_API_BASE}/{file_id}/export"
            params = {"mimeType": "text/plain"}
        else:
            # Binary / text file: download media
            url = f"{GOOGLE_DRIVE_API_BASE}/{file_id}"
            params = {"alt": "media"}

        drive_resp = await client.get(url, headers=headers, params=params)

    if drive_resp.status_code != 200:
        raise HTTPException(
            status_code=drive_resp.status_code,
            detail=drive_resp.text,
        )

    content = drive_resp.content
    if not content:
        raise HTTPException(status_code=500, detail="Drive file is empty.")

    filename = payload.name or "drive_transcript.txt"

    # 2) Send to existing upload_transcript endpoint
    async with httpx.AsyncClient(timeout=60.0) as client:
        files = {"file": (filename, content, "text/plain")}
        cookie_header = request.headers.get("cookie", "")

        upload_resp = await client.post(
            f"{INTERNAL_API_BASE}/api/meetings/{payload.meeting_id}/upload_transcript",
            files=files,
            headers={"Cookie": cookie_header},
        )

    if upload_resp.status_code != 200:
        raise HTTPException(
            status_code=upload_resp.status_code,
            detail=upload_resp.text,
        )

    return {"ok": True}

# -------------------------------------------------------------------
# 3) PREVIEW: return text snippet for UI modal
# -------------------------------------------------------------------

class DrivePreviewRequest(BaseModel):
  file_id: str
  mime_type: Optional[str] = None


@router.post("/preview_text")
async def preview_drive_text(
    payload: DrivePreviewRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Return a text preview of a Google Drive file.
    Used by the front-end before attaching a file to a meeting.
    """
    user: User = _user_from_cookie_or_header(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    access_token = user.google_access_token
    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Google account not connected for this user.",
        )

    mime = (payload.mime_type or "").lower()
    headers = {"Authorization": f"Bearer {access_token}"}

    if mime.startswith("application/vnd.google-apps.document"):
        # Google Doc → export as plain text
        url = f"{GOOGLE_DRIVE_API_BASE}/{payload.file_id}/export"
        params = {"mimeType": "text/plain"}
    else:
        # Regular file → download media
        url = f"{GOOGLE_DRIVE_API_BASE}/{payload.file_id}"
        params = {"alt": "media"}

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, headers=headers, params=params)

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    text = resp.text or ""
    if len(text) > 8000:
        text = text[:8000] + "\n\n…(truncated preview)…"

    return {"text": text}
