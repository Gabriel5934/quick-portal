from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

import app.cielo.models  # noqa: F401  (registers the tables on Base.metadata)
from app.config import Settings
from app.db import Base, IntEnumType

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> str:
    """``sqlalchemy.url`` when set (tests), otherwise DATABASE_PATH."""
    url = config.get_main_option("sqlalchemy.url")
    if url:
        return url
    settings = Settings.from_env()
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    return settings.database_url.render_as_string(hide_password=False)


def render_item(type_, obj, autogen_context):
    # IntEnum columns are plain integers in the database; keep migrations free
    # of application imports.
    if type_ == "type" and isinstance(obj, IntEnumType):
        return "sa.Integer()"
    return False


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        render_item=render_item,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(database_url(), poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            render_item=render_item,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
