#!/usr/bin/env python3
"""One-time import of the former FastAPI JSON store into PostgreSQL.

Run `alembic upgrade head` first. The JSON file is never changed or removed;
keep it until the imported data has been verified.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict

from sqlalchemy.exc import SQLAlchemyError

# When invoked as a file, Python puts ``scripts/`` rather than the API root
# on sys.path. Keep the documented command independent of PYTHONPATH.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.database import SqlStore


REQUIRED_LISTS = (
    "workouts",
    "workoutExercises",
    "trainingSets",
    "favoriteExercises",
    "users",
    "sessions",
)


def load_backup(path: Path, legacy_owner_key: str | None) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"无法读取 JSON 数据文件：{exc}") from exc
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("只支持 version 为 1 的 JSON 数据文件")
    for key in REQUIRED_LISTS:
        if not isinstance(data.get(key), list):
            raise ValueError(f"数据文件缺少列表字段：{key}")

    missing_owner = [item for item in [*data["workouts"], *data["favoriteExercises"]] if not item.get("ownerKey")]
    if missing_owner and not legacy_owner_key:
        raise ValueError(
            "发现认证功能上线前的无归属数据；请使用 --legacy-owner-key guest:<此设备游客ID> 指定归属"
        )
    if legacy_owner_key:
        for item in missing_owner:
            item["ownerKey"] = legacy_owner_key
    return {"version": 1, **{key: data[key] for key in REQUIRED_LISTS}}


def main() -> int:
    parser = argparse.ArgumentParser(description="将 api-data.json 导入 PostgreSQL")
    parser.add_argument("json_file", type=Path, help="旧 api-data.json 的路径")
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL"), help="覆盖 DATABASE_URL")
    parser.add_argument("--legacy-owner-key", help="为旧版无 ownerKey 数据指定用户或游客归属")
    args = parser.parse_args()
    if not args.database_url:
        parser.error("请设置 DATABASE_URL 或传入 --database-url")

    try:
        imported = load_backup(args.json_file, args.legacy_owner_key)
        store = SqlStore(args.database_url)

        def replace(_: Dict[str, Any]) -> None:
            _.clear()
            _.update(imported)

        store.mutate(replace)
    except (ValueError, SQLAlchemyError) as exc:
        print(f"导入失败：{exc}", file=sys.stderr)
        return 2
    print(f"已导入 {len(imported['users'])} 个账号和 {len(imported['workouts'])} 条训练记录。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
