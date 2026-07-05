import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Shield, Trash2, Users } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

interface ChatMessage {
  id: number;
  user_id: number;
  username: string;
  display_name?: string | null;
  role?: string;
  message: string;
  created_at: string;
}

interface CommunityChatTabProps {
  currentUser: any;
}

const CommunityChatTab: React.FC<CommunityChatTabProps> = ({ currentUser }) => {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.username === 'admin';

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const fetchMessages = async (initial = false) => {
    try {
      const lastId = initial || messages.length === 0 ? 0 : messages[messages.length - 1].id;
      const res = await api.get('/community/messages', { params: lastId ? { afterId: lastId } : { limit: 80 } });
      const incoming = Array.isArray(res.data) ? res.data : [];
      if (initial) {
        setMessages(incoming);
      } else if (incoming.length > 0) {
        setMessages((current) => [...current, ...incoming].slice(-200));
      }
      if (incoming.length > 0 || initial) scrollToBottom();
    } catch (err: any) {
      if (initial) showToast(err.response?.data?.error || 'Không tải được phòng chat', 'error');
    } finally {
      if (initial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages(true);
    const timer = window.setInterval(() => fetchMessages(false), 4000);
    return () => window.clearInterval(timer);
  }, []);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await api.post('/community/messages', { message: text });
      setMessages((current) => [...current, res.data].slice(-200));
      setMessage('');
      scrollToBottom();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Gửi tin nhắn thất bại', 'error');
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (id: number) => {
    try {
      await api.delete(`/community/messages/${id}`);
      setMessages((current) => current.filter((item) => item.id !== id));
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa tin nhắn thất bại', 'error');
    }
  };

  const clearChat = async () => {
    if (!window.confirm('Xóa toàn bộ phòng chat cộng đồng?')) return;
    try {
      await api.delete('/community/messages');
      setMessages([]);
      showToast('Đã xóa phòng chat', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa phòng chat thất bại', 'error');
    }
  };

  return <div className="col-span-12 h-full min-h-[calc(100vh-9rem)] grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 px-1 sm:px-0">
    <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden flex flex-col min-h-[620px]">
      <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-950 to-indigo-950 text-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center"><MessageCircle className="w-6 h-6" /></div>
          <div>
            <h3 className="font-black text-lg">Phòng chat cộng đồng</h3>
            <p className="text-xs text-white/60">Trao đổi nhanh giữa các thành viên CloudSave.</p>
          </div>
        </div>
        <div className="text-xs bg-emerald-400/15 text-emerald-200 px-3 py-1.5 rounded-full font-bold">Live polling</div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50">
        {loading ? <div className="text-sm text-slate-500">Đang tải tin nhắn...</div> : messages.length === 0 ? <div className="h-full flex items-center justify-center text-center text-slate-500 text-sm">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.</div> : messages.map((item) => {
          const mine = item.user_id === currentUser?.id || item.username === currentUser?.username;
          return <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${mine ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md'}`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={`text-xs font-black ${mine ? 'text-indigo-100' : 'text-slate-500'}`}>{item.display_name || item.username}{item.role === 'Admin' && <Shield className="inline w-3 h-3 ml-1" />}</span>
                <span className={`text-[10px] ${mine ? 'text-indigo-100' : 'text-slate-400'}`}>{new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words leading-6">{item.message}</p>
              {(mine || isAdmin) && <button type="button" onClick={() => deleteMessage(item.id)} className={`mt-2 text-[10px] font-bold inline-flex items-center gap-1 ${mine ? 'text-indigo-100 hover:text-white' : 'text-red-500'}`}><Trash2 className="w-3 h-3" />Xóa</button>}
            </div>
          </div>;
        })}
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t border-slate-100 bg-white flex gap-3">
        <textarea value={message} onChange={(e)=>setMessage(e.target.value)} maxLength={1000} rows={2} placeholder="Nhập tin nhắn..." className="flex-1 resize-none border border-slate-200 rounded-2xl px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100" />
        <button type="submit" disabled={!message.trim() || sending} className="px-5 rounded-2xl bg-indigo-600 text-white font-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"><Send className="w-4 h-4" />Gửi</button>
      </form>
    </div>

    <aside className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-5">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4"><Users className="w-6 h-6" /></div>
        <h4 className="font-black text-slate-900">Thông tin phòng</h4>
        <p className="text-sm text-slate-500 mt-2 leading-6">Tin nhắn được lưu trong database và tự làm mới mỗi 4 giây. Mỗi người có thể xóa tin của mình, admin có thể xóa mọi tin.</p>
      </div>
      {isAdmin && <button type="button" onClick={clearChat} className="w-full px-4 py-3 rounded-2xl border border-red-200 text-red-600 font-black text-sm hover:bg-red-50">Xóa toàn bộ chat</button>}
    </aside>
  </div>;
};

export default CommunityChatTab;
