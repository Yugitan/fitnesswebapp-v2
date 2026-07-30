from pathlib import Path

from fastapi.testclient import TestClient

from src.main import create_app

GUEST_A = {"X-Guest-ID": "guest_test_user_a_12345"}
GUEST_B = {"X-Guest-ID": "guest_test_user_b_67890"}


def bearer(token: str):
    return {"Authorization": f"Bearer {token}", **GUEST_A}


def test_guest_workout_and_favorite_flow(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))

    response = client.post("/api/workouts", json={"date": "2026-07-29"}, headers=GUEST_A)
    assert response.status_code == 200
    workout = response.json()

    duplicate = client.post("/api/workouts", json={"date": "2026-07-29"}, headers=GUEST_A)
    assert duplicate.json()["id"] == workout["id"]

    response = client.post(
        f"/api/workouts/{workout['id']}/exercises",
        json={"exerciseId": "0001"},
        headers=GUEST_A,
    )
    assert response.status_code == 201
    workout_exercise = response.json()

    detail = client.get(f"/api/workouts/{workout['id']}", headers=GUEST_A).json()
    training_set = detail["exercises"][0]["sets"][0]
    assert training_set["reps"] == 10

    response = client.patch(
        f"/api/workouts/{workout['id']}/sets/{training_set['id']}",
        json={"weightKg": 60, "reps": 8},
        headers=GUEST_A,
    )
    assert response.status_code == 204

    response = client.post(
        f"/api/workouts/{workout['id']}/exercises/{workout_exercise['id']}/sets",
        json={},
        headers=GUEST_A,
    )
    assert response.status_code == 204

    detail = client.get(f"/api/workouts/{workout['id']}", headers=GUEST_A).json()
    assert [(item.get("weightKg"), item.get("reps")) for item in detail["exercises"][0]["sets"]] == [(60, 8), (60, 8)]

    invalid = client.patch(
        f"/api/workouts/{workout['id']}/sets/{training_set['id']}",
        json={"reps": 2.5},
        headers=GUEST_A,
    )
    assert invalid.status_code == 400

    assert client.put("/api/favorite-exercises/0001", headers=GUEST_A).status_code == 204
    assert client.get("/api/favorite-exercises", headers=GUEST_A).json() == ["0001"]

    recent = client.get("/api/workouts/recent?limit=3", headers=GUEST_A).json()
    assert len(recent) == 1
    assert recent[0]["workout"]["date"] == "2026-07-29"


def test_workout_is_only_created_when_draft_is_completed(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))
    date = "2026-07-30"

    # Choosing actions and a template is frontend-only draft state, so the
    # backend must have no implicit creation route for either operation.
    assert client.get(f"/api/workouts/by-date/{date}", headers=GUEST_A).json() is None
    assert client.post("/api/workouts/complete", json={"date": date, "exerciseIds": []}, headers=GUEST_A).status_code == 400
    assert client.get(f"/api/workouts/by-date/{date}", headers=GUEST_A).json() is None

    completed = client.post(
        "/api/workouts/complete",
        json={"date": date, "exerciseIds": ["0662", "0043", "0027"], "notes": "模板草稿完成"},
        headers=GUEST_A,
    )
    assert completed.status_code == 200
    bundle = completed.json()
    assert bundle["workout"]["notes"] == "模板草稿完成"
    assert [item["workoutExercise"]["exerciseId"] for item in bundle["exercises"]] == ["0662", "0043", "0027"]
    assert all(item["sets"][0]["reps"] == 10 for item in bundle["exercises"])


def test_completing_editable_draft_persists_its_sets(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))

    response = client.post(
        "/api/workouts/complete",
        json={
            "date": "2026-07-30",
            "exerciseIds": ["0662"],
            "notes": "草稿中填写的训练数据",
            "draftExercises": [{
                "exerciseId": "0662",
                "sets": [
                    {"weightKg": 40, "reps": 12},
                    {"weightKg": 45, "reps": 8},
                ],
            }],
        },
        headers=GUEST_A,
    )

    assert response.status_code == 200
    sets = response.json()["exercises"][0]["sets"]
    assert [(item.get("weightKg"), item.get("reps")) for item in sets] == [(40, 12), (45, 8)]


def test_guests_and_users_are_isolated_and_guest_data_migrates(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))
    workout = client.post("/api/workouts", json={"date": "2026-07-30"}, headers=GUEST_A).json()
    client.post(
        f"/api/workouts/{workout['id']}/exercises",
        json={"exerciseId": "0002"},
        headers=GUEST_A,
    )
    client.put("/api/favorite-exercises/0002", headers=GUEST_A)

    assert client.get("/api/workouts", headers=GUEST_B).json() == []
    assert client.get(f"/api/workouts/{workout['id']}", headers=GUEST_B).status_code == 404
    assert client.get("/api/favorite-exercises", headers=GUEST_B).json() == []

    registered = client.post(
        "/api/auth/register",
        json={
            "email": "first@example.com",
            "password": "password123",
            "confirmPassword": "password123",
            "displayName": "第一位用户",
            "guestId": GUEST_A["X-Guest-ID"],
        },
    )
    assert registered.status_code == 201
    session = registered.json()
    user_headers = bearer(session["token"])
    assert client.get("/api/auth/me", headers=user_headers).json()["user"]["email"] == "first@example.com"
    assert len(client.get("/api/workouts", headers=user_headers).json()) == 1
    assert client.get("/api/favorite-exercises", headers=user_headers).json() == ["0002"]
    assert client.get("/api/workouts", headers=GUEST_A).json() == []

    second = client.post(
        "/api/auth/register",
        json={"email": "second@example.com", "password": "password456", "confirmPassword": "password456", "displayName": "第二位用户"},
    ).json()
    second_headers = {"Authorization": f"Bearer {second['token']}", **GUEST_B}
    assert client.get("/api/workouts", headers=second_headers).json() == []
    assert client.get(f"/api/workouts/{workout['id']}", headers=second_headers).status_code == 404

    login = client.post(
        "/api/auth/login",
        json={"email": "first@example.com", "password": "password123", "guestId": GUEST_A["X-Guest-ID"]},
    )
    assert login.status_code == 200
    assert len(client.get("/api/workouts", headers=bearer(login.json()["token"])).json()) == 1


