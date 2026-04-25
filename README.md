# Autello

Docker Compose-стенд: публичный Nginx, PostgreSQL, pgAdmin, приватный Docker Registry v2, Watchtower. Секреты в `.env` (не в репозитории).

## Требования

- Docker и Docker Compose (v2: `docker compose`).

## Быстрый старт

```bash
cp .env.example .env
# Отредактируйте .env; для registry создайте registry-auth/htpasswd (см. .env.example)

docker compose up -d
```

## Сервисы

| Сервис        | Назначение |
|---------------|------------|
| **nginx**     | Публичный HTTP (:80), заготовка для фронта и API — см. `config/nginx/default.conf` |
| **postgres**  | БД, порт 5432 **не** проброшен наружу, доступ из сети `autello` |
| **pgadmin** + **pgadmin-nginx** | Веб-интерфейс pgAdmin на **127.0.0.1:5050** (не на :80) |
| **registry**  | Официальный `registry:2.8.3`, Basic Auth (htpasswd), порт **5000** |
| **watchtower**| Обновление образов по расписанию, с опциональной меткой (см. `docker-compose.yml`) |

## Доступ

### pgAdmin

- URL на машине с Docker: **http://127.0.0.1:5050/** (или **/login**; путь `/pgadmin` редиректится на `/`).
- С другой машины: SSH-туннель `ssh -L 5050:127.0.0.1:5050 user@сервер`, затем **http://127.0.0.1:5050** в браузере.
- Учётка: переменные **`AUTELLO_PGADMIN_EMAIL`** и **`AUTELLO_PGADMIN_PASSWORD`** в `.env` (именно префикс `AUTELLO_`, а не `PGADMIN_DEFAULT_` — иначе IDE может подставить свои env и «сломать» логин). Учётка создаётся **при первом создании** тома `pgadmin_data`.

### Подключение к PostgreSQL из pgAdmin

- **Host:** `postgres` (имя сервиса в compose)  
- **Port:** `5432`  
- **User / Password / Database:** из `.env` — `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`.  
- Пароль в самой БД **не** обновляется при правке `POSTGRES_PASSWORD` в `.env` после инициализации тома; при ошибке `password authentication failed` — выровняйте пароль в PostgreSQL (см. комментарии в `.env.example`).

### Docker Registry

- Логин: `docker login <хост>:5000`, учётки в **`registry-auth/htpasswd`**.  
- HTTP без TLS: на **клиенте** Docker добавьте `insecure-registries` — см. `.env.example`.  
- Для публичного IP ограничьте доступ файрволом; при необходимости — TLS и прокси.

## Файлы конфигурации

- `config/nginx/default.conf` — виртуальный хост Nginx.  
- `config/registry/config.yml` — настройка Registry, хранение, auth.  
- `config/pgadmin-nginx/gate.conf` — прокси к pgAdmin, редирект `/pgadmin` → `/`.

## Репозиторий

В **`.gitignore`**: `.env` и `registry-auth/htpasswd`. Клонируя проект, скопируйте `.env.example` → `.env` и сгенерируйте `htpasswd` для registry.

## Дальше

В `docker-compose.yml` в комментариях есть шаблон сервиса **backend** (подключение к `postgres`, публикация образа в registry). Подключите `upstream` в Nginx, когда появятся фронт и API.
