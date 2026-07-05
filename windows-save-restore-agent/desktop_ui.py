import ctypes
import logging
import os
import queue
import random
import threading
import time
import webbrowser
from pathlib import Path
from typing import Any, Callable, Dict, Optional

try:
    import tkinter as tk
except Exception:
    tk = None  # type: ignore[assignment]

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


class DesktopAgentApp:
    BG = "#07101b"
    CARD = "#17191f"
    CARD_SOFT = "#20242c"
    CARD_EDGE = "#2a3444"
    CARD_EDGE_SOFT = "#202938"
    TEXT = "#f5f8fc"
    TEXT_MUTED = "#9da9bb"
    ACCENT = "#23b3d6"
    ACCENT_STRONG = "#1497bc"
    WARNING = "#ffbf66"
    DANGER = "#ff7b7b"
    INFO = "#6ec1ff"
    NODE = "#69d8ff"
    NODE_ALT = "#33e1c7"
    LINE = "#16324f"

    def __init__(self, base_dir: Path, agent_factory: AgentFactory) -> None:
        if tk is None:
            raise RuntimeError("Tkinter is not available on this machine. Use --headless mode instead.")

        self.base_dir = base_dir
        self.agent_factory = agent_factory

        self.root = tk.Tk()
        self.root.title("CloudSave Desktop Agent")
        self.root.geometry("400x580")
        self.root.configure(bg=self.BG)
        self.root.protocol("WM_DELETE_WINDOW", self.hide_to_tray)
        self.root.overrideredirect(True)

        icon_path = self.base_dir / "icon.ico"
        if icon_path.exists():
            try:
                self.root.iconbitmap(default=str(icon_path))
            except Exception:
                pass

        self.events: "queue.Queue[tuple[str, Dict[str, Any]]]" = queue.Queue()
        self.stop_event = threading.Event()
        self.verification_url = ""
        self.authenticated = False
        self.window_hidden = False
        self.closing = False
        self.tray_icon: Any = None
        self.tray_thread: Optional[threading.Thread] = None
        self.toast_windows: list[Any] = []
        self.neuron_nodes: list[Dict[str, float]] = []
        self.drag_offset_x = 0
        self.drag_offset_y = 0
        self.window_corner_radius = 42
        self.background_phase = 0.0
        self.status_pulse_phase = 0.0
        self.is_syncing = False
        self.signal_rings: list[Dict[str, float]] = []

        self.status_badge_var = tk.StringVar(value="Chuẩn bị")
        self.status_message_var = tk.StringVar(value="Đang tạo khóa thiết bị cục bộ và chờ nhịp tim đầu tiên.")
        self.device_id_var = tk.StringVar(value="-")
        self.api_key_var = tk.StringVar(value="-")
        self.link_hint_var = tk.StringVar(value="Nút đăng nhập trình duyệt sẽ xuất hiện ở đây khi cần liên kết thiết bị.")
        self.last_event_var = tk.StringVar(value="Agent đang khởi động.")

        self.build_ui()
        self.center_window()
        self.apply_window_shape()
        self.start_tray_icon()

        self.agent = self.agent_factory(self.enqueue_event, self.stop_event)
        self.worker_thread = threading.Thread(target=self.agent.run_forever, name="cloudsave-agent", daemon=True)
        self.worker_thread.start()

        self.root.after(160, self.process_events)

    def build_ui(self) -> None:
        self.background_canvas = tk.Canvas(self.root, bg=self.BG, highlightthickness=0, bd=0)
        self.background_canvas.place(relx=0, rely=0, relwidth=1, relheight=1)

        shell = tk.Frame(self.root, bg=self.BG)
        shell.place(relx=0, rely=0, relwidth=1, relheight=1)

        card = tk.Frame(shell, bg=self.CARD, padx=16, pady=12, highlightthickness=1, highlightbackground=self.CARD_EDGE_SOFT)
        card.place(relx=0.5, rely=0.5, anchor="center", relwidth=0.86, relheight=0.88)
        self.card = card

        title_bar = tk.Frame(card, bg=self.CARD, height=42)
        title_bar.pack(fill="x", pady=(0, 12))
        title_bar.pack_propagate(False)
        title_bar.bind("<ButtonPress-1>", self.start_window_drag)
        title_bar.bind("<B1-Motion>", self.perform_window_drag)

        title_left = tk.Frame(title_bar, bg=self.CARD)
        title_left.pack(side="left", fill="y")
        title_left.bind("<ButtonPress-1>", self.start_window_drag)
        title_left.bind("<B1-Motion>", self.perform_window_drag)

        tk.Label(
            title_left,
            text="CloudSave",
            bg=self.CARD,
            fg=self.TEXT,
            font=("Segoe UI Semibold", 11),
        ).pack(side="left", padx=(2, 10))
        tk.Label(
            title_left,
            text="Agent Tray",
            bg=self.CARD,
            fg=self.TEXT_MUTED,
            font=("Segoe UI", 9),
        ).pack(side="left")

        window_actions = tk.Frame(title_bar, bg=self.CARD)
        window_actions.pack(side="right")
        self.make_icon_button(window_actions, "_", self.hide_to_tray).pack(side="left", padx=(0, 6))
        self.make_icon_button(window_actions, "X", self.quit_app, danger=True).pack(side="left")

        header = tk.Frame(card, bg=self.CARD)
        header.pack(fill="x", pady=(12, 0))

        tk.Label(
            header,
            text="CLOUDSAVE",
            bg=self.CARD,
            fg=self.TEXT,
            font=("Segoe UI Black", 32),
        ).pack(anchor="center")
        tk.Label(
            header,
            text="Tray sync agent cho Windows",
            bg=self.CARD,
            fg=self.TEXT_MUTED,
            font=("Segoe UI", 10),
            wraplength=280,
            justify="center",
        ).pack(anchor="center", pady=(8, 20))

        status_row = tk.Frame(card, bg=self.CARD)
        status_row.pack(fill="x")
        self.badge_label = tk.Label(
            status_row,
            textvariable=self.status_badge_var,
            bg=self.WARNING,
            fg="#2f1d00",
            font=("Segoe UI Semibold", 11),
            padx=12,
            pady=6,
        )
        self.badge_label.pack(anchor="center")

        tk.Label(
            card,
            textvariable=self.status_message_var,
            bg=self.CARD,
            fg=self.TEXT,
            font=("Segoe UI", 11),
            wraplength=280,
            justify="center",
        ).pack(anchor="center", pady=(14, 14))

        content = tk.Frame(card, bg=self.CARD)
        content.pack(fill="both", expand=True)

        self.device_panel = self.create_field_block(content, "THIẾT BỊ", self.device_id_var)
        self.device_panel.pack(fill="x", pady=(0, 10))
        self.key_panel = self.create_field_block(content, "API KEY", self.api_key_var, monospace=True)
        self.key_panel.pack(fill="x", pady=(0, 10))
        self.event_panel = self.create_field_block(content, "TRẠNG THÁI GẦN NHẤT", self.last_event_var)
        self.event_panel.pack(fill="x", pady=(0, 14))

        self.link_button = self.make_button(content, "MỞ ĐĂNG NHẬP", self.open_verification_url, accent=True)
        self.link_button.pack(fill="x")

        utility_row = tk.Frame(content, bg=self.CARD)
        utility_row.pack(fill="x", pady=(10, 0))
        self.copy_button = self.make_button(utility_row, "Sao chép khóa", self.copy_api_key)
        self.copy_button.pack(side="left", fill="x", expand=True)
        self.tray_button = self.make_button(utility_row, "Ẩn tray", self.hide_to_tray)
        self.tray_button.pack(side="left", fill="x", expand=True, padx=(8, 0))

        tk.Label(
            card,
            textvariable=self.link_hint_var,
            bg=self.CARD,
            fg=self.TEXT_MUTED,
            font=("Segoe UI", 10),
            wraplength=285,
            justify="center",
        ).pack(anchor="center", pady=(16, 8))

        self.log_label = tk.Label(
            card,
            text="Agent is starting.",
            bg=self.CARD,
            fg=self.TEXT_MUTED,
            font=("Segoe UI", 9),
            wraplength=285,
            justify="center",
            anchor="center",
        )
        self.log_label.pack(fill="x", pady=(0, 4))

        self.root.bind("<Configure>", self.on_root_resize)
        self.initialize_neuron_field()
        self.animate_neuron_field()

        self.append_activity("Shell desktop đã được khởi tạo.")

    def create_field_block(self, parent: Any, label: str, value_var: Any, *, monospace: bool = False) -> Any:
        row = tk.Frame(parent, bg=self.CARD_SOFT, padx=14, pady=10, highlightthickness=1, highlightbackground=self.CARD_EDGE)
        tk.Label(
            row,
            text=label,
            bg=self.CARD_SOFT,
            fg=self.TEXT_MUTED,
            font=("Segoe UI", 9),
        ).pack(anchor="w")
        tk.Label(
            row,
            textvariable=value_var,
            bg=self.CARD_SOFT,
            fg=self.TEXT,
            font=("Consolas", 11) if monospace else ("Segoe UI Semibold", 11),
            wraplength=250,
            justify="left",
        ).pack(anchor="w", pady=(6, 0))
        return row

    def make_button(
        self,
        parent: Any,
        text: str,
        command: Callable[[], None],
        *,
        accent: bool = False,
        danger: bool = False,
    ) -> Any:
        bg = self.CARD_SOFT
        fg = self.TEXT
        hover_bg = "#20314b"
        if accent:
            bg = self.ACCENT
            fg = "#062111"
            hover_bg = self.ACCENT_STRONG
        elif danger:
            bg = self.DANGER
            fg = "white"
            hover_bg = "#ec5353"

        button = tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=hover_bg,
            activeforeground=fg,
            relief="flat",
            bd=0,
            padx=14,
            pady=12,
            cursor="hand2",
            font=("Segoe UI Semibold", 10),
        )
        button.bind("<Enter>", lambda _event, ref=button, color=hover_bg: ref.configure(bg=color))
        button.bind("<Leave>", lambda _event, ref=button, color=bg: ref.configure(bg=color))
        return button

    def make_icon_button(self, parent: Any, text: str, command: Callable[[], None], *, danger: bool = False) -> Any:
        bg = self.CARD_SOFT if not danger else self.DANGER
        fg = self.TEXT if not danger else "white"
        hover_bg = "#20314b" if not danger else "#ec5353"
        button = tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=hover_bg,
            activeforeground=fg,
            relief="flat",
            bd=0,
            width=3,
            pady=6,
            cursor="hand2",
            font=("Segoe UI Semibold", 10),
        )
        button.bind("<Enter>", lambda _event, ref=button: ref.configure(bg=hover_bg))
        button.bind("<Leave>", lambda _event, ref=button: ref.configure(bg=bg))
        return button

    def start_window_drag(self, event: Any) -> None:
        self.drag_offset_x = event.x_root - self.root.winfo_x()
        self.drag_offset_y = event.y_root - self.root.winfo_y()

    def perform_window_drag(self, event: Any) -> None:
        x = event.x_root - self.drag_offset_x
        y = event.y_root - self.drag_offset_y
        self.root.geometry(f"+{x}+{y}")

    def initialize_neuron_field(self) -> None:
        self.neuron_nodes = []
        for i in range(34):
            self.neuron_nodes.append(
                {
                    "x": random.uniform(0.08, 0.92),
                    "y": random.uniform(0.12, 0.88),
                    "dx": random.uniform(-0.00075, 0.00075),
                    "dy": random.uniform(-0.00065, 0.00065),
                    "r": random.uniform(1.4, 3.2),
                    "glow": random.uniform(0.6, 1.0),
                    "pulse": random.uniform(0, 6.28),
                }
            )
        self.signal_rings = [
            {"x": 0.18, "y": 0.24, "phase": 0.0, "speed": 0.008, "color": self.NODE},
            {"x": 0.78, "y": 0.72, "phase": 0.38, "speed": 0.006, "color": self.NODE_ALT},
            {"x": 0.52, "y": 0.46, "phase": 0.72, "speed": 0.005, "color": self.INFO},
        ]

    def on_root_resize(self, _event: Any) -> None:
        if hasattr(self, "background_canvas"):
            self.draw_neuron_field()
        self.apply_window_shape()

    def center_window(self) -> None:
        self.root.update_idletasks()
        width = self.root.winfo_width() or 380
        height = self.root.winfo_height() or 560
        screen_width = self.root.winfo_screenwidth()
        screen_height = self.root.winfo_screenheight()
        x = max((screen_width - width) // 2, 0)
        y = max((screen_height - height) // 2, 0)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def apply_window_shape(self) -> None:
        if os.name != "nt":
            return

        try:
            self.root.update_idletasks()
            width = max(self.root.winfo_width(), 1)
            height = max(self.root.winfo_height(), 1)
            radius = min(self.window_corner_radius, width // 3, height // 3)

            gdi32 = ctypes.windll.gdi32
            user32 = ctypes.windll.user32
            region = gdi32.CreateRoundRectRgn(0, 0, width + 1, height + 1, radius, radius)
            user32.SetWindowRgn(self.root.winfo_id(), region, True)
        except Exception:
            logging.debug("Could not apply rounded window shape", exc_info=True)

    def animate_neuron_field(self) -> None:
        if self.closing:
            return

        self.background_phase += 0.012
        self.status_pulse_phase += 0.08

        for node in self.neuron_nodes:
            node["x"] += node["dx"]
            node["y"] += node["dy"]
            node["pulse"] += 0.04

            if node["x"] <= 0.04 or node["x"] >= 0.96:
                node["dx"] *= -1
                node["x"] = max(0.04, min(0.96, node["x"]))
            if node["y"] <= 0.08 or node["y"] >= 0.92:
                node["dy"] *= -1
                node["y"] = max(0.08, min(0.92, node["y"]))

        for ring in self.signal_rings:
            ring["phase"] = (ring["phase"] + ring["speed"]) % 1.0

        self.draw_neuron_field()
        self.update_status_pulse()
        self.root.after(42, self.animate_neuron_field)

    def draw_neuron_field(self) -> None:
        canvas = self.background_canvas
        width = max(canvas.winfo_width(), 1)
        height = max(canvas.winfo_height(), 1)
        canvas.delete("all")

        canvas.create_rectangle(0, 0, width, height, fill=self.BG, outline="")

        # Moving deep glow layers keep the desktop shell alive without stealing focus.
        glow_colors = ["#0d1728", "#10233c", "#123250", "#0f4154", "#14566c", "#0f766e"]
        for glow_index, color in enumerate(glow_colors):
            phase = self.background_phase + glow_index * 0.72
            drift_x = self._sin_approx(phase) * width * 0.08
            drift_y = self._sin_approx(phase * 0.72) * height * 0.05
            pad_x = 36 + glow_index * 30
            pad_y = 84 + glow_index * 24
            canvas.create_oval(
                -pad_x + drift_x,
                height * 0.50 - pad_y + drift_y,
                width + pad_x + drift_x,
                height + pad_y + drift_y,
                fill=color,
                outline="",
            )

        # Slow signal rings give the background an active sync-console feel.
        for ring in self.signal_rings:
            center_x = ring["x"] * width
            center_y = ring["y"] * height
            for layer in range(3):
                progress = (ring["phase"] + layer * 0.28) % 1.0
                radius = 24 + progress * 170
                opacity = 1.0 - progress
                color = self._blend_color(str(ring["color"]), self.BG, opacity * 0.42)
                canvas.create_oval(
                    center_x - radius,
                    center_y - radius,
                    center_x + radius,
                    center_y + radius,
                    outline=color,
                    width=1,
                )

        # Subtle moving scan lines.
        scan_offset = int((self.background_phase * 220) % 28)
        for y in range(-scan_offset, height + 28, 28):
            canvas.create_line(0, y, width, y + 10, fill="#0d2236", width=1)

        # Curved data routes.
        arc_shift = int((self.background_phase * 18) % 30)
        for index in range(12):
            inset = 20 + index * 13
            opacity_level = max(0.22, 0.95 - index * 0.07)
            line_color = self._blend_color(self.LINE, "#07101b", opacity_level)
            canvas.create_arc(
                -width * 0.48,
                -height * 0.28 + inset + arc_shift,
                width * 1.24,
                height * 0.76 + inset,
                start=6,
                extent=132,
                style="arc",
                outline=line_color,
                width=1,
            )

        # Draw connection lines between nearby nodes
        max_distance = 0.25
        for i, node1 in enumerate(self.neuron_nodes):
            for j, node2 in enumerate(self.neuron_nodes):
                if j <= i:
                    continue
                dx = node1["x"] - node2["x"]
                dy = node1["y"] - node2["y"]
                distance = (dx * dx + dy * dy) ** 0.5
                if distance < max_distance:
                    x1 = node1["x"] * width
                    y1 = node1["y"] * height
                    x2 = node2["x"] * width
                    y2 = node2["y"] * height
                    opacity = 1.0 - (distance / max_distance)
                    line_alpha = int(opacity * 80)
                    line_color = f"#{line_alpha:02x}{line_alpha + 60:02x}{line_alpha + 100:02x}"
                    canvas.create_line(x1, y1, x2, y2, fill=line_color, width=1, smooth=True)

        # Draw nodes with glow halos
        for index, node in enumerate(self.neuron_nodes):
            x = node["x"] * width
            y = node["y"] * height
            base_radius = node["r"]
            glow_intensity = node["glow"]
            pulse_offset = abs(0.2 * (1 + 0.4 * abs(self._sin_approx(node["pulse"]))))
            radius = base_radius * (1 + pulse_offset)
            
            color = self.NODE if index % 3 != 0 else self.NODE_ALT
            
            # Multi-layer glow halo
            halo_layers = [
                (radius * 5.5, f"#{self._hex_alpha(color, 0.08)}"),
                (radius * 4.2, f"#{self._hex_alpha(color, 0.15)}"),
                (radius * 3.0, f"#{self._hex_alpha(color, 0.25)}"),
                (radius * 2.0, f"#{self._hex_alpha(color, 0.4)}"),
                (radius * 1.3, f"#{self._hex_alpha(color, 0.7)}"),
            ]
            
            for halo_radius, halo_color in halo_layers:
                canvas.create_oval(
                    x - halo_radius, y - halo_radius,
                    x + halo_radius, y + halo_radius,
                    fill=halo_color, outline=""
                )
            
            # Core node
            canvas.create_oval(
                x - radius, y - radius,
                x + radius, y + radius,
                fill=color, outline=""
            )
            
            # Bright center
            bright_radius = radius * 0.5
            canvas.create_oval(
                x - bright_radius, y - bright_radius,
                x + bright_radius, y + bright_radius,
                fill="#ffffff", outline=""
            )

    def _sin_approx(self, x: float) -> float:
        """Fast sine approximation for animation."""
        import math
        return math.sin(x)

    def _blend_color(self, color1: str, color2: str, ratio: float) -> str:
        """Blend two hex colors."""
        c1 = int(color1[1:], 16)
        c2 = int(color2[1:], 16)
        r1, g1, b1 = (c1 >> 16) & 0xff, (c1 >> 8) & 0xff, c1 & 0xff
        r2, g2, b2 = (c2 >> 16) & 0xff, (c2 >> 8) & 0xff, c2 & 0xff
        r = int(r1 * ratio + r2 * (1 - ratio))
        g = int(g1 * ratio + g2 * (1 - ratio))
        b = int(b1 * ratio + b2 * (1 - ratio))
        return f"#{r:02x}{g:02x}{b:02x}"

    def _hex_alpha(self, color: str, alpha: float) -> str:
        """Apply alpha to a hex color (returns hex string without #)."""
        c = int(color[1:], 16)
        r, g, b = (c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff
        r = int(r * alpha)
        g = int(g * alpha)
        b = int(b * alpha)
        return f"{r:02x}{g:02x}{b:02x}"

    def enqueue_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        self.events.put((event_type, payload))

    def process_events(self) -> None:
        while True:
            try:
                event_type, payload = self.events.get_nowait()
            except queue.Empty:
                break
            self.handle_event(event_type, payload)

        if not self.closing:
            self.root.after(180, self.process_events)

    def handle_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        if event_type == "key_ready":
            self.device_id_var.set(str(payload.get("device_id", "-")))
            self.api_key_var.set(str(payload.get("api_key", "-")))

            if payload.get("is_new"):
                self.set_status("Khóa sẵn sàng", "Tạo khóa xong. Hoàn tất bước đăng nhập trên trình duyệt để agent chạy ẩn.", tone="warning")
                self.link_hint_var.set("Đây là một khóa thiết bị hoàn toàn mới. Hãy giữ cửa sổ này mở cho đến khi luồng đăng nhập trình duyệt hoàn tất.")
                self.append_activity("Khóa thiết bị mới đã được tạo và chờ luồng liên kết.")
            else:
                self.set_status("Đang kiểm tra", "Đang kiểm tra trạng thái liên kết của thiết bị với máy chủ.", tone="info")
                self.link_hint_var.set("Khóa hiện tại đã được phát hiện. Agent đang kiểm tra xem thiết bị này đã được liên kết chưa.")
                self.append_activity("Đã tải khóa thiết bị hiện tại từ agent.key.")
            return

        if event_type == "link_required":
            self.verification_url = str(payload.get("verification_url", "")).strip()
            self.set_status("Yêu cầu đăng nhập", "Trình duyệt đã được mở. Sau khi đăng nhập thành công, cửa sổ này sẽ tự ẩn xuống tray.", tone="warning")
            self.link_hint_var.set(self.verification_url or "Không thể xác định URL đăng nhập.")
            self.append_activity("Luồng đăng nhập trình duyệt đã bắt đầu để liên kết thiết bị.")
            self.show_window()
            self.show_toast("Yêu cầu đăng nhập", "Vui lòng hoàn tất luồng đăng nhập thiết bị trong trình duyệt.", tone="warning")
            return

        if event_type == "authenticated":
            self.authenticated = True
            self.set_status("Đã kết nối", "Thiết bị đã xác thực. Agent đang chạy nền trong tray và sẽ tự xử lý khôi phục.", tone="success")
            self.link_hint_var.set("Xác thực hoàn tất. Bạn có thể đóng cửa sổ; biểu tượng tray sẽ giữ agent hoạt động.")
            self.append_activity("Xác thực thành công. Chế độ tray hiện đang hoạt động.")
            message = "Đăng nhập thành công. CloudSave hiện đang chạy trong khay hệ thống."
            if not payload.get("linked_via_browser"):
                message = "Thiết bị đã được liên kết. CloudSave đang chạy trong khay hệ thống."
            self.show_toast("CloudSave hoạt động", message, tone="success")
            self.root.after(900, lambda: self.hide_to_tray(silent=True))
            return

        if event_type == "task_processing":
            game_name = str(payload.get("game_name", "Game không xác định"))
            self.set_status("Đang đồng bộ", f"Đang khôi phục save cho {game_name}.", tone="info")
            self.append_activity(f"Đang xử lý tác vụ khôi phục cho {game_name}.")
            return

        if event_type == "task_completed":
            game_name = str(payload.get("game_name", "Game không xác định"))
            self.set_status("Đã kết nối", "Khôi phục thành công. Agent tiếp tục theo dõi lệnh mới trong nền.", tone="success")
            self.append_activity(f"Khôi phục thành công cho {game_name}.")
            self.show_toast("Đồng bộ thành công", f"{game_name} đã được khôi phục thành công.", tone="success")
            return

        if event_type == "task_failed":
            game_name = str(payload.get("game_name", "Game không xác định"))
            error = str(payload.get("error", "Lỗi không xác định"))
            self.set_status("Lỗi đồng bộ", f"Khôi phục save cho {game_name} thất bại. Xem nhật ký để biết chi tiết.", tone="danger")
            self.append_activity(f"Khôi phục thất bại cho {game_name}: {error}")
            self.show_toast("Đồng bộ thất bại", f"{game_name}: {error}", tone="danger")
            return

        if event_type == "warning":
            message = str(payload.get("message", "Unknown warning"))
            self.append_activity(message)
            return

    def set_status(self, badge: str, message: str, *, tone: str) -> None:
        self.status_badge_var.set(badge)
        self.status_message_var.set(message)
        
        # Track syncing state for pulse animation
        self.is_syncing = (tone == "info" and "Đang đồng bộ" in badge)

        if tone == "success":
            bg = self.ACCENT
            fg = "#062111"
        elif tone == "danger":
            bg = self.DANGER
            fg = "white"
        elif tone == "info":
            bg = self.INFO
            fg = "#04213f"
        else:
            bg = self.WARNING
            fg = "#2f1d00"
        self.badge_label.configure(bg=bg, fg=fg)

    def update_status_pulse(self) -> None:
        """Animate status badge when syncing."""
        if not self.is_syncing or self.closing:
            return
        
        try:
            import math
            pulse = 0.85 + 0.15 * abs(math.sin(self.status_pulse_phase))
            # Apply subtle scale effect through padding variation
            padding = int(6 + 2 * abs(math.sin(self.status_pulse_phase * 0.5)))
            self.badge_label.configure(pady=padding)
        except Exception:
            pass

    def append_activity(self, message: str) -> None:
        timestamp = time.strftime("%H:%M:%S")
        entry = f"[{timestamp}] {message}"
        self.last_event_var.set(entry)
        self.log_label.configure(text=entry)

    def copy_api_key(self) -> None:
        api_key = self.api_key_var.get().strip()
        if not api_key or api_key == "-":
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(api_key)
        self.root.update_idletasks()
        self.append_activity("Khóa API đã được sao chép vào bộ nhớ tạm.")
        self.show_toast("Đã sao chép", "Khóa API đã được sao chép vào bộ nhớ tạm.", tone="info")

    def open_verification_url(self) -> None:
        if not self.verification_url:
            self.append_activity("URL đăng nhập chưa có.")
            return
        webbrowser.open(self.verification_url)
        self.append_activity("Đã mở trang đăng nhập trình duyệt theo cách thủ công.")

    def show_window(self) -> None:
        self.window_hidden = False
        self.root.deiconify()
        self.root.overrideredirect(True)
        self.center_window()
        self.apply_window_shape()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(250, lambda: self.root.attributes("-topmost", False))

    def hide_to_tray(self, silent: bool = False) -> None:
        if self.closing:
            return
        if self.tray_icon is None:
            try:
                self.root.overrideredirect(False)
                self.root.iconify()
            except Exception:
                self.root.withdraw()
            return

        self.window_hidden = True
        self.root.withdraw()
        if not silent:
            self.append_activity("Cửa sổ đã ẩn vào khay hệ thống.")
            self.show_toast("Chạy trong tray", "CloudSave vẫn hoạt động trong khay hệ thống.", tone="info")

    def build_tray_image(self) -> Any:
        icon_path = self.base_dir / "icon.ico"
        if Image and icon_path.exists():
            try:
                return Image.open(icon_path)
            except Exception:
                pass

        if not Image or not ImageDraw:
            return None

        image = Image.new("RGBA", (64, 64), self.BG)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((8, 10, 56, 54), radius=18, fill="#173153")
        draw.ellipse((16, 22, 36, 42), fill="#5fdba7")
        draw.ellipse((28, 18, 48, 38), fill="#72b9ff")
        draw.rounded_rectangle((16, 30, 48, 42), radius=10, fill="#f7fafc")
        draw.rounded_rectangle((28, 34, 40, 48), radius=6, fill="#5fdba7")
        return image

    def start_tray_icon(self) -> None:
        if pystray is None:
            self.append_activity("pystray không khả dụng. Ứng dụng sẽ ở dạng cửa sổ bình thường.")
            return

        tray_image = self.build_tray_image()
        if tray_image is None:
            self.append_activity("Hình ảnh tray không thể được tạo. Ứng dụng sẽ ở dạng cửa sổ bình thường.")
            return

        menu = pystray.Menu(
            pystray.MenuItem("Mở CloudSave", lambda icon, item: self.root.after(0, self.show_window)),
            pystray.MenuItem("Mở trang đăng nhập", lambda icon, item: self.root.after(0, self.open_verification_url)),
            pystray.MenuItem("Thoát", lambda icon, item: self.root.after(0, self.quit_app)),
        )
        self.tray_icon = pystray.Icon("cloudsave-agent", tray_image, "CloudSave Desktop Agent", menu)
        self.tray_thread = threading.Thread(target=self.tray_icon.run, name="cloudsave-tray", daemon=True)
        self.tray_thread.start()

    def show_toast(self, title: str, message: str, *, tone: str) -> None:
        palette = {
            "success": (self.ACCENT, "#65f7d4"),
            "danger": (self.DANGER, "#ffffff"),
            "warning": (self.WARNING, "#3d2200"),
            "info": (self.INFO, "#a8d9ff"),
        }
        stripe, title_fg = palette.get(tone, palette["info"])

        toast = tk.Toplevel(self.root)
        toast.overrideredirect(True)
        toast.attributes("-topmost", True)
        toast.configure(bg=self.CARD)

        frame = tk.Frame(toast, bg=self.CARD, padx=16, pady=14, highlightthickness=1, highlightbackground=self.CARD_EDGE)
        frame.pack(fill="both", expand=True)

        tk.Frame(frame, bg=stripe, width=6, height=68).pack(side="left", fill="y", padx=(0, 12))
        body = tk.Frame(frame, bg=self.CARD)
        body.pack(side="left", fill="both", expand=True)
        tk.Label(body, text=title, bg=self.CARD, fg=title_fg, font=("Segoe UI Semibold", 12)).pack(anchor="w")
        tk.Label(
            body,
            text=message,
            bg=self.CARD,
            fg=self.TEXT,
            font=("Segoe UI", 10),
            wraplength=260,
            justify="left",
        ).pack(anchor="w", pady=(6, 0))

        toast.update_idletasks()
        width = 340
        height = max(92, frame.winfo_reqheight() + 4)
        offset = len(self.toast_windows) * (height + 12)
        x = toast.winfo_screenwidth() - width - 22
        y = toast.winfo_screenheight() - height - 48 - offset
        toast.geometry(f"{width}x{height}+{x}+{y}")

        self.toast_windows.append(toast)

        def cleanup(window: Any = toast) -> None:
            if window in self.toast_windows:
                self.toast_windows.remove(window)
            if window.winfo_exists():
                window.destroy()

        toast.after(4200, cleanup)

    def quit_app(self) -> None:
        if self.closing:
            return
        self.closing = True
        self.stop_event.set()
        if self.tray_icon is not None:
            try:
                self.tray_icon.stop()
            except Exception:
                logging.exception("Could not stop tray icon cleanly")
        self.root.destroy()

    def run(self) -> None:
        try:
            self.root.mainloop()
        finally:
            self.stop_event.set()
