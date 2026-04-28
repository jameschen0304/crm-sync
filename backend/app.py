import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


# 可选：Render 挂持久盘时设 CRM_DB_PATH=/data/crm.db，避免每次部署丢失 SQLite
_db_override = os.getenv("CRM_DB_PATH", "").strip()
if _db_override:
    DB_PATH = Path(_db_override)
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
else:
    DB_PATH = Path(__file__).with_name("crm.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

JWT_SECRET = os.getenv("CRM_JWT_SECRET", "dev-jwt-secret-change-me")
JWT_ALG = "HS256"
JWT_EXPIRE_DAYS = int(os.getenv("CRM_JWT_EXPIRE_DAYS", "30"))
ALLOW_REGISTER = os.getenv("CRM_ALLOW_REGISTER", "true").lower() in ("1", "true", "yes")
# Use pbkdf2_sha256 first to avoid bcrypt backend issues on some hosts.
# Keep bcrypt in the list so existing bcrypt hashes can still be verified.
pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")

HOLIDAYS_MMDD = {
    "01-01",  # 元旦
    "05-01",  # 劳动节
    "10-01", "10-02", "10-03",  # 国庆常见公休
}


class Base(DeclarativeBase):
    pass


class CrmUser(Base):
    __tablename__ = "crm_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class Company(Base):
    __tablename__ = "company"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    country_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    website_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    wechat: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # 跟进流程
    follow_up_stage: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    next_follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # 周一例行（独立于主跟进流程）
    monday_routine_enabled: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    monday_next_follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    monday_last_follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    monday_last_follow_up_note: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    monday_follow_up_history: Mapped[Optional[str]] = mapped_column(String(8000), nullable=True)
    last_follow_up_channel: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_follow_up_note: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    follow_up_history: Mapped[Optional[str]] = mapped_column(String(8000), nullable=True)
    # 最近成交（结构化字段 + 原始粘贴文本）
    last_won_raw: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    last_won_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_won_product: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_won_qty: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_won_unit_price: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    last_won_supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)

def ensure_schema():
    # 轻量“加列迁移”：你本地已有 crm.db 时，也能自动补齐新列
    with engine.begin() as conn:
        cols = conn.execute(text("PRAGMA table_info(company)")).fetchall()
        existing = {c[1] for c in cols}  # name at index 1
        alters = []
        def add(col, ddl):
            if col not in existing:
                alters.append(f"ALTER TABLE company ADD COLUMN {ddl}")

        add("last_won_raw", "last_won_raw VARCHAR(2000)")
        add("last_won_time", "last_won_time DATETIME")
        add("last_won_product", "last_won_product VARCHAR(255)")
        add("last_won_qty", "last_won_qty VARCHAR(64)")
        add("last_won_unit_price", "last_won_unit_price VARCHAR(128)")
        add("last_won_supplier", "last_won_supplier VARCHAR(255)")
        add("region", "region VARCHAR(16)")
        add("follow_up_stage", "follow_up_stage VARCHAR(32)")
        add("next_follow_up_at", "next_follow_up_at DATETIME")
        add("last_follow_up_at", "last_follow_up_at DATETIME")
        add("monday_routine_enabled", "monday_routine_enabled VARCHAR(8)")
        add("monday_next_follow_up_at", "monday_next_follow_up_at DATETIME")
        add("monday_last_follow_up_at", "monday_last_follow_up_at DATETIME")
        add("monday_last_follow_up_note", "monday_last_follow_up_note VARCHAR(2000)")
        add("monday_follow_up_history", "monday_follow_up_history VARCHAR(8000)")
        add("last_follow_up_channel", "last_follow_up_channel VARCHAR(32)")
        add("last_follow_up_note", "last_follow_up_note VARCHAR(2000)")
        add("follow_up_history", "follow_up_history VARCHAR(8000)")
        add("wechat", "wechat VARCHAR(128)")

        for stmt in alters:
            conn.execute(text(stmt))

ensure_schema()


