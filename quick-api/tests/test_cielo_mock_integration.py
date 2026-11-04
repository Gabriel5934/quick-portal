"""POST /cielo/onboard against the real cielo-mock, over real HTTP.

Unlike test_cielo.py nothing is intercepted: the mock (../cielo-mock) runs as a
node subprocess with a throwaway SQLite database, and Settings point the app
at it. This keeps the payload Quick API builds in step with the mock's
validation, e.g. agencyDigit "x" for an agency without a digit.

Skipped when node 24+ or the mock's dependencies are unavailable.
"""

import json
import os
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import uuid
from collections.abc import Iterator
from dataclasses import dataclass, replace
from pathlib import Path

import pytest
import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.auth.models import User
from app.cielo.models import CieloDocumentType, CieloSeller, CieloSellerMembership
from app.config import Settings
from tests.conftest import QUICK_API_DIR, bearer, login, register
from tests.test_cielo import cnpj_seller, cpf_seller

MOCK_DIR = QUICK_API_DIR.parent / "cielo-mock"
MIN_NODE_MAJOR = 24
STARTUP_TIMEOUT_SECONDS = 20
# The mock's credentials, hard-coded in cielo-mock/src/config.ts. The master
# merchant ID must equal the mock's merchant ID: the mock rejects any other
# masterMerchantId.
MOCK_MERCHANT_ID = "00000000-0000-0000-0000-000000000000"
MOCK_CLIENT_SECRET = "mock-cielo-secret"


@dataclass(frozen=True)
class RunningMock:
    base_url: str
    database_file: Path


def _node_major(node: str) -> int | None:
    try:
        version = subprocess.run(  # noqa: S603
            [node, "--version"], capture_output=True, text=True, check=True
        ).stdout
        return int(version.strip().lstrip("v").split(".")[0])
    except (OSError, subprocess.CalledProcessError, ValueError):
        return None


def _newest_mtime(directory: Path) -> float:
    return max(path.stat().st_mtime for path in directory.rglob("*.ts"))


def _mock_command(node: str) -> list[str]:
    """The built server when it is up to date with src/, else src/ via tsx."""
    built = MOCK_DIR / "dist" / "server.js"
    if built.is_file() and built.stat().st_mtime >= _newest_mtime(MOCK_DIR / "src"):
        return [node, "--disable-warning=ExperimentalWarning", str(built)]
    if (MOCK_DIR / "node_modules" / "tsx").is_dir():
        return [
            node,
            "--disable-warning=ExperimentalWarning",
            "--import",
            "tsx",
            str(MOCK_DIR / "src" / "server.ts"),
        ]
    pytest.skip(
        "cielo-mock has no up-to-date build and tsx is not installed; "
        "run `npm ci` (and optionally `npm run build`) in cielo-mock"
    )


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="module")
def cielo_mock() -> Iterator[RunningMock]:
    node = shutil.which("node")
    if node is None:
        pytest.skip("node is not installed; the cielo-mock integration needs it")
    major = _node_major(node)
    if major is None or major < MIN_NODE_MAJOR:
        pytest.skip(f"cielo-mock needs node {MIN_NODE_MAJOR}+, found {major}")
    if not (MOCK_DIR / "node_modules" / "express").is_dir():
        pytest.skip("cielo-mock dependencies are missing; run `npm ci` in cielo-mock")
    command = _mock_command(node)

    with tempfile.TemporaryDirectory(prefix="cielo-mock-it-") as directory:
        database_file = Path(directory) / "cielo.sqlite3"
        port = _free_port()
        # A minimal environment: nothing from cielo-mock/.env or the caller's
        # MOCK_CIELO_* variables, and onboarding notifications disabled.
        env = {
            "PATH": os.environ.get("PATH", ""),
            "PORT": str(port),
            "MOCK_CIELO_DATABASE_FILE": str(database_file),
            "MOCK_CIELO_TOKEN_LIFETIME_SECONDS": "1200",
            "MOCK_CIELO_ONBOARDING_MODE": "success",
            "MOCK_CIELO_NOTIFICATION_URL": "",
        }
        stderr_path = Path(directory) / "stderr.log"
        with stderr_path.open("wb") as stderr:
            # stdout carries the mock's request/response logs; not needed.
            process = subprocess.Popen(  # noqa: S603
                command,
                cwd=MOCK_DIR,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=stderr,
            )
        try:
            base_url = f"http://127.0.0.1:{port}"
            _wait_until_healthy(process, base_url, stderr_path)
            yield RunningMock(base_url=base_url, database_file=database_file)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def _wait_until_healthy(
    process: subprocess.Popen, base_url: str, stderr_path: Path
) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    # The module-scoped cielo_mock runs before the function-scoped
    # _no_proxy_for_the_mock, so the probe must not read proxy variables itself.
    with requests.Session() as probe:
        probe.trust_env = False
        while time.monotonic() < deadline:
            if process.poll() is not None:
                pytest.fail(
                    f"cielo-mock exited with {process.returncode}:\n"
                    + stderr_path.read_text(errors="replace")
                )
            try:
                if probe.get(base_url + "/health", timeout=1).ok:
                    return
            except requests.ConnectionError:
                pass
            time.sleep(0.1)
    pytest.fail(f"cielo-mock did not become healthy within {STARTUP_TIMEOUT_SECONDS}s")


