import base64


class InvalidClaimTokenError(ValueError):
    pass


def decode_claim_token(token: str) -> tuple[str, str]:
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        rest_id, order_id = raw.split(":", 1)
        if not rest_id or not order_id:
            raise InvalidClaimTokenError("empty rest_id or order_id")
        return rest_id, order_id
    except (ValueError, UnicodeDecodeError) as exc:
        raise InvalidClaimTokenError("malformed claim token") from exc


def encode_claim_token(rest_id: str, order_id: str) -> str:
    return base64.urlsafe_b64encode(f"{rest_id}:{order_id}".encode("utf-8")).decode("ascii").rstrip("=")
