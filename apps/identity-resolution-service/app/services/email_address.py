"""Lightweight email validation for claim OTP requests."""

from __future__ import annotations

import re

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(raw: str) -> str:
    email = raw.strip().lower()
    if len(email) > 320 or not _EMAIL_RE.match(email):
        raise ValueError("Invalid email address")
    return email