def _is_business_day(dt: datetime) -> bool:
    # weekday: Monday=0 ... Sunday=6
    if dt.weekday() >= 5:
        return False
    mmdd = f"{dt.month:02d}-{dt.day:02d}"
    return mmdd not in HOLIDAYS_MMDD


# 与 static/app.js 中 FOLLOW_UP_STAGE_DAYS 保持一致
FOLLOW_UP_STAGE_DAYS = {
    "新线索": 1,
    "已联系": 3,
    "需求确认": 3,
    "已报价": 2,
    "谈判中": 2,
    "成交": 30,
    "暂停": None,
}


def compute_next_follow_up_at(stage: str, from_dt: datetime) -> Optional[datetime]:
    """与前端 computeNextFollowUpISO 同一规则：按工作日跳过周末与节假日。"""
    if stage == "暂停":
        return None
    days = FOLLOW_UP_STAGE_DAYS.get(stage)
    if days is None:
        return None
    d = from_dt
    left = days
    while left > 0:
        d = d + timedelta(days=1)
        if _is_business_day(d):
            left -= 1
    while not _is_business_day(d):
        d = d + timedelta(days=1)
    return d


def compute_next_monday_at(from_dt: datetime) -> datetime:
    """固定排到下一个周一（今天是周一也排到下周一）。"""
    delta = (7 - from_dt.weekday()) % 7
    if delta == 0:
        delta = 7
    return from_dt + timedelta(days=delta)


def _normalize_monday_routine_fields(data: dict) -> dict:
    """周一例行仅对有 WhatsApp 的客户生效。"""
    whatsapp = (data.get("whatsapp") or "").strip()
    enabled = data.get("monday_routine_enabled") == "1"
    if enabled and whatsapp:
        data["monday_routine_enabled"] = "1"
        if data.get("monday_next_follow_up_at") is None:
            data["monday_next_follow_up_at"] = compute_next_monday_at(datetime.utcnow())
    else:
        data["monday_routine_enabled"] = None
        data["monday_next_follow_up_at"] = None
    return data


def migrate_follow_up_defaults() -> None:
    """历史客户：补全跟进阶段与下次跟进时间（与当前前端逻辑一致）。"""
    valid_stages = set(FOLLOW_UP_STAGE_DAYS.keys())
    now = datetime.utcnow()
    with Session(engine) as db:
        rows = db.scalars(select(Company)).all()
        changed = False
        for row in rows:
            stage = (row.follow_up_stage or "").strip() or None
            # 兼容旧版本把“周一例行”写在主阶段里的数据：迁移到独立字段
            if stage == "周一例行":
                if row.monday_routine_enabled != "1":
                    row.monday_routine_enabled = "1"
                    changed = True
                if row.monday_next_follow_up_at is None:
                    row.monday_next_follow_up_at = compute_next_monday_at(now)
                    changed = True
                stage = None
            if not stage or stage not in valid_stages:
                row.follow_up_stage = "新线索"
                stage = "新线索"
                changed = True
            if row.monday_routine_enabled == "1" and row.monday_next_follow_up_at is None:
                row.monday_next_follow_up_at = compute_next_monday_at(now)
                changed = True
            if row.monday_routine_enabled != "1" and row.monday_next_follow_up_at is not None:
                row.monday_next_follow_up_at = None
                changed = True
            # 无 WhatsApp 的客户不允许周一例行
            if not (row.whatsapp or "").strip():
                if row.monday_routine_enabled is not None:
                    row.monday_routine_enabled = None
                    changed = True
                if row.monday_next_follow_up_at is not None:
                    row.monday_next_follow_up_at = None
                    changed = True
            if stage == "暂停":
                if row.next_follow_up_at is not None:
                    row.next_follow_up_at = None
                    row.updated_at = datetime.utcnow()
                    changed = True
                continue
            if row.next_follow_up_at is None:
                nxt = compute_next_follow_up_at(stage, now)
                if nxt:
                    row.next_follow_up_at = nxt
                    row.updated_at = datetime.utcnow()
                    changed = True
        if changed:
            db.commit()


