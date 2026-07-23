import re

_UPI_VPA_RE = re.compile(r"^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$")


def normalize_upi_vpa(raw: str) -> str:
    vpa = raw.strip().lower()
    if not _UPI_VPA_RE.match(vpa):
        raise ValueError("Invalid UPI VPA")
    return vpa


def mask_upi_vpa(vpa: str) -> str:
    if "@" not in vpa:
        return "***"
    local, _, handle = vpa.partition("@")
    if len(local) <= 2:
        masked_local = "*" * len(local)
    else:
        masked_local = f"{local[0]}{'*' * (len(local) - 2)}{local[-1]}"
    return f"{masked_local}@{handle}"
