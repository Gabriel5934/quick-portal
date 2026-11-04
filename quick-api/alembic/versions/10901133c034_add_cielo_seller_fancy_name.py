"""add cielo seller fancy name

Revision ID: 10901133c034
Revises: 5991fc07045b
Create Date: 2026-11-04 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '10901133c034'
down_revision: Union[str, Sequence[str], None] = '5991fc07045b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('cielo_sellers', schema=None) as batch_op:
        batch_op.add_column(sa.Column('fancy_name', sa.String(length=50), server_default='', nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('cielo_sellers', schema=None) as batch_op:
        batch_op.drop_column('fancy_name')