migrate_follow_up_defaults()


def normalize_existing_followup_dates():
    # 对历史数据做一次“工作日规范化”
    with Session(engine) as db:
        rows = db.scalars(select(Company)).all()
        changed = False
        for row in rows:
            dt = row.next_follow_up_at
            if not dt:
                continue
            new_dt = dt
            while not _is_business_day(new_dt):
                # 顺延到下一个自然日，保留具体时分秒
                new_dt = new_dt + timedelta(days=1)
            if new_dt != dt:
                row.next_follow_up_at = new_dt
                db.add(row)
                changed = True
        if changed:
            db.commit()


normalize_existing_followup_dates()


def get_db():
    with Session(engine) as session:
        yield session


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _valid_email(email: str) -> bool:
    e = _normalize_email(email)
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", e))


def issue_access_token(user_id: int) -> str:
    exp = datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": exp}, JWT_SECRET, algorithm=JWT_ALG)


def get_current_user(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> CrmUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not logged in")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not logged in")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        uid = int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get(CrmUser, uid)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    timezone: str = Field(min_length=1, max_length=64)
    country_code: Optional[str] = Field(default=None, max_length=2)
    region: Optional[str] = Field(default=None, max_length=16)
    linkedin_url: Optional[str] = Field(default=None, max_length=512)
    website_url: Optional[str] = Field(default=None, max_length=512)
    email: Optional[str] = Field(default=None, max_length=255)
    wechat: Optional[str] = Field(default=None, max_length=128)
    whatsapp: Optional[str] = Field(default=None, max_length=64)
    follow_up_stage: Optional[str] = Field(default=None, max_length=32)
    next_follow_up_at: Optional[datetime] = None
    last_follow_up_at: Optional[datetime] = None
    monday_routine_enabled: Optional[str] = Field(default=None, max_length=8)
    monday_next_follow_up_at: Optional[datetime] = None
    monday_last_follow_up_at: Optional[datetime] = None
    monday_last_follow_up_note: Optional[str] = Field(default=None, max_length=2000)
    monday_follow_up_history: Optional[str] = Field(default=None, max_length=8000)
    last_follow_up_channel: Optional[str] = Field(default=None, max_length=32)
    last_follow_up_note: Optional[str] = Field(default=None, max_length=2000)
    follow_up_history: Optional[str] = Field(default=None, max_length=8000)
    last_won_raw: Optional[str] = Field(default=None, max_length=2000)
    last_won_time: Optional[datetime] = None
    last_won_product: Optional[str] = Field(default=None, max_length=255)
    last_won_qty: Optional[str] = Field(default=None, max_length=64)
    last_won_unit_price: Optional[str] = Field(default=None, max_length=128)
    last_won_supplier: Optional[str] = Field(default=None, max_length=255)


class CompanyOut(CompanyIn):
    id: int
    created_at: datetime
    updated_at: datetime


