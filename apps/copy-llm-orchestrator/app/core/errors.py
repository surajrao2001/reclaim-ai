import uuid
from typing import Any

from fastapi import HTTPException


def api_error(
    status_code: int,
    code: str,
    message: str,
    *,
    retryable: bool = False,
) -> HTTPException:
    body: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "trace_id": str(uuid.uuid4()),
            "retryable": retryable,
        }
    }
    return HTTPException(status_code=status_code, detail=body)
