"""Database engine, session management, and lifecycle hooks using SQLAlchemy 2.0."""

from contextlib import contextmanager
from typing import Generator, Optional
from sqlalchemy import create_engine, event, Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

from app.db.config import DATABASE_URL


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy entities."""
    pass


def build_engine(db_url: str = DATABASE_URL) -> Engine:
    """Creates a SQLAlchemy engine with SQLite foreign key pragmas enabled."""
    is_sqlite = db_url.startswith("sqlite")
    engine = create_engine(
        db_url,
        connect_args={"check_same_thread": False} if is_sqlite else {},
        echo=False,
    )

    if is_sqlite:
        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = build_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db(target_engine: Engine = engine) -> None:
    """Creates all database tables defined on Base."""
    Base.metadata.create_all(bind=target_engine)


def reset_db(target_engine: Engine = engine) -> None:
    """Drops all database tables and recreates them cleanly."""
    Base.metadata.drop_all(bind=target_engine)
    Base.metadata.create_all(bind=target_engine)


def seed_db(session: Optional[Session] = None, session_factory=SessionLocal) -> None:
    """Explicitly seeds initial clinic data (doctors and availability slots)."""
    from app.repositories import ClinicRepository

    if session is not None:
        repo = ClinicRepository(session)
        repo.seed_default_clinic_data()
    else:
        with session_factory() as sess:
            repo = ClinicRepository(sess)
            repo.seed_default_clinic_data()


@contextmanager
def get_db(session_factory=SessionLocal) -> Generator[Session, None, None]:
    """Provide a transactional scope around a series of operations."""
    session: Session = session_factory()
    try:
        yield session
    finally:
        session.close()
