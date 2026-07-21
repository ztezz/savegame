import logging
from logging.handlers import RotatingFileHandler
import hashlib
import json
import os
import random
import re
import secrets
import shutil
import socket
import stat
import sys
import tempfile
import threading
import time
import uuid
import webbrowser
import zipfile
import ctypes
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlsplit

import requests
from dotenv import load_dotenv
from agent_version import AGENT_VERSION

try:
    from rich.console import Console
    from rich.logging import RichHandler
    from rich.panel import Panel
    from rich.table import Table
except Exception:
    Console = None  # type: ignore[assignment]
    RichHandler = None  # type: ignore[assignment]
    Panel = None  # type: ignore[assignment]
    Table = None  # type: ignore[assignment]

# Load .env file from the directory where the exe/script lives.
# When bundled with PyInstaller, __file__ points inside the temp extraction folder,
# so we use sys.executable's parent (the actual exe location) instead.
_base_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).parent
_env_path = _base_dir / ".env"
load_dotenv(dotenv_path=_env_path, override=True)
_data_dir = (Path(os.environ["LOCALAPPDATA"]) if os.getenv("LOCALAPPDATA") else Path.home() / ".local" / "share") / "CloudSave"
_logs_dir = _data_dir / "logs"

if getattr(sys.stdout, "encoding", None) and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CONSOLE = Console() if Console else None
AgentEventHandler = Callable[[str, Dict[str, Any]], None]
ERROR_ALREADY_EXISTS = 183
API_BASE_URL = "https://api.luugame.fun"
API_HOST = "api.luugame.fun"
VERIFICATION_HOSTS = frozenset({API_HOST, "luugame.fun", "www.luugame.fun"})
RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL", "CLOCK$"} | {f"COM{i}" for i in range(1, 10)} | {f"LPT{i}" for i in range(1, 10)}
MAX_LEASE_SECONDS = 24 * 60 * 60
MAX_LEASE_TOKEN_LENGTH = 4096


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def setup_logging() -> None:
    _logs_dir.mkdir(parents=True, exist_ok=True)
    handlers: list[logging.Handler] = [
        RotatingFileHandler(
            _logs_dir / "agent.log",
            maxBytes=5 * 1024 * 1024,
            backupCount=3,
            encoding="utf-8",
        )
    ]

    if RichHandler and sys.stdout:
        handlers.insert(0, RichHandler(rich_tracebacks=True, show_path=False))
        log_format = "%(message)s"
        date_format = "[%X]"
    else:
        if sys.stdout:
            handlers.insert(0, logging.StreamHandler(sys.stdout))
        log_format = "%(asctime)s [%(levelname)s] %(message)s"
        date_format = None

    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        datefmt=date_format,
        handlers=handlers,
        force=True,
    )


def show_startup_banner(api_base_url: str, device_id: str, poll_interval: int) -> None:
    if not CONSOLE or not Panel or not Table:
        return

    table = Table.grid(padding=(0, 1))
    table.add_row("[bold cyan]Device[/]", device_id)
    table.add_row("[bold cyan]API[/]", api_base_url)
    table.add_row("[bold cyan]Poll[/]", f"{poll_interval}s")

    CONSOLE.print(
        Panel(
            table,
            title="CloudSave Restore Agent",
            border_style="bright_blue",
            expand=False,
        )
    )


def show_new_key_notice(device_id: str, api_key: str) -> None:
    if CONSOLE and Panel and Table:
        table = Table.grid(padding=(0, 1))
        table.add_row("[bold]Device name[/]", device_id)
        table.add_row("[bold]API Key[/]", api_key)
        table.add_row("[bold]Next[/]", "Browser will open for login/link flow")
        CONSOLE.print(
            Panel(
                table,
                title="New Device Key Generated",
                border_style="yellow",
                expand=False,
            )
        )
        return

    print()
    print("=" * 62)
    print("  NEW KEY GENERATED -- REGISTER IT IN THE WEB UI")
    print("=" * 62)
    print(f"  Device name : {device_id}")
    print(f"  API Key     : {api_key}")
    print("=" * 62)
    print()