def test_registration_validation_and_logout(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))
    weak = client.post(
        "/api/auth/register",
        json={"email": "bad@example.com", "password": "short", "confirmPassword": "short", "displayName": "测试"},
    )
    assert weak.status_code == 400

    mismatch = client.post(
        "/api/auth/register",
        json={"email": "mismatch@example.com", "password": "password123", "confirmPassword": "password456", "displayName": "测试"},
    )
    assert mismatch.status_code == 400
    assert mismatch.json() == {"error": "两次输入的密码不一致"}

    registered = client.post(
        "/api/auth/register",
        json={"email": "valid@example.com", "password": "password123", "confirmPassword": "password123", "displayName": "测试"},
    ).json()
    headers = bearer(registered["token"])
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_password_change_revokes_other_sessions(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))
    registered = client.post(
        "/api/auth/register",
        json={"email": "password@example.com", "password": "password123", "confirmPassword": "password123"},
    ).json()
    first_headers = bearer(registered["token"])
    second = client.post(
        "/api/auth/login",
        json={"email": "password@example.com", "password": "password123"},
    ).json()
    second_headers = bearer(second["token"])

    changed = client.patch(
        "/api/auth/password",
        json={"currentPassword": "password123", "newPassword": "newpassword123", "confirmPassword": "newpassword123"},
        headers=first_headers,
    )
    assert changed.status_code == 204
    assert client.get("/api/auth/me", headers=first_headers).status_code == 200
    assert client.get("/api/auth/me", headers=second_headers).status_code == 401
    assert client.post("/api/auth/login", json={"email": "password@example.com", "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "password@example.com", "password": "newpassword123"}).status_code == 200


def test_login_is_rate_limited(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))
    client.post(
        "/api/auth/register",
        json={"email": "rate@example.com", "password": "password123", "confirmPassword": "password123"},
    )
    for _ in range(5):
        assert client.post("/api/auth/login", json={"email": "rate@example.com", "password": "incorrect"}).status_code == 401
    blocked = client.post("/api/auth/login", json={"email": "rate@example.com", "password": "password123"})
    assert blocked.status_code == 429


def test_templates_and_quick_exercises_require_a_user_and_are_isolated(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))
    assert client.get("/api/training/templates").status_code == 401
    assert client.get("/api/training/templates", headers=GUEST_A).status_code == 401
    assert client.get("/api/training/quick-exercises", headers=GUEST_A).status_code == 401

    first = client.post(
        "/api/auth/register",
        json={"email": "templates@example.com", "password": "password123", "confirmPassword": "password123"},
    ).json()
    first_headers = bearer(first["token"])
    templates = client.get("/api/training/templates", headers=first_headers)
    assert templates.status_code == 200
    assert [template["id"] for template in templates.json()] == ["beginner-full-body"]

    assert templates.json()[0]["exerciseIds"] == ["0662", "0043", "0027", "0361", "0001"]

    custom = client.post(
        "/api/training/templates",
        json={"name": "我的上肢日", "exerciseIds": ["0025", "0027", "0294"]},
        headers=first_headers,
    )
    assert custom.status_code == 201
    custom_id = custom.json()["id"]
    assert custom.json()["kind"] == "custom"
    assert client.get("/api/workouts", headers=first_headers).json() == []

    updated = client.patch(
        f"/api/training/templates/{custom_id}",
        json={"name": "我的上肢强化日", "exerciseIds": ["0025", "0294"]},
        headers=first_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "我的上肢强化日"
    assert updated.json()["exerciseIds"] == ["0025", "0294"]

    assert client.post(
        "/api/workouts/complete",
        json={"date": "2026-07-30", "exerciseIds": ["0025"], "notes": ""},
        headers=first_headers,
    ).status_code == 200
    client.put("/api/favorite-exercises/0025", headers=first_headers)
    quick = client.get("/api/training/quick-exercises", headers=first_headers).json()
    assert quick["favorites"] == ["0025"]
    assert quick["recent"]
    assert quick["recommended"][0]["id"] == "chest"

    second = client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123", "confirmPassword": "password123"},
    ).json()
    second_headers = bearer(second["token"])
    assert [template["id"] for template in client.get("/api/training/templates", headers=second_headers).json()] == ["beginner-full-body"]
    assert client.get("/api/training/quick-exercises", headers=second_headers).json()["favorites"] == []
    assert client.get("/api/training/quick-exercises", headers=second_headers).json()["recent"] == []
    assert client.patch(f"/api/training/templates/{custom_id}", json={"name": "无权修改", "exerciseIds": ["0025"]}, headers=second_headers).status_code == 404
    assert client.delete(f"/api/training/templates/{custom_id}", headers=second_headers).status_code == 404
    assert client.delete(f"/api/training/templates/{custom_id}", headers=first_headers).status_code == 204


def test_health_identifies_fastapi(tmp_path: Path):
    client = TestClient(create_app(tmp_path / "data.json"))
    assert client.get("/api/health").json() == {"ok": True, "framework": "FastAPI"}
