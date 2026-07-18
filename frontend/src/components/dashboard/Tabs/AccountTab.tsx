import React, { useState, useEffect, useRef } from "react";
import { Camera, Database, HardDrive, Lock, Monitor, Save, Shield, Trash2, Upload, User, Clock } from "lucide-react";
import api from "../../../utils/api";
import { API_ORIGIN } from "../../../utils/api";
import { AccountStats, LoginHistoryItem } from "../types";

type Props = {
  currentUser: any;
  onSaveProfile: (payload: { display_name: string; email: string }) => Promise<void>;
  onOpenChangePassword: () => void;
  onUserUpdate?: (user: any) => void;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
};

export default function AccountTab({ currentUser, onSaveProfile, onOpenChangePassword, onUserUpdate }: Props) {
  const [displayName, setDisplayName] = useState(currentUser?.display_name || currentUser?.username || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Update fields if currentUser changes
    setDisplayName(currentUser?.display_name || currentUser?.username || "");
    setEmail(currentUser?.email || "");
    if (currentUser?.avatar_url) {
      setAvatarPreview(`${API_ORIGIN}${currentUser.avatar_url}`);
    }
  }, [currentUser]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get("/users/me/stats");
        setStats(res.data);
      } catch (_) {
        // ignore
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, []);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Ảnh phải nhỏ hơn 5MB");
      return;
    }
    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await api.post("/users/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newUser = { ...currentUser, avatar_url: res.data.avatar_url };
      localStorage.setItem("user", JSON.stringify(newUser));
      onUserUpdate?.(newUser);
    } catch (_) {
      alert("Upload ảnh thất bại");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!confirm("Xóa ảnh đại diện?")) return;
    try {
      await api.delete("/users/me/avatar");
      setAvatarPreview(null);
      const newUser = { ...currentUser, avatar_url: null };
      localStorage.setItem("user", JSON.stringify(newUser));
      onUserUpdate?.(newUser);
    } catch (_) {
      alert("Xóa ảnh thất bại");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveProfile({ display_name: displayName.trim(), email: email.trim() });
    } finally {
      setSaving(false);
    }
  };

  const statCards = [
    { label: "Số bản lưu", value: stats?.save_count ?? "-", sub: stats ? formatBytes(stats.save_bytes) : "", icon: Database, color: "text-indigo-600 bg-indigo-50" },
    { label: "Drive đã dùng", value: stats ? formatBytes(stats.drive_bytes) : "-", sub: `${stats?.drive_files ?? 0} file`, icon: HardDrive, color: "text-emerald-600 bg-emerald-50" },
    { label: "Thiết bị kết nối", value: stats?.device_count ?? "-", sub: "", icon: Monitor, color: "text-violet-600 bg-violet-50" },
    { label: "Vai trò", value: currentUser?.role || "User", sub: "", icon: Shield, color: currentUser?.role === "Admin" ? "text-amber-600 bg-amber-50" : "text-slate-600 bg-slate-100" },
  ];

  return (
    <div className="admin-dark-surface col-span-12 space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{card.label}</p>
                <p className="mt-1 text-xl font-black text-slate-900">{statsLoading ? "..." : card.value}</p>
                {card.sub && <p className="text-xs text-slate-400 font-semibold mt-0.5">{statsLoading ? "" : card.sub}</p>}
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Avatar + Quick Actions */}
        <div className="space-y-4">
          {/* Avatar Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
            <div className="relative inline-block mb-4">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-3xl border-2 border-indigo-100">
                  {(currentUser?.username || "U").charAt(0).toUpperCase()}
                </div>
              )}
              {avatarUploading && (
                <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <p className="font-black text-slate-900 text-lg">{currentUser?.username}</p>
            <p className="text-xs text-slate-500 mb-4">{currentUser?.role || "User"}</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 disabled:opacity-60"
              >
                <Camera className="w-4 h-4" />
                {avatarUploading ? "Đang tải..." : "Đổi ảnh đại diện"}
              </button>
              {avatarPreview && (
                <button
                  onClick={handleRemoveAvatar}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-red-200 text-red-600 rounded-xl text-xs font-black hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Xóa ảnh
                </button>
              )}
              <button
                onClick={onOpenChangePassword}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                <Lock className="w-4 h-4" />
                Đổi mật khẩu
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarSelect}
            />
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Thông tin tài khoản</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Username</span>
                <code className="text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-xs font-mono">{currentUser?.username}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Vai trò</span>
                <span className={`text-xs font-black px-2 py-0.5 rounded-full ${currentUser?.role === "Admin" ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-600"}`}>
                  {currentUser?.role || "User"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold">Trạng thái</span>
                <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Hoạt động</span>
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Edit Profile */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <User className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Chỉnh sửa hồ sơ</h3>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Tên hiển thị</label>
                <input
                  required
                  minLength={2}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all"
                  placeholder="Tên hiển thị"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Email liên lạc</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all"
                  placeholder="email@example.com"
                />
              </div>
              <button
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-black disabled:opacity-60 transition"
              >
                <Save className="w-4 h-4" />
                {saving ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
            </form>
          </div>

          {/* Login History */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Lịch sử đăng nhập</h3>
            </div>
            {statsLoading ? (
              <p className="text-xs text-slate-400 font-semibold">Đang tải...</p>
            ) : !stats?.login_history?.length ? (
              <p className="text-xs text-slate-400 font-semibold">Chưa có lịch sử đăng nhập</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stats.login_history.map((item: LoginHistoryItem, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${item.status === "success" ? "bg-emerald-500" : "bg-red-400"}`} />
                      <span className="text-xs text-slate-500 font-mono truncate">{item.ip_address || "Không rõ IP"}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-700">
                        {new Date(item.created_at).toLocaleDateString("vi-VN")}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(item.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
