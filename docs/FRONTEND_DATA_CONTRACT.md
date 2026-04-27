# Контракт данных для фронтенда (Autéllo)

Краткое описание JSON-форматов и эндпоинтов, на которые можно опираться при генерации или синхронизации UI с API.

## Базовый URL

- Переменная окружения фронта: `VITE_API_BASE` (без завершающего `/`), например `https://api.example.com` или пусто для того же хоста.
- Префиксы ниже указаны от корня API (`${VITE_API_BASE}/api/...`).

## Заголовки

- Все тела запросов с JSON: `Content-Type: application/json`, ответы: `Accept: application/json`.
- Защищённые админ-операции: `Authorization: Bearer <JWT>`.

---

## 1. Настройки лендинга / заявки — `admin_data`

Публичное чтение списка; запись только с JWT админа.

| Метод | Путь | Auth | Назначение |
|--------|------|------|------------|
| `GET` | `/api/admin-data` | нет | Список записей |
| `GET` | `/api/admin-data/{row_id}` | нет | Одна запись |
| `POST` | `/api/admin-data` | JWT | Создать (или `?row_id=` — обновить строку) |
| `PATCH` | `/api/admin-data/{row_id}` | JWT | Частичное обновление |
| `DELETE` | `/api/admin-data/{row_id}` | JWT | Удалить строку |

### 1.1. Ответ списка / одной записи (`AdminDataOut`)

Массив объектов или один объект со следующей формой:

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `number` | PK в БД |
| `services` | `ServiceItem[]` | Справочник услуг для формы и админки |
| `budget_range_min` | `string \| null` | Нижняя граница бюджета (строка, часто число в виде текста) |
| `budget_range_max` | `string \| null` | Верхняя граница |
| `extra_ui` | `object \| null` | Произвольный JSON для доп. настроек UI |
| `created_at` | `string` (ISO 8601) | Дата создания |
| `updated_at` | `string \| null` | Дата обновления |

### 1.2. Элемент `ServiceItem` (элемент `services`)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | `string` | Стабильный ключ (если пусто — сервер подставит `svc_{n}`) |
| `title` | `string` | Название услуги (для селектов и отображения) |
| `description` | `string` | Описание, может быть пустым |

Дополнительные поля в объекте **разрешены** (`extra` на бэкенде): генератор может закладывать расширения, но обязательны согласованные `id` / `title` / `description` как строки.

**Нормализация на входе (POST/PATCH):**

- Вместо массива нельзя передавать один объект без обёртки в список — бэкенд принимает **только массив** объектов; одиночный `{}` превращается в `[{}]`.
- `id` / `title` / `description` приводятся к строкам; в них нельзя передавать вложенные объекты/массивы.

### 1.3. Тело создания / полного обновления (`AdminDataIn`, PATCH — те же поля опционально)

```json
{
  "services": [
    { "id": "paint", "title": "Покраска", "description": "" }
  ],
  "budget_range_min": "0",
  "budget_range_max": "1500000",
  "extra_ui": null
}
```

- `extra_ui`: объект или `null`; **не** передавать пустой массив `[]` (будет отклонено/нормализовано в `null` на части путей — лучше сразу `null` или объект).
- Лишние ключи на корне тела **запрещены** (`extra: forbid`).

---

## 2. Заявка (тёплый лид) — `warm_leads`

| Метод | Путь | Auth |
|--------|------|------|
| `POST` | `/api/warm-leads` | нет |

### 2.1. Тело создания (`WarmLeadCreate`)

Обязательны только **`first_name`** и **`last_name`** (непустые строки). Остальные поля опциональны.

| Поле | Тип | Примечание |
|------|-----|------------|
| `first_name` | `string` | обязательно |
| `last_name` | `string` | обязательно |
| `middle_name` | `string \| null` | |
| `business_info` | `string \| null` | |
| `business_niche` | `string \| null` | |
| `company_size` | `string \| null` | |
| `task_volume` | `string \| null` | |
| `role_type` | `string \| null` | |
| `business_size` | `string \| null` | |
| `need_volume` | `string \| null` | |
| `result_deadline` | `string \| null` | удобно `YYYY-MM-DD` |
| `task_type` | `string \| null` | |
| `product_interest` | `string \| null` | часто совпадает с `title` услуги из `admin_data` |
| `budget` | `string \| null` | итог суммы (строка), не число |
| `contact_method` | `string \| null` | |
| `preferred_time` | `string \| null` | |
| `comments` | `string \| null` | |
| `behavior` | `LeadBehaviorPayload \| null` | см. ниже |

Лишние ключи на корне **запрещены**.

### 2.2. `LeadBehaviorPayload` (вложенный объект `behavior`)

Все поля опциональны по смыслу (есть значения по умолчанию на бэкенде):

| Поле | Тип | По умолчанию |
|------|-----|----------------|
| `time_on_page_seconds` | `number` | `0` |
| `button_clicks` | `Record<string, number>` | `{}` |
| `cursor_hover_data` | `any` | `null` |
| `page_return_count` | `number` | `0` |
| `raw_metrics` | `object \| null` | `null` |

`extra: forbid` — без произвольных доп. ключей.

### 2.3. Ответ создания (`WarmLeadOut`)

Поля заявки + `id`, `created_at`, `updated_at`.

### 2.4. Две таблицы поведения в БД (не путать)

| Таблица | Откуда данные | Поля (логика) |
|--------|----------------|---------------|
| **`lead_behavior_pings`** | Публичный **`POST /api/lead-behavior`** раз в секунду с лендинга | `time_on_page`, `buttons_clicked` и `cursor_positions` как **текст** (внутри — JSON-строка), много строк на визит |
| **`lead_behaviors`** | Только при **`POST /api/warm-leads`** (объект `behavior` в теле заявки) | `application_id` = id заявки в `warm_leads`, `time_on_page_seconds`, `button_clicks` / `cursor_hover_data` как **JSONB** |

Просмотр сырых пингов в админке: **`GET /api/lead-behavior/records?skip=&limit=`** (JWT). В pgAdmin для секундной телеметрии смотрите **`lead_behavior_pings`**, а не `lead_behaviors`.

---

## 3. Связка UI: откуда брать опции

- **Диапазон бюджета (слайдер):** из выбранной записи `admin_data` (часто первая по `id`): `budget_range_min`, `budget_range_max` → парсинг как числа на клиенте по необходимости.
- **Список услуг (селект «продукт / услуга»):** массив `services` той же записи; значение в заявку уходит в `product_interest` строкой (например `title`).

---

## 4. Ошибки

Типичный формат FastAPI:

```json
{ "detail": "Текст ошибки" }
```

или массив объектов валидации с полем `msg`. Фронт может разбирать `detail` как строку или первый элемент массива.

---

## 5. Рекомендации для генератора кода

1. Разделить типы: **`AdminDataRow`** (GET), **`AdminDataWritePayload`** (POST/PATCH тело без `id`/`timestamps`).
2. Для формы заявки держать **все поля строками** в состоянии, как в текущем `WarmLeadForm`, и собирать `WarmLeadCreate` перед `POST`.
3. Не отправлять `undefined` в JSON — только отсутствующие ключи или `null`, где API допускает.
4. Источник правды по схеме write для админки — OpenAPI/Swagger бэкенда; этот документ — сжатое резюме для промптов и людей.
