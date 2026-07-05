# Windows Save Restore Agent

Python desktop agent that polls restore tasks, links the current Windows device, then runs quietly in the tray with toast notifications.

## Features

- Polls `GET /api/task?device_id=...` every 5 seconds
- Sends heartbeat via `POST /api/sync/heartbeat`
- Uses local `agent.key` (auto generated on first run) for API authentication
- Shows a modern desktop activation window with device key and login status
- Auto hides to tray after successful login/device link
- Shows a bottom-right notification when a restore task completes
- Downloads `file_url` from backend task payload
- Checks `/api/agent/info` periodically and logs when a newer Agent version is available
- Auto extracts ZIP files, or copies non-ZIP file directly
- Restores into `save_path` provided by each task (falls back to `restored_saves/` if missing/invalid)
- Reports result to `POST /api/done`
- Enforces single-instance execution (GUI and headless)
- Structured logs for success and failures

## Setup

1. Create a virtual environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

2. Configure environment variables (PowerShell example):

```powershell
$env:AGENT_VERSION = "1.0.0"
$env:POLL_INTERVAL_SECONDS = "5"
$env:REQUEST_TIMEOUT_SECONDS = "30"
```

The backend API is hardcoded to `https://thzi-luugame.hf.space`. Optional runtime settings can be placed in a `.env` file next to `restore_agent.py`.

3. Start the desktop agent:

```powershell
python restore_agent.py
```

The first run shows the device key and waits for the browser login flow. Once the device is linked successfully, the window hides to the system tray automatically.

## Run In Background On Windows

### Option 1: Task Scheduler (recommended, no extra software)

Install and auto-start at boot:

```powershell
.\install-task-scheduler.ps1 `
  -PollIntervalSeconds 5 `
  -RequestTimeoutSeconds 30
```

These background install scripts now start the agent in `--headless` mode so no desktop window is shown for service/task execution.

### Option 2: NSSM Windows Service

Requirements: install NSSM and ensure `nssm` is in PATH.

```powershell
.\install-nssm-service.ps1 `
  -PollIntervalSeconds 5 `
  -RequestTimeoutSeconds 30
```

### Manage Agent

```powershell
# status
.\manage-agent.ps1 -Action status

# start / stop / restart
.\manage-agent.ps1 -Action start
.\manage-agent.ps1 -Action stop
.\manage-agent.ps1 -Action restart

# view logs
.\manage-agent.ps1 -Action logs
```

Log files are written to:

- `logs/agent.out.log`
- `logs/agent.err.log`

## Troubleshooting

### 1) Agent báo 401 / liên tục yêu cầu đăng nhập

- Nguyên nhân thường gặp: `agent.key` chưa được liên kết hoặc đã bị thu hồi ở backend.
- Cách xử lý:
  1. Mở agent ở chế độ desktop (`python restore_agent.py`) để hoàn tất luồng đăng nhập trên trình duyệt.
  2. Nếu vẫn lỗi, dừng agent, xóa `agent.key`, chạy lại để tạo key mới và liên kết lại.

### 2) Không tự mở được trình duyệt khi cần liên kết

- Agent vẫn in ra `verification_url` trong log/UI.
- Mở thủ công URL đó trên cùng máy Windows đang chạy agent để hoàn tất liên kết.

### 3) Khôi phục xong nhưng game không nhận save

- Kiểm tra `save_path` của game trong Web UI (Library > Edit game).
- Nếu `save_path` thiếu/sai, agent sẽ fallback vào `restored_saves/invalid_target_path`.
- Mở log để xem thông báo `Configured save path is not accessible` hoặc `unresolved environment variables`.

### 4) Chạy nền nhưng không thấy hoạt động

- Dùng lệnh:

```powershell
.\manage-agent.ps1 -Action status
.\manage-agent.ps1 -Action logs
```

- Nếu chạy bằng Task Scheduler/NSSM, xác nhận process chỉ chạy một instance (agent đã bật single-instance cho cả GUI/headless).

### 5) Tác vụ restore fail do file nén lỗi

- Agent chỉ nhận file hợp lệ backend trả về qua `file_url`.
- Nếu archive bị hỏng hoặc không an toàn (đường dẫn thoát thư mục), agent sẽ fail task và báo lỗi về `/api/done`.

## Task Flow

1. Web UI calls `POST /api/restore` with `save_id` + `device_id`
2. Agent polls `GET /api/task` with `device_id`
3. Backend atomically claims one pending task (no duplicate claim)
4. Agent downloads and restores file into local save folder
5. Agent calls `POST /api/done` with `success=true/false`
