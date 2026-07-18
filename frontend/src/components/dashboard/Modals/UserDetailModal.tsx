import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Database, HardDrive, Monitor, X, Clock, Gamepad2, Shield, Lock, Unlock } from "lucide-react";
import { UserDetail } from "../types";
import api from "../../../utils/api";
import { API_ORIGIN } from "../../../utils/api";

interface UserDetailModalProps {
  show: boolean;
  userId: number | null;
  onClose: () => void;
  onResetPassword: (userId: number, username: string) => void;
  onToggleStatus: (userId: number, currentStatus: "Active" | "Locked") => void;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
};

const UserDetailModal: React.FC<UserDetailModalProps> = ({ show, userId, onClose, onResetPassword, onToggleStatus }) => {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "login" | "games">("overview");

  useEffect(() => {
    if (!show || !userId) { setDetail(null); return; }
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/users/${userId}/detail`);
        setDetail(res.data);
      } catch (_) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [show, userId]);

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="admin-dark-surface flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:border dark:border-slate-700 dark:bg-slate-900"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Chi tiết tài khoản</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : detail ? (
              <div className="flex-1 overflow-y-auto">
                {/* User Header */}
                <div className="px-6 py-5 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-center gap-4">
                    {detail.avatar_url ? (
                      <img src={`${API_ORIGIN}${detail.avatar_url}`} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover border border-slate-200" />
                    ) : (
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${detail.role === "Admin" ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-600"}`}>
                        {(detail.username || "U").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xl font-black text-slate-900 truncate">{detail.display_name || detail.username}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <code className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded font-mono text-slate-600">{detail.username}</code>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${detail.role === "Admin" ? "bg-indigo-50 text-indigo-600 border border-indigo-100" : "bg-slate-100 text-slate-500"}`}>
                          {detail.role}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${detail.status === "Active" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                          {detail.status === "Active" ? "Hoạt động" : "Đã khóa"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{detail.email || "Chưa có email"}</p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => onToggleStatus(detail.id, detail.status)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border transition ${
                          detail.status === "Active"
                            ? "border-red-200 text-red-600 hover:bg-red-50"
                            : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        }`}
                      >
                        {detail.status === "Active" ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        {detail.status === "Active" ? "Khóa" : "Mở khóa"}
                      </button>
                      <button
                        onClick={() => onResetPassword(detail.id, detail.username)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Reset PW
                      </button>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 p-5 border-b border-slate-100">
                  <div className="text-center p-3 rounded-xl bg-indigo-50">
                    <Database className="w-5 h-5 text-indigo-600 mx-auto mb-1" />
                    <p className="text-xl font-black text-indigo-700">{detail.stats.save_count}</p>
                    <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wide">Bản lưu</p>
                    <p className="text-[10px] text-indigo-400">{formatBytes(detail.stats.save_bytes)}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-emerald-50">
                    <HardDrive className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                    <p className="text-xl font-black text-emerald-700">{formatBytes(detail.stats.drive_bytes)}</p>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Drive</p>
                    <p className="text-[10px] text-emerald-400">{detail.stats.drive_files} file</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-violet-50">
                    <Monitor className="w-5 h-5 text-violet-600 mx-auto mb-1" />
                    <p className="text-xl font-black text-violet-700">{detail.stats.device_count}</p>
                    <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wide">Thiết bị</p>
                    <p className="text-[10px] text-violet-400">API keys</p>
                  </div>
                </div>

                {/* Section Tabs */}
                <div className="flex gap-1 px-5 pt-4 border-b border-slate-100">
                  {(["overview", "login", "games"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setActiveSection(s)}
                      className={`px-4 py-2 text-xs font-black uppercase tracking-wide rounded-t-lg transition border-b-2 ${
                        activeSection === s ? "border-indigo-600 text-indigo-600 bg-indigo-50" : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {s === "overview" ? "Thiết bị" : s === "login" ? "Lịch sử đăng nhập" : "Game gần đây"}
                    </button>
                  ))}
                </div>

                {/* Section Content */}
                <div className="p-5">
                  {activeSection === "overview" && (
                    <div className="space-y-2">
                      {!detail.devices.length ? (
                        <p className="text-sm text-slate-400 font-semibold text-center py-4">Chưa có thiết bị nào</p>
                      ) : (
                        detail.devices.map((d, i) => (
                          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                            <div className="flex items-center gap-2">
                              <Monitor className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-bold text-slate-700">{d.device_name}</span>
                            </div>
                            <div className="text-right text-xs text-slate-400">
                              <p>Tạo: {new Date(d.created_at).toLocaleDateString("vi-VN")}</p>
                              {d.last_used_at && <p>Dùng lần cuối: {new Date(d.last_used_at).toLocaleDateString("vi-VN")}</p>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeSection === "login" && (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {!detail.login_history.length ? (
                        <p className="text-sm text-slate-400 font-semibold text-center py-4">Chưa có lịch sử đăng nhập</p>
                      ) : (
                        detail.login_history.map((item, i) => (
                          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${item.status === "success" ? "bg-emerald-500" : "bg-red-400"}`} />
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-xs font-mono text-slate-600">{item.ip_address || "Không rõ IP"}</span>
                            </div>
                            <div className="text-right text-xs text-slate-400">
                              <p>{new Date(item.created_at).toLocaleDateString("vi-VN")}</p>
                              <p>{new Date(item.created_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeSection === "games" && (
                    <div className="space-y-2">
                      {!detail.recent_games.length ? (
                        <p className="text-sm text-slate-400 font-semibold text-center py-4">Chưa có game nào</p>
                      ) : (
                        detail.recent_games.map((g, i) => (
                          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <Gamepad2 className="w-4 h-4 text-slate-400 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{g.game_name}</p>
                                <p className="text-[10px] text-slate-400">{g.category}</p>
                              </div>
                            </div>
                            <div className="text-right text-xs text-slate-500 shrink-0">
                              <p className="font-bold">{g.save_count} save</p>
                              {g.last_save && <p>{new Date(g.last_save).toLocaleDateString("vi-VN")}</p>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-4 text-center">
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Tạo lúc: {new Date(detail.createdAt).toLocaleDateString("vi-VN", { year: "numeric", month: "long", day: "numeric" })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center py-20">
                <p className="text-sm text-slate-400 font-semibold">Không thể tải thông tin</p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default UserDetailModal;
