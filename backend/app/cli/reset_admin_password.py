"""
Сброс пароля учётной записи admin_user (обход веб-формы).

В контейнере backend:
  python -m app.cli.reset_admin_password ЛОГИН НОВЫЙ_ПАРОЛЬ

Локально (из каталога backend, с DATABASE_URL в окружении):
  python -m app.cli.reset_admin_password ЛОГИН НОВЫЙ_ПАРОЛЬ
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.core.database import async_session_factory
from app.core.security import hash_password, normalize_credential
from app.models.admin_user import AdminUserCRUD


async def _run(username: str, password: str) -> int:
    username = normalize_credential(username)
    password = normalize_credential(password)
    if len(username) < 1:
        print("Логин не может быть пустым.", file=sys.stderr)
        return 1
    if len(password) < 8:
        print("Пароль не короче 8 символов.", file=sys.stderr)
        return 1
    async with async_session_factory() as session:
        u = await AdminUserCRUD.get_by_username(session, username)
        if not u:
            print(f"Пользователь «{username}» не найден.", file=sys.stderr)
            return 1
        await AdminUserCRUD.update(session, u.id, password_hash=hash_password(password))
        await session.commit()
        print(f"Пароль обновлён для «{username}» (id={u.id}).")
        return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Сброс пароля admin_user")
    p.add_argument("username")
    p.add_argument("password", help="Новый пароль (≥ 8 символов)")
    args = p.parse_args()
    raise SystemExit(asyncio.run(_run(args.username, args.password)))


if __name__ == "__main__":
    main()
