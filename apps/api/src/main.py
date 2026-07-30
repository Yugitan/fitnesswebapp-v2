from __future__ import annotations

import base64
import hashlib
import hmac
import math
import os
import re
import secrets
import threading
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from .database import SqlStore, database_url_from_path

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
GUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{12,100}$")
DEFAULT_DATABASE_URL = "postgresql+psycopg://amax:amax@127.0.0.1:5432/amax"
PASSWORD_ITERATIONS = 310_000
SESSION_DAYS = 30
LOGIN_MAX_ATTEMPTS = max(1, int(os.getenv("LOGIN_MAX_ATTEMPTS", "5")))
LOGIN_WINDOW_SECONDS = max(1, int(os.getenv("LOGIN_WINDOW_SECONDS", "900")))


def now_datetime() -> datetime:
    return datetime.now(timezone.utc)


def iso_datetime(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def now() -> str:
    return iso_datetime(now_datetime())


def create_id(prefix: str) -> str:
    return f"{prefix}_{uuid4()}"


def validate_backup(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise HTTPException(400, "备份文件版本无效")
    keys = ("workouts", "workoutExercises", "trainingSets", "favoriteExercises")
    for key in keys:
        if not isinstance(payload.get(key), list):
            raise HTTPException(400, f"备份缺少 {key}")
    return {"version": 1, **{key: deepcopy(payload[key]) for key in keys}}


class WorkoutCreate(BaseModel):
    date: str


class DraftSetInput(BaseModel):
    weightKg: Optional[float] = None
    reps: Optional[int] = None


class DraftExerciseInput(BaseModel):
    exerciseId: str
    sets: list[DraftSetInput]


class WorkoutCommitInput(BaseModel):
    date: str
    exerciseIds: list[str]
    notes: str = ""
    draftExercises: list[DraftExerciseInput] = Field(default_factory=list)


class ExerciseCreate(BaseModel):
    exerciseId: str


class RegisterInput(BaseModel):
    email: str
    password: str
    confirmPassword: Optional[str] = None
    displayName: Optional[str] = None
    guestId: Optional[str] = None


class LoginInput(BaseModel):
    email: str
    password: str
    guestId: Optional[str] = None


class ChangePasswordInput(BaseModel):
    currentPassword: str
    newPassword: str
    confirmPassword: str


class UserTemplateCreate(BaseModel):
    name: str
    exerciseIds: list[str]


class UserTemplateUpdate(BaseModel):
    name: str
    exerciseIds: list[str]


@dataclass(frozen=True)
class Principal:
    owner_key: str
    kind: str
    user_id: Optional[str] = None
    guest_id: Optional[str] = None


BUILT_IN_TRAINING_TEMPLATES = (
    {
        "id": "beginner-full-body",
        "kind": "built-in",
        "name": "新手全身",
        "description": "从大肌群开始的全身入门训练",
        "tag": "全身 · 约 45 分钟",
        "exerciseIds": ("0662", "0043", "0027", "0361", "0001"),
    },
)

BODY_PART_RECOMMENDATIONS = (
    {"id": "chest", "name": "胸部", "exerciseIds": ("0025", "0662")},
    {"id": "back", "name": "背部", "exerciseIds": ("0027", "0818")},
    {"id": "upper-legs", "name": "腿部", "exerciseIds": ("0043", "0054")},
    {"id": "shoulders", "name": "肩部", "exerciseIds": ("0361", "0334")},
    {"id": "core", "name": "核心", "exerciseIds": ("0001", "0464")},
)


class LoginAttemptLimiter:
    """Small per-process login throttle.

    Production deployments should keep a single API worker or replace this
    with a shared Redis limiter before horizontally scaling the API.
    """

    def __init__(self, maximum_attempts: int, window_seconds: int):
        self.maximum_attempts = maximum_attempts
        self.window = timedelta(seconds=window_seconds)
        self.attempts: Dict[str, list[datetime]] = {}
        self.lock = threading.Lock()

    def check(self, key: str) -> None:
        timestamp = now_datetime()
        with self.lock:
            recent = [attempt for attempt in self.attempts.get(key, []) if timestamp - attempt < self.window]
            self.attempts[key] = recent
            if len(recent) >= self.maximum_attempts:
                remaining = max(1, math.ceil((self.window - (timestamp - recent[0])).total_seconds()))
                raise HTTPException(429, f"登录尝试过多，请在 {remaining} 秒后重试")

    def record_failure(self, key: str) -> None:
        timestamp = now_datetime()
        with self.lock:
            recent = [attempt for attempt in self.attempts.get(key, []) if timestamp - attempt < self.window]
            recent.append(timestamp)
            self.attempts[key] = recent

    def reset(self, key: str) -> None:
        with self.lock:
            self.attempts.pop(key, None)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt_value, digest_value = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_value.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_value.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except (TypeError, ValueError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user["id"],
        "email": user["email"],
        "displayName": user["displayName"],
        "createdAt": user["createdAt"],
    }


def bundle_for(data: Dict[str, Any], workout: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if workout is None:
        return None
    workout_exercises = sorted(
        (item for item in data["workoutExercises"] if item["workoutId"] == workout["id"]),
        key=lambda item: item["sortOrder"],
    )
    return {
        "workout": {key: value for key, value in workout.items() if key != "ownerKey"},
        "exercises": [
            {
                "workoutExercise": workout_exercise,
                "sets": sorted(
                    (item for item in data["trainingSets"] if item["workoutExerciseId"] == workout_exercise["id"]),
                    key=lambda item: item["setNumber"],
                ),
            }
            for workout_exercise in workout_exercises
        ],
    }


def owned_workouts(data: Dict[str, Any], principal: Principal):
    return [item for item in data["workouts"] if item.get("ownerKey") == principal.owner_key]


def require_user(principal: Principal) -> str:
    if principal.kind != "user" or not principal.user_id:
        raise HTTPException(401, "登录后即可使用训练模板和快捷动作")
    return principal.user_id


def recent_exercise_ids(data: Dict[str, Any], principal: Principal, limit: int = 8) -> list[str]:
    workouts = sorted(owned_workouts(data, principal), key=lambda item: (item["date"], item["updatedAt"]), reverse=True)
    score_by_id: Dict[str, tuple[int, int]] = {}
    for workout_index, workout in enumerate(workouts[:24]):
        for workout_exercise in data["workoutExercises"]:
            if workout_exercise["workoutId"] != workout["id"]:
                continue
            exercise_id = workout_exercise["exerciseId"]
            count, newest_workout_index = score_by_id.get(exercise_id, (0, workout_index))
            score_by_id[exercise_id] = (count + 1, min(newest_workout_index, workout_index))
    return [
        exercise_id
        for exercise_id, _ in sorted(score_by_id.items(), key=lambda item: (-item[1][0], item[1][1], item[0]))[:limit]
    ]


def public_user_template(template: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": template["id"], "kind": "custom", "name": template["name"],
        "description": f"{len(template['exerciseIds'])} 个动作 · 你的自定义编排",
        "tag": "自定义模板", "exerciseIds": template["exerciseIds"],
    }


def find_user_template(data: Dict[str, Any], template_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    return next(
        (item for item in data["userTemplates"] if item["id"] == template_id and item["userId"] == user_id),
        None,
    )


def validate_template_exercise_ids(exercise_ids: list[str]) -> list[str]:
    normalized = []
    for exercise_id in exercise_ids:
        if not isinstance(exercise_id, str) or not exercise_id.strip() or len(exercise_id) > 128:
            raise HTTPException(400, "模板动作格式无效")
        if exercise_id not in normalized:
            normalized.append(exercise_id)
    if not normalized or len(normalized) > 12:
        raise HTTPException(400, "模板需要包含 1 到 12 个动作")
    return normalized


def validate_workout_exercise_ids(exercise_ids: list[str]) -> list[str]:
    normalized = []
    for exercise_id in exercise_ids:
        if not isinstance(exercise_id, str) or not exercise_id.strip() or len(exercise_id) > 128:
            raise HTTPException(400, "动作格式无效")
        if exercise_id not in normalized:
            normalized.append(exercise_id)
    if not normalized or len(normalized) > 50:
        raise HTTPException(400, "一次训练需要包含 1 到 50 个动作")
    return normalized


def validate_draft_exercises(
    drafts: list[DraftExerciseInput], exercise_ids: list[str],
) -> Dict[str, list[Dict[str, Any]]]:
    draft_sets_by_exercise_id: Dict[str, list[Dict[str, Any]]] = {}
    for draft in drafts:
        if draft.exerciseId not in exercise_ids or draft.exerciseId in draft_sets_by_exercise_id:
            raise HTTPException(400, "草稿动作格式无效")
        if not draft.sets or len(draft.sets) > 50:
            raise HTTPException(400, "每个草稿动作需要包含 1 到 50 组")
        sets = []
        for draft_set in draft.sets:
            weight_kg = optional_number(draft_set.weightKg, "weightKg")
            reps = optional_number(draft_set.reps, "reps", integer=True)
            sets.append({"weightKg": weight_kg, "reps": reps})
        draft_sets_by_exercise_id[draft.exerciseId] = sets
    return draft_sets_by_exercise_id


def require_workout(data: Dict[str, Any], workout_id: str, principal: Principal) -> Dict[str, Any]:
    workout = next(
        (item for item in data["workouts"] if item["id"] == workout_id and item.get("ownerKey") == principal.owner_key),
        None,
    )
    if workout is None:
        raise HTTPException(404, "训练记录不存在")
    return workout


def touch_workout(data: Dict[str, Any], workout_id: str, principal: Principal) -> None:
    require_workout(data, workout_id, principal)["updatedAt"] = now()


def optional_number(value: Any, field: str, *, integer: bool = False) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise HTTPException(400, f"{field} 必须是非负数字")
    if integer and (not float(value).is_integer() or value < 1):
        raise HTTPException(400, f"{field} 必须是正整数")
    return int(value) if integer else value


def validate_guest_id(guest_id: Optional[str]) -> Optional[str]:
    if guest_id is None:
        return None
    if not GUEST_ID_PATTERN.fullmatch(guest_id):
        raise HTTPException(400, "游客身份格式无效")
    return guest_id


def claim_legacy_data(data: Dict[str, Any], owner_key: str) -> None:
    for workout in data["workouts"]:
        if not workout.get("ownerKey"):
            workout["ownerKey"] = owner_key
    for favorite in data["favoriteExercises"]:
        if not favorite.get("ownerKey"):
            favorite["ownerKey"] = owner_key


def migrate_guest_data(data: Dict[str, Any], guest_id: Optional[str], user_id: str) -> None:
    if not guest_id:
        return
    validate_guest_id(guest_id)
    guest_owner = f"guest:{guest_id}"
    user_owner = f"user:{user_id}"
    claim_legacy_data(data, guest_owner)

    user_by_date = {item["date"]: item for item in data["workouts"] if item.get("ownerKey") == user_owner}
    guest_workouts = [item for item in data["workouts"] if item.get("ownerKey") == guest_owner]
    removed_ids = set()
    for workout in guest_workouts:
        existing = user_by_date.get(workout["date"])
        if existing:
            existing_count = len([item for item in data["workoutExercises"] if item["workoutId"] == existing["id"]])
            moving = [item for item in data["workoutExercises"] if item["workoutId"] == workout["id"]]
            for index, workout_exercise in enumerate(sorted(moving, key=lambda item: item["sortOrder"])):
                workout_exercise["workoutId"] = existing["id"]
                workout_exercise["sortOrder"] = existing_count + index
            if workout.get("notes") and not existing.get("notes"):
                existing["notes"] = workout["notes"]
            existing["updatedAt"] = now()
            removed_ids.add(workout["id"])
        else:
            workout["ownerKey"] = user_owner
            user_by_date[workout["date"]] = workout
    data["workouts"] = [item for item in data["workouts"] if item["id"] not in removed_ids]

    for favorite in data["favoriteExercises"]:
        if favorite.get("ownerKey") == guest_owner:
            favorite["ownerKey"] = user_owner
    seen = set()
    favorites = []
    for favorite in data["favoriteExercises"]:
        key = (favorite.get("ownerKey"), favorite["exerciseId"])
        if key not in seen:
            seen.add(key)
            favorites.append(favorite)
    data["favoriteExercises"] = favorites


def clear_owned_data(data: Dict[str, Any], principal: Principal) -> None:
    workout_ids = {item["id"] for item in data["workouts"] if item.get("ownerKey") == principal.owner_key}
    exercise_ids = {item["id"] for item in data["workoutExercises"] if item["workoutId"] in workout_ids}
    data["workouts"] = [item for item in data["workouts"] if item["id"] not in workout_ids]
    data["workoutExercises"] = [item for item in data["workoutExercises"] if item["id"] not in exercise_ids]
    data["trainingSets"] = [item for item in data["trainingSets"] if item["workoutExerciseId"] not in exercise_ids]
    data["favoriteExercises"] = [item for item in data["favoriteExercises"] if item.get("ownerKey") != principal.owner_key]


SEED_WORKOUTS = [
    ("2026-05-06", [("0001", [(None, 15), (None, 12), (None, 12)]), ("3294", [(None, 10), (None, 10), (None, 8)])]),
    ("2026-05-15", [("0007", [(32, 12), (36, 10), (36, 10)]), ("0002", [(None, 12), (None, 12), (None, 10)])]),
    ("2026-06-03", [("3293", [(None, 6), (None, 5), (None, 5)]), ("0007", [(34, 12), (38, 10), (40, 8)])]),
    ("2026-06-12", [("3294", [(None, 12), (None, 10), (None, 8)]), ("3214", [(None, 10), (None, 10), (None, 10)])]),
    ("2026-06-24", [("0001", [(None, 18), (None, 15), (None, 15)]), ("0002", [(None, 14), (None, 12), (None, 12)])]),
    ("2026-06-29", [("0007", [(40, 10), (42, 8), (42, 8)]), ("3293", [(None, 6), (None, 6), (None, 5)])]),
]


def seed_data(data: Dict[str, Any], principal: Principal) -> int:
    owned_seed_ids = {
        item["id"] for item in data["workouts"]
        if item.get("ownerKey") == principal.owner_key and item["id"].startswith("seed_workout_")
    }
    exercise_ids = {item["id"] for item in data["workoutExercises"] if item["workoutId"] in owned_seed_ids}
    data["workouts"] = [item for item in data["workouts"] if item["id"] not in owned_seed_ids]
    data["workoutExercises"] = [item for item in data["workoutExercises"] if item["id"] not in exercise_ids]
    data["trainingSets"] = [item for item in data["trainingSets"] if item["workoutExerciseId"] not in exercise_ids]

    for date, exercises in SEED_WORKOUTS:
        timestamp = iso_datetime(datetime.fromisoformat(f"{date}T20:00:00+08:00").astimezone(timezone.utc))
        workout_id = create_id("seed_workout")
        data["workouts"].append({
            "id": workout_id, "ownerKey": principal.owner_key, "date": date,
            "notes": "开发测试数据", "createdAt": timestamp, "updatedAt": timestamp,
        })
        for exercise_index, (exercise_id, sets) in enumerate(exercises):
            workout_exercise_id = create_id("seed_workout_exercise")
            data["workoutExercises"].append({
                "id": workout_exercise_id, "workoutId": workout_id,
                "exerciseId": exercise_id, "sortOrder": exercise_index,
            })
            for set_index, (weight_kg, reps) in enumerate(sets):
                training_set = {
                    "id": create_id("seed_set"), "workoutExerciseId": workout_exercise_id,
                    "setNumber": set_index + 1, "reps": reps, "createdAt": timestamp,
                }
                if weight_kg is not None:
                    training_set["weightKg"] = weight_kg
                data["trainingSets"].append(training_set)
    return len(SEED_WORKOUTS)


def create_app(data_file: Optional[Path] = None, *, database_url: Optional[str] = None) -> FastAPI:
    # ``data_file`` remains a test-only compatibility parameter.  Runtime
    # deployments use DATABASE_URL and are expected to run Alembic migrations.
    if data_file is not None:
        store = SqlStore(database_url_from_path(data_file), initialize_schema=True)
    else:
        store = SqlStore(database_url or os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    app = FastAPI(title="小白 Amax API", version="0.3.0")
    allowed_hosts = [host.strip() for host in os.getenv("ALLOWED_HOSTS", "*").split(",") if host.strip()]
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts or ["*"])
    if os.getenv("FORCE_HTTPS", "false").lower() in {"1", "true", "yes"}:
        app.add_middleware(HTTPSRedirectMiddleware)
    login_limiter = LoginAttemptLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SECONDS)

    @app.exception_handler(HTTPException)
    async def http_error_handler(_, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"error": "请求参数格式无效", "details": exc.errors()})

    @app.exception_handler(SQLAlchemyError)
    async def database_error_handler(_, __: SQLAlchemyError):
        return JSONResponse(status_code=503, content={"error": "服务暂时不可用，请稍后重试"})

    def get_principal(
        authorization: Optional[str] = Header(None),
        x_guest_id: Optional[str] = Header(None),
    ) -> Principal:
        data = store.read()
        if authorization and authorization.startswith("Bearer "):
            token = authorization.removeprefix("Bearer ").strip()
            session = next((item for item in data["sessions"] if hmac.compare_digest(item["tokenHash"], token_hash(token))), None)
            if session:
                expires_at = datetime.fromisoformat(session["expiresAt"].replace("Z", "+00:00"))
                user = next((item for item in data["users"] if item["id"] == session["userId"]), None)
                if user and expires_at > now_datetime():
                    return Principal(owner_key=f"user:{user['id']}", kind="user", user_id=user["id"])
            raise HTTPException(401, "登录已过期，请重新登录")

        guest_id = validate_guest_id(x_guest_id)
        if not guest_id:
            raise HTTPException(400, "缺少游客身份")
        principal = Principal(owner_key=f"guest:{guest_id}", kind="guest", guest_id=guest_id)
        store.mutate(lambda current: claim_legacy_data(current, principal.owner_key))
        return principal

    def get_user_principal(authorization: Optional[str] = Header(None)) -> Principal:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(401, "请先登录")
        return get_principal(authorization=authorization, x_guest_id=None)

    def create_session(data: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
        token = secrets.token_urlsafe(32)
        timestamp = now_datetime()
        data["sessions"] = [item for item in data["sessions"] if item["userId"] != user["id"] or datetime.fromisoformat(item["expiresAt"].replace("Z", "+00:00")) > timestamp]
        data["sessions"].append({
            "id": create_id("session"), "userId": user["id"], "tokenHash": token_hash(token),
            "createdAt": iso_datetime(timestamp), "expiresAt": iso_datetime(timestamp + timedelta(days=SESSION_DAYS)),
        })
        return {"token": token, "user": public_user(user)}

    @app.get("/api/health")
    def health():
        return {"ok": True, "framework": "FastAPI"}

    @app.post("/api/auth/register", status_code=201)
    def register(payload: RegisterInput):
        email = payload.email.strip().lower()
        display_name = (payload.displayName or email.split("@", 1)[0]).strip()
        if not EMAIL_PATTERN.fullmatch(email):
            raise HTTPException(400, "邮箱格式无效")
        if len(payload.password) < 8:
            raise HTTPException(400, "密码至少需要 8 位")
        if payload.confirmPassword is None:
            raise HTTPException(400, "请再次输入密码")
        if not hmac.compare_digest(payload.password, payload.confirmPassword):
            raise HTTPException(400, "两次输入的密码不一致")
        if not display_name or len(display_name) > 40:
            raise HTTPException(400, "昵称长度应为 1 到 40 位")

        def mutation(data: Dict[str, Any]):
            if any(item["email"].lower() == email for item in data["users"]):
                raise HTTPException(409, "该邮箱已经注册")
            user = {
                "id": create_id("user"), "email": email, "displayName": display_name,
                "passwordHash": hash_password(payload.password), "createdAt": now(),
            }
            data["users"].append(user)
            migrate_guest_data(data, payload.guestId, user["id"])
            return create_session(data, user)

        return store.mutate(mutation)

    @app.post("/api/auth/login")
    def login(payload: LoginInput, request: Request):
        email = payload.email.strip().lower()
        client_host = request.client.host if request.client else "unknown"
        limiter_key = f"{client_host}:{email}"
        login_limiter.check(limiter_key)

        def mutation(data: Dict[str, Any]):
            user = next((item for item in data["users"] if item["email"].lower() == email), None)
            if user is None or not verify_password(payload.password, user["passwordHash"]):
                login_limiter.record_failure(limiter_key)
                raise HTTPException(401, "邮箱或密码错误")
            migrate_guest_data(data, payload.guestId, user["id"])
            return create_session(data, user)

        result = store.mutate(mutation)
        login_limiter.reset(limiter_key)
        return result

    @app.get("/api/auth/me")
    def me(principal: Principal = Depends(get_principal)):
        if principal.kind != "user":
            return {"user": None}
        user = next((item for item in store.read()["users"] if item["id"] == principal.user_id), None)
        if user is None:
            raise HTTPException(401, "用户不存在")
        return {"user": public_user(user)}

    @app.post("/api/auth/logout", status_code=204)
    def logout(authorization: Optional[str] = Header(None)):
        if authorization and authorization.startswith("Bearer "):
            hashed = token_hash(authorization.removeprefix("Bearer ").strip())
            store.mutate(lambda data: data.update(sessions=[item for item in data["sessions"] if item["tokenHash"] != hashed]))
        return Response(status_code=204)

    @app.get("/api/training/templates")
    def list_training_templates(principal: Principal = Depends(get_user_principal)):
        user_id = require_user(principal)
        data = store.read()
        custom_templates = [
            public_user_template(template)
            for template in sorted(
                (item for item in data["userTemplates"] if item["userId"] == user_id),
                key=lambda item: item["updatedAt"],
                reverse=True,
            )
        ]
        return [dict(template) for template in BUILT_IN_TRAINING_TEMPLATES] + custom_templates

    @app.post("/api/training/templates", status_code=201)
    def create_user_training_template(
        payload: UserTemplateCreate,
        principal: Principal = Depends(get_user_principal),
    ):
        user_id = require_user(principal)
        name = payload.name.strip()
        if not name or len(name) > 60:
            raise HTTPException(400, "模板名称长度应为 1 到 60 位")
        exercise_ids = validate_template_exercise_ids(payload.exerciseIds)

        def mutation(data: Dict[str, Any]):
            if any(item["userId"] == user_id and item["name"].casefold() == name.casefold() for item in data["userTemplates"]):
                raise HTTPException(409, "已有同名自定义模板")
            template = {
                "id": create_id("template"), "userId": user_id, "name": name,
                "exerciseIds": exercise_ids, "createdAt": now(), "updatedAt": now(),
            }
            data["userTemplates"].append(template)
            return public_user_template(template)

        return store.mutate(mutation)

    @app.delete("/api/training/templates/{template_id}", status_code=204)
    def delete_user_training_template(template_id: str, principal: Principal = Depends(get_user_principal)):
        user_id = require_user(principal)

        def mutation(data: Dict[str, Any]):
            template = find_user_template(data, template_id, user_id)
            if template is None:
                raise HTTPException(404, "自定义模板不存在")
            data["userTemplates"] = [item for item in data["userTemplates"] if item["id"] != template_id]

        store.mutate(mutation)
        return Response(status_code=204)

    @app.patch("/api/training/templates/{template_id}")
    def update_user_training_template(
        template_id: str,
        payload: UserTemplateUpdate,
        principal: Principal = Depends(get_user_principal),
    ):
        user_id = require_user(principal)
        name = payload.name.strip()
        if not name or len(name) > 60:
            raise HTTPException(400, "模板名称长度应为 1 到 60 位")
        exercise_ids = validate_template_exercise_ids(payload.exerciseIds)

        def mutation(data: Dict[str, Any]):
            template = find_user_template(data, template_id, user_id)
            if template is None:
                raise HTTPException(404, "自定义模板不存在")
            if any(
                item["id"] != template_id and item["userId"] == user_id and item["name"].casefold() == name.casefold()
                for item in data["userTemplates"]
            ):
                raise HTTPException(409, "已有同名自定义模板")
            template.update(name=name, exerciseIds=exercise_ids, updatedAt=now())
            return public_user_template(template)

        return store.mutate(mutation)

    @app.get("/api/training/quick-exercises")
    def list_quick_exercises(principal: Principal = Depends(get_user_principal)):
        require_user(principal)
        data = store.read()
        favorites = [
            item["exerciseId"]
            for item in sorted(
                (item for item in data["favoriteExercises"] if item.get("ownerKey") == principal.owner_key),
                key=lambda item: item.get("createdAt", ""),
                reverse=True,
            )
        ]
        return {
            "favorites": favorites[:8],
            "recent": recent_exercise_ids(data, principal),
            "recommended": [dict(item) for item in BODY_PART_RECOMMENDATIONS],
        }

    @app.patch("/api/auth/password", status_code=204)
    def change_password(
        payload: ChangePasswordInput,
        principal: Principal = Depends(get_principal),
        authorization: Optional[str] = Header(None),
    ):
        if principal.kind != "user" or not principal.user_id:
            raise HTTPException(401, "请先登录")
        if len(payload.newPassword) < 8:
            raise HTTPException(400, "新密码至少需要 8 位")
        if not hmac.compare_digest(payload.newPassword, payload.confirmPassword):
            raise HTTPException(400, "两次输入的新密码不一致")
        current_token_hash = token_hash(authorization.removeprefix("Bearer ").strip()) if authorization and authorization.startswith("Bearer ") else ""

        def mutation(data: Dict[str, Any]):
            user = next((item for item in data["users"] if item["id"] == principal.user_id), None)
            if user is None:
                raise HTTPException(401, "用户不存在")
            if not verify_password(payload.currentPassword, user["passwordHash"]):
                raise HTTPException(400, "当前密码不正确")
            user["passwordHash"] = hash_password(payload.newPassword)
            # Keep this device signed in and revoke every other active session.
            data["sessions"] = [
                item for item in data["sessions"]
                if item["userId"] != user["id"] or hmac.compare_digest(item["tokenHash"], current_token_hash)
            ]

        store.mutate(mutation)
        return Response(status_code=204)

    @app.get("/api/workouts/today")
    def get_today_workout(date: str = Query(...), principal: Principal = Depends(get_principal)):
        if not DATE_PATTERN.fullmatch(date):
            raise HTTPException(400, "date 必须是 YYYY-MM-DD")
        data = store.read()
        workout = next((item for item in owned_workouts(data, principal) if item["date"] == date), None)
        return bundle_for(data, workout)

    @app.get("/api/workouts/recent")
    def list_recent_workouts(limit: int = Query(3, ge=1, le=50), principal: Principal = Depends(get_principal)):
        data = store.read()
        bundles = [bundle_for(data, workout) for workout in sorted(owned_workouts(data, principal), key=lambda item: item["date"], reverse=True)]
        return [bundle for bundle in bundles if bundle and bundle["exercises"]][:limit]

    @app.get("/api/workouts/by-date/{date}")
    def get_workout_by_date(date: str, principal: Principal = Depends(get_principal)):
        if not DATE_PATTERN.fullmatch(date):
            raise HTTPException(400, "date 必须是 YYYY-MM-DD")
        data = store.read()
        workout = next((item for item in owned_workouts(data, principal) if item["date"] == date), None)
        return bundle_for(data, workout)

    @app.get("/api/workouts")
    def list_workouts(month: Optional[str] = None, principal: Principal = Depends(get_principal)):
        if month and not MONTH_PATTERN.fullmatch(month):
            raise HTTPException(400, "month 必须是 YYYY-MM")
        data = store.read()
        workouts = [item for item in owned_workouts(data, principal) if not month or item["date"].startswith(month)]
        bundles = [bundle_for(data, item) for item in sorted(workouts, key=lambda item: item["date"], reverse=True)]
        return [bundle for bundle in bundles if bundle and bundle["exercises"]]

    @app.post("/api/workouts")
    def create_workout(payload: WorkoutCreate, principal: Principal = Depends(get_principal)):
        if not DATE_PATTERN.fullmatch(payload.date):
            raise HTTPException(400, "date 必须是 YYYY-MM-DD")

        def mutation(data: Dict[str, Any]):
            existing = next((item for item in owned_workouts(data, principal) if item["date"] == payload.date), None)
            if existing:
                return {key: value for key, value in existing.items() if key != "ownerKey"}
            timestamp = now()
            workout = {
                "id": create_id("workout"), "ownerKey": principal.owner_key, "date": payload.date,
                "notes": "", "createdAt": timestamp, "updatedAt": timestamp,
            }
            data["workouts"].append(workout)
            return {key: value for key, value in workout.items() if key != "ownerKey"}

        return store.mutate(mutation)

    @app.post("/api/workouts/complete")
    def commit_workout(payload: WorkoutCommitInput, principal: Principal = Depends(get_principal)):
        if not DATE_PATTERN.fullmatch(payload.date):
            raise HTTPException(400, "date 必须是 YYYY-MM-DD")
        if not isinstance(payload.notes, str) or len(payload.notes) > 2000:
            raise HTTPException(400, "备注格式无效")
        exercise_ids = validate_workout_exercise_ids(payload.exerciseIds)
        draft_sets_by_exercise_id = validate_draft_exercises(payload.draftExercises, exercise_ids)

        def mutation(data: Dict[str, Any]):
            workout = next((item for item in owned_workouts(data, principal) if item["date"] == payload.date), None)
            if workout is None:
                timestamp = now()
                workout = {
                    "id": create_id("workout"), "ownerKey": principal.owner_key, "date": payload.date,
                    "notes": payload.notes.strip(), "createdAt": timestamp, "updatedAt": timestamp,
                }
                data["workouts"].append(workout)
            else:
                workout["notes"] = payload.notes.strip()
                workout["updatedAt"] = now()
            existing_workout_exercises = [item for item in data["workoutExercises"] if item["workoutId"] == workout["id"]]
            existing_ids = {item["exerciseId"] for item in existing_workout_exercises}
            sort_order = max((item["sortOrder"] for item in existing_workout_exercises), default=-1) + 1
            for exercise_id in exercise_ids:
                if exercise_id in existing_ids:
                    continue
                workout_exercise = {
                    "id": create_id("workoutExercise"), "workoutId": workout["id"],
                    "exerciseId": exercise_id, "sortOrder": sort_order,
                }
                data["workoutExercises"].append(workout_exercise)
                draft_sets = draft_sets_by_exercise_id.get(exercise_id, [{"weightKg": None, "reps": 10}])
                for set_number, draft_set in enumerate(draft_sets, start=1):
                    training_set = {
                        "id": create_id("set"), "workoutExerciseId": workout_exercise["id"],
                        "setNumber": set_number, "createdAt": now(),
                    }
                    if draft_set["weightKg"] is not None:
                        training_set["weightKg"] = draft_set["weightKg"]
                    if draft_set["reps"] is not None:
                        training_set["reps"] = draft_set["reps"]
                    data["trainingSets"].append(training_set)
                existing_ids.add(exercise_id)
                sort_order += 1
            return bundle_for(data, workout)

        return store.mutate(mutation)

    @app.get("/api/workouts/{workout_id}")
    def get_workout(workout_id: str, principal: Principal = Depends(get_principal)):
        data = store.read()
        return bundle_for(data, require_workout(data, workout_id, principal))

    @app.patch("/api/workouts/{workout_id}", status_code=204)
    def update_workout(workout_id: str, payload: Dict[str, Any] = Body(...), principal: Principal = Depends(get_principal)):
        def mutation(data: Dict[str, Any]):
            workout = require_workout(data, workout_id, principal)
            if "notes" in payload:
                notes = payload["notes"]
                if not isinstance(notes, str) or len(notes) > 2000:
                    raise HTTPException(400, "备注格式无效")
                workout["notes"] = notes.strip()
            workout["updatedAt"] = now()
        store.mutate(mutation)
        return Response(status_code=204)

    @app.delete("/api/workouts/{workout_id}", status_code=204)
    def delete_workout(workout_id: str, principal: Principal = Depends(get_principal)):
        def mutation(data: Dict[str, Any]):
            require_workout(data, workout_id, principal)
            exercise_ids = {item["id"] for item in data["workoutExercises"] if item["workoutId"] == workout_id}
            data["workouts"] = [item for item in data["workouts"] if item["id"] != workout_id]
            data["workoutExercises"] = [item for item in data["workoutExercises"] if item["workoutId"] != workout_id]
            data["trainingSets"] = [item for item in data["trainingSets"] if item["workoutExerciseId"] not in exercise_ids]
        store.mutate(mutation)
        return Response(status_code=204)

    @app.post("/api/workouts/{workout_id}/exercises", status_code=201)
    def add_exercise(workout_id: str, payload: ExerciseCreate, principal: Principal = Depends(get_principal)):
        if not payload.exerciseId.strip():
            raise HTTPException(400, "exerciseId 不能为空")
        def mutation(data: Dict[str, Any]):
            require_workout(data, workout_id, principal)
            existing = [item for item in data["workoutExercises"] if item["workoutId"] == workout_id]
            workout_exercise = {"id": create_id("workoutExercise"), "workoutId": workout_id, "exerciseId": payload.exerciseId, "sortOrder": len(existing)}
            data["workoutExercises"].append(workout_exercise)
            data["trainingSets"].append({"id": create_id("set"), "workoutExerciseId": workout_exercise["id"], "setNumber": 1, "reps": 10, "createdAt": now()})
            touch_workout(data, workout_id, principal)
            return workout_exercise
        return store.mutate(mutation)

    @app.delete("/api/workouts/{workout_id}/exercises/{workout_exercise_id}", status_code=204)
    def delete_exercise(workout_id: str, workout_exercise_id: str, principal: Principal = Depends(get_principal)):
        def mutation(data: Dict[str, Any]):
            require_workout(data, workout_id, principal)
            target = next((item for item in data["workoutExercises"] if item["id"] == workout_exercise_id and item["workoutId"] == workout_id), None)
            if target is None:
                raise HTTPException(404, "训练动作不存在")
            data["workoutExercises"] = [item for item in data["workoutExercises"] if item["id"] != workout_exercise_id]
            data["trainingSets"] = [item for item in data["trainingSets"] if item["workoutExerciseId"] != workout_exercise_id]
            touch_workout(data, workout_id, principal)
        store.mutate(mutation)
        return Response(status_code=204)

    @app.post("/api/workouts/{workout_id}/exercises/{workout_exercise_id}/sets", status_code=204)
    def add_set(workout_id: str, workout_exercise_id: str, principal: Principal = Depends(get_principal)):
        def mutation(data: Dict[str, Any]):
            require_workout(data, workout_id, principal)
            target = next((item for item in data["workoutExercises"] if item["id"] == workout_exercise_id and item["workoutId"] == workout_id), None)
            if target is None:
                raise HTTPException(404, "训练动作不存在")
            sets = sorted((item for item in data["trainingSets"] if item["workoutExerciseId"] == workout_exercise_id), key=lambda item: item["setNumber"])
            previous = sets[-1] if sets else None
            training_set = {"id": create_id("set"), "workoutExerciseId": workout_exercise_id, "setNumber": len(sets) + 1, "reps": previous.get("reps", 10) if previous else 10, "createdAt": now()}
            if previous and "weightKg" in previous:
                training_set["weightKg"] = previous["weightKg"]
            data["trainingSets"].append(training_set)
            touch_workout(data, workout_id, principal)
        store.mutate(mutation)
        return Response(status_code=204)

    @app.patch("/api/workouts/{workout_id}/sets/{set_id}", status_code=204)
    def update_set(workout_id: str, set_id: str, payload: Dict[str, Any] = Body(...), principal: Principal = Depends(get_principal)):
        def mutation(data: Dict[str, Any]):
            require_workout(data, workout_id, principal)
            training_set = next((item for item in data["trainingSets"] if item["id"] == set_id), None)
            parent = training_set and next((item for item in data["workoutExercises"] if item["id"] == training_set["workoutExerciseId"] and item["workoutId"] == workout_id), None)
            if training_set is None or parent is None:
                raise HTTPException(404, "训练组不存在")
            if "weightKg" in payload:
                value = optional_number(payload["weightKg"], "weightKg")
                training_set.pop("weightKg", None) if value is None else training_set.update(weightKg=value)
            if "reps" in payload:
                value = optional_number(payload["reps"], "reps", integer=True)
                training_set.pop("reps", None) if value is None else training_set.update(reps=value)
            touch_workout(data, workout_id, principal)
        store.mutate(mutation)
        return Response(status_code=204)

    @app.delete("/api/workouts/{workout_id}/sets/{set_id}", status_code=204)
    def delete_set(workout_id: str, set_id: str, principal: Principal = Depends(get_principal)):
        def mutation(data: Dict[str, Any]):
            require_workout(data, workout_id, principal)
            training_set = next((item for item in data["trainingSets"] if item["id"] == set_id), None)
            parent = training_set and next((item for item in data["workoutExercises"] if item["id"] == training_set["workoutExerciseId"] and item["workoutId"] == workout_id), None)
            if training_set is None or parent is None:
                raise HTTPException(404, "训练组不存在")
            data["trainingSets"] = [item for item in data["trainingSets"] if item["id"] != set_id]
            remaining = sorted((item for item in data["trainingSets"] if item["workoutExerciseId"] == parent["id"]), key=lambda item: item["setNumber"])
            for index, item in enumerate(remaining, start=1):
                item["setNumber"] = index
            touch_workout(data, workout_id, principal)
        store.mutate(mutation)
        return Response(status_code=204)

    @app.get("/api/favorite-exercises")
    def list_favorites(principal: Principal = Depends(get_principal)):
        return [item["exerciseId"] for item in store.read()["favoriteExercises"] if item.get("ownerKey") == principal.owner_key]

    @app.put("/api/favorite-exercises/{exercise_id}", status_code=204)
    def add_favorite(exercise_id: str, principal: Principal = Depends(get_principal)):
        def mutation(data: Dict[str, Any]):
            data["favoriteExercises"] = [item for item in data["favoriteExercises"] if not (item.get("ownerKey") == principal.owner_key and item["exerciseId"] == exercise_id)]
            data["favoriteExercises"].append({"exerciseId": exercise_id, "ownerKey": principal.owner_key, "createdAt": now()})
        store.mutate(mutation)
        return Response(status_code=204)

    @app.delete("/api/favorite-exercises/{exercise_id}", status_code=204)
    def delete_favorite(exercise_id: str, principal: Principal = Depends(get_principal)):
        store.mutate(lambda data: data.update(favoriteExercises=[item for item in data["favoriteExercises"] if not (item.get("ownerKey") == principal.owner_key and item["exerciseId"] == exercise_id)]))
        return Response(status_code=204)

    @app.get("/api/data/export")
    def export_data(principal: Principal = Depends(get_principal)):
        data = store.read()
        workouts = owned_workouts(data, principal)
        workout_ids = {item["id"] for item in workouts}
        workout_exercises = [item for item in data["workoutExercises"] if item["workoutId"] in workout_ids]
        exercise_ids = {item["id"] for item in workout_exercises}
        return {
            "version": 1,
            "workouts": [{key: value for key, value in item.items() if key != "ownerKey"} for item in workouts],
            "workoutExercises": workout_exercises,
            "trainingSets": [item for item in data["trainingSets"] if item["workoutExerciseId"] in exercise_ids],
            "favoriteExercises": [{key: value for key, value in item.items() if key != "ownerKey"} for item in data["favoriteExercises"] if item.get("ownerKey") == principal.owner_key],
            "exportedAt": now(),
        }

    @app.put("/api/data/import", status_code=204)
    def import_data(payload: Dict[str, Any] = Body(...), principal: Principal = Depends(get_principal)):
        imported = validate_backup(payload)
        def mutation(data: Dict[str, Any]):
            clear_owned_data(data, principal)
            workout_map = {}
            for source in imported["workouts"]:
                new_id = create_id("workout")
                workout_map[source.get("id")] = new_id
                data["workouts"].append({**source, "id": new_id, "ownerKey": principal.owner_key})
            exercise_map = {}
            for source in imported["workoutExercises"]:
                if source.get("workoutId") not in workout_map:
                    continue
                new_id = create_id("workoutExercise")
                exercise_map[source.get("id")] = new_id
                data["workoutExercises"].append({**source, "id": new_id, "workoutId": workout_map[source["workoutId"]]})
            for source in imported["trainingSets"]:
                if source.get("workoutExerciseId") in exercise_map:
                    data["trainingSets"].append({**source, "id": create_id("set"), "workoutExerciseId": exercise_map[source["workoutExerciseId"]]})
            for source in imported["favoriteExercises"]:
                if isinstance(source, dict) and isinstance(source.get("exerciseId"), str):
                    data["favoriteExercises"].append({"exerciseId": source["exerciseId"], "ownerKey": principal.owner_key, "createdAt": source.get("createdAt", now())})
        store.mutate(mutation)
        return Response(status_code=204)

    @app.delete("/api/data", status_code=204)
    def clear_data(principal: Principal = Depends(get_principal)):
        store.mutate(lambda data: clear_owned_data(data, principal))
        return Response(status_code=204)

    @app.post("/api/dev/seed")
    def seed_test_data(principal: Principal = Depends(get_principal)):
        return {"count": store.mutate(lambda data: seed_data(data, principal))}

    return app


app = create_app()
