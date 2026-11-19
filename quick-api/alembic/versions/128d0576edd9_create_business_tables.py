"""create business tables

Revision ID: 128d0576edd9
Revises: 10901133c034
Create Date: 2026-11-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '128d0576edd9'
down_revision: Union[str, Sequence[str], None] = '10901133c034'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('businesses',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('cnpj', sa.String(length=14), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('cnpj = upper(cnpj) AND length(cnpj) = 14', name='ck_businesses_cnpj_normalized'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('cnpj')
    )
    op.create_table('business_membership',
    sa.Column('business_id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['business_id'], ['businesses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('business_id', 'user_id')
    )
    with op.batch_alter_table('business_membership', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_business_membership_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('business_membership', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_business_membership_user_id'))

    op.drop_table('business_membership')
    op.drop_table('businesses')