def durable_replace(source: Path, destination: Path) -> None:
    if os.name != "nt":
        os.replace(source, destination)
        return
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.MoveFileExW.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_ulong]
    kernel32.MoveFileExW.restype = ctypes.c_bool
    if not kernel32.MoveFileExW(str(source), str(destination), 0x1 | 0x8):
        raise ctypes.WinError(ctypes.get_last_error())


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    tmp = Path(name)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        durable_replace(tmp, path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


class DataBlob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_ulong), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def dpapi(data: bytes, protect: bool) -> bytes:
    if os.name != "nt":
        return data
    crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    blob_pointer = ctypes.POINTER(DataBlob)
    if protect:
        function = crypt32.CryptProtectData
        function.argtypes = [blob_pointer, ctypes.c_wchar_p, blob_pointer, ctypes.c_void_p,
                             ctypes.c_void_p, ctypes.c_ulong, blob_pointer]
    else:
        function = crypt32.CryptUnprotectData
        function.argtypes = [blob_pointer, ctypes.POINTER(ctypes.c_wchar_p), blob_pointer,
                             ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, blob_pointer]
    function.restype = ctypes.c_bool
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    source_buffer = ctypes.create_string_buffer(data)
    source = DataBlob(len(data), ctypes.cast(source_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    result = DataBlob()
    args = (ctypes.byref(source), "CloudSave key", None, None, None, 0, ctypes.byref(result)) if protect else (ctypes.byref(source), None, None, None, None, 0, ctypes.byref(result))
    if not function(*args):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(result.pbData, result.cbData)
    finally:
        kernel32.LocalFree(result.pbData)


def load_or_generate_key(key_file: Path) -> tuple[str, bool, bool]:
    legacy = _base_dir / "agent.key"
    source = key_file if key_file.exists() else legacy if legacy.exists() else None
    if source:
        raw = source.read_bytes()
        key = (dpapi(raw[6:], False) if raw.startswith(b"DPAPI\0") else raw).decode("utf-8").strip()
        if not key or len(key) > 4096 or any(ord(c) < 32 for c in key):
            raise RuntimeError(f"Invalid agent key in {source}")
        migrated = source == legacy and source != key_file
        if migrated or os.name == "nt" and not raw.startswith(b"DPAPI\0"):
            atomic_write(key_file, b"DPAPI\0" + dpapi(key.encode(), True) if os.name == "nt" else key.encode())
        return key, False, migrated
    key = secrets.token_hex(32)
    atomic_write(key_file, b"DPAPI\0" + dpapi(key.encode(), True) if os.name == "nt" else key.encode())
    return key, True, False


def load_device_id(path: Path, legacy_install: bool) -> str:
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if not value or len(value) > 255 or re.search(r"[\x00-\x1f\x7f]", value):
            raise RuntimeError("Persisted device ID is invalid")
        return value
    value = socket.gethostname().strip()[:255] if legacy_install else f"device-{uuid.uuid4()}"
    atomic_write(path, (value + "\n").encode())
    return value


def validate_url(value: str, hosts: frozenset[str], purpose: str) -> str:
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ValueError(f"Invalid {purpose} URL") from exc
    if (parsed.scheme.lower() != "https" or not parsed.hostname or parsed.username is not None or
            parsed.password is not None or port not in (None, 443) or
            parsed.hostname.lower() not in hosts or parsed.fragment):
        raise ValueError(f"Untrusted {purpose} URL")
    return value


def version_tuple(value: str) -> tuple[int, int, int]:
    if not isinstance(value, str) or not re.fullmatch(r"\d+\.\d+\.\d+", value):
        raise ValueError("Agent version must use x.y.z format")
    return tuple(map(int, value.split(".")))  # type: ignore[return-value]


def parse_update_info(info: Any, api_base_url: str) -> Dict[str, Any]:
    if not isinstance(info, dict):
        raise ValueError("Update metadata must be an object")
    version = info.get("version")
    size = info.get("size")
    sha256 = info.get("sha256")
    download_path = info.get("downloadUrl")
    if type(info.get("available")) is not bool or not info["available"]:
        raise ValueError("Update is not available")
    version_tuple(version)
    if type(size) is not int or size <= 0:
        raise ValueError("Update size must be a positive integer")
    if not isinstance(sha256, str) or not re.fullmatch(r"[0-9a-f]{64}", sha256):
        raise ValueError("Update SHA-256 must be a lowercase digest")
    expected_path = f"/api/agent/download/{sha256}"
    if download_path != expected_path:
        raise ValueError("Update URL does not match its SHA-256 digest")
    download_url = validate_url(f"{api_base_url}{download_path}", frozenset({API_HOST}), "update download")
    parsed = urlsplit(download_url)
    if parsed.path != expected_path or parsed.query:
        raise ValueError("Update download URL is not canonical")
    return {"version": version, "size": size, "sha256": sha256, "download_url": download_url}


def parse_lease_fields(payload: Dict[str, Any]) -> tuple[str, str, int, float]:
    token = payload.get("lease_token")
    expires_at = payload.get("lease_expires_at")
    lease_seconds = payload.get("lease_seconds")
    if (not isinstance(token, str) or not token or len(token) > MAX_LEASE_TOKEN_LENGTH or
            re.search(r"[\x00-\x1f\x7f]", token)):
        raise ValueError("Task lease_token is invalid")
    if not isinstance(expires_at, str) or not expires_at or len(expires_at) > 64:
        raise ValueError("Task lease_expires_at must be an ISO-8601 timestamp")
    if type(lease_seconds) is not int or not 1 <= lease_seconds <= MAX_LEASE_SECONDS:
        raise ValueError(f"Task lease_seconds must be an integer from 1 to {MAX_LEASE_SECONDS}")
    try:
        parsed = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Task lease_expires_at must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Task lease_expires_at must include a timezone")
    expiry_epoch = parsed.astimezone(timezone.utc).timestamp()
    if not expiry_epoch > time.time():
        raise ValueError("Task lease is already expired")
    return token, expires_at, lease_seconds, expiry_epoch


class LeaseLostError(RuntimeError):
    pass


class CommitPublishedError(RuntimeError):
    pass


class LeaseKeeper:
    def __init__(self, agent: "RestoreAgent", task_id: int, token: str,
                 lease_seconds: int, expiry_epoch: float) -> None:
        self.agent = agent
        self.task_id = task_id
        self.token = token
        self.lease_seconds = lease_seconds
        self._expiry_monotonic = time.monotonic() + max(0.0, expiry_epoch - time.time())
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stopped = threading.Event()
        self._lost = threading.Event()
        self._reason = "Lease expired"
        self._thread = threading.Thread(target=self._run, name=f"lease-{task_id}", daemon=True)

    def start(self) -> None:
        self._thread.start()

    def stop(self) -> None:
        self._stopped.set()
        self._wake.set()
        self._thread.join(timeout=max(2, self.agent.connect_timeout + self.agent.read_timeout + 1))

    def ensure_owned(self) -> None:
        with self._lock:
            expired = time.monotonic() >= self._expiry_monotonic
        if expired:
            self._mark_lost("Lease expired")
        if self._lost.is_set():
            raise LeaseLostError(self._reason)

    def renew_now(self) -> None:
        self.ensure_owned()
        # This one-shot session keeps synchronous commit fencing independent of
        # both the main agent session and the periodic worker's session.
        with requests.Session() as session:
            self._renew(session)
        self.ensure_owned()

    def _mark_lost(self, reason: str) -> None:
        self._reason = reason
        self._lost.set()
        self._wake.set()

    def _renew(self, session: requests.Session) -> None:
        response = session.post(
            f"{self.agent.api_base_url}/api/task/{self.task_id}/renew",
            headers={"Authorization": f"ApiKey {self.agent.api_key}"},
            json={"device_id": self.agent.device_id, "lease_token": self.token},
            timeout=(self.agent.connect_timeout, self.agent.read_timeout),
            allow_redirects=False,
        )
        if response.is_redirect:
            response.close()
            raise RuntimeError("Lease renewal redirects are not allowed")
        if response.status_code in (401, 409):
            self._mark_lost(f"Lease renewal rejected with HTTP {response.status_code}")
            raise LeaseLostError(self._reason)
        response.raise_for_status()
        payload = response.json() or {}
        returned_token, _expires, seconds, expiry = parse_lease_fields(payload)
        if not secrets.compare_digest(returned_token, self.token):
            self._mark_lost("Lease renewal returned a different token")
            raise LeaseLostError(self._reason)
        with self._lock:
            self.lease_seconds = seconds
            self._expiry_monotonic = time.monotonic() + max(0.0, expiry - time.time())

    def _run(self) -> None:
        with requests.Session() as session:
            while not self._stopped.is_set() and not self._lost.is_set():
                with self._lock:
                    remaining = self._expiry_monotonic - time.monotonic()
                    interval = max(0.25, min(max(1.0, self.lease_seconds / 3), max(0.0, remaining - 1.0)))
                if remaining <= 0:
                    self._mark_lost("Lease expired")
                    break
                if self._wake.wait(interval):
                    self._wake.clear()
                    continue
                try:
                    self._renew(session)
                except LeaseLostError:
                    break
                except Exception as exc:
                    with self._lock:
                        expired = time.monotonic() >= self._expiry_monotonic
                    if expired:
                        self._mark_lost(f"Lease expired after renewal failure: {exc}")
                        break
                    logging.warning("Task #%s lease renewal transient failure: %s", self.task_id, exc)


def is_headless_mode() -> bool:
    return "--headless" in sys.argv or os.getenv("AGENT_HEADLESS", "").strip().lower() in {"1", "true", "yes"}


class SingleInstance:
    def __init__(self, name: str) -> None:
        self.name = name
        self.handle: Any = None

    def acquire(self) -> bool:
        if os.name != "nt":
            return True

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_bool, ctypes.c_wchar_p]
        kernel32.CreateMutexW.restype = ctypes.c_void_p
        ctypes.set_last_error(0)
        self.handle = kernel32.CreateMutexW(None, False, self.name)
        if not self.handle:
            logging.error("Could not create mutex: %s", ctypes.WinError(ctypes.get_last_error()))
            return False
        if ctypes.get_last_error() == ERROR_ALREADY_EXISTS:
            self.release()
            return False
        return True

    def release(self) -> None:
        if os.name != "nt" or not self.handle:
            return

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel32.CloseHandle.argtypes = [ctypes.c_void_p]
        kernel32.CloseHandle.restype = ctypes.c_bool
        if not kernel32.CloseHandle(self.handle):
            logging.error("Could not close mutex: %s", ctypes.WinError(ctypes.get_last_error()))
        self.handle = None


def show_single_instance_notice() -> None:
    message = "CloudSave Desktop Agent đang chạy. Hãy mở từ biểu tượng khay hệ thống hiện có."
    try:
        ctypes.windll.user32.MessageBoxW(None, message, "CloudSave Desktop Agent", 0x00000040)
    except Exception:
        logging.warning(message)


class RestoreAgent:
    def __init__(
        self,
        event_handler: Optional[AgentEventHandler] = None,
        stop_event: Optional[threading.Event] = None,
    ) -> None:
        self.api_base_url = API_BASE_URL
        self.poll_interval = max(1, env_int("POLL_INTERVAL_SECONDS", 5))
        self.connect_timeout = max(1, env_int("CONNECT_TIMEOUT_SECONDS", 10))
        self.read_timeout = max(1, env_int("READ_TIMEOUT_SECONDS", 30))
        self.download_deadline = max(30, env_int("DOWNLOAD_DEADLINE_SECONDS", 1800))
        self.max_download_bytes = max(1, env_int("MAX_DOWNLOAD_BYTES", 2 * 1024**3))
        self.max_members = max(1, env_int("MAX_ARCHIVE_MEMBERS", 10000))
        self.max_file_bytes = max(1, env_int("MAX_ARCHIVE_FILE_BYTES", 2 * 1024**3))
        self.max_total_bytes = max(1, env_int("MAX_ARCHIVE_TOTAL_BYTES", 4 * 1024**3))
        self.max_ratio = max(1, env_int("MAX_ARCHIVE_COMPRESSION_RATIO", 200))
        self.max_depth = max(1, env_int("MAX_ARCHIVE_DEPTH", 32))
        self.max_path = max(40, env_int("MAX_ARCHIVE_PATH_LENGTH", 240))
        self.update_check_interval = max(60, env_int("UPDATE_CHECK_INTERVAL_SECONDS", 6 * 60 * 60))
        self.last_update_check = 0.0
        self.event_handler = event_handler
        self.stop_event = stop_event or threading.Event()

        self.api_key, is_new_key, _migrated = load_or_generate_key(_data_dir / "agent.key")
        self.device_id = load_device_id(_data_dir / "device.id", not is_new_key)
        self.display_name = socket.gethostname().strip()[:255] or self.device_id
        self.link_started = False
        self.link_expires_at = 0.0
        self.link_refresh_requested = threading.Event()
        self.authenticated_once = False

        self.session = requests.Session()
        self.is_processing = False
        self.ack_file = _data_dir / "pending-acks.json"
        self.dead_ack_file = _data_dir / "dead-letter-acks.json"
        self.transaction_index_file = _data_dir / "restore-transactions.json"
        self.pending_acks = self._load_ack_journal()
        self.dead_acks = self._load_dead_ack_journal()

        self.emit(
            "key_ready",
            device_id=self.device_id,
            api_key=self.api_key,
            api_base_url=self.api_base_url,
            version=AGENT_VERSION,
            is_new=is_new_key,
        )

        if is_new_key:
            show_new_key_notice(self.device_id, self.api_key)

    def emit(self, event_type: str, **payload: Any) -> None:
        if not self.event_handler:
            return
        try:
            self.event_handler(event_type, dict(payload))
        except Exception:
            logging.exception("UI event handler failed for %s", event_type)

    def start_link_flow(self, force: bool = False) -> None:
        if not force and self.link_started and time.monotonic() < self.link_expires_at:
            return
        self.link_started = False
        try:
            response = self._request(
                "POST",
                "/api/device-links/start",
                json={"device_name": self.device_id, "device_display_name": self.display_name,
                      "api_key": self.api_key, "force_relink": force},
            )
            payload = response.json() or {}

            if payload.get("already_linked"):
                self.emit("link_not_required")
                return

            verification_url = validate_url(str(payload.get("verification_url", "")).strip(), VERIFICATION_HOSTS, "verification")

            self.link_started = True
            expires = payload.get("expires_in_seconds", 600)
            self.link_expires_at = time.monotonic() + (min(expires, 86400) if type(expires) is int and expires > 0 else 600)
            self.emit(
                "link_required",
                verification_url=verification_url,
                device_id=self.device_id,
                api_key=self.api_key,
            )
            logging.warning(
                "Device key is not linked yet. Opening browser for login/link flow:\n"
                "  Device name: %s\n"
                "  URL: %s",
                self.device_id,
                verification_url,
            )

            try:
                if os.name == "nt":
                    os.startfile(verification_url)
                    opened = True
                else:
                    opened = webbrowser.open(verification_url)
            except OSError:
                opened = webbrowser.open(verification_url)
            if not opened:
                logging.warning("Could not auto-open browser. Open URL manually: %s", verification_url)
        except Exception as exc:
            logging.warning("Could not start link flow: %s", exc)
            self.emit("warning", message=f"Could not start login flow: {exc}")

    def refresh_link_flow(self) -> None:
        self.link_refresh_requested.set()

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        if not path.startswith("/") or path.startswith("//"):
            raise ValueError("API path must be relative")
        headers = dict(kwargs.pop("headers", {}))
        headers["Authorization"] = f"ApiKey {self.api_key}"
        response = self.session.request(
            method,
            f"{self.api_base_url}{path}",
            headers=headers,
            timeout=(self.connect_timeout, self.read_timeout),
            allow_redirects=False,
            **kwargs,
        )
        if response.is_redirect:
            response.close()
            raise RuntimeError("API redirects are not allowed")
        response.raise_for_status()
        return response

    def check_for_update(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and now - self.last_update_check < self.update_check_interval:
            return

        try:
            response = self._request("GET", "/api/agent/info")
            info = response.json() or {}
            update = parse_update_info(info, self.api_base_url)
            latest_version = update["version"]

            if version_tuple(latest_version) > version_tuple(AGENT_VERSION):
                logging.warning(
                    "CloudSave Agent update available: current=%s latest=%s size=%s sha256=%s download=%s",
                    AGENT_VERSION,
                    latest_version,
                    update["size"],
                    update["sha256"],
                    update["download_url"],
                )
                self.emit(
                    "update_available",
                    current_version=AGENT_VERSION,
                    latest_version=latest_version,
                    download_url=update["download_url"],
                    size=update["size"],
                    sha256=update["sha256"],
                )
            self.last_update_check = time.monotonic()
        except Exception as exc:
            logging.info("Update check skipped: %s", exc)

    def heartbeat(self) -> bool:
        try:
            self._request("POST", "/api/sync/heartbeat", json={"deviceName": self.device_id, "device_display_name": self.display_name})
            if not self.authenticated_once:
                self.authenticated_once = True
                self.emit("authenticated", linked_via_browser=self.link_started)

            if self.link_started:
                logging.info("Device linked successfully. Agent is now authenticated.")
                self.link_started = False
            return True
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                self.authenticated_once = False
                self.start_link_flow()
            else:
                logging.warning("Heartbeat failed: %s", exc)
                self.emit("warning", message=f"Heartbeat failed: {exc}")
            return False
        except Exception as exc:
            logging.warning("Heartbeat failed: %s", exc)
            self.emit("warning", message=f"Heartbeat failed: {exc}")
            return False

    def fetch_task(self) -> Optional[Dict[str, Any]]:
        if self.is_processing:
            return None
        try:
            response = self._request("GET", "/api/task", params={"device_id": self.device_id})
            return (response.json() or {}).get("task")
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                self.authenticated_once = False
                self.start_link_flow()
            else:
                logging.error("Fetch task failed: %s", exc)
                self.emit("warning", message=f"Fetch task failed: {exc}")
            return None
        except Exception as exc:
            logging.error("Fetch task failed: %s", exc)
            self.emit("warning", message=f"Fetch task failed: {exc}")
            return None

    def download_file(self, file_url: str, destination: Path, expected_size: Optional[int],
                      expected_hash: Optional[str], lease: Optional[LeaseKeeper] = None) -> str:
        validate_url(file_url, frozenset({API_HOST}), "authenticated download")
        if expected_size is not None and expected_size > self.max_download_bytes:
            raise ValueError("Artifact exceeds configured download limit")
        required = expected_size if expected_size is not None else self.max_download_bytes
        free = shutil.disk_usage(destination.parent).free
        if free < required:
            raise OSError(f"Insufficient download space: need {required} bytes, have {free}")
        started, received, digest = time.monotonic(), 0, hashlib.sha256()
        headers = {"Authorization": f"ApiKey {self.api_key}"}
        with self.session.get(file_url, headers=headers, stream=True, allow_redirects=False,
                              timeout=(self.connect_timeout, self.read_timeout)) as response:
            if response.is_redirect:
                raise RuntimeError("Download redirects are not allowed")
            response.raise_for_status()
            length = response.headers.get("Content-Length")
            if length:
                try:
                    content_length = int(length)
                except ValueError as exc:
                    raise ValueError("Invalid download Content-Length") from exc
                if content_length < 0 or content_length > self.max_download_bytes or expected_size is not None and content_length != expected_size:
                    raise ValueError("Download Content-Length violates task limits")
            with destination.open("xb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 256):
                    if lease:
                        lease.ensure_owned()
                    if self.stop_event.is_set():
                        raise InterruptedError("Restore cancelled during download")
                    if time.monotonic() - started > self.download_deadline:
                        raise TimeoutError("Download exceeded total deadline")
                    if chunk:
                        received += len(chunk)
                        if received > self.max_download_bytes or expected_size is not None and received > expected_size:
                            raise ValueError("Download exceeded expected size or configured limit")
                        digest.update(chunk)
                        output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
        if expected_size is not None and received != expected_size:
            raise ValueError(f"Downloaded size mismatch: expected {expected_size}, got {received}")
        if expected_hash is not None and not secrets.compare_digest(digest.hexdigest(), expected_hash):
            raise ValueError("Downloaded SHA-256 mismatch")
        return digest.hexdigest()

    def resolve_target_dir(self, save_path: str) -> Path:
        if not isinstance(save_path, str) or not save_path.strip():
            raise ValueError("Task save_path is required")
        raw_path = save_path.strip()
        expanded_path = os.path.expanduser(os.path.expandvars(raw_path))
        if re.search(r"%[^%]+%|\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*", expanded_path):
            raise ValueError("save_path contains unresolved variables")
        win_path = PureWindowsPath(expanded_path)
        if not win_path.is_absolute() or expanded_path.startswith(("\\\\", "//")):
            raise ValueError("save_path must be an absolute local path")
        if expanded_path.startswith(("\\\\?\\", "\\\\.\\")) or ":" in expanded_path[2:]:
            raise ValueError("save_path uses a device path or alternate data stream")
        target = Path(os.path.abspath(expanded_path))
        if target == Path(target.anchor):
            raise ValueError("Refusing to restore over a drive root")
        target_norm = os.path.normcase(str(target))
        for value in (os.getenv("WINDIR"), os.getenv("SystemRoot"), os.getenv("ProgramFiles"), os.getenv("ProgramFiles(x86)"), os.getenv("ProgramData")):
            if value:
                dangerous = os.path.normcase(os.path.abspath(value))
                if target_norm == dangerous or target_norm.startswith(dangerous + os.sep):
                    raise ValueError("Refusing dangerous Windows system save_path")
        current = Path(target.anchor)
        for part in target.parts[1:]:
            stem = part.rstrip(" .").split(".", 1)[0].upper()
            if part != part.rstrip(" .") or stem in RESERVED_NAMES or ":" in part:
                raise ValueError(f"Unsafe save_path component: {part!r}")
            current /= part
            if current.exists() and self._is_reparse(current):
                raise ValueError(f"save_path traverses a reparse point: {current}")
        if target.parent.drive and not Path(target.anchor).exists():
            raise FileNotFoundError(f"Drive {target.drive} is unavailable")
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and not target.is_dir():
            raise ValueError("save_path exists but is not a directory")
        return target

    @staticmethod
    def _is_reparse(path: Path) -> bool:
        if path.is_symlink():
            return True
        if os.name == "nt" and path.exists():
            kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
            kernel32.GetFileAttributesW.argtypes = [ctypes.c_wchar_p]
            kernel32.GetFileAttributesW.restype = ctypes.c_ulong
            attrs = kernel32.GetFileAttributesW(str(path))
            return attrs != 0xFFFFFFFF and bool(attrs & 0x400)
        return False

    def _move_directory(self, source: Path, destination: Path) -> None:
        durable_replace(source, destination)

    def _validate_restore_overlay(self, source: Path, destination: Path,
                                  lease: Optional[LeaseKeeper] = None) -> None:
        destination_entries = ({entry.name.casefold(): entry for entry in destination.iterdir()}
                               if destination.exists() else {})
        for source_entry in source.iterdir():
            if lease:
                lease.ensure_owned()
            if self.stop_event.is_set():
                raise InterruptedError("Restore cancelled while validating existing files")
            if self._is_reparse(source_entry):
                raise ValueError(f"Refusing to restore a reparse point: {source_entry}")

            mode = source_entry.stat(follow_symlinks=False).st_mode
            destination_entry = destination_entries.get(source_entry.name.casefold())
            if stat.S_ISDIR(mode):
                if destination_entry is not None and (not destination_entry.is_dir() or
                                                       self._is_reparse(destination_entry)):
                    raise ValueError(f"Restore file/directory conflict: {source_entry.name}")
                self._validate_restore_overlay(
                    source_entry, destination_entry or destination / source_entry.name, lease)
            elif stat.S_ISREG(mode):
                if destination_entry is not None and (not destination_entry.is_file() or
                                                       self._is_reparse(destination_entry)):
                    raise ValueError(f"Restore file/directory conflict: {source_entry.name}")
            else:
                raise ValueError(f"Refusing to restore a special file: {source_entry}")

    def _publish_restore_overlay(self, source: Path, destination: Path,
                                 lease: Optional[LeaseKeeper] = None) -> None:
        destination.mkdir(parents=True, exist_ok=True)
        for source_entry in source.iterdir():
            if lease:
                lease.ensure_owned()
            destination_entry = destination / source_entry.name
            if source_entry.is_dir():
                self._publish_restore_overlay(source_entry, destination_entry, lease)
                shutil.copystat(source_entry, destination_entry, follow_symlinks=False)
            else:
                # Replace only this save file. Never rename or delete the containing save directory.
                durable_replace(source_entry, destination_entry)

    def _transaction_path(self, target: Path) -> Path:
        return target.parent / f".{target.name}.restore-transaction.json"

    def _load_transaction_index(self) -> list[str]:
        if not self.transaction_index_file.exists():
            return []
        value = json.loads(self.transaction_index_file.read_text(encoding="utf-8"))
        if not isinstance(value, list) or any(not isinstance(item, str) or not item for item in value):
            raise RuntimeError("Invalid restore transaction index")
        return list(dict.fromkeys(value[-100:]))

    def _save_transaction_index(self, paths: list[str]) -> None:
        atomic_write(self.transaction_index_file, json.dumps(paths[-100:], separators=(",", ":")).encode())

    def _register_transaction(self, journal_path: Path) -> None:
        paths = self._load_transaction_index()
        value = str(journal_path)
        if value not in paths:
            paths.append(value)
            self._save_transaction_index(paths)

    def _forget_transaction(self, journal_path: Path) -> None:
        paths = [item for item in self._load_transaction_index() if os.path.normcase(item) != os.path.normcase(str(journal_path))]
        self._save_transaction_index(paths)

    @staticmethod
    def _write_transaction(journal_path: Path, transaction: Dict[str, Any], phase: str) -> None:
        transaction["phase"] = phase
        atomic_write(journal_path, json.dumps(transaction, separators=(",", ":"), sort_keys=True).encode())

    def _validate_transaction(self, journal_path: Path, transaction: Any) -> Dict[str, Any]:
        required = {"task_id", "device_id", "lease_token", "sha256", "target", "staging",
                    "backup", "original_existed", "phase"}
        if not isinstance(transaction, dict) or set(transaction) != required:
            raise ValueError("Restore transaction has invalid fields")
        if (type(transaction["task_id"]) is not int or transaction["task_id"] <= 0 or
                transaction["device_id"] != self.device_id or
                not isinstance(transaction["lease_token"], str) or not transaction["lease_token"] or
                len(transaction["lease_token"]) > MAX_LEASE_TOKEN_LENGTH or
                not isinstance(transaction["sha256"], str) or
                not re.fullmatch(r"[0-9a-f]{64}", transaction["sha256"]) or
                type(transaction["original_existed"]) is not bool or
                transaction["phase"] not in {"staged", "backup_pending", "backup_moved", "publish_pending", "published"}):
            raise ValueError("Restore transaction metadata is invalid")
        try:
            target = Path(transaction["target"])
            staging = Path(transaction["staging"])
            backup = Path(transaction["backup"])
        except TypeError as exc:
            raise ValueError("Restore transaction paths are invalid") from exc
        if not all(path.is_absolute() for path in (journal_path, target, staging, backup)):
            raise ValueError("Restore transaction paths must be absolute")
        parent = target.parent
        same_parent = all(os.path.normcase(os.path.abspath(str(path.parent))) ==
                          os.path.normcase(os.path.abspath(str(parent))) for path in (journal_path, staging, backup))
        expected_journal = self._transaction_path(target)
        if (not same_parent or os.path.normcase(os.path.abspath(str(journal_path))) !=
                os.path.normcase(os.path.abspath(str(expected_journal))) or
                not staging.name.startswith(f".{target.name}.staging-") or
                not backup.name.startswith(f".{target.name}.backup-") or
                target in (staging, backup) or self._is_reparse(parent)):
            raise ValueError("Restore transaction contains unsafe paths")
        return transaction

    def _finish_recovered_commit(self, journal_path: Path, transaction: Dict[str, Any]) -> None:
        self.queue_ack(transaction["task_id"], True, lease_token=transaction["lease_token"])
        backup = Path(transaction["backup"])
        if backup.exists():
            shutil.rmtree(backup)
        journal_path.unlink(missing_ok=True)
        self._forget_transaction(journal_path)

    def recover_transactions(self) -> None:
        try:
            journal_names = self._load_transaction_index()
        except Exception as exc:
            logging.error("Cannot load restore transaction index; preserving it: %s", exc)
            return
        for journal_name in journal_names:
            journal_path = Path(journal_name)
            if not journal_path.exists():
                logging.error("Restore transaction journal is missing; preserving index entry: %s", journal_path)
                continue
            try:
                if journal_path.stat().st_size > 64 * 1024:
                    raise ValueError("Restore transaction journal is too large")
                transaction = self._validate_transaction(
                    journal_path, json.loads(journal_path.read_text(encoding="utf-8")))
                target = Path(transaction["target"])
                staging = Path(transaction["staging"])
                backup = Path(transaction["backup"])
                phase = transaction["phase"]
                published = phase in {"published", "publish_pending"} and target.is_dir() and not staging.exists()
                if published:
                    self._finish_recovered_commit(journal_path, transaction)
                    continue
                if phase in {"staged", "backup_pending"} and target.is_dir() and not backup.exists():
                    if staging.exists():
                        shutil.rmtree(staging)
                    journal_path.unlink()
                    self._forget_transaction(journal_path)
                    continue
                if phase in {"backup_pending", "backup_moved", "publish_pending"} and backup.is_dir() and not target.exists():
                    if staging.exists():
                        shutil.rmtree(staging)
                    self._move_directory(backup, target)
                    journal_path.unlink()
                    self._forget_transaction(journal_path)
                    continue
                if phase == "staged" and not transaction["original_existed"] and not target.exists():
                    if staging.exists():
                        shutil.rmtree(staging)
                    journal_path.unlink()
                    self._forget_transaction(journal_path)
                    continue
                if (phase in {"backup_pending", "backup_moved", "publish_pending"} and
                        not transaction["original_existed"] and not target.exists() and staging.is_dir() and
                        not backup.exists()):
                    shutil.rmtree(staging)
                    journal_path.unlink()
                    self._forget_transaction(journal_path)
                    continue
                raise RuntimeError("ambiguous transaction filesystem state")
            except Exception as exc:
                logging.error("Restore recovery preserved journal %s: %s", journal_path, exc)

    def apply_restore(self, archive_path: Path, save_path: str, original_filename: Optional[str],
                      lease: Optional[LeaseKeeper] = None, task_id: Optional[int] = None,
                      lease_token: Optional[str] = None, artifact_hash: Optional[str] = None) -> None:
        target_dir = self.resolve_target_dir(save_path)
        journal_path = self._transaction_path(target_dir)
        if task_id is not None:
            indexed = any(os.path.normcase(item) == os.path.normcase(str(journal_path))
                          for item in self._load_transaction_index())
            if journal_path.exists() or indexed:
                raise RuntimeError(f"Unresolved restore transaction exists for target: {journal_path}")
        staging = Path(tempfile.mkdtemp(prefix=f".{target_dir.name}.staging-", dir=str(target_dir.parent)))
        published = False
        try:
            if zipfile.is_zipfile(archive_path):
                self._extract_zip(archive_path, staging, lease)
            else:
                if not original_filename or Path(original_filename).name != original_filename or PureWindowsPath(original_filename).name != original_filename:
                    raise ValueError("Non-ZIP artifact requires a safe original_filename")
                self._validate_component(original_filename)
                artifact_size = archive_path.stat().st_size
                free = shutil.disk_usage(staging.parent).free
                if free < artifact_size:
                    raise OSError(f"Insufficient staging space: need {artifact_size} bytes, have {free}")
                shutil.copy2(archive_path, staging / original_filename)
            self._validate_restore_overlay(staging, target_dir, lease)
            if lease:
                lease.ensure_owned()
            if self.stop_event.is_set():
                raise InterruptedError("Restore cancelled before commit")
            if lease:
                lease.renew_now()
            # Each file replacement is atomic. An interrupted task is safe to retry and cannot
            # remove unrelated files or sibling directories from an overly broad save path.
            try:
                self._publish_restore_overlay(staging, target_dir, lease)
                published = True
                if task_id is not None and lease_token is not None and artifact_hash is not None:
                    self.queue_ack(task_id, True, lease_token=lease_token)
            except Exception as exc:
                if published:
                    raise CommitPublishedError(
                        f"Restore was published but durable acknowledgement could not be queued: {exc}") from exc
                raise
        finally:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)

    @staticmethod
    def _validate_component(part: str) -> None:
        stem = part.rstrip(" .").split(".", 1)[0].upper()
        if (not part or part in (".", "..") or part != part.rstrip(" .") or
                re.search(r'[<>:"|?*\x00-\x1f]', part) or stem in RESERVED_NAMES):
            raise ValueError(f"Unsafe Windows filename component: {part!r}")

    def _extract_zip(self, archive_path: Path, destination: Path,
                     lease: Optional[LeaseKeeper] = None) -> None:
        with zipfile.ZipFile(archive_path) as archive:
            infos = archive.infolist()
            if len(infos) > self.max_members:
                raise ValueError("ZIP has too many members")
            validated: list[tuple[zipfile.ZipInfo, tuple[str, ...], bool]] = []
            seen: set[str] = set()
            declared_total = 0
            for info in infos:
                name = info.filename
                if not name or "\x00" in name or "\\" in name or len(name) > self.max_path:
                    raise ValueError(f"Unsafe ZIP member: {name!r}")
                raw_parts = name[:-1].split("/") if name.endswith("/") else name.split("/")
                if any(part in ("", ".") for part in raw_parts):
                    raise ValueError(f"Non-canonical ZIP member path: {name!r}")
                posix, windows = PurePosixPath(name), PureWindowsPath(name)
                parts = tuple(part for part in posix.parts if part not in ("", "."))
                if posix.is_absolute() or windows.is_absolute() or windows.drive or not parts or len(parts) > self.max_depth:
                    raise ValueError(f"Absolute, drive, or deep ZIP member: {name!r}")
                for part in parts:
                    self._validate_component(part)
                key = "/".join(parts).casefold()
                if key in seen:
                    raise ValueError(f"Case-insensitive duplicate ZIP member: {name!r}")
                seen.add(key)
                mode = (info.external_attr >> 16) & 0xFFFF
                if info.flag_bits & 0x1:
                    raise ValueError(f"Encrypted ZIP member is forbidden: {name!r}")
                if (mode & 0o170000) == 0o120000:
                    raise ValueError(f"ZIP symlink is forbidden: {name!r}")
                is_dir = info.is_dir() or (mode & 0o170000) == 0o040000
                if not is_dir and mode and (mode & 0o170000) not in (0, 0o100000):
                    raise ValueError(f"Special ZIP member is forbidden: {name!r}")
                if info.file_size < 0 or info.file_size > self.max_file_bytes:
                    raise ValueError(f"ZIP member exceeds per-file limit: {name!r}")
                declared_total += info.file_size
                if declared_total > self.max_total_bytes:
                    raise ValueError("ZIP exceeds total uncompressed limit")
                if info.file_size and info.compress_size == 0 or info.compress_size and info.file_size / info.compress_size > self.max_ratio:
                    raise ValueError(f"ZIP member compression ratio is excessive: {name!r}")
                validated.append((info, parts, is_dir))
            free = shutil.disk_usage(destination.parent).free
            if free < declared_total:
                raise OSError(f"Insufficient extraction space: need {declared_total} bytes, have {free}")
            actual_total = 0
            for info, parts, is_dir in validated:
                if lease:
                    lease.ensure_owned()
                if self.stop_event.is_set():
                    raise InterruptedError("Restore cancelled during extraction")
                output_path = destination.joinpath(*parts)
                if is_dir:
                    output_path.mkdir(parents=True, exist_ok=True)
                    continue
                output_path.parent.mkdir(parents=True, exist_ok=True)
                written = 0
                # ZipExtFile validates CRC when read through EOF.
                with archive.open(info) as source, output_path.open("xb") as output:
                    while True:
                        if lease:
                            lease.ensure_owned()
                        if self.stop_event.is_set():
                            raise InterruptedError("Restore cancelled during extraction")
                        chunk = source.read(256 * 1024)
                        if not chunk:
                            break
                        written += len(chunk)
                        actual_total += len(chunk)
                        if written > info.file_size or written > self.max_file_bytes or actual_total > self.max_total_bytes:
                            raise ValueError("ZIP expanded beyond declared or configured limits")
                        output.write(chunk)
                if written != info.file_size:
                    raise ValueError(f"ZIP member size mismatch: {info.filename!r}")

    def _load_ack_journal(self) -> list[Dict[str, Any]]:
        if not self.ack_file.exists():
            return []
        try:
            value = json.loads(self.ack_file.read_text(encoding="utf-8"))
            if not isinstance(value, list):
                raise ValueError("root is not a list")
            return [item for item in value[-100:] if self._valid_ack(item)]
        except Exception as exc:
            raise RuntimeError(f"Invalid acknowledgement journal: {exc}") from exc

    def _valid_ack(self, item: Any) -> bool:
        return (isinstance(item, dict) and type(item.get("task_id")) is int and item["task_id"] > 0 and
                type(item.get("success")) is bool and item.get("device_id") == self.device_id and
                isinstance(item.get("lease_token"), str) and bool(item["lease_token"]) and
                len(item["lease_token"]) <= MAX_LEASE_TOKEN_LENGTH)

    def _load_dead_ack_journal(self) -> list[Dict[str, Any]]:
        if not self.dead_ack_file.exists():
            return []
        try:
            value = json.loads(self.dead_ack_file.read_text(encoding="utf-8"))
            if not isinstance(value, list):
                raise ValueError("root is not a list")
            return [item for item in value[-100:] if self._valid_ack(item)]
        except Exception as exc:
            raise RuntimeError(f"Invalid dead-letter acknowledgement journal: {exc}") from exc

    def _save_acks(self) -> None:
        atomic_write(self.ack_file, json.dumps(self.pending_acks, separators=(",", ":")).encode())

    def _save_dead_acks(self) -> None:
        atomic_write(self.dead_ack_file, json.dumps(self.dead_acks[-100:], separators=(",", ":")).encode())

    def queue_ack(self, task_id: int, success: bool, error: Optional[str] = None,
                  lease_token: Optional[str] = None) -> None:
        if not isinstance(lease_token, str) or not lease_token or len(lease_token) > MAX_LEASE_TOKEN_LENGTH:
            raise ValueError("Acknowledgement lease_token is invalid")
        self.pending_acks = [item for item in self.pending_acks if item["task_id"] != task_id or
                             item["lease_token"] != lease_token]
        self.pending_acks.append({"task_id": task_id, "device_id": self.device_id, "success": success,
                                  "error": error[:4000] if error else None, "lease_token": lease_token})
        self._save_acks()

    def retry_acks(self) -> bool:
        for item in list(self.pending_acks):
            try:
                self.report_done(item["task_id"], item["success"], item["lease_token"], item.get("error"))
                self.pending_acks.remove(item)
                self._save_acks()
            except requests.HTTPError as exc:
                if exc.response is not None and exc.response.status_code in (404, 409):
                    self.pending_acks.remove(item)
                    self.dead_acks.append(item)
                    self._save_dead_acks()
                    self._save_acks()
                    logging.warning("Task #%s acknowledgement moved to dead-letter after HTTP %s",
                                    item["task_id"], exc.response.status_code)
                    continue
                logging.warning("Task #%s acknowledgement remains pending: %s", item["task_id"], exc)
                return False
            except Exception as exc:
                logging.warning("Task #%s acknowledgement remains pending: %s", item["task_id"], exc)
                return False
        return True

    def report_done(self, task_id: int, success: bool, lease_token: str,
                    error: Optional[str] = None) -> None:
        self._request(
            "POST",
            "/api/done",
            json={"task_id": task_id, "device_id": self.device_id, "lease_token": lease_token,
                  "success": success, "error": error},
        )

    def process_task(self, task: Dict[str, Any]) -> int:
        allowed = {"id", "game_id", "save_id", "game_name", "device_id", "save_path", "status", "created_at",
                   "claimed_at", "file_url", "file_size", "sha256", "original_filename", "lease_token",
                   "lease_expires_at", "lease_seconds"}
        unknown = set(task) - allowed
        if unknown:
            raise ValueError(f"Task payload has unknown fields: {', '.join(sorted(unknown))}")
        task_id = task.get("id")
        file_url = task.get("file_url")
        save_path = task.get("save_path")
        device_id = task.get("device_id")
        file_size = task.get("file_size")
        sha256 = task.get("sha256")
        original_filename = task.get("original_filename")
        lease_token, _lease_expires_at, lease_seconds, lease_expiry = parse_lease_fields(task)
        if type(task_id) is not int or task_id <= 0:
            raise ValueError("Task id must be a positive integer")
        if not isinstance(file_url, str) or not file_url.strip():
            raise ValueError("Task file_url is required")
        if device_id != self.device_id:
            raise ValueError("Task device_id does not match this agent")
        if not isinstance(save_path, str) or not save_path.strip():
            raise ValueError("Task save_path is required")
        if file_size is not None and (type(file_size) is not int or file_size < 0):
            raise ValueError("Task file_size must be a non-negative integer or null")
        if sha256 is not None and (not isinstance(sha256, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", sha256)):
            raise ValueError("Task sha256 must be a 64-character hex digest or null")
        if original_filename is not None and (not isinstance(original_filename, str) or not original_filename):
            raise ValueError("Task original_filename must be a non-empty string or null")

        self.recover_transactions()
        logging.info(
            "Processing task #%s  game: %s  save_path: %s",
            task_id,
            task.get("game_name"),
            save_path or "(not configured)",
        )

        self.emit(
            "task_processing",
            task_id=task_id,
            game_name=task.get("game_name") or "Unknown game",
            save_path=save_path or "",
        )

        lease = LeaseKeeper(self, task_id, lease_token, lease_seconds, lease_expiry)
        lease.start()
        try:
            with tempfile.TemporaryDirectory(prefix="restore-download-") as tmp_dir:
                tmp_file = Path(tmp_dir) / f"task-{task_id}.bin"
                artifact_hash = self.download_file(file_url.strip(), tmp_file, file_size,
                                                   sha256.lower() if sha256 else None, lease)
                self.apply_restore(tmp_file, save_path, original_filename, lease, task_id,
                                   lease_token, artifact_hash)
        finally:
            lease.stop()

        return task_id

    def run_forever(self) -> None:
        show_startup_banner(self.api_base_url, self.device_id, self.poll_interval)
        logging.info("Agent started. version=%s  device_id=%s  poll=%ss", AGENT_VERSION, self.device_id, self.poll_interval)
        self.check_for_update(force=True)
        self.recover_transactions()

        failures = 0
        try:
            while not self.stop_event.is_set():
                if self.link_refresh_requested.is_set():
                    self.link_refresh_requested.clear()
                    self.start_link_flow(force=True)
                self.check_for_update()
                ack_ok = self.retry_acks()
                heartbeat_ok = self.heartbeat()
                task = self.fetch_task() if ack_ok else None

                if not task:
                    failures = 0 if ack_ok and heartbeat_ok else min(failures + 1, 8)
                    delay = self.poll_interval if not failures else min(300, self.poll_interval * 2 ** failures)
                    delay *= random.uniform(0.75, 1.25)
                    if self.stop_event.wait(delay):
                        break
                    continue

                failures = 0
                self.is_processing = True
                raw_id = task.get("id")
                task_id = raw_id if type(raw_id) is int and raw_id > 0 else 0
                game_name = task.get("game_name") if isinstance(task.get("game_name"), str) else "Unknown game"
                local_success = False
                lease_token = task.get("lease_token") if isinstance(task.get("lease_token"), str) else None
                try:
                    task_id = self.process_task(task)
                    local_success = True
                    # apply_restore durably queues success before returning.
                    logging.info("Task #%s restored locally.", task_id)
                    self.emit("task_completed", task_id=task_id, game_name=game_name)
                    try:
                        self.retry_acks()
                    except Exception as done_exc:
                        logging.warning("Local restore succeeded; acknowledgement is pending: %s", done_exc)
                except CommitPublishedError as exc:
                    local_success = True
                    logging.error("Task #%s committed locally; recovery/acknowledgement remains pending: %s",
                                  task_id, exc)
                    self.emit("warning", message=str(exc))
                except Exception as exc:
                    logging.exception("Task #%s failed", task_id if task_id else "unknown")
                    if not local_success:
                        self.emit("task_failed", task_id=task_id, game_name=game_name, error=str(exc))
                        if task_id:
                            try:
                                if lease_token:
                                    self.queue_ack(task_id, False, str(exc), lease_token)
                                self.retry_acks()
                            except Exception as done_exc:
                                logging.error("Could not journal/report task #%s failure: %s", task_id, done_exc)
                finally:
                    self.is_processing = False
                    if self.stop_event.wait(1):
                        break
        finally:
            self.session.close()
            logging.info("Agent stopped.")


def run_headless() -> None:
    agent = RestoreAgent()
    agent.run_forever()


def main() -> None:
    setup_logging()

    headless = is_headless_mode()
    instance = SingleInstance("Global\\CloudSaveDesktopAgentSingleton")
    if not instance.acquire():
        if headless:
            logging.warning("CloudSave Desktop Agent is already running. Exiting duplicate headless instance.")
        else:
            show_single_instance_notice()
        return

    try:
        if headless:
            run_headless()
            return

        from desktop_ui import DesktopAgentApp

        app = DesktopAgentApp(
            base_dir=_base_dir,
            agent_factory=lambda event_handler, stop_event: RestoreAgent(
                event_handler=event_handler,
                stop_event=stop_event,
            ),
        )
        app.run()
    finally:
        instance.release()


if __name__ == "__main__":
    main()
