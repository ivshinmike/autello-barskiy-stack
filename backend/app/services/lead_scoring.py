"""
Эвристический скоринг «тёплых» лидов для админ-панели.
Оценка 0–100: бюджет, размер компании, роль, сроки, ниша, маркеры срочности в тексте.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:
    from app.models.warm_lead import WarmLead

Temperature = Literal["hot", "warm", "cold"]
Department = Literal["vip", "general"]


def _today() -> date:
    return datetime.now(timezone.utc).date()


def parse_budget_rub(text: str | None) -> float:
    """Извлекает максимальное «денежное» число из строки бюджета (в т.ч. «от – до»)."""
    if not text or not str(text).strip():
        return 0.0
    s = str(text).replace("\u00a0", " ")
    s_low = s.lower()
    best = 0.0
    for m in re.finditer(r"\d[\d\s.,]*\d|\d", s):
        chunk = m.group(0)
        t = re.sub(r"\s+", "", chunk).replace(",", ".")
        if not t or t in ".,":
            continue
        if t.count(".") > 1:
            t = t.replace(".", "")
        try:
            v = float(t)
        except ValueError:
            continue
        if "млн" in s_low and v < 10_000:
            v *= 1_000_000
        if v > best:
            best = v
    return best


def _budget_points(budget: float) -> int:
    if budget <= 0:
        return 0
    if budget < 30_000:
        return 2
    if budget < 100_000:
        return 6
    if budget < 300_000:
        return 10
    if budget < 800_000:
        return 15
    if budget < 1_500_000:
        return 20
    if budget < 3_000_000:
        return 23
    return 25


def _company_points(company_size: str | None, business_size: str | None) -> int:
    blob = f"{company_size or ''} {business_size or ''}".lower()
    if not blob.strip():
        return 5
    if re.search(r"1000\+|10\s*000|корпора", blob):
        return 20
    if "500+" in blob or re.search(r"20[1-9]|201", blob) or re.search(
        r"500", blob
    ):
        return 18
    if re.search(r"50[1-9]|51|200", blob) and (
        "200" in blob or "–" in blob or "-" in blob
    ):
        return 15
    if re.search(r"11|50", blob):
        return 10
    if re.search(r"6|10", blob) and ("6" in blob or "10" in blob):
        return 7
    # Дефис в классе только в начале/конце, иначе «\s-–» даёт невалидный диапазон в re.
    if re.search(r"1[-\s\u2013]5", blob) or "ип" in blob:
        return 4
    return 8


def _role_points(role_type: str | None) -> int:
    if not role_type:
        return 5
    t = role_type.lower()
    if any(
        x in t
        for x in (
            "владел",
            "фаундер",
            "основател",
            "ceo",
            "директор",
            "руковод",
            "cfo",
            "coo",
            "коммерч",
        )
    ):
        return 15
    if any(x in t for x in ("закуп", "it", "тим", "лид", "head")):
        return 11
    if "сотрудник" in t or "маркет" in t:
        return 5
    return 8


_DATE_RE = re.compile(
    r"(20\d{2})[.\-/](0?[1-9]|1[0-2])[.\-/](0?[1-9]|[12]\d|3[01])"
)


def _parse_first_iso_date(s: str) -> date | None:
    m = _DATE_RE.search(s)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(y, mo, d)
    except ValueError:
        return None


def _deadline_points(
    result_deadline: str | None, comments: str | None, business_info: str | None
) -> int:
    ref = _today()
    text_all = f"{result_deadline or ''} {comments or ''} {business_info or ''}"
    lo = text_all.lower()
    base = 0
    if result_deadline and str(result_deadline).strip():
        rd = str(result_deadline).strip()
        parsed = _parse_first_iso_date(rd)
        if parsed is not None:
            days = (parsed - ref).days
            if days <= 1:
                base = 25
            elif days <= 7:
                base = 20
            elif days <= 14:
                base = 16
            elif days <= 30:
                base = 11
            elif days <= 90:
                base = 6
            else:
                base = 0
        else:
            if any(
                w in lo
                for w in (
                    "2027",
                    "квартал",
                    "полугод",
                    "q4",
                    "позже",
                    "когда-нибудь",
                    "плава",
                    "гибко",
                )
            ):
                base = 0
            elif any(w in lo for w in ("недел", "дня", "завтра", "сегодня", "срочн")):
                base = 14
            else:
                base = 2
    kw = sum(
        2
        for w in (
            "срочн",
            "немедленн",
            "тендер",
            "регулятор",
            "аудит",
            "инвестор",
            "релиз",
            "промо",
        )
        if w in lo
    )
    return min(25, base + min(6, kw))


def _niche_points(
    business_niche: str | None, business_info: str | None, product_interest: str | None
) -> int:
    blob = f"{business_niche or ''} {business_info or ''} {product_interest or ''}".lower()
    if not blob.strip():
        return 3
    s = 0
    for chunk, pts in (
        (("fintech", "банк", "финанс", "compliance", "регул", "kyc"), 10),
        (("it", "saas", "b2b", "разработ", "корпоратив", "внедрен"), 7),
        (("e-commerce", "ecom", "ритейл", "маркетплейс", "e-commerce"), 6),
        (("edtech", "мед", "клиник", "health", "промышлен", "логист"), 5),
    ):
        if any(x in blob for x in chunk):
            s = max(s, pts)
    return min(10, max(s, 2))


def _need_volume_points(
    need_volume: str | None, task_volume: str | None, task_type: str | None
) -> int:
    blob = f"{need_volume or ''} {task_volume or ''} {task_type or ''}".lower()
    if any(x in blob for x in ("критич", "максим", "под ключ", "полный", "корпорат")):
        return 5
    if any(x in blob for x in ("сред", "поэтап", "пилот")):
        return 3
    if any(x in blob for x in ("миним", "ознаком", "точеч", "оценк")):
        return 1
    return 2


@dataclass
class LeadScoreBreakdown:
    budget: int
    company: int
    role: int
    deadline: int
    niche: int
    need: int
    total: int


def compute_lead_score(lead: WarmLead) -> tuple[int, LeadScoreBreakdown, Temperature, Department]:
    b_raw = parse_budget_rub(lead.budget)
    budget = _budget_points(b_raw)
    company = _company_points(lead.company_size, lead.business_size)
    role = _role_points(lead.role_type)
    deadline = _deadline_points(lead.result_deadline, lead.comments, lead.business_info)
    niche = _niche_points(lead.business_niche, lead.business_info, lead.product_interest)
    need = _need_volume_points(lead.need_volume, lead.task_volume, lead.task_type)

    raw_total = budget + company + role + deadline + niche + need
    total = int(min(100, round(raw_total)))

    if total >= 68:
        temp: Temperature = "hot"
    elif total >= 42:
        temp = "warm"
    else:
        temp = "cold"

    is_vip = total >= 72 or b_raw >= 1_400_000 or (b_raw >= 800_000 and company >= 16)
    dept: Department = "vip" if is_vip else "general"

    br = LeadScoreBreakdown(
        budget=budget,
        company=company,
        role=role,
        deadline=deadline,
        niche=niche,
        need=need,
        total=total,
    )
    return total, br, temp, dept