class RegisterBody(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SessionOut(BaseModel):
    user_id: int
    email: str


app = FastAPI(title="CRM Sync (Worktime Reminder)")

# GitHub Pages 等静态站点跨域调用本 API（浏览器会先发 OPTIONS 预检）
_cors = os.getenv("CRM_CORS_ORIGINS", "").strip()
if _cors:
    _allow = [o.strip() for o in _cors.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allow,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https://[\w.-]+\.github\.io|http://127\.0\.0\.1(:\d+)?|http://localhost(:\d+)?",
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

static_dir = Path(__file__).with_name("static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.middleware("http")
async def no_cache_html_middleware(request: Request, call_next):
    """避免浏览器/CDN 长期缓存 HTML，导致前端改版后用户仍看到旧页面。"""
    response = await call_next(request)
    path = request.url.path
    if path.endswith(".html") or path == "/":
        response.headers["Cache-Control"] = "no-store, max-age=0, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    return response


@app.get("/")
def index():
    # 必须用 /static/index.html 打开页面，这样 ./styles.css、./app.js 才会解析到 /static/ 下
    return RedirectResponse(url="/static/index.html", status_code=302)


@app.post("/api/auth/register", response_model=TokenOut)
def auth_register(payload: RegisterBody, db: Session = Depends(get_db)) -> TokenOut:
    email = _normalize_email(payload.email)
    if not _valid_email(email):
        raise HTTPException(status_code=400, detail="Invalid email")
    if not ALLOW_REGISTER:
        raise HTTPException(status_code=403, detail="Registration is disabled")
    if db.scalar(select(CrmUser).where(CrmUser.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    try:
        row = CrmUser(email=email, password_hash=pwd_context.hash(payload.password))
        db.add(row)
        db.commit()
        db.refresh(row)
        return TokenOut(access_token=issue_access_token(row.id))
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Register storage error")
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Register failed")


@app.post("/api/auth/login", response_model=TokenOut)
def auth_login(payload: LoginBody, db: Session = Depends(get_db)) -> TokenOut:
    email = _normalize_email(payload.email)
    user = db.scalar(select(CrmUser).where(CrmUser.email == email))
    if not user or not pwd_context.verify(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    return TokenOut(access_token=issue_access_token(user.id))


@app.get("/api/auth/session", response_model=SessionOut)
def auth_session(user: CrmUser = Depends(get_current_user)) -> SessionOut:
    return SessionOut(user_id=user.id, email=user.email)


@app.get("/api/companies", dependencies=[Depends(get_current_user)])
def list_companies(db: Session = Depends(get_db)) -> list[CompanyOut]:
    rows = db.scalars(select(Company).order_by(Company.name.asc())).all()
    return [CompanyOut.model_validate(r, from_attributes=True) for r in rows]


@app.post("/api/companies", dependencies=[Depends(get_current_user)])
def create_company(payload: CompanyIn, db: Session = Depends(get_db)) -> CompanyOut:
    exists = db.scalar(select(Company).where(Company.name == payload.name))
    if exists:
        raise HTTPException(status_code=409, detail="Company name already exists")
    data = _normalize_monday_routine_fields(payload.model_dump())
    row = Company(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return CompanyOut.model_validate(row, from_attributes=True)


@app.put("/api/companies/{company_id}", dependencies=[Depends(get_current_user)])
def update_company(company_id: int, payload: CompanyIn, db: Session = Depends(get_db)) -> CompanyOut:
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    if payload.name != row.name:
        exists = db.scalar(select(Company).where(Company.name == payload.name))
        if exists:
            raise HTTPException(status_code=409, detail="Company name already exists")

    old_follow_up = (
        row.last_follow_up_at,
        row.last_follow_up_channel,
        row.last_follow_up_note,
    )

    data = _normalize_monday_routine_fields(payload.model_dump())
    for k, v in data.items():
        setattr(row, k, v)

    new_follow_up = (
        row.last_follow_up_at,
        row.last_follow_up_channel,
        row.last_follow_up_note,
    )
    if new_follow_up != old_follow_up and row.last_follow_up_at:
        follow_time = row.last_follow_up_at.strftime("%Y-%m-%d %H:%M:%S")
        follow_channel = row.last_follow_up_channel or "未填写渠道"
        follow_note = row.last_follow_up_note or "（无备注）"
        new_line = f"[{follow_time}] {follow_channel} | {follow_note}"
        history = (row.follow_up_history or "").strip()
        row.follow_up_history = f"{history}\n{new_line}" if history else new_line
    # 周一例行：仅覆盖 monday_last_* 字段，不追加独立历史（与主跟进「跟进历史」区分）
    db.add(row)
    db.commit()
    db.refresh(row)
    return CompanyOut.model_validate(row, from_attributes=True)


@app.delete("/api/companies/{company_id}", dependencies=[Depends(get_current_user)])
def delete_company(company_id: int, db: Session = Depends(get_db)):
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
