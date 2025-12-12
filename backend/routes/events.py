# backend/routes/events.py
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

import os
import smtplib
from email.message import EmailMessage

from fastapi import APIRouter, Depends, Header, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Event
from ..schemas import EventCreate, EventOut

router = APIRouter(prefix="/events", tags=["events"])


# --------- helpers ---------
def _get_user_id_from_header(user_id_header: Optional[str]) -> Optional[int]:
    if not user_id_header:
        return None
    try:
        return int(user_id_header)
    except ValueError:
        return None


def _send_email_sync(event: Event):
    """
    Very simple SMTP email sender.
    Configure using env vars:

    SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, EMAIL_FROM
    """
    if not event.notify_email:
        return

    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    email_from = os.getenv("EMAIL_FROM", username or "no-reply@example.com")

    if not host or not username or not password:
        # Log-only failure; in a real app, use logging instead of print
        print("[events] SMTP not configured, skipping email send")
        return

    msg = EmailMessage()
    msg["From"] = email_from
    msg["To"] = event.notify_email
    msg["Subject"] = f"Event created: {event.title}"

    dt_text = event.start_time.isoformat()
    body_lines = [
        f"Hi,",
        "",
        f"An event has been created in your AI Summariser offline calendar:",
        "",
        f"Title       : {event.title}",
        f"Date & Time : {dt_text}",
        f"Location    : {event.location or '—'}",
        "",
        f"Description : {event.description or '—'}",
        "",
        "This email was sent from your AI Summariser backend.",
    ]
    msg.set_content("\n".join(body_lines))

    # TLS SMTP connection
    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(username, password)
        server.send_message(msg)


# --------- routes ---------


@router.get("/", response_model=List[EventOut])
def list_events(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    from_time: Optional[datetime] = Query(default=None),
    to_time: Optional[datetime] = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
):
    user_id = _get_user_id_from_header(x_user_id)
    query = db.query(Event)

    if user_id is not None:
        query = query.filter(Event.user_id == user_id)

    if from_time is not None:
        query = query.filter(Event.start_time >= from_time)
    if to_time is not None:
        query = query.filter(Event.start_time <= to_time)

    events = (
        query.order_by(Event.start_time.asc())
        .limit(limit)
        .all()
    )
    return events


@router.post("/", response_model=EventOut)
def create_event(
    payload: EventCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user_id = _get_user_id_from_header(x_user_id)

    event = Event(
        user_id=user_id,
        title=payload.title,
        description=payload.description,
        start_time=payload.start_time,
        end_time=payload.end_time,
        location=payload.location,
        notify_email=payload.notify_email,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Fire-and-forget email about the event
    if event.notify_email:
        background_tasks.add_task(_send_email_sync, event)

    return event


@router.post("/{event_id}/send_email", response_model=EventOut)
def send_event_email(
    event_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    user_id = _get_user_id_from_header(x_user_id)

    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if user_id is not None and event.user_id not in (None, user_id):
        # simple ownership check
        raise HTTPException(status_code=403, detail="Not allowed")

    if not event.notify_email:
        raise HTTPException(status_code=400, detail="Event has no notify_email set")

    background_tasks.add_task(_send_email_sync, event)
    return event

@router.delete("/{event_id}", status_code=204)
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()
    # 204 = No Content, so we just return None
    return None