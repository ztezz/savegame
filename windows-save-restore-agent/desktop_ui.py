import ctypes
import logging
import math
import os
import queue
import random
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any, Callable, Dict, Optional
from urllib.parse import urlsplit

if os.name == "nt":
    from ctypes import wintypes

    class _MONITORINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("rcMonitor", wintypes.RECT),
            ("rcWork", wintypes.RECT),
            ("dwFlags", wintypes.DWORD),
        ]

    _user32 = ctypes.WinDLL("user32", use_last_error=True)
    _gdi32 = ctypes.WinDLL("gdi32", use_last_error=True)
    _user32.GetParent.argtypes = [wintypes.HWND]
    _user32.GetParent.restype = wintypes.HWND
    _user32.SetWindowRgn.argtypes = [wintypes.HWND, ctypes.c_void_p, wintypes.BOOL]
    _user32.SetWindowRgn.restype = ctypes.c_int
    _user32.MonitorFromWindow.argtypes = [wintypes.HWND, wintypes.DWORD]
    _user32.MonitorFromWindow.restype = wintypes.HANDLE
    _user32.GetMonitorInfoW.argtypes = [wintypes.HANDLE, ctypes.POINTER(_MONITORINFO)]
    _user32.GetMonitorInfoW.restype = wintypes.BOOL
    _gdi32.CreateRoundRectRgn.argtypes = [
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    ]
    _gdi32.CreateRoundRectRgn.restype = ctypes.c_void_p
    _gdi32.DeleteObject.argtypes = [ctypes.c_void_p]
    _gdi32.DeleteObject.restype = wintypes.BOOL

try:
    import tkinter as tk
    import tkinter.font as tkfont
except Exception:
    tk = None  # type: ignore[assignment]
    tkfont = None  # type: ignore[assignment]

try:
    from PIL import Image, ImageDraw
except Exception:
    Image = None  # type: ignore[assignment]
    ImageDraw = None  # type: ignore[assignment]

try:
    import pystray
except Exception:
    pystray = None  # type: ignore[assignment]


AgentEventHandler = Callable[[str, Dict[str, Any]], None]
AgentFactory = Callable[[AgentEventHandler, threading.Event], Any]


def _rounded_polygon(canvas: Any, x1: float, y1: float, x2: float, y2: float,
                     radius: float, **options: Any) -> int:
    radius = max(1.0, min(radius, (x2 - x1) / 2, (y2 - y1) / 2))
    points = (
        x1 + radius, y1, x2 - radius, y1, x2, y1, x2, y1 + radius,
        x2, y2 - radius, x2, y2, x2 - radius, y2, x1 + radius, y2,
        x1, y2, x1, y2 - radius, x1, y1 + radius, x1, y1,
    )
    return canvas.create_polygon(points, smooth=True, splinesteps=24, **options)


if tk is not None:
    class RoundedPanel(tk.Canvas):
        """A real rounded shell whose inset content cannot cover its corners."""

        def __init__(self, parent: Any, *, fill: str, edge: str, radius: int,
                     padding: tuple[int, int], **options: Any) -> None:
            super().__init__(parent, bg=options.pop("outside"), bd=0, highlightthickness=0,
                             takefocus=False, **options)
            self._fill, self._edge = fill, edge
            self._radius = radius
            self._pad_x, self._pad_y = padding
            self._requested_width = self._requested_height = 1
            self.content = tk.Frame(self, bg=fill, bd=0, highlightthickness=0)
            self._window = self.create_window(self._pad_x, self._pad_y, anchor="nw", window=self.content)
            self.bind("<Configure>", self._redraw, add="+")
            self.content.bind("<Configure>", self._content_changed, add="+")

        def _content_changed(self, _event: Any = None) -> None:
            requested_width = self.content.winfo_reqwidth() + self._pad_x * 2
            requested_height = self.content.winfo_reqheight() + self._pad_y * 2
            if (requested_width, requested_height) != (self._requested_width, self._requested_height):
                self._requested_width, self._requested_height = requested_width, requested_height
                super().configure(width=requested_width, height=requested_height)

        def _redraw(self, _event: Any = None) -> None:
            width, height = max(self.winfo_width(), 2), max(self.winfo_height(), 2)
            self.delete("surface")
            _rounded_polygon(self, 1, 1, width - 1, height - 1, self._radius,
                             fill=self._fill, outline=self._edge, width=1, tags="surface")
            self.tag_lower("surface")
            self.coords(self._window, self._pad_x, self._pad_y)
            self.itemconfigure(self._window, width=max(width - self._pad_x * 2, 1),
                               height=max(height - self._pad_y * 2, 1))


    class RoundedButton(tk.Canvas):
        """Keyboard-accessible rounded button with animated pointer feedback."""

        def __init__(self, parent: Any, text: str, command: Callable[[], None], *,
                     colors: tuple[str, str, str, str], foreground: str, disabled_foreground: str,
                     font: tuple[str, int], padding: tuple[int, int], radius: int, edge: str) -> None:
            self._font = tkfont.Font(parent=parent, font=font)
            self._padding = padding
            self._radius, self._edge = radius, edge
            self._normal, self._hover, self._pressed, self._disabled = colors
            self._foreground, self._disabled_foreground = foreground, disabled_foreground
            self._text, self._state, self._command = text, "normal", command
            self._current_color = self._normal
            self._transition_id: Optional[str] = None
            height = self._font.metrics("linespace") + padding[1] * 2
            width = self._font.measure(text) + padding[0] * 2
            super().__init__(parent, width=width, height=height, bg=str(parent.cget("bg")), bd=0,
                             highlightthickness=2, highlightbackground=str(parent.cget("bg")),
                             highlightcolor=edge, takefocus=True, cursor="hand2")
            self.bind("<Configure>", self._draw, add="+")
            self.bind("<Enter>", lambda _event: self._transition(self._hover))
            self.bind("<Leave>", lambda _event: self._transition(self._normal))
            self.bind("<ButtonPress-1>", lambda _event: self._transition(self._pressed))
            self.bind("<ButtonRelease-1>", self._release)
            self.bind("<Return>", lambda _event: self.invoke())
            self.bind("<space>", lambda _event: self.invoke())
            self.bind("<FocusIn>", lambda _event: self._draw())
            self.bind("<FocusOut>", lambda _event: self._draw())
            self._draw()

        @staticmethod
        def _blend(first: str, second: str, amount: float) -> str:
            a, b = int(first[1:], 16), int(second[1:], 16)
            channels = [int(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount)
                        for shift in (16, 8, 0)]
            return "#" + "".join(f"{channel:02x}" for channel in channels)

        def _transition(self, target: str) -> None:
            if self._state == "disabled":
                return
            if self._transition_id is not None:
                self.after_cancel(self._transition_id)
            start = self._current_color

            def step(index: int = 1) -> None:
                self._current_color = self._blend(start, target, index / 4)
                self._draw()
                self._transition_id = self.after(18, step, index + 1) if index < 4 else None
            step()

        def _release(self, event: Any) -> None:
            inside = 0 <= event.x < self.winfo_width() and 0 <= event.y < self.winfo_height()
            self._transition(self._hover if inside else self._normal)
            if inside:
                self.invoke()

        def _draw(self, _event: Any = None) -> None:
            self.delete("all")
            width, height = max(self.winfo_width(), int(self.cget("width"))), max(self.winfo_height(), int(self.cget("height")))
            color = self._disabled if self._state == "disabled" else self._current_color
            edge = self._edge if self.focus_get() == self and self._state != "disabled" else color
            _rounded_polygon(self, 2, 2, width - 2, height - 2, self._radius,
                             fill=color, outline=edge, width=2)
            self.create_text(width / 2, height / 2, text=self._text,
                             fill=self._disabled_foreground if self._state == "disabled" else self._foreground,
                             font=self._font)

        def invoke(self) -> None:
            if self._state != "disabled":
                self._command()

        def configure(self, cnf: Any = None, **kwargs: Any) -> Any:
            if cnf:
                kwargs.update(cnf)
            changed = False
            if "text" in kwargs:
                self._text, changed = str(kwargs.pop("text")), True
            if "state" in kwargs:
                self._state, changed = str(kwargs.pop("state")), True
                self.configure(cursor="arrow" if self._state == "disabled" else "hand2")
            if changed:
                super().configure(width=self._font.measure(self._text) + self._padding[0] * 2)
                self._current_color = self._disabled if self._state == "disabled" else self._normal
                self._draw()
            return super().configure(**kwargs) if kwargs else None

        config = configure

        def cget(self, key: str) -> Any:
            if key == "text":
                return self._text
            if key == "state":
                return self._state
            return super().cget(key)

        def __getitem__(self, key: str) -> Any:
            return self.cget(key)


