import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, Integer, String, create_engine, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


DB_PATH = Path(__file__).with_name("crm.db")
DATABASE_URL = f"sqlite:///{DB_PATH}"

API_KEY = os.getenv("CRM_API_KEY", "dev-key-change-me")
HOLIDAYS_MMDD = {
    "01-01",  # 元旦
    "05-01",  # 劳动节
    "10-01", "10-02", "10-03",  # 国庆常见公休
}


class Base(DeclarativeBase):
    pass


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
    whatsapp: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # 跟进流程
    follow_up_stage: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    next_follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_follow_up_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_follow_up_channel: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_follow_up_note: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
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
        add("last_follow_up_channel", "last_follow_up_channel VARCHAR(32)")
        add("last_follow_up_note", "last_follow_up_note VARCHAR(2000)")

        for stmt in alters:
            conn.execute(text(stmt))

ensure_schema()


def _is_business_day(dt: datetime) -> bool:
    # weekday: Monday=0 ... Sunday=6
    if dt.weekday() >= 5:
        return False
    mmdd = f"{dt.month:02d}-{dt.day:02d}"
    return mmdd not in HOLIDAYS_MMDD


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


def require_api_key(x_api_key: Optional[str] = Header(default=None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    timezone: str = Field(min_length=1, max_length=64)
    country_code: Optional[str] = Field(default=None, max_length=2)
    region: Optional[str] = Field(default=None, max_length=16)
    linkedin_url: Optional[str] = Field(default=None, max_length=512)
    website_url: Optional[str] = Field(default=None, max_length=512)
    email: Optional[str] = Field(default=None, max_length=255)
    whatsapp: Optional[str] = Field(default=None, max_length=64)
    follow_up_stage: Optional[str] = Field(default=None, max_length=32)
    next_follow_up_at: Optional[datetime] = None
    last_follow_up_at: Optional[datetime] = None
    last_follow_up_channel: Optional[str] = Field(default=None, max_length=32)
    last_follow_up_note: Optional[str] = Field(default=None, max_length=2000)
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


app = FastAPI(title="CRM Sync (Worktime Reminder)")

static_dir = Path(__file__).with_name("static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def index():
    return FileResponse(static_dir / "index.html")


@app.get("/api/companies", dependencies=[Depends(require_api_key)])
def list_companies(db: Session = Depends(get_db)) -> list[CompanyOut]:
    rows = db.scalars(select(Company).order_by(Company.name.asc())).all()
    return [CompanyOut.model_validate(r, from_attributes=True) for r in rows]


@app.post("/api/companies", dependencies=[Depends(require_api_key)])
def create_company(payload: CompanyIn, db: Session = Depends(get_db)) -> CompanyOut:
    exists = db.scalar(select(Company).where(Company.name == payload.name))
    if exists:
        raise HTTPException(status_code=409, detail="Company name already exists")
    row = Company(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return CompanyOut.model_validate(row, from_attributes=True)


@app.put("/api/companies/{company_id}", dependencies=[Depends(require_api_key)])
def update_company(company_id: int, payload: CompanyIn, db: Session = Depends(get_db)) -> CompanyOut:
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    if payload.name != row.name:
        exists = db.scalar(select(Company).where(Company.name == payload.name))
        if exists:
            raise HTTPException(status_code=409, detail="Company name already exists")

    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    db.add(row)
    db.commit()
    db.refresh(row)
    return CompanyOut.model_validate(row, from_attributes=True)


@app.delete("/api/companies/{company_id}", dependencies=[Depends(require_api_key)])
def delete_company(company_id: int, db: Session = Depends(get_db)):
    row = db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