@pytest.fixture(autouse=True)
def _no_proxy_for_the_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """The app's requests honour proxy variables; the mock is local.

    The startup probe in _wait_until_healthy ignores them on its own.
    """
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")


@pytest.fixture
def settings(settings: Settings, cielo_mock: RunningMock) -> Settings:
    """conftest's settings, with Cielo pointed at the running mock."""
    return replace(
        settings,
        cielo_merchant_id=MOCK_MERCHANT_ID,
        cielo_client_secret=MOCK_CLIENT_SECRET,
        cielo_auth_base_url=cielo_mock.base_url,
        cielo_onboarding_base_url=cielo_mock.base_url,
        cielo_master_merchant_id=MOCK_MERCHANT_ID,
    )


@pytest.fixture
def auth(client: TestClient) -> dict[str, str]:
    register(client, "mock@example.com")
    return bearer(login(client, "mock@example.com"))


def _with_agency_digit(seller: dict, agency_digit: str) -> dict:
    return {
        **seller,
        "bank_account": {**seller["bank_account"], "agency_digit": agency_digit},
    }


def _mock_bank_account(mock: RunningMock, document_number: str) -> dict:
    """The bankAccount the mock stored for a seller."""
    database = sqlite3.connect(f"file:{mock.database_file}?mode=ro", uri=True)
    try:
        (data,) = database.execute(
            "SELECT onboarding_data FROM sellers WHERE document_number = ?",
            (document_number,),
        ).fetchone()
    finally:
        database.close()
    return json.loads(data)["bankAccount"]


# Each case uses its own document: the mock rejects documents it already has.
@pytest.mark.parametrize(
    ("make_seller", "document_type", "document_number", "agency_digit"),
    [
        (cnpj_seller, "CNPJ", "45723174000110", "x"),
        (cpf_seller, "CPF", "39053344705", "x"),
        (cnpj_seller, "CNPJ", "60701190000104", "7"),
        (cpf_seller, "CPF", "11144477735", "0"),
    ],
    ids=["cnpj-x", "cpf-x", "cnpj-digit", "cpf-digit"],
)
def test_onboard_against_the_mock(
    app: FastAPI,
    client: TestClient,
    auth: dict[str, str],
    cielo_mock: RunningMock,
    make_seller,
    document_type: str,
    document_number: str,
    agency_digit: str,
) -> None:
    seller = _with_agency_digit(
        make_seller(document_number=document_number), agency_digit
    )

    response = client.post("/cielo/onboard", json=seller, headers=auth)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body == {
        "id": body["id"],
        "document_type": document_type,
        "document_number": document_number,
        "fancy_name": seller["fancy_name"],
    }
    seller_id = uuid.UUID(body["id"])
    with app.state.session_factory() as session:
        (stored,) = session.scalars(select(CieloSeller))
        (membership,) = session.scalars(select(CieloSellerMembership))
        user = session.scalar(select(User))
    assert stored.id == seller_id
    assert stored.document_type is CieloDocumentType[document_type]
    assert stored.document_number == document_number
    assert stored.fancy_name == seller["fancy_name"]
    assert (membership.seller_id, membership.user_id) == (seller_id, user.id)

    bank_account = _mock_bank_account(cielo_mock, document_number)
    assert bank_account["agencyDigit"] == agency_digit
    assert bank_account["documentType"] == document_type
    assert bank_account["documentNumber"] == document_number


def test_the_mocks_agency_digit_error_is_relayed(
    app: FastAPI, client: TestClient, auth: dict[str, str]
) -> None:
    seller = _with_agency_digit(cnpj_seller(document_number="33000167000101"), "y")

    response = client.post("/cielo/onboard", json=seller, headers=auth)

    assert response.status_code == 400, response.text
    assert response.json() == [
        {
            "Code": "RequestValidationError",
            "Message": 'bankAccount.agencyDigit: must contain one digit or "x".',
        }
    ]
    with app.state.session_factory() as session:
        assert session.scalars(select(CieloSeller)).all() == []
