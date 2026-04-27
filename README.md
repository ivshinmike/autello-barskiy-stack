# Autello

Docker Compose: публичный **Nginx** (:80), **PostgreSQL**, **backend** (порт **не** публикуется — только сеть `autello`), **Watchtower**. Опционально по профилю `tools`: **pgAdmin**, **Docker Registry**. Секреты в `.env` (не в репозитории).

## Требования

- Docker и Docker Compose (v2: `docker compose`).

## Быстрый старт

```bash
cp .env.example .env
# Отредактируйте .env (пароли, JWT_SECRET).

docker compose up -d
```

Сайт и API: **http://адрес-сервера/** (статика из `frontend/dist`) и **/api/** проксируется в бэкенд. Прямого доступа к Uvicorn на :8000 с хоста **нет**.

### Опционально: pgAdmin и Registry

```bash
docker compose --profile tools up -d
```

## Сервисы

| Сервис | Назначение |
|--------|------------|
| **nginx** | Публичный HTTP (:80), фронт и API — см. `config/nginx/default.conf` |
| **backend** | FastAPI, **:8000 только внутри** сети; снаружи — через Nginx `/api/`, `GET /health` |
| **postgres** | БД, порт 5432 **не** пробрасывается наружу |
| **pgadmin** + **pgadmin-nginx** | Профиль **`tools`**, :5050 |
| **registry** | Профиль **`tools`**, :5000 |
| **watchtower** | Обновление образов по расписанию (см. `docker-compose.yml`) |

## API и OpenAPI

- С браузера к хосту **:80** пути **/docs**, **/redoc**, **/openapi.json** зарезервированы под **404** (чтобы не отдавался SPA). Рабочий вход в приложение: **/api/…**.
- Проверка бэка: `GET /health` на том же хосте (Nginx) или `GET /api/health`.
- Включение Swagger **на Uvicorn внутри контейнера**: `ENABLE_OPENAPI=true` в `.env` и, например,  
  `docker compose exec backend curl -sS http://127.0.0.1:8000/docs` (порт 8000 доступен **только внутри** контейнера backend).

## Доступ: pgAdmin (при `--profile tools`)

- URL: **http://&lt;хост&gt;:5050/**
- Учётка: **`AUTELLO_PGADMIN_EMAIL`**, **`AUTELLO_PGADMIN_PASSWORD`** в `.env` (префикс `AUTELLO_` — не `PGADMIN_DEFAULT_`, см. комментарии в `.env.example`).

### Подключение к PostgreSQL

- **Host (из pgAdmin-контейнера):** `postgres`  
- **Port:** `5432`  
- **User / Password / Database:** из `.env` — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.

## Docker Registry (при `--profile tools`)

- `docker login <хост>:5000`, учётки в **`registry-auth/htpasswd`**.  
- HTTP без TLS: `insecure-registries` на **клиенте** Docker — см. `.env.example`.

## Файлы конфигурации

- `config/nginx/default.conf` — виртуальный хост.  
- `config/registry/config.yml` — настройка Registry.  
- `config/pgadmin-nginx/gate.conf` — прокси к pgAdmin.

## Репозиторий

В **`.gitignore`**: `.env` и `registry-auth/htpasswd`. Скопируйте `.env.example` → `.env`.
