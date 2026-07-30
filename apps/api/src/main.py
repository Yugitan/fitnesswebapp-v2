from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import os
import re
import secrets
import threading
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from uuid import uuid4

from fastapi import Body, Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MONTH_PATTERN = re.compile(r"^\d{4}-\d{2}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
GUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{12,100}$")
DEFAULT_DATA_FILE = Path(__file__).resolve().parents[3] / "data/runtime/api-data.json"
PASSWORD_ITERATIONS = 310_000
SESSION_DAYS = 30


def empty_data() -> Dict[str, Any]:
    return {
        "version": 1,
        "workouts": [],
        "workoutExercises": [],
        "trainingSets": [],
        "favoriteExercises": [],
        "users": [],
        "sessions": [],
    }


def now_datetime() -> datetime:
    return datetime.now(timezone.utc)


def iso_datetime(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")


def now() -> str:
    return iso_datetime(now_datetime())


def create_id(prefix: str) -> str:
    return f"{prefix}_{uuid4()}"


def normalize_store(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise HTTPException(400, "数据文件版本无效")
    normalized = empty_data()
    for key in normalized:
        if key == "version":
            continue
        value = payload.get(key, [])
        if not isinstance(value, list):
            raise HTTPException(400, f"数据文件缺少 {key}")
        normalized[key] = deepcopy(value)
    return normalized


def validate_backup(payload: Any) -> Dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("version") != 1:
        raise HTTPException(400, "备份文件版本无效")
    keys = ("workouts", "workoutExercises", "trainingSets", "favoriteExercises")
    for key in keys:
        if not isinstance(payload.get(key), list):
            raise HTTPException(400, f"备份缺少 {key}")
    return {"version": 1, **{key: deepcopy(payload[key]) for key in keys}}


class JsonStore:
    def __init__(self, data_file: Path):
        self.data_file = data_file
        self.lock = threading.RLock()

    def read(self) -> Dict[str, Any]:
        with self.lock:
            if not self.data_file.exists():
                return empty_data()
            return normalize_store(json.loads(self.data_file.read_text(encoding="utf-8")))

    def mutate(self, callback: Callable[[Dict[str, Any]], Any]) -> Any:
        with self.lock:
            data = self.read()
            result = callback(data)
            self.data_file.parent.mkdir(parents=True, exist_ok=True)
            temporary_file = self.data_file.with_suffix(f"{self.data_file.suffix}.tmp")
            temporary_file.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            os.replace(temporary_file, self.data_file)
            return result


class WorkoutCreate(BaseModel):
    date: str


class ExerciseCreate(BaseModel):
    exerciseId: str


class RegisterInput(BaseModel):
    email: str
    password: str
    displayName: Optional[str] = None
    guestId: Optional[str] = None


class LoginInput(BaseModel):
    email: str
    password: str
    guestId: Optional[str] = None


@dataclass(frozen=True)
class Principal:
    owner_key: str
    kind: str
    user_id: Optional[str] = None
    guest_id: Optional[str] = None


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


def create_app(data_file: Optional[Path] = None) -> FastAPI:
    store = JsonStore(data_file or DEFAULT_DATA_FILE)
    app = FastAPI(title="小白 Amax API", version="0.2.0")

    @app.exception_handler(HTTPException)
    async def http_error_handler(_, exc: HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_, exc: RequestValidationError):
        return JSONResponse(status_code=422, content={"error": "请求参数格式无效", "details": exc.errors()})

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
    def login(payload: LoginInput):
        email = payload.email.strip().lower()

        def mutation(data: Dict[str, Any]):
            user = next((item for item in data["users"] if item["email"].lower() == email), None)
            if user is None or not verify_password(payload.password, user["passwordHash"]):
                raise HTTPException(401, "邮箱或密码错误")
            migrate_guest_data(data, payload.guestId, user["id"])
            return create_session(data, user)

        return store.mutate(mutation)

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
