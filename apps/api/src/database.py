from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, Optional

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, delete, select, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(40), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)


class Workout(Base):
    __tablename__ = "workouts"
    __table_args__ = (UniqueConstraint("owner_key", "training_date", name="uq_workouts_owner_date"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    training_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"
    __table_args__ = (UniqueConstraint("workout_id", "sort_order", name="uq_workout_exercises_sort_order"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workout_id: Mapped[str] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"), index=True, nullable=False)
    exercise_id: Mapped[str] = mapped_column(String(128), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)


class TrainingSet(Base):
    __tablename__ = "training_sets"
    __table_args__ = (UniqueConstraint("workout_exercise_id", "set_number", name="uq_training_sets_set_number"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workout_exercise_id: Mapped[str] = mapped_column(ForeignKey("workout_exercises.id", ondelete="CASCADE"), index=True, nullable=False)
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[Optional[float]] = mapped_column(nullable=True)
    reps: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class FavoriteExercise(Base):
    __tablename__ = "favorite_exercises"
    __table_args__ = (UniqueConstraint("owner_key", "exercise_id", name="uq_favorite_exercises_owner_exercise"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    owner_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    exercise_id: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class UserTrainingTemplate(Base):
    __tablename__ = "user_training_templates"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_training_templates_name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    exercise_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def database_url_from_path(path: Path) -> str:
    return f"sqlite+pysqlite:///{path.resolve()}"


def normalize_database_url(database_url: str) -> str:
    """Accept provider connection strings while consistently using psycopg 3."""
    if database_url.startswith("postgres://"):
        return f"postgresql+psycopg://{database_url.removeprefix('postgres://')}"
    if database_url.startswith("postgresql://"):
        return f"postgresql+psycopg://{database_url.removeprefix('postgresql://')}"
    return database_url


def parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def iso_datetime(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


class SqlStore:
    """Compatibility boundary for the existing API domain operations.

    Every mutation is a single SQL transaction.  PostgreSQL serializes the
    short read-modify-write operation with a transaction advisory lock, so
    concurrent API workers cannot overwrite another user's changes.
    """

    def __init__(self, database_url: str, *, initialize_schema: bool = False):
        connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
        self.engine = create_engine(normalize_database_url(database_url), future=True, pool_pre_ping=True, connect_args=connect_args)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)
        if initialize_schema:
            Base.metadata.create_all(self.engine)

    @contextmanager
    def _session(self, *, write: bool = False) -> Iterator[Session]:
        with self.sessions.begin() as session:
            if write and self.engine.dialect.name == "postgresql":
                session.execute(text("SELECT pg_advisory_xact_lock(640126804)"))
            yield session

    def read(self) -> Dict[str, Any]:
        with self._session() as session:
            return self._dump(session)

    def mutate(self, callback: Callable[[Dict[str, Any]], Any]) -> Any:
        with self._session(write=True) as session:
            data = self._dump(session)
            result = callback(data)
            self._replace(session, data)
            return result

    @staticmethod
    def _dump(session: Session) -> Dict[str, Any]:
        return {
            "version": 1,
            "users": [
                {"id": row.id, "email": row.email, "displayName": row.display_name,
                 "passwordHash": row.password_hash, "createdAt": iso_datetime(row.created_at)}
                for row in session.scalars(select(User)).all()
            ],
            "sessions": [
                {"id": row.id, "userId": row.user_id, "tokenHash": row.token_hash,
                 "createdAt": iso_datetime(row.created_at), "expiresAt": iso_datetime(row.expires_at)}
                for row in session.scalars(select(UserSession)).all()
            ],
            "workouts": [
                {"id": row.id, "ownerKey": row.owner_key, "date": row.training_date.isoformat(),
                 "notes": row.notes, "createdAt": iso_datetime(row.created_at), "updatedAt": iso_datetime(row.updated_at)}
                for row in session.scalars(select(Workout)).all()
            ],
            "workoutExercises": [
                {"id": row.id, "workoutId": row.workout_id, "exerciseId": row.exercise_id, "sortOrder": row.sort_order}
                for row in session.scalars(select(WorkoutExercise)).all()
            ],
            "trainingSets": [
                {key: value for key, value in {
                    "id": row.id, "workoutExerciseId": row.workout_exercise_id, "setNumber": row.set_number,
                    "weightKg": row.weight_kg, "reps": row.reps, "createdAt": iso_datetime(row.created_at),
                }.items() if value is not None}
                for row in session.scalars(select(TrainingSet)).all()
            ],
            "favoriteExercises": [
                {"exerciseId": row.exercise_id, "ownerKey": row.owner_key, "createdAt": iso_datetime(row.created_at)}
                for row in session.scalars(select(FavoriteExercise)).all()
            ],
            "userTemplates": [
                {"id": row.id, "userId": row.user_id, "name": row.name, "exerciseIds": list(row.exercise_ids),
                 "createdAt": iso_datetime(row.created_at), "updatedAt": iso_datetime(row.updated_at)}
                for row in session.scalars(select(UserTrainingTemplate)).all()
            ],
        }

    @staticmethod
    def _replace(session: Session, data: Dict[str, Any]) -> None:
        # Delete dependent rows first to keep the operation portable across
        # PostgreSQL and the SQLite database used by the test suite.
        for model in (TrainingSet, WorkoutExercise, FavoriteExercise, UserTrainingTemplate, UserSession, Workout, User):
            session.execute(delete(model))
        session.flush()
        session.add_all(User(
            id=row["id"], email=row["email"], display_name=row["displayName"], password_hash=row["passwordHash"],
            created_at=parse_datetime(row["createdAt"]),
        ) for row in data["users"])
        session.flush()
        session.add_all(UserSession(
            id=row["id"], user_id=row["userId"], token_hash=row["tokenHash"],
            created_at=parse_datetime(row["createdAt"]), expires_at=parse_datetime(row["expiresAt"]),
        ) for row in data["sessions"])
        session.add_all(Workout(
            id=row["id"], owner_key=row["ownerKey"], training_date=date.fromisoformat(row["date"]),
            notes=row.get("notes", ""), created_at=parse_datetime(row["createdAt"]),
            updated_at=parse_datetime(row["updatedAt"]),
        ) for row in data["workouts"])
        session.flush()
        session.add_all(WorkoutExercise(
            id=row["id"], workout_id=row["workoutId"], exercise_id=row["exerciseId"], sort_order=row["sortOrder"],
        ) for row in data["workoutExercises"])
        session.flush()
        session.add_all(TrainingSet(
            id=row["id"], workout_exercise_id=row["workoutExerciseId"], set_number=row["setNumber"],
            weight_kg=row.get("weightKg"), reps=row.get("reps"), created_at=parse_datetime(row["createdAt"]),
        ) for row in data["trainingSets"])
        session.add_all(FavoriteExercise(
            owner_key=row["ownerKey"], exercise_id=row["exerciseId"], created_at=parse_datetime(row["createdAt"]),
        ) for row in data["favoriteExercises"])
        session.add_all(UserTrainingTemplate(
            id=row["id"], user_id=row["userId"], name=row["name"], exercise_ids=row["exerciseIds"],
            created_at=parse_datetime(row["createdAt"]), updated_at=parse_datetime(row["updatedAt"]),
        ) for row in data.get("userTemplates", []))