class DesktopAgentApp:
    MAX_EVENTS_PER_TICK = 50
    MAX_QUEUED_EVENTS = 500
    MAX_LOG_LINES = 150
    MAX_TOASTS = 3

    BG = "#070b12"
    RAIL = "#091522"
    PANEL = "#0d1420"
    CARD = "#111c2a"
    CARD_SOFT = "#152335"
    EDGE = "#20334a"
    TEXT = "#edf7ff"
    MUTED = "#8193a8"
    DIM = "#52657a"
    CYAN = "#42d9ff"
    TEAL = "#42efc3"
    AMBER = "#f6bd60"
    RED = "#ff6b78"
    BLUE = "#69a7ff"

    def __init__(self, base_dir: Path, agent_factory: AgentFactory) -> None:
        if tk is None:
            raise RuntimeError("Tkinter is not available on this machine. Use --headless mode instead.")

        self._enable_dpi_awareness()
        self.base_dir = base_dir
        self.agent_factory = agent_factory
        self.events: "queue.Queue[tuple[str, Dict[str, Any]]]" = queue.Queue(maxsize=self.MAX_QUEUED_EVENTS)
        self.stop_event = threading.Event()
        self.verification_url = ""
        self.api_key = ""
        self.api_base_url = "-"
        self.agent_version = "-"
        self.authenticated = False
        self.window_hidden = False
        self.closing = False
        self.is_syncing = False
        self.link_refresh_pending = False
        self.relay_phase = 0.0
        self.progress_phase = 0.0
        self.status_phase = 0.0
        self.animation_after_id: Optional[str] = None
        self.auto_hide_after_id: Optional[str] = None
        self.copy_feedback_after_id: Optional[str] = None
        self.update_metadata: Optional[Dict[str, Any]] = None
        self.toast_windows: list[Any] = []
        self.tray_icon: Any = None
        self.tray_image: Any = None
        self.tray_thread: Optional[threading.Thread] = None
        self.tray_ready = False
        self.tray_failed = False
        self.is_maximized = False
        self.restore_geometry: Optional[str] = None
        self._drag_offset: Optional[tuple[int, int]] = None
        self._resize_start: Optional[tuple[int, int, int, int]] = None
        self._region_after_id: Optional[str] = None

        self.root = tk.Tk()
        self.root.title("CloudSave | Neural Relay Console")
        self.root.configure(bg=self.BG)
        self.root.overrideredirect(True)
        self.root.protocol("WM_DELETE_WINDOW", self.hide_to_tray)
        self.root.bind("<Alt-F4>", self._hide_shortcut, add="+")
        self.root.bind("<Escape>", self._hide_shortcut, add="+")
        self.root.bind("<Configure>", self._schedule_window_region, add="+")

        icon_path = self.base_dir / "icon.ico"
        if icon_path.exists():
            try:
                self.root.iconbitmap(default=str(icon_path))
            except Exception:
                pass

        self.status_title_var = tk.StringVar(value="ĐANG KHỞI ĐỘNG")
        self.status_message_var = tk.StringVar(value="Đang tạo danh tính thiết bị và chờ nhịp tim đầu tiên.")
        self.device_id_var = tk.StringVar(value="-")
        self.api_key_var = tk.StringVar(value="-")
        self.version_var = tk.StringVar(value="-")
        self.api_url_var = tk.StringVar(value="-")
        self.link_display_var = tk.StringVar(value="Chưa có liên kết đăng nhập")
        self.update_title_var = tk.StringVar(value="")
        self.update_detail_var = tk.StringVar(value="")

        self.build_ui()
        self.center_window()
        self.root.after_idle(self._apply_windows_effects)
        self.start_tray_icon()

        self.agent = self.agent_factory(self.enqueue_event, self.stop_event)
        self.worker_thread = threading.Thread(target=self.agent.run_forever, name="cloudsave-agent", daemon=False)
        self.worker_thread.start()
        self.root.after(120, self.process_events)
        self.animate_console()

    @staticmethod
    def _enable_dpi_awareness() -> None:
        if os.name != "nt":
            return
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                logging.debug("Could not enable Windows DPI awareness", exc_info=True)

    def _apply_windows_effects(self) -> None:
        if os.name != "nt" or self.closing:
            return
        try:
            self.root.update_idletasks()
            hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id()) or self.root.winfo_id()
            dwm = ctypes.windll.dwmapi.DwmSetWindowAttribute
            rounded = ctypes.c_int(2)  # DWMWCP_ROUND
            dwm(hwnd, 33, ctypes.byref(rounded), ctypes.sizeof(rounded))
            dark = ctypes.c_int(1)
            if dwm(hwnd, 20, ctypes.byref(dark), ctypes.sizeof(dark)) != 0:
                dwm(hwnd, 19, ctypes.byref(dark), ctypes.sizeof(dark))
            backdrop = ctypes.c_int(2)  # DWMSBT_MAINWINDOW; ignored before Windows 11 22H2.
            dwm(hwnd, 38, ctypes.byref(backdrop), ctypes.sizeof(backdrop))
        except Exception:
            logging.debug("Windows DWM effects are unavailable", exc_info=True)

    def build_ui(self) -> None:
        self.root.grid_rowconfigure(0, weight=0)
        self.root.grid_rowconfigure(1, weight=1)
        self.root.grid_columnconfigure(0, minsize=202)
        self.root.grid_columnconfigure(1, weight=1, minsize=470)

        chrome_scale = max(float(self.root.tk.call("tk", "scaling")) / (96.0 / 72.0), 1.0)
        icon_size = int(24 * chrome_scale)
        self.title_bar = tk.Frame(self.root, bg="#0a111b", highlightthickness=0)
        self.title_bar.grid(row=0, column=0, columnspan=2, sticky="ew")
        self.title_bar.grid_columnconfigure(2, weight=1)

        self.chrome_icon = tk.Canvas(self.title_bar, width=icon_size, height=icon_size, bg="#0a111b",
                                     bd=0, highlightthickness=0, takefocus=False)
        self.chrome_icon.grid(row=0, column=0, padx=(12, 8), pady=7)
        inset = max(int(2 * chrome_scale), 2)
        _rounded_polygon(self.chrome_icon, inset, inset, icon_size - inset, icon_size - inset,
                         int(7 * chrome_scale), fill="#15364a", outline=self.CYAN)
        self.chrome_icon.create_text(icon_size / 2, icon_size / 2, text="CS", fill=self.TEXT,
                                     font=("Consolas", 7, "bold"))

        title_block = tk.Frame(self.title_bar, bg="#0a111b")
        title_block.grid(row=0, column=1, sticky="w")
        self.chrome_title_label = tk.Label(title_block, text="CloudSave", bg="#0a111b", fg=self.TEXT,
                                           font=("Segoe UI Semibold", 9))
        self.chrome_title_label.pack(side="left")
        self.title_subtitle_var = tk.StringVar(value="  DESKTOP AGENT")
        self.chrome_subtitle_label = tk.Label(title_block, textvariable=self.title_subtitle_var,
                                              bg="#0a111b", fg=self.DIM, font=("Consolas", 7))
        self.chrome_subtitle_label.pack(side="left", padx=(5, 0))

        controls = tk.Frame(self.title_bar, bg="#0a111b")
        controls.grid(row=0, column=3, sticky="e", padx=(4, 8), pady=3)
        self.chrome_minimize_button = self._make_chrome_button(controls, "-", self.hide_to_tray)
        self.chrome_minimize_button.pack(side="left", padx=2)
        self.chrome_maximize_button = self._make_chrome_button(controls, "□", self.toggle_maximize)
        self.chrome_maximize_button.pack(side="left", padx=2)
        self.chrome_close_button = self._make_chrome_button(controls, "x", self.hide_to_tray, close=True)
        self.chrome_close_button.pack(side="left", padx=2)

        for widget in (self.title_bar, self.chrome_icon, title_block,
                       self.chrome_title_label, self.chrome_subtitle_label):
            widget.bind("<ButtonPress-1>", self.start_window_drag, add="+")
            widget.bind("<B1-Motion>", self.drag_window, add="+")
            widget.bind("<ButtonRelease-1>", self.end_window_drag, add="+")
            widget.bind("<Double-Button-1>", self.toggle_maximize, add="+")

        rail = tk.Frame(self.root, bg=self.RAIL, highlightthickness=0)
        rail.grid(row=1, column=0, sticky="nsew")
        rail.grid_rowconfigure(2, weight=1)
        rail.grid_columnconfigure(0, weight=1)

        brand = tk.Frame(rail, bg=self.RAIL, padx=22, pady=22)
        brand.grid(row=0, column=0, sticky="ew")
        tk.Label(brand, text="CLOUDSAVE", bg=self.RAIL, fg=self.TEXT, font=("Segoe UI Semibold", 15)).pack(anchor="w")
        tk.Label(brand, text="NEURAL RELAY CONSOLE", bg=self.RAIL, fg=self.CYAN,
                 font=("Consolas", 8)).pack(anchor="w", pady=(4, 0))
        tk.Frame(rail, bg=self.EDGE, height=1).grid(row=1, column=0, sticky="ew", padx=20)

        self.relay_canvas = tk.Canvas(rail, bg=self.RAIL, highlightthickness=0, bd=0)
        self.relay_canvas.grid(row=2, column=0, sticky="nsew", padx=10, pady=10)
        self.relay_canvas.bind("<Configure>", lambda _event: self.draw_relay())

        rail_meta = tk.Frame(rail, bg=self.RAIL, padx=22, pady=20)
        rail_meta.grid(row=3, column=0, sticky="ew")
        tk.Label(rail_meta, text="RUNTIME", bg=self.RAIL, fg=self.DIM,
                 font=("Consolas", 8)).pack(anchor="w")
        self.rail_version_label = tk.Label(rail_meta, text="VERSION  -", bg=self.RAIL, fg=self.MUTED,
                                           font=("Consolas", 8))
        self.rail_version_label.pack(anchor="w", pady=(6, 0))
        self.rail_api_label = tk.Label(rail_meta, text="API  -", bg=self.RAIL, fg=self.MUTED,
                                       font=("Consolas", 8), wraplength=160, justify="left")
        self.rail_api_label.pack(anchor="w", pady=(4, 0))

        workspace = tk.Frame(self.root, bg=self.BG, padx=22, pady=18)
        workspace.grid(row=1, column=1, sticky="nsew")
        workspace.grid_columnconfigure(0, weight=1)
        workspace.grid_rowconfigure(4, weight=1)

        header = tk.Frame(workspace, bg=self.BG)
        header.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        header.grid_columnconfigure(1, weight=1)
        self.status_dot = tk.Canvas(header, width=22, height=22, bg=self.BG, highlightthickness=0)
        self.status_dot.grid(row=0, column=0, rowspan=2, sticky="n", padx=(0, 10), pady=(2, 0))
        self.status_color = self.AMBER
        self.status_dot_id = self.status_dot.create_oval(7, 7, 15, 15, fill=self.AMBER, outline="")
        tk.Label(header, textvariable=self.status_title_var, bg=self.BG, fg=self.TEXT,
                 font=("Segoe UI Semibold", 14)).grid(row=0, column=1, sticky="w")
        tk.Label(header, textvariable=self.status_message_var, bg=self.BG, fg=self.MUTED,
                 font=("Segoe UI", 9), anchor="w", justify="left", wraplength=480).grid(row=1, column=1, sticky="ew", pady=(3, 0))
        self.progress_canvas = tk.Canvas(header, height=4, bg=self.BG, highlightthickness=0)
        self.progress_canvas.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(9, 0))

        self.update_banner = self.make_card(workspace, fill="#10273a", edge="#24506b", radius=14, padx=13, pady=9)
        self.update_banner.grid(row=1, column=0, sticky="ew", pady=(0, 10))
        update_content = self.update_banner.content
        update_content.grid_columnconfigure(0, weight=1)
        tk.Label(update_content, textvariable=self.update_title_var, bg="#10273a", fg=self.CYAN,
                 font=("Segoe UI Semibold", 9)).grid(row=0, column=0, sticky="w")
        tk.Label(update_content, textvariable=self.update_detail_var, bg="#10273a", fg=self.MUTED,
                 font=("Segoe UI", 8)).grid(row=1, column=0, sticky="w", pady=(2, 0))
        self.update_button = self.make_button(update_content, "Tải bản đã xác minh", self.open_verified_update, compact=True)
        self.update_button.grid(row=0, column=1, rowspan=2, padx=(10, 5))
        self.make_button(update_content, "Bỏ qua", self.dismiss_update, compact=True, quiet=True).grid(row=0, column=2, rowspan=2)
        self.update_banner.grid_remove()

        link_shell = self.make_card(workspace)
        link_shell.grid(row=2, column=0, sticky="ew", pady=(0, 10))
        link_card = link_shell.content
        link_card.grid_columnconfigure(0, weight=1)
        tk.Label(link_card, text="LIÊN KẾT THIẾT BỊ", bg=self.CARD, fg=self.MUTED,
                 font=("Consolas", 8)).grid(row=0, column=0, columnspan=3, sticky="w")
        link_field = self.make_card(link_card, fill=self.CARD_SOFT, edge="#29425d", radius=11, padx=10, pady=7)
        link_field.grid(row=1, column=0, columnspan=3, sticky="ew", pady=(8, 9))
        link_field.content.grid_columnconfigure(0, weight=1)
        self.link_entry = tk.Entry(link_field.content, textvariable=self.link_display_var, state="readonly",
                                   readonlybackground=self.CARD_SOFT, fg=self.TEXT, relief="flat", bd=0,
                                   font=("Consolas", 9), selectbackground="#255a76", selectforeground=self.TEXT)
        self.link_entry.grid(row=0, column=0, sticky="ew")
        self.open_link_button = self.make_button(link_card, "Mở đăng nhập", self.open_verification_url, accent=True, compact=True)
        self.open_link_button.grid(row=2, column=0, sticky="w")
        self.refresh_link_button = self.make_button(link_card, "Tạo liên kết mới", self.refresh_link_flow, compact=True)
        self.refresh_link_button.grid(row=2, column=1, sticky="w", padx=(7, 0))
        self.copy_link_button = self.make_button(link_card, "Sao chép link", self.copy_verification_url, compact=True, quiet=True)
        self.copy_link_button.grid(row=2, column=2, sticky="e", padx=(7, 0))

        info_shell = self.make_card(workspace)
        info_shell.grid(row=3, column=0, sticky="ew", pady=(0, 10))
        info_card = info_shell.content
        for column in range(4):
            info_card.grid_columnconfigure(column, weight=1)
        self.add_info_field(info_card, 0, "DEVICE ID", self.device_id_var)
        self.add_info_field(info_card, 1, "API KEY", self.api_key_var, mono=True)
        self.add_info_field(info_card, 2, "VERSION", self.version_var)
        self.add_info_field(info_card, 3, "API", self.api_url_var)

        log_shell = self.make_card(workspace, padx=3, pady=3, radius=16)
        log_shell.grid(row=4, column=0, sticky="nsew", pady=(0, 10))
        log_card = log_shell.content
        log_card.grid_rowconfigure(1, weight=1)
        log_card.grid_columnconfigure(0, weight=1)
        log_head = tk.Frame(log_card, bg=self.CARD, padx=13, pady=8)
        log_head.grid(row=0, column=0, columnspan=2, sticky="ew")
        tk.Label(log_head, text="ACTIVITY STREAM", bg=self.CARD, fg=self.MUTED,
                 font=("Consolas", 8)).pack(side="left")
        self.make_button(log_head, "Xóa hiển thị", self.clear_log_display, compact=True, quiet=True).pack(side="right")
        self.make_button(log_head, "Sao chép log", self.copy_log, compact=True, quiet=True).pack(side="right", padx=(0, 6))
        self.log_text = tk.Text(log_card, state="disabled", bg="#0a111b", fg="#a9bbcc", insertbackground=self.TEXT,
                                selectbackground="#255a76", selectforeground=self.TEXT, relief="flat", bd=0,
                                font=("Consolas", 8), padx=11, pady=8, wrap="word", height=5, takefocus=True)
        self.log_text.grid(row=1, column=0, sticky="nsew")
        scrollbar = tk.Scrollbar(log_card, command=self.log_text.yview, bg=self.CARD_SOFT,
                                 activebackground=self.CYAN, troughcolor="#0a111b", relief="flat", bd=0)
        scrollbar.grid(row=1, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=scrollbar.set)

        footer = tk.Frame(workspace, bg=self.BG)
        footer.grid(row=5, column=0, sticky="ew")
        tk.Label(footer, text="Khóa luôn được che trên màn hình", bg=self.BG, fg=self.DIM,
                 font=("Segoe UI", 8)).pack(side="left")
        self.tray_button = self.make_button(footer, "Ẩn xuống tray", self.hide_to_tray, compact=True, quiet=True)
        self.tray_button.pack(side="right")
        self.copy_key_button = self.make_button(footer, "Sao chép API key", self.copy_api_key, compact=True)
        self.copy_key_button.pack(side="right", padx=(0, 7))

        grip_size = int(18 * chrome_scale)
        self.resize_grip = tk.Canvas(self.root, width=grip_size, height=grip_size, bg=self.BG, bd=0,
                                     highlightthickness=0, cursor="size_nw_se", takefocus=False)
        self.resize_grip.place(relx=1.0, rely=1.0, anchor="se")
        self.resize_grip.create_line(grip_size * 0.33, grip_size * 0.89,
                                     grip_size * 0.89, grip_size * 0.33, fill=self.DIM, width=1)
        self.resize_grip.create_line(grip_size * 0.61, grip_size * 0.89,
                                     grip_size * 0.89, grip_size * 0.61, fill=self.MUTED, width=1)
        self.resize_grip.bind("<ButtonPress-1>", self.start_window_resize)
        self.resize_grip.bind("<B1-Motion>", self.resize_window)
        self.resize_grip.bind("<ButtonRelease-1>", self.end_window_resize)

        self.append_activity("Neural Relay Console đã được khởi tạo.")

    def _make_chrome_button(self, parent: Any, text: str, command: Callable[[], None],
                            *, close: bool = False) -> Any:
        normal = "#0a111b"
        hover = "#a83246" if close else self.CARD_SOFT
        pressed = "#d04457" if close else "#294760"
        return RoundedButton(parent, text, command,
                             colors=(normal, hover, pressed, normal), foreground=self.TEXT,
                             disabled_foreground=self.DIM, font=("Segoe UI Semibold", 9),
                             padding=(10, 4), radius=11, edge=self.CYAN)

    def _hide_shortcut(self, _event: Any = None) -> str:
        self.hide_to_tray()
        return "break"

    def start_window_drag(self, event: Any) -> None:
        if self.is_maximized:
            geometry = self.restore_geometry or self.root.geometry()
            size = geometry.split("+")[0]
            try:
                width, height = (int(value) for value in size.split("x", 1))
            except ValueError:
                return
            work_left, work_top, work_right, _work_bottom = self._work_area()
            work_width = max(work_right - work_left, 1)
            fraction = min(max((event.x_root - work_left) / work_width, 0.0), 1.0)
            x = event.x_root - int(width * fraction)
            y = max(work_top, event.y_root - max(event.y, 1))
            self.is_maximized = False
            self.chrome_maximize_button.configure(text="□")
            self.resize_grip.place(relx=1.0, rely=1.0, anchor="se")
            self.root.geometry(f"{width}x{height}+{x}+{y}")
        self._drag_offset = (event.x_root - self.root.winfo_x(), event.y_root - self.root.winfo_y())

    def drag_window(self, event: Any) -> None:
        if self._drag_offset is None or self.is_maximized:
            return
        offset_x, offset_y = self._drag_offset
        self.root.geometry(f"+{event.x_root - offset_x}+{event.y_root - offset_y}")

    def end_window_drag(self, _event: Any = None) -> None:
        self._drag_offset = None

    def toggle_maximize(self, _event: Any = None) -> str:
        if self.is_maximized:
            if self.restore_geometry:
                self.root.geometry(self.restore_geometry)
            self.is_maximized = False
            self.chrome_maximize_button.configure(text="□")
            self.resize_grip.place(relx=1.0, rely=1.0, anchor="se")
        else:
            self.root.update_idletasks()
            self.restore_geometry = self.root.geometry()
            left, top, right, bottom = self._work_area()
            self.root.geometry(f"{right - left}x{bottom - top}+{left}+{top}")
            self.is_maximized = True
            self.chrome_maximize_button.configure(text="❐")
            self.resize_grip.place_forget()
        self._schedule_window_region()
        return "break"

    def start_window_resize(self, event: Any) -> None:
        if not self.is_maximized:
            self._resize_start = (event.x_root, event.y_root,
                                  self.root.winfo_width(), self.root.winfo_height())

    def resize_window(self, event: Any) -> None:
        if self._resize_start is None or self.is_maximized:
            return
        start_x, start_y, start_width, start_height = self._resize_start
        _left, _top, right, bottom = self._work_area()
        max_width = max(right - self.root.winfo_x(), 1)
        max_height = max(bottom - self.root.winfo_y(), 1)
        width = min(max(start_width + event.x_root - start_x, self.root.winfo_reqwidth(),
                        self.root.winfo_minwidth()), max_width)
        height = min(max(start_height + event.y_root - start_y, self.root.winfo_reqheight(),
                         self.root.winfo_minheight()), max_height)
        self.root.geometry(f"{width}x{height}")

    def end_window_resize(self, _event: Any = None) -> None:
        self._resize_start = None

    def _schedule_window_region(self, event: Any = None) -> None:
        if self.closing or (event is not None and event.widget is not self.root):
            return
        if self._region_after_id is not None:
            try:
                self.root.after_cancel(self._region_after_id)
            except Exception:
                pass
        self._region_after_id = self.root.after(90, self._apply_window_region)

    def _apply_window_region(self) -> None:
        self._region_after_id = None
        if os.name != "nt" or self.closing or self.window_hidden:
            return
        try:
            self.root.update_idletasks()
            width, height = self.root.winfo_width(), self.root.winfo_height()
            if width <= 1 or height <= 1:
                return
            scale = max(float(self.root.tk.call("tk", "scaling")) / (96.0 / 72.0), 1.0)
            diameter = 1 if self.is_maximized else max(int(14 * scale * 2), 2)
            hwnd = _user32.GetParent(self.root.winfo_id()) or self.root.winfo_id()
            region = _gdi32.CreateRoundRectRgn(0, 0, width + 1, height + 1, diameter, diameter)
            if not region:
                return
            # A successful SetWindowRgn transfers ownership of the region to Windows.
            if not _user32.SetWindowRgn(hwnd, region, True):
                _gdi32.DeleteObject(region)
        except Exception:
            logging.debug("Could not apply rounded window region", exc_info=True)

    def make_card(self, parent: Any, *, padx: int = 13, pady: int = 11, radius: int = 15,
                  fill: Optional[str] = None, edge: Optional[str] = None) -> Any:
        return RoundedPanel(parent, fill=fill or self.CARD, edge=edge or self.EDGE, radius=radius,
                            padding=(padx, pady), outside=str(parent.cget("bg")))

    def add_info_field(self, parent: Any, column: int, label: str, variable: Any, *, mono: bool = False) -> None:
        cell = tk.Frame(parent, bg=self.CARD)
        cell.grid(row=0, column=column, sticky="nsew", padx=(0 if column == 0 else 8, 0))
        tk.Label(cell, text=label, bg=self.CARD, fg=self.DIM, font=("Consolas", 7)).pack(anchor="w")
        tk.Label(cell, textvariable=variable, bg=self.CARD, fg=self.TEXT,
                 font=("Consolas", 8) if mono else ("Segoe UI Semibold", 8),
                 anchor="w", justify="left").pack(anchor="w", pady=(4, 0))

    def make_button(self, parent: Any, text: str, command: Callable[[], None], *, accent: bool = False,
                    compact: bool = False, quiet: bool = False) -> Any:
        bg = self.CYAN if accent else (self.CARD if quiet else self.CARD_SOFT)
        fg = "#04131b" if accent else self.TEXT
        active = "#7be6ff" if accent else "#203a52"
        pressed = "#a0efff" if accent else "#294760"
        return RoundedButton(parent, text, command,
                             colors=(bg, active, pressed, "#111a25"), foreground=fg,
                             disabled_foreground=self.DIM, font=("Segoe UI Semibold", 8 if compact else 9),
                             padding=(11 if compact else 15, 6 if compact else 9),
                             radius=12 if compact else 15, edge=self.CYAN)

    def center_window(self) -> None:
        # Canvas-hosted panels settle from the inside out; allow each nested
        # requested size to propagate before applying physical-pixel geometry.
        for _ in range(4):
            self.root.update_idletasks()
        left, top, right, bottom = self._work_area()
        work_width = max(right - left, 1)
        work_height = max(bottom - top, 1)

        # Tk geometry uses physical pixels while widget/font metrics follow DPI.
        # At 300% scaling, an unscaled 780x590 window clips most of the UI.
        dpi_scale = max(float(self.root.tk.call("tk", "scaling")) / (96.0 / 72.0), 1.0)
        width = height = requested_width = requested_height = 1
        for _ in range(3):
            requested_width = self.root.winfo_reqwidth() + int(12 * dpi_scale)
            requested_height = self.root.winfo_reqheight() + int(12 * dpi_scale)
            width = min(max(int(780 * dpi_scale), requested_width), int(work_width * 0.94))
            height = min(max(int(590 * dpi_scale), requested_height), int(work_height * 0.94))
            x = left + max((right - left - width) // 2, 0)
            y = top + max((bottom - top - height) // 2, 0)
            self.root.geometry(f"{width}x{height}+{x}+{y}")
            self.root.update()

        min_width = min(max(int(680 * dpi_scale), requested_width), width)
        min_height = min(max(int(520 * dpi_scale), requested_height), height)
        self.root.minsize(min_width, min_height)

    def _work_area(self) -> tuple[int, int, int, int]:
        if os.name == "nt":
            try:
                hwnd = _user32.GetParent(self.root.winfo_id()) or self.root.winfo_id()
                monitor = _user32.MonitorFromWindow(hwnd, 2)  # MONITOR_DEFAULTTONEAREST
                info = _MONITORINFO(cbSize=ctypes.sizeof(_MONITORINFO))
                if monitor and _user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
                    return info.rcWork.left, info.rcWork.top, info.rcWork.right, info.rcWork.bottom
                rect = wintypes.RECT()
                if ctypes.windll.user32.SystemParametersInfoW(0x0030, 0, ctypes.byref(rect), 0):
                    return rect.left, rect.top, rect.right, rect.bottom
            except Exception:
                logging.debug("Could not read Windows work area", exc_info=True)
        return 0, 0, self.root.winfo_screenwidth(), self.root.winfo_screenheight()

    def animate_console(self) -> None:
        self.animation_after_id = None
        if self.closing or self.window_hidden:
            return
        self.relay_phase = (self.relay_phase + (0.075 if self.is_syncing else 0.025)) % 1.0
        self.progress_phase = (self.progress_phase + 0.07) % 1.0
        self.status_phase = (self.status_phase + (0.16 if self.is_syncing else 0.07)) % (math.pi * 2)
        self.draw_relay()
        self.draw_progress()
        self.draw_status_dot()
        self.animation_after_id = self.root.after(55 if self.is_syncing else 220, self.animate_console)

    def _ensure_relay_topology(self) -> None:
        if hasattr(self, "_relay_nodes"):
            return

        rng = random.Random(0xC10D5A7E)
        nodes: list[tuple[float, float, float]] = []
        while len(nodes) < 26:
            candidate = (rng.uniform(0.04, 0.96), rng.uniform(0.04, 0.96), rng.random() * math.pi * 2)
            if all(math.hypot(candidate[0] - x, candidate[1] - y) > 0.105 for x, y, _phase in nodes):
                nodes.append(candidate)

        candidates = sorted(
            (math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]), a, b)
            for a in range(len(nodes)) for b in range(a + 1, len(nodes))
        )
        parents = list(range(len(nodes)))

        def root(index: int) -> int:
            while parents[index] != index:
                parents[index] = parents[parents[index]]
                index = parents[index]
            return index

        edges: list[tuple[int, int, float]] = []
        degrees = [0] * len(nodes)
        for distance, first, second in candidates:
            first_root, second_root = root(first), root(second)
            if first_root != second_root:
                parents[first_root] = second_root
                edges.append((first, second, distance))
                degrees[first] += 1
                degrees[second] += 1
        for distance, first, second in candidates:
            if len(edges) >= 48:
                break
            if distance < 0.29 and degrees[first] < 5 and degrees[second] < 5 \
                    and not any(a == first and b == second for a, b, _distance in edges):
                edges.append((first, second, distance))
                degrees[first] += 1
                degrees[second] += 1

        route_candidates = sorted(range(len(edges)), key=lambda i: (
            (nodes[edges[i][0]][1] + nodes[edges[i][1]][1]) / 2,
            (nodes[edges[i][0]][0] + nodes[edges[i][1]][0]) / 2,
        ))
        self._relay_nodes = nodes
        self._relay_edges = edges
        self._relay_packet_edges = tuple(route_candidates[index] for index in range(1, len(route_candidates), 5))
        self._relay_stars = tuple((rng.uniform(0.03, 0.97), rng.uniform(0.02, 0.98), rng.random())
                                  for _ in range(18))

    @staticmethod
    def _relay_curve_point(start: tuple[float, float], control: tuple[float, float],
                           end: tuple[float, float], amount: float) -> tuple[float, float]:
        inverse = 1.0 - amount
        return (inverse * inverse * start[0] + 2 * inverse * amount * control[0] + amount * amount * end[0],
                inverse * inverse * start[1] + 2 * inverse * amount * control[1] + amount * amount * end[1])

    def draw_relay(self) -> None:
        if not hasattr(self, "relay_canvas"):
            return
        self._ensure_relay_topology()
        canvas = self.relay_canvas
        width = max(canvas.winfo_width(), 150)
        height = max(canvas.winfo_height(), 260)
        canvas.delete("all")
        try:
            dpi_scale = max(float(canvas.tk.call("tk", "scaling")) / (96.0 / 72.0), 1.0)
        except Exception:
            dpi_scale = 1.0
        scale = max(1.0, min(dpi_scale, width / 185.0, height / 300.0))
        pad_x = max(8 * scale, width * 0.045)
        mesh_top = max(31 * scale, height * 0.07)
        mesh_bottom = height - max(43 * scale, height * 0.13)
        mesh_width, mesh_height = width - pad_x * 2, mesh_bottom - mesh_top
        glow = (math.sin(self.status_phase) + 1.0) / 2.0
        api_known = bool(self.api_base_url and self.api_base_url != "-")
        connected = bool(self.authenticated)

        def map_point(normalized_x: float, normalized_y: float, phase: float = 0.0) -> tuple[float, float]:
            drift_x = math.sin(self.status_phase * 0.42 + phase) * 1.6 * scale
            drift_y = math.cos(self.status_phase * 0.34 + phase * 1.17) * 2.0 * scale
            return pad_x + normalized_x * mesh_width + drift_x, mesh_top + normalized_y * mesh_height + drift_y

        grid_color = self._blend_color(self.CYAN if connected else self.AMBER, self.RAIL, 0.92)
        for fraction in (0.2, 0.4, 0.6, 0.8):
            grid_x = pad_x + mesh_width * fraction
            grid_y = mesh_top + mesh_height * fraction
            canvas.create_line(grid_x, mesh_top, grid_x, mesh_bottom, fill=grid_color,
                               width=max(1, int(scale * 0.35)), dash=(max(1, int(2 * scale)), max(2, int(7 * scale))))
            canvas.create_line(pad_x, grid_y, width - pad_x, grid_y, fill=grid_color,
                               width=max(1, int(scale * 0.35)), dash=(max(1, int(2 * scale)), max(2, int(7 * scale))))
        for star_x, star_y, intensity in self._relay_stars:
            x, y = map_point(star_x, star_y, intensity * math.pi * 2)
            radius = scale * (0.35 + intensity * 0.45)
            star_color = self._blend_color(self.CYAN, self.RAIL, 0.72 + intensity * 0.18)
            canvas.create_oval(x - radius, y - radius, x + radius, y + radius, fill=star_color, outline="")

        node_positions = [map_point(x, y, phase) for x, y, phase in self._relay_nodes]
        base_edge = self.CYAN if connected else self.AMBER
        for index, (first, second, distance) in enumerate(self._relay_edges):
            edge_amount = min(0.93, 0.72 + distance * 0.55 + (index % 3) * 0.025)
            canvas.create_line(*node_positions[first], *node_positions[second],
                               fill=self._blend_color(base_edge, self.RAIL, edge_amount),
                               width=max(1, int(scale * (0.38 if distance > 0.2 else 0.55))))

        hub_specs = (
            ("API", 0.20, 0.23, api_known, self.CYAN if api_known else self.AMBER),
            ("DEVICE", 0.78, 0.43, connected, self.TEAL if connected else self.AMBER),
            ("SAVE", 0.40, 0.76, self.is_syncing, self.CYAN if self.is_syncing else (self.TEAL if connected else self.DIM)),
        )
        hub_points = [map_point(x, y, index * 2.1) for index, (_label, x, y, _active, _color) in enumerate(hub_specs)]
        controls = (
            (width * 0.58, mesh_top + mesh_height * 0.19),
            (width * 0.72, mesh_top + mesh_height * 0.73),
            (width * 0.13, mesh_top + mesh_height * 0.55),
        )
        route_color = self._blend_color(self.CYAN if connected else self.AMBER, self.RAIL,
                                        0.40 if self.is_syncing else 0.62)
        routes = ((0, 1), (1, 2), (2, 0))
        for route_index, (first, second) in enumerate(routes):
            samples = [self._relay_curve_point(hub_points[first], controls[route_index], hub_points[second], step / 12)
                       for step in range(13)]
            canvas.create_line(*(coordinate for point in samples for coordinate in point), smooth=True,
                               splinesteps=18, fill=route_color,
                               width=max(1, int(scale * (1.15 if self.is_syncing else 0.75))))

        packet_edges = self._relay_packet_edges[:8 if self.is_syncing else (3 if connected else (1 if api_known else 0))]
        packet_color = self.CYAN if connected or self.is_syncing else self.AMBER
        for packet_index, edge_index in enumerate(packet_edges):
            first, second, _distance = self._relay_edges[edge_index]
            amount = (self.relay_phase * (1.45 if self.is_syncing else 0.62) + packet_index * 0.173) % 1.0
            start, end = node_positions[first], node_positions[second]
            packet_x = start[0] + (end[0] - start[0]) * amount
            packet_y = start[1] + (end[1] - start[1]) * amount
            halo = scale * (2.6 if self.is_syncing else 2.0)
            canvas.create_oval(packet_x - halo, packet_y - halo, packet_x + halo, packet_y + halo,
                               fill=self._blend_color(packet_color, self.RAIL, 0.58), outline="")
            core = max(1.0, scale * 0.8)
            canvas.create_oval(packet_x - core, packet_y - core, packet_x + core, packet_y + core,
                               fill=packet_color, outline="")

        node_color = self._blend_color(self.TEAL if connected else self.AMBER, self.RAIL, 0.35)
        for index, (node_x, node_y) in enumerate(node_positions):
            breath = 0.25 * math.sin(self.status_phase * 0.55 + self._relay_nodes[index][2])
            radius = scale * (1.15 + (index % 4) * 0.13 + breath)
            canvas.create_oval(node_x - radius * 2.6, node_y - radius * 2.6,
                               node_x + radius * 2.6, node_y + radius * 2.6,
                               outline=self._blend_color(node_color, self.RAIL, 0.54), width=max(1, int(scale * 0.35)))
            canvas.create_oval(node_x - radius, node_y - radius, node_x + radius, node_y + radius,
                               fill=node_color, outline="")

        hub_radius = 4.5 * scale
        label_gap = 12 * scale
        label_font = ("Consolas", -max(8, int(7.5 * scale)), "bold")
        for index, ((label, _x, _y, active, color), (hub_x, hub_y)) in enumerate(zip(hub_specs, hub_points)):
            pulse = (2.2 * scale * glow) if label == "SAVE" and self.is_syncing else (0.8 * scale * glow if active else 0)
            outer = hub_radius * 2.35 + pulse
            canvas.create_oval(hub_x - outer, hub_y - outer, hub_x + outer, hub_y + outer,
                               outline=self._blend_color(color, self.RAIL, 0.56), width=max(1, int(scale * 0.55)))
            canvas.create_oval(hub_x - hub_radius * 1.45, hub_y - hub_radius * 1.45,
                               hub_x + hub_radius * 1.45, hub_y + hub_radius * 1.45,
                               outline=self._blend_color(color, self.RAIL, 0.25), width=max(1, int(scale * 0.7)))
            canvas.create_oval(hub_x - hub_radius, hub_y - hub_radius, hub_x + hub_radius, hub_y + hub_radius,
                               fill=self._blend_color(color, self.RAIL, 0.18 if active else 0.38), outline="")
            core = max(1.5, 1.45 * scale)
            canvas.create_oval(hub_x - core, hub_y - core, hub_x + core, hub_y + core, fill=color, outline="")
            label_y = hub_y + (label_gap + outer if index == 2 else -(label_gap + outer))
            canvas.create_text(hub_x, label_y, text=label, fill=color if active else self.MUTED,
                               font=label_font, anchor="center")

        title_font = ("Consolas", -max(8, int(7 * scale)), "bold")
        canvas.create_text(width / 2, max(10 * scale, 12), text="RELAY // DATA MESH", fill=self.DIM, font=title_font)
        state = "SYNC STREAM" if self.is_syncing else ("LINK STABLE" if self.authenticated else "AWAITING LINK")
        chip_color = self.CYAN if self.is_syncing else (self.TEAL if connected else self.AMBER)
        chip_width = min(width - 16 * scale, max(82 * scale, len(state) * 5.2 * scale))
        chip_height = 17 * scale
        chip_y = height - max(15 * scale, height * 0.038)
        _rounded_polygon(canvas, width / 2 - chip_width / 2, chip_y - chip_height / 2,
                         width / 2 + chip_width / 2, chip_y + chip_height / 2, chip_height / 2,
                         fill=self._blend_color(chip_color, self.RAIL, 0.84),
                         outline=self._blend_color(chip_color, self.RAIL, 0.48), width=max(1, int(scale * 0.45)))
        canvas.create_text(width / 2, chip_y, text=state, fill=chip_color,
                           font=("Consolas", -max(8, int(7 * scale)), "bold"))

    def draw_progress(self) -> None:
        if not hasattr(self, "progress_canvas"):
            return
        canvas = self.progress_canvas
        width = max(canvas.winfo_width(), 1)
        canvas.delete("all")
        canvas.create_rectangle(0, 1, width, 3, fill="#142131", outline="")
        if self.is_syncing:
            segment = max(70, width // 4)
            x = int((width + segment) * self.progress_phase) - segment
            canvas.create_rectangle(x, 1, x + segment, 3, fill="#24738a", outline="")
            canvas.create_rectangle(x + segment * 0.28, 0, x + segment * 0.72, 4,
                                    fill=self.CYAN, outline="")

    def draw_status_dot(self) -> None:
        if not hasattr(self, "status_dot"):
            return
        canvas = self.status_dot
        canvas.delete("all")
        pulse = (math.sin(self.status_phase) + 1) / 2
        radius = 7 + pulse * (3 if self.is_syncing else 2)
        canvas.create_oval(11 - radius, 11 - radius, 11 + radius, 11 + radius,
                           outline=self._blend_color(self.status_color, self.BG, 0.45), width=1)
        self.status_dot_id = canvas.create_oval(7, 7, 15, 15, fill=self.status_color, outline="")

    @staticmethod
    def _blend_color(first: str, second: str, amount: float) -> str:
        a, b = int(first[1:], 16), int(second[1:], 16)
        values = [int(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount)
                  for shift in (16, 8, 0)]
        return "#" + "".join(f"{value:02x}" for value in values)

    def enqueue_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        item = (str(event_type), dict(payload))
        try:
            self.events.put_nowait(item)
        except queue.Full:
            try:
                self.events.get_nowait()
            except queue.Empty:
                pass
            try:
                self.events.put_nowait(item)
            except queue.Full:
                logging.warning("Desktop UI event queue remained full; dropped %s", event_type)

    def process_events(self) -> None:
        for _ in range(self.MAX_EVENTS_PER_TICK):
            try:
                event_type, payload = self.events.get_nowait()
            except queue.Empty:
                break
            try:
                self.handle_event(event_type, payload)
            except Exception:
                logging.exception("Desktop UI event handler failed for %s", event_type)
        if not self.closing:
            self.root.after(150, self.process_events)

    def handle_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        if event_type == "_tray_ready":
            self.tray_ready, self.tray_failed = True, False
            self.append_activity("Biểu tượng khay hệ thống đã sẵn sàng.")
            return
        if event_type == "_tray_failed":
            self.tray_ready, self.tray_failed = False, True
            self.append_activity(f"Không thể khởi động tray: {self._bounded(payload.get('error'))}")
            return
        if event_type == "_tray_stopped":
            self.tray_ready = False
            return
        if event_type == "_tray_show":
            self.show_window()
            return
        if event_type == "_tray_open_verification":
            self.open_verification_url()
            return
        if event_type == "_refresh_link":
            self.refresh_link_flow()
            return
        if event_type == "_tray_exit":
            self.quit_app()
            return

        if event_type == "key_ready":
            self.device_id_var.set(self._bounded(payload.get("device_id", "-"), 48))
            self.api_key = str(payload.get("api_key", "")).strip()
            self.api_key_var.set(self.mask_api_key(self.api_key))
            self.agent_version = self._bounded(payload.get("version", "-"), 24)
            self.api_base_url = self._bounded(payload.get("api_base_url", "-"), 120)
            self.version_var.set(self.agent_version)
            self.api_url_var.set(self._display_host(self.api_base_url))
            self.title_subtitle_var.set(f"  VERSION {self.agent_version}")
            self.rail_version_label.configure(text=f"VERSION  {self.agent_version}")
            self.rail_api_label.configure(text=f"API  {self._display_host(self.api_base_url)}")
            if payload.get("is_new"):
                self.set_status("KHÓA ĐÃ SẴN SÀNG", "Hoàn tất đăng nhập để liên kết thiết bị này.", "warning")
                self.append_activity("Đã tạo danh tính thiết bị mới; đang chờ liên kết.")
            else:
                self.set_status("ĐANG KIỂM TRA", "Đang xác minh liên kết hiện tại với máy chủ.", "info")
                self.append_activity("Đã nạp danh tính thiết bị hiện có.")
            return

        if event_type == "link_required":
            self.cancel_auto_hide()
            self.authenticated = False
            self.is_syncing = False
            self.verification_url = str(payload.get("verification_url", "")).strip()
            self.link_display_var.set(self.shorten_url(self.verification_url) if self.verification_url else "Không nhận được liên kết hợp lệ")
            self._set_link_waiting(False)
            self.set_status("CẦN ĐĂNG NHẬP", "Mở liên kết và hoàn tất xác thực thiết bị trong trình duyệt.", "warning")
            self.append_activity("Phiên liên kết mới đã sẵn sàng.")
            self.show_window()
            self.show_toast("Yêu cầu đăng nhập", "Hoàn tất liên kết thiết bị trong trình duyệt.", tone="warning")
            return

        if event_type == "authenticated":
            self.authenticated = True
            self.is_syncing = False
            self.verification_url = ""
            self.link_display_var.set("Thiết bị đã xác thực; không cần liên kết")
            self._set_link_waiting(False)
            self.set_status("RELAY ĐÃ KẾT NỐI", "Agent đang theo dõi tác vụ khôi phục trong nền.", "success")
            self.append_activity("Xác thực thành công; relay đang hoạt động.")
            self.show_toast("CloudSave hoạt động", "Thiết bị đã kết nối và đang chạy trong tray.", tone="success")
            self.cancel_auto_hide()
            self.auto_hide_after_id = self.root.after(900, self.auto_hide_authenticated)
            return

        if event_type == "update_available":
            metadata = self.validated_update_metadata(payload)
            if metadata is None:
                logging.warning("UI ignored invalid update metadata")
                return
            self.update_metadata = metadata
            size_mb = metadata["size"] / 1024 / 1024
            self.update_title_var.set(f"Bản cập nhật {metadata['latest_version']} đã sẵn sàng")
            self.update_detail_var.set(f"Hiện tại {metadata['current_version']}  |  {size_mb:.1f} MB  |  SHA-256 verified")
            self.update_button.configure(state="normal")
            self.update_banner.grid()
            self.append_activity(f"Đã xác minh metadata bản cập nhật {metadata['latest_version']}.")
            return

        if event_type == "task_processing":
            game = self._bounded(payload.get("game_name", "Game không xác định"), 80)
            self.is_syncing = True
            self.set_status("ĐANG KHÔI PHỤC", f"Đang truyền save cho {game}. Vui lòng giữ agent hoạt động.", "info")
            self.append_activity(f"Bắt đầu tác vụ khôi phục: {game}.")
            self._restart_animation()
            return
        if event_type == "task_completed":
            game = self._bounded(payload.get("game_name", "Game không xác định"), 80)
            self.is_syncing = False
            self.set_status("RELAY ĐÃ KẾT NỐI", "Khôi phục hoàn tất; agent tiếp tục chờ tác vụ mới.", "success")
            self.append_activity(f"Khôi phục thành công: {game}.")
            self.show_toast("Đồng bộ thành công", f"{game} đã được khôi phục.", tone="success")
            return
        if event_type == "task_failed":
            game = self._bounded(payload.get("game_name", "Game không xác định"), 80)
            error = self._bounded(payload.get("error", "Lỗi không xác định"), 240)
            self.is_syncing = False
            self.set_status("RELAY GẶP LỖI", f"Không thể khôi phục {game}. Xem activity stream.", "danger")
            self.append_activity(f"Khôi phục thất bại: {game}: {error}")
            self.show_toast("Đồng bộ thất bại", f"{game}: {error}", tone="danger")
            return
        if event_type == "warning":
            self._set_link_waiting(False)
            self.append_activity(f"Cảnh báo: {self._bounded(payload.get('message', 'Unknown warning'), 240)}")

    def set_status(self, title: str, message: str, tone: str) -> None:
        self.status_title_var.set(title)
        self.status_message_var.set(self._bounded(message, 220))
        colors = {"success": self.TEAL, "danger": self.RED, "info": self.CYAN, "warning": self.AMBER}
        self.status_color = colors.get(tone, self.MUTED)
        self.draw_status_dot()
        self.draw_relay()
        self.draw_progress()

    def append_activity(self, message: str) -> None:
        entry = f"[{time.strftime('%H:%M:%S')}] {self._bounded(message, 400)}\n"
        self.log_text.configure(state="normal")
        self.log_text.insert("end", entry)
        line_count = int(self.log_text.index("end-1c").split(".")[0])
        if line_count > self.MAX_LOG_LINES:
            self.log_text.delete("1.0", f"{line_count - self.MAX_LOG_LINES + 1}.0")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def clear_log_display(self) -> None:
        self.log_text.configure(state="normal")
        self.log_text.delete("1.0", "end")
        self.log_text.configure(state="disabled")

    def copy_log(self) -> None:
        content = self.log_text.get("1.0", "end-1c")
        if content:
            self._set_clipboard(content)
            self.show_toast("Đã sao chép", "Activity stream đã được sao chép.", tone="info")

    def copy_api_key(self) -> None:
        if not self.api_key:
            self.show_toast("Chưa có khóa", "API key chưa sẵn sàng.", tone="warning")
            return
        self._set_clipboard(self.api_key)
        if self.copy_feedback_after_id is not None:
            try:
                self.root.after_cancel(self.copy_feedback_after_id)
            except Exception:
                pass
        self.copy_key_button.configure(text="Đã sao chép")
        self.copy_feedback_after_id = self.root.after(1800, self._restore_copy_button)
        self.append_activity("API key đã được sao chép an toàn; khóa vẫn được che trong giao diện.")

    def _restore_copy_button(self) -> None:
        self.copy_feedback_after_id = None
        if not self.closing:
            self.copy_key_button.configure(text="Sao chép API key")

    def _set_clipboard(self, value: str) -> None:
        try:
            self.root.clipboard_clear()
            self.root.clipboard_append(value)
            self.root.update_idletasks()
        except tk.TclError as exc:
            self.append_activity(f"Không thể truy cập clipboard: {self._bounded(exc)}")
            self.show_toast("Clipboard đang bận", "Windows chưa cho phép sao chép. Hãy thử lại.", tone="warning")

    def open_verification_url(self) -> None:
        if not self.verification_url:
            self.show_toast("Chưa có liên kết", "Hãy tạo liên kết đăng nhập mới.", tone="warning")
            return
        if not self.is_valid_verification_url(self.verification_url):
            self.append_activity("Đã chặn URL đăng nhập không thuộc allowlist.")
            self.show_toast("Liên kết bị chặn", "URL không thuộc miền CloudSave hợp lệ.", tone="danger")
            return
        webbrowser.open(self.verification_url)
        self.append_activity("Đã mở liên kết đăng nhập trong trình duyệt.")

    def copy_verification_url(self) -> None:
        if self.verification_url and self.is_valid_verification_url(self.verification_url):
            self._set_clipboard(self.verification_url)
            self.show_toast("Đã sao chép", "Liên kết đăng nhập đã được sao chép.", tone="info")

    def refresh_link_flow(self) -> None:
        if self.link_refresh_pending:
            return
        self.cancel_auto_hide()
        self.verification_url = ""
        self.link_display_var.set("Đang yêu cầu phiên đăng nhập mới...")
        self._set_link_waiting(True)
        self.append_activity("Đang yêu cầu một phiên liên kết mới.")
        try:
            self.agent.refresh_link_flow()
        except Exception as exc:
            self._set_link_waiting(False)
            self.append_activity(f"Không thể yêu cầu liên kết: {self._bounded(exc)}")

    def _set_link_waiting(self, waiting: bool) -> None:
        self.link_refresh_pending = waiting
        self.refresh_link_button.configure(state="disabled" if waiting else "normal")

    @staticmethod
    def is_valid_verification_url(url: str) -> bool:
        try:
            parsed = urlsplit(url)
            return (parsed.scheme.lower() == "https" and parsed.hostname is not None
                    and parsed.hostname.lower() in {"api.luugame.fun", "luugame.fun", "www.luugame.fun"}
                    and parsed.username is None and parsed.password is None and parsed.port in (None, 443))
        except ValueError:
            return False

    @staticmethod
    def validated_update_metadata(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        current = str(payload.get("current_version", "?")).strip()
        latest = str(payload.get("latest_version", "?")).strip()
        download_url = str(payload.get("download_url", "")).strip()
        sha256 = str(payload.get("sha256", "")).strip()
        size = payload.get("size")
        try:
            parsed = urlsplit(download_url)
            valid = (parsed.scheme == "https" and parsed.hostname == "api.luugame.fun"
                     and parsed.username is None and parsed.password is None and parsed.port in (None, 443)
                     and parsed.path == f"/api/agent/download/{sha256}"
                     and not parsed.query and not parsed.fragment and len(sha256) == 64
                     and all(char in "0123456789abcdef" for char in sha256)
                     and type(size) is int and size > 0)
        except ValueError:
            valid = False
        if not valid:
            return None
        return {"current_version": current, "latest_version": latest, "download_url": download_url,
                "sha256": sha256, "size": size}

    def open_verified_update(self) -> None:
        metadata = self.validated_update_metadata(self.update_metadata or {})
        if metadata is None or metadata != self.update_metadata:
            self.update_button.configure(state="disabled")
            self.append_activity("Metadata cập nhật không còn hợp lệ; thao tác tải đã bị chặn.")
            return
        webbrowser.open(metadata["download_url"])
        self.append_activity("Đã mở tải xuống bản cập nhật đã xác minh.")

    def dismiss_update(self) -> None:
        self.update_metadata = None
        self.update_button.configure(state="disabled")
        self.update_banner.grid_remove()

    @staticmethod
    def mask_api_key(api_key: str) -> str:
        if not api_key:
            return "-"
        if len(api_key) <= 4:
            return "•" * len(api_key)
        return f"{'•' * min(12, len(api_key) - 4)}{api_key[-4:]}"

    @staticmethod
    def shorten_url(url: str, limit: int = 58) -> str:
        if len(url) <= limit:
            return url
        return f"{url[:limit - 15]}...{url[-12:]}"

    @staticmethod
    def _display_host(url: str) -> str:
        try:
            return urlsplit(url).netloc or url
        except ValueError:
            return "-"

    @staticmethod
    def _bounded(value: Any, limit: int = 320) -> str:
        text = " ".join(str(value).split())
        return text if len(text) <= limit else text[:limit - 3] + "..."

    def cancel_auto_hide(self) -> None:
        if self.auto_hide_after_id is not None:
            try:
                self.root.after_cancel(self.auto_hide_after_id)
            except Exception:
                pass
            self.auto_hide_after_id = None

    def auto_hide_authenticated(self) -> None:
        self.auto_hide_after_id = None
        if self.authenticated:
            self.hide_to_tray(silent=True)

    def _restart_animation(self) -> None:
        if not self.window_hidden and self.animation_after_id is None:
            self.animate_console()

    def show_window(self) -> None:
        self.cancel_auto_hide()
        self.window_hidden = False
        self.root.deiconify()
        self.root.overrideredirect(True)
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(250, lambda: self.root.attributes("-topmost", False) if not self.closing else None)
        self.root.after_idle(self._apply_windows_effects)
        self._schedule_window_region()
        self._restart_animation()

    def hide_to_tray(self, silent: bool = False) -> None:
        if self.closing:
            return
        if not self.tray_ready:
            reason = "tray chưa sẵn sàng" if not self.tray_failed else "tray không khởi động được"
            self.append_activity(f"Không thể ẩn cửa sổ vì {reason}.")
            return
        self.cancel_auto_hide()
        self.window_hidden = True
        if self.animation_after_id is not None:
            try:
                self.root.after_cancel(self.animation_after_id)
            except Exception:
                pass
            self.animation_after_id = None
        self.root.withdraw()
        if not silent:
            self.append_activity("Cửa sổ đã ẩn xuống khay hệ thống.")
            self.show_toast("Chạy trong tray", "CloudSave vẫn hoạt động trong nền.", tone="info")

    def build_tray_image(self) -> Any:
        icon_path = self.base_dir / "icon.ico"
        if Image and icon_path.exists():
            try:
                with Image.open(icon_path) as source:
                    return source.copy()
            except Exception:
                pass
        if not Image or not ImageDraw:
            return None
        image = Image.new("RGBA", (64, 64), self.BG)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((8, 10, 56, 54), radius=18, fill="#173153")
        draw.ellipse((16, 22, 36, 42), fill=self.TEAL)
        draw.ellipse((28, 18, 48, 38), fill=self.CYAN)
        draw.rounded_rectangle((16, 30, 48, 42), radius=10, fill="#f7fafc")
        return image

    def start_tray_icon(self) -> None:
        if pystray is None:
            self.tray_failed = True
            self.append_activity("pystray không khả dụng; cửa sổ sẽ luôn hiển thị.")
            return
        tray_image = self.build_tray_image()
        if tray_image is None:
            self.tray_failed = True
            self.append_activity("Không thể tạo hình ảnh tray; cửa sổ sẽ luôn hiển thị.")
            return
        menu = pystray.Menu(
            pystray.MenuItem("Mở CloudSave", lambda icon, item: self.enqueue_event("_tray_show", {})),
            pystray.MenuItem("Mở trang đăng nhập", lambda icon, item: self.enqueue_event("_tray_open_verification", {})),
            pystray.MenuItem("Thoát", lambda icon, item: self.enqueue_event("_tray_exit", {})),
        )
        self.tray_image = tray_image
        try:
            self.tray_icon = pystray.Icon("cloudsave-agent", self.tray_image, "CloudSave Desktop Agent", menu)
        except Exception as exc:
            self.tray_failed = True
            self.tray_image.close()
            self.tray_image = None
            self.append_activity(f"Không thể tạo tray: {self._bounded(exc)}")
            logging.exception("Could not create tray icon")
            return
        self.tray_thread = threading.Thread(target=self.run_tray_icon, name="cloudsave-tray", daemon=False)
        self.tray_thread.start()

    def run_tray_icon(self) -> None:
        try:
            def mark_ready(icon: Any) -> None:
                icon.visible = True
                self.enqueue_event("_tray_ready", {})
            self.tray_icon.run(setup=mark_ready)
        except Exception as exc:
            logging.exception("Tray icon failed")
            self.enqueue_event("_tray_failed", {"error": str(exc)})
        finally:
            self.enqueue_event("_tray_stopped", {})

    def show_toast(self, title: str, message: str, *, tone: str) -> None:
        while len(self.toast_windows) >= self.MAX_TOASTS:
            oldest = self.toast_windows.pop(0)
            try:
                oldest.destroy()
            except Exception:
                pass
        colors = {"success": self.TEAL, "danger": self.RED, "warning": self.AMBER, "info": self.CYAN}
        stripe = colors.get(tone, self.CYAN)
        toast = tk.Toplevel(self.root)
        toast.overrideredirect(True)
        toast.attributes("-topmost", True)
        toast.configure(bg=self.CARD)
        frame = tk.Frame(toast, bg=self.CARD, padx=13, pady=11, highlightthickness=1, highlightbackground=self.EDGE)
        frame.pack(fill="both", expand=True)
        tk.Frame(frame, bg=stripe, width=4).pack(side="left", fill="y", padx=(0, 11))
        body = tk.Frame(frame, bg=self.CARD)
        body.pack(side="left", fill="both", expand=True)
        tk.Label(body, text=self._bounded(title, 48), bg=self.CARD, fg=stripe,
                 font=("Segoe UI Semibold", 10)).pack(anchor="w")
        tk.Label(body, text=self._bounded(message, 180), bg=self.CARD, fg=self.TEXT, font=("Segoe UI", 9),
                 wraplength=270, justify="left").pack(anchor="w", pady=(4, 0))
        toast.update_idletasks()
        left, top, right, bottom = self._work_area()
        dpi_scale = max(float(self.root.tk.call("tk", "scaling")) / (96.0 / 72.0), 1.0)
        width = min(max(int(330 * dpi_scale), frame.winfo_reqwidth() + int(8 * dpi_scale)),
                    int((right - left) * 0.42))
        height = max(int(78 * dpi_scale), frame.winfo_reqheight() + int(2 * dpi_scale))
        offset = len(self.toast_windows) * (height + 9)
        x = max(left, right - width - 16)
        y = max(top, bottom - height - 16 - offset)
        toast.geometry(f"{width}x{height}+{x}+{y}")
        toast.after_idle(lambda window=toast: self._round_toast(window))
        self.toast_windows.append(toast)

        def cleanup(window: Any = toast) -> None:
            if window in self.toast_windows:
                self.toast_windows.remove(window)
            try:
                if window.winfo_exists():
                    window.destroy()
            except Exception:
                pass
        toast.after(4200, cleanup)

    @staticmethod
    def _round_toast(toast: Any) -> None:
        if os.name != "nt":
            return
        try:
            hwnd = ctypes.windll.user32.GetParent(toast.winfo_id()) or toast.winfo_id()
            rounded = ctypes.c_int(2)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(
                hwnd, 33, ctypes.byref(rounded), ctypes.sizeof(rounded)
            )
        except Exception:
            logging.debug("Could not round toast window", exc_info=True)

    def quit_app(self) -> None:
        if self.closing:
            return
        self.closing = True
        self.cancel_auto_hide()
        if self._region_after_id is not None:
            try:
                self.root.after_cancel(self._region_after_id)
            except Exception:
                pass
            self._region_after_id = None
        if self.animation_after_id is not None:
            try:
                self.root.after_cancel(self.animation_after_id)
            except Exception:
                pass
            self.animation_after_id = None
        self.stop_event.set()
        if self.tray_icon is not None:
            try:
                self.tray_icon.stop()
            except Exception:
                logging.exception("Could not stop tray icon cleanly")
        self.wait_for_shutdown()

    def wait_for_shutdown(self) -> None:
        worker_alive = self.worker_thread.is_alive()
        tray_alive = self.tray_thread is not None and self.tray_thread.is_alive()
        if worker_alive or tray_alive:
            self.root.after(100, self.wait_for_shutdown)
            return
        if self.tray_image is not None:
            try:
                self.tray_image.close()
            except Exception:
                logging.debug("Could not close tray image", exc_info=True)
            self.tray_image = None
        self.tray_icon = None
        self.root.destroy()

    def run(self) -> None:
        try:
            self.root.mainloop()
        finally:
            self.stop_event.set()
            if self.tray_icon is not None:
                try:
                    self.tray_icon.stop()
                except Exception:
                    logging.debug("Could not stop tray icon during final cleanup", exc_info=True)
            if self.worker_thread.is_alive():
                self.worker_thread.join()
            if self.tray_thread is not None and self.tray_thread.is_alive():
                self.tray_thread.join()
