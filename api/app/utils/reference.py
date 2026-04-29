"""Human-readable reference number generation using Crockford Base32 + check digit.

Format: {PREFIX}-XXXXXXXC
  - 7 Crockford base32 characters encoding secrets.randbits(35)
  - 1 check character from the extended mod-37 alphabet
  - Example: TKT-7H2K9PCR

Crockford alphabet (32): 0123456789ABCDEFGHJKMNPQRSTVWXYZ
  No I, L, O, U — avoids 0/O, 1/I/L confusion when read aloud or typed.

Check alphabet (37): 0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U
"""

import secrets

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_CHECK_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U"
_CROCKFORD_DECODE = {c: i for i, c in enumerate(_CROCKFORD)}


def generate_reference(prefix: str = "TKT") -> str:
    """Return a new reference string, e.g. 'TKT-7H2K9PCR'.

    Uses secrets.randbits(35) for the 7-character body so it is
    cryptographically unpredictable.  35 bits → 34 billion unique codes.
    """
    n = secrets.randbits(35)

    # Encode MSB-first into 7 Crockford base32 characters.
    chars = []
    tmp = n
    for _ in range(7):
        chars.append(_CROCKFORD[tmp & 0x1F])
        tmp >>= 5
    body = "".join(reversed(chars))

    check = _CHECK_CHARS[n % 37]
    return f"{prefix}-{body}{check}"


def validate_reference(ref: str, prefix: str = "TKT") -> bool:
    """Return True if ref has the correct prefix, length, and check digit."""
    ref = normalize_reference(ref)
    header = f"{prefix}-"
    if not ref.startswith(header):
        return False
    code = ref[len(header):]
    if len(code) != 8:  # 7 body + 1 check
        return False

    body, check = code[:7], code[7]

    n = 0
    for c in body:
        if c not in _CROCKFORD_DECODE:
            return False
        n = n * 32 + _CROCKFORD_DECODE[c]

    return check == _CHECK_CHARS[n % 37]


def normalize_reference(ref: str) -> str:
    """Strip whitespace and uppercase — canonical form for storage and lookup."""
    return ref.strip().upper()
