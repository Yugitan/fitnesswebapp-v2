"""Add user-owned training templates.

Revision ID: 20260730_0002
Revises: 20260730_0001
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa


revision = "20260730_0002"
down_revision = "20260730_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_training_templates",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("exercise_ids", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_user_training_templates_name"),
    )
    op.create_index("ix_user_training_templates_user_id", "user_training_templates", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_training_templates")
