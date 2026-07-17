import React, { useState } from "react";
import { Lock, Save, User } from "lucide-react";

type Props = {
  currentUser: any;
  onSaveProfile: (payload: { display_name: string; email: string }) => Promise<void>;
  onOpenChangePassword: () => void;
};

export default function AccountTab({ currentUser, onSaveProfile, onOpenChangePassword }: Props) {
  const [displayName, setDisplayName] = useState(currentUser?.display_name || currentUser?.username || "");
  const [email, setEmail] = useState(currentUser?.email || "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSaveProfile({ display_name: displayName.trim(), email: email.trim() }); }
    finally { setSaving(false); }
  };

  return (
    <div className="col-span-12 grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="text-sm font-black uppercase tracking-widest text-slate-700 mb-4">Thông tin tài khoản</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="profile-display-name" className="text-xs font-bold text-slate-500">Tên hiển thị</label>
            <input id="profile-display-name" required minLength={2} value={displayName} onChange={(e)=>setDisplayName(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label htmlFor="profile-email" className="text-xs font-bold text-slate-500">Email</label>
            <input id="profile-email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2" />
          </div>
          <button disabled={saving} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"><Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </form>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xl mb-3">{(currentUser?.username || 'U').charAt(0).toUpperCase()}</div>
        <p className="font-bold text-slate-900">{currentUser?.username}</p>
        <p className="text-xs text-slate-500 mb-4">{currentUser?.role || 'User'}</p>
        <button onClick={onOpenChangePassword} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2"><Lock className="w-4 h-4" />Đổi mật khẩu</button>
      </div>
    </div>
  );
}
