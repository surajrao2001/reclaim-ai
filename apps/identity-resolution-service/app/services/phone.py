import hashlib
import hmac

import phonenumbers
from phonenumbers import NumberParseException


def normalize_phone_e164(phone: str, default_region: str = "IN") -> str:
    try:
        parsed = phonenumbers.parse(phone, default_region)
        if not phonenumbers.is_valid_number(parsed):
            raise ValueError("invalid phone number")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except NumberParseException as exc:
        raise ValueError("invalid phone number") from exc


def hash_phone_e164(phone_e164: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), phone_e164.encode("utf-8"), hashlib.sha256).hexdigest()
