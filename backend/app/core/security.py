from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings


def normalize_credential(value: str) -> str:
    """Убирает ведущие/хвостовые пробелы и переводы строк (копирование из файла, браузера)."""
    return value.strip()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not plain or not hashed:
        return False
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            hashed.strip().encode("utf-8"),
        )
    except ValueError:
        return False


def create_access_token(*, subject: str, username: str) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    exp = now + timedelta(minutes=s.jwt_expire_minutes)
    payload = {
        "sub": subject,
        "username": username,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, s.jwt_secret, algorithm=s.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    s = get_settings()
    return jwt.decode(token, s.jwt_secret, algorithms=[s.jwt_algorithm])
