import logging
import os
import re
import secrets
import shutil
import socket
import sys
import tempfile
import threading
import time
import webbrowser
import zipfile
import ctypes
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import requests
from dotenv import load_dotenv

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
_logs_dir = _base_dir / "logs"
load_dotenv(dotenv_path=_env_path, override=True)

if getattr(sys.stdout, "encoding", None) and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

CONSOLE = Console() if Console else None
AgentEventHandler = Callable[[str, Dict[str, Any]], None]
ERROR_ALREADY_EXISTS = 183


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
    handlers: list[logging.Handler] = [logging.FileHandler(_logs_dir / "agent.log", encoding="utf-8")]

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


def merge_directories(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        target = dst / item.name
        if item.is_dir():
            merge_directories(item, target)
        else:
            shutil.copy2(item, target)


def extract_zip_safely(archive: zipfile.ZipFile, destination: Path) -> None:
    destination_resolved = destination.resolve()
    for member in archive.infolist():
        member_path = (destination / member.filename).resolve()
        try:
            member_path.relative_to(destination_resolved)
        except ValueError as exc:
            raise ValueError(f"Archive member escapes target directory: {member.filename}") from exc
    archive.extractall(destination)


def load_or_generate_key(key_file: Path) -> tuple[str, bool]:
    if key_file.exists():
        key = key_file.read_text(encoding="utf-8").strip()
        if key:
            return key, False
    key = secrets.token_hex(32)
    key_file.write_text(key, encoding="utf-8")
    return key, True


def is_headless_mode() -> bool:
    return "--headless" in sys.argv or os.getenv("AGENT_HEADLESS", "").strip().lower() in {"1", "true", "yes"}


class SingleInstance:
    def __init__(self, name: str) -> None:
        self.name = name
        self.handle: Any = None

    def acquire(self) -> bool:
        if os.name != "nt":
            return True

        kernel32 = ctypes.windll.kernel32
        self.handle = kernel32.CreateMutexW(None, False, self.name)
        if not self.handle:
            return True

        last_error = kernel32.GetLastError()
        return last_error != ERROR_ALREADY_EXISTS

    def release(self) -> None:
        if os.name != "nt" or not self.handle:
            return

        kernel32 = ctypes.windll.kernel32
        kernel32.CloseHandle(self.handle)
        self.handle = None


def show_single_instance_notice() -> None:
    message = "CloudSave Desktop Agent da dang chay. Hay mo tu tray icon hien co."
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
        self.api_base_url = os.getenv("API_BASE_URL", "https://thzi-luugame.hf.space").rstrip("/")
        self.device_id = socket.gethostname()
        self.poll_interval = max(1, env_int("POLL_INTERVAL_SECONDS", 5))
        self.request_timeout = max(5, env_int("REQUEST_TIMEOUT_SECONDS", 30))
        self.event_handler = event_handler
        self.stop_event = stop_event or threading.Event()

        key_file = _base_dir / "agent.key"
        self.api_key, is_new_key = load_or_generate_key(key_file)
        self.link_started = False
        self.authenticated_once = False

        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"ApiKey {self.api_key}"})
        self.is_processing = False

        self.emit(
            "key_ready",
            device_id=self.device_id,
            api_key=self.api_key,
            api_base_url=self.api_base_url,
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

    def start_link_flow(self) -> None:
        if self.link_started:
            return

        try:
            response = self._request(
                "POST",
                "/api/device-links/start",
                json={"device_name": self.device_id, "api_key": self.api_key},
            )
            payload = response.json() or {}

            if payload.get("already_linked"):
                return

            verification_url = str(payload.get("verification_url", "")).strip()
            if not verification_url:
                logging.warning("Link flow did not return verification URL")
                self.emit("warning", message="Link flow did not return a verification URL.")
                return

            self.link_started = True
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

            opened = webbrowser.open(verification_url)
            if not opened:
                logging.warning("Could not auto-open browser. Open URL manually: %s", verification_url)
        except Exception as exc:
            logging.warning("Could not start link flow: %s", exc)
            self.emit("warning", message=f"Could not start login flow: {exc}")

    def _request(self, method: str, path: str, **kwargs: Any) -> requests.Response:
        response = self.session.request(
            method,
            f"{self.api_base_url}{path}",
            timeout=self.request_timeout,
            **kwargs,
        )
        response.raise_for_status()
        return response

    def heartbeat(self) -> None:
        try:
            self._request("POST", "/api/sync/heartbeat", json={"deviceName": self.device_id})
            if not self.authenticated_once:
                self.authenticated_once = True
                self.emit("authenticated", linked_via_browser=self.link_started)

            if self.link_started:
                logging.info("Device linked successfully. Agent is now authenticated.")
                self.link_started = False
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                self.authenticated_once = False
                self.start_link_flow()
            else:
                logging.warning("Heartbeat failed: %s", exc)
                self.emit("warning", message=f"Heartbeat failed: {exc}")
        except Exception as exc:
            logging.warning("Heartbeat failed: %s", exc)
            self.emit("warning", message=f"Heartbeat failed: {exc}")

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

    def download_file(self, file_url: str, destination: Path) -> None:
        with self.session.get(file_url, stream=True, timeout=self.request_timeout) as response:
            response.raise_for_status()
            with destination.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 256):
                    if chunk:
                        output.write(chunk)

    def resolve_target_dir(self, save_path: Optional[str]) -> Path:
        default_dir = _base_dir / "restored_saves"

        if not save_path:
            default_dir.mkdir(parents=True, exist_ok=True)
            logging.warning(
                "No save path configured for this game. Writing to default folder: %s\n"
                "To set the correct path: Web UI > Library > Edit game > fill in save path.",
                default_dir,
            )
            return default_dir

        raw_path = save_path.strip()
        expanded_path = os.path.expanduser(os.path.expandvars(raw_path))

        if re.search(r"%[^%]+%", expanded_path):
            fallback_dir = default_dir / "invalid_target_path"
            fallback_dir.mkdir(parents=True, exist_ok=True)
            logging.error(
                "Configured save path contains unresolved environment variables: %s. Falling back to: %s\n"
                "Fix path in Web UI > Library > Edit game.",
                raw_path,
                fallback_dir,
            )
            return fallback_dir

        requested_dir = Path(expanded_path)

        try:
            if requested_dir.drive and not Path(f"{requested_dir.drive}\\").exists():
                raise FileNotFoundError(f"Drive {requested_dir.drive} is not available")

            requested_dir.mkdir(parents=True, exist_ok=True)
            return requested_dir
        except Exception as exc:
            fallback_dir = default_dir / "invalid_target_path"
            fallback_dir.mkdir(parents=True, exist_ok=True)
            logging.error(
                "Configured save path is not accessible: %s (%s). Falling back to: %s\n"
                "Fix path in Web UI > Library > Edit game.",
                requested_dir,
                exc,
                fallback_dir,
            )
            return fallback_dir

    def apply_restore(self, archive_path: Path, save_path: Optional[str]) -> None:
        target_dir = self.resolve_target_dir(save_path)

        if zipfile.is_zipfile(archive_path):
            with tempfile.TemporaryDirectory(prefix="restore-unzip-") as unzip_dir:
                unzip_path = Path(unzip_dir)
                with zipfile.ZipFile(archive_path, "r") as zf:
                    extract_zip_safely(zf, unzip_path)
                merge_directories(unzip_path, target_dir)
        else:
            shutil.copy2(archive_path, target_dir / archive_path.name)

    def report_done(self, task_id: int, success: bool, error: Optional[str] = None) -> None:
        self._request(
            "POST",
            "/api/done",
            json={"task_id": task_id, "device_id": self.device_id, "success": success, "error": error},
        )

    def process_task(self, task: Dict[str, Any]) -> int:
        task_id = int(task.get("id", 0))
        file_url = str(task.get("file_url", "")).strip()
        save_path: Optional[str] = task.get("save_path") or None

        if task_id <= 0 or not file_url:
            raise ValueError("Invalid task payload")

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

        with tempfile.TemporaryDirectory(prefix="restore-download-") as tmp_dir:
            tmp_file = Path(tmp_dir) / f"task-{task_id}.bin"
            self.download_file(file_url, tmp_file)
            self.apply_restore(tmp_file, save_path)

        return task_id

    def run_forever(self) -> None:
        show_startup_banner(self.api_base_url, self.device_id, self.poll_interval)
        logging.info("Agent started. device_id=%s  poll=%ss", self.device_id, self.poll_interval)

        while not self.stop_event.is_set():
            self.heartbeat()
            task = self.fetch_task()

            if not task:
                if self.stop_event.wait(self.poll_interval):
                    break
                continue

            self.is_processing = True
            task_id = 0
            game_name = task.get("game_name") or "Unknown game"
            try:
                task_id = self.process_task(task)
                self.report_done(task_id, True)
                logging.info("Task #%s done.", task_id)
                self.emit(
                    "task_completed",
                    task_id=task_id,
                    game_name=game_name,
                )
            except Exception as exc:
                logging.exception("Task #%s failed", task_id if task_id > 0 else "unknown")
                self.emit(
                    "task_failed",
                    task_id=task_id,
                    game_name=game_name,
                    error=str(exc),
                )
                if task_id > 0:
                    try:
                        self.report_done(task_id, False, str(exc))
                    except Exception as done_exc:
                        logging.error("Could not report task #%s result: %s", task_id, done_exc)
                else:
                    logging.error("Skipping report_done because task payload has invalid id")
            finally:
                self.is_processing = False
                if self.stop_event.wait(1):
                    break

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
