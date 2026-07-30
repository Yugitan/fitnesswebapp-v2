"""Create the PostgreSQL persistence schema.

Revision ID: 20260730_0001
Revises:
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260730_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=40), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_table(
        "workouts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("owner_key", sa.String(length=128), nullable=False),
        sa.Column("training_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_key", "training_date", name="uq_workouts_owner_date"),
    )
    op.create_index("ix_workouts_owner_key", "workouts", ["owner_key"])
    op.create_table(
        "favorite_exercises",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("owner_key", sa.String(length=128), nullable=False),
        sa.Column("exercise_id", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("owner_key", "exercise_id", name="uq_favorite_exercises_owner_exercise"),
    )
    op.create_index("ix_favorite_exercises_owner_key", "favorite_exercises", ["owner_key"])
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index("ix_user_sessions_expires_at", "user_sessions", ["expires_at"])
    op.create_table(
        "workout_exercises",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workout_id", sa.String(length=64), nullable=False),
        sa.Column("exercise_id", sa.String(length=128), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["workout_id"], ["workouts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workout_id", "sort_order", name="uq_workout_exercises_sort_order"),
    )
    op.create_index("ix_workout_exercises_workout_id", "workout_exercises", ["workout_id"])
    op.create_table(
        "training_sets",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("workout_exercise_id", sa.String(length=64), nullable=False),
        sa.Column("set_number", sa.Integer(), nullable=False),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["workout_exercise_id"], ["workout_exercises.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workout_exercise_id", "set_number", name="uq_training_sets_set_number"),
    )
    op.create_index("ix_training_sets_workout_exercise_id", "training_sets", ["workout_exercise_id"])


def downgrade() -> None:
    op.drop_table("training_sets")
    op.drop_table("workout_exercises")
    op.drop_table("user_sessions")
    op.drop_table("favorite_exercises")
    op.drop_table("workouts")
    op.drop_table("users")
