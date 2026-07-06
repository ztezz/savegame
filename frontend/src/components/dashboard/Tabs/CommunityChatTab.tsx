import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, Shield, Smile, Trash2, Users } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

const telegramPattern = {
  backgroundColor: '#dbeafe',
  backgroundImage: 'radial-gradient(circle at 20px 20px, rgba(255,255,255,0.55) 0 2px, transparent 3px), radial-gradient(circle at 70px 70px, rgba(59,130,246,0.12) 0 3px, transparent 4px)',
  backgroundSize: '96px 96px',
};

interface ChatMessage {
  id: number;
  user_id: number;
  username: string;
  display_name?: string | null;
  role?: string;
  sender_type?: 'user' | 'ai';
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
  const lastMessageIdRef = useRef(0);
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.username === 'admin';
  const quickEmojis = ['😀', '😂', '🤣', '😍', '😎', '🤔', '👍', '🔥', '🎮', '❤️'];

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const fetchMessages = async (initial = false) => {
    try {
      const lastId = initial ? 0 : lastMessageIdRef.current;
      const res = await api.get('/community/messages', { params: lastId ? { afterId: lastId } : { limit: 80 } });
      const incoming = Array.isArray(res.data) ? res.data : [];
      if (initial) {
        setMessages(incoming);
        lastMessageIdRef.current = incoming.length > 0 ? incoming[incoming.length - 1].id : 0;
      } else if (incoming.length > 0) {
        setMessages((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const merged = [...current, ...incoming.filter((item) => !existingIds.has(item.id))].slice(-200);
          lastMessageIdRef.current = merged.length > 0 ? merged[merged.length - 1].id : 0;
          return merged;
        });
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
      const nextMessages = res.data?.message ? [res.data.message, res.data.aiMessage].filter(Boolean) : [res.data];
      setMessages((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const merged = [...current, ...nextMessages.filter((item) => !existingIds.has(item.id))].slice(-200);
        lastMessageIdRef.current = merged.length > 0 ? merged[merged.length - 1].id : 0;
        return merged;
      });
      setMessage('');
      scrollToBottom();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Gửi tin nhắn thất bại', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleMessageKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!message.trim() || sending) return;
    event.currentTarget.form?.requestSubmit();
  };

  const addEmoji = (emoji: string) => {
    setMessage((current) => `${current}${emoji}`);
  };

  const avatarLabel = (item: ChatMessage) => (item.display_name || item.username || '?').slice(0, 1).toUpperCase();

  const deleteMessage = async (id: number) => {
    try {
      await api.delete(`/community/messages/${id}`);
      setMessages((current) => {
        const next = current.filter((item) => item.id !== id);
        lastMessageIdRef.current = next.length > 0 ? next[next.length - 1].id : 0;
        return next;
      });
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa tin nhắn thất bại', 'error');
    }
  };

  const clearChat = async () => {
    if (!window.confirm('Xóa toàn bộ phòng chat cộng đồng?')) return;
    try {
      await api.delete('/community/messages');
      setMessages([]);
      lastMessageIdRef.current = 0;
      showToast('Đã xóa phòng chat', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa phòng chat thất bại', 'error');
    }
  };

  return <div className="col-span-12 h-full min-h-[calc(100vh-9rem)] grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 px-1 sm:px-0">
    <div className="overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-2xl shadow-sky-100/70 flex flex-col min-h-[620px]">
      <div className="p-5 border-b border-sky-100 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 text-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 ring-4 ring-white/10 flex items-center justify-center"><MessageCircle className="w-6 h-6" /></div>
          <div>
            <h3 className="font-black text-lg">Phòng chat cộng đồng</h3>
            <p className="text-xs text-white/75">Trao đổi nhanh giữa các thành viên CloudSave.</p>
          </div>
        </div>
        <div className="text-xs bg-white/20 text-white px-3 py-1.5 rounded-full font-bold backdrop-blur">Live polling</div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" style={telegramPattern}>
        {loading ? <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-500 shadow-sm backdrop-blur">Đang tải tin nhắn...</div> : messages.length === 0 ? <div className="h-full flex items-center justify-center text-center text-slate-600 text-sm"><div className="rounded-3xl bg-white/80 px-6 py-5 shadow-sm backdrop-blur">Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.</div></div> : messages.map((item) => {
          const mine = item.user_id === currentUser?.id || item.username === currentUser?.username;
          const isAi = item.sender_type === 'ai' || item.role === 'AI';
          return <div key={item.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
            {!mine && <div className={`mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white shadow-sm ${isAi ? 'bg-amber-500' : 'bg-sky-500'}`}>{isAi ? 'AI' : avatarLabel(item)}</div>}
            <div className={`relative max-w-[84%] px-4 py-3 shadow-md ${mine ? 'rounded-[1.4rem] rounded-br-md bg-gradient-to-br from-sky-500 to-blue-600 text-white' : isAi ? 'rounded-[1.4rem] rounded-bl-md border border-amber-200 bg-amber-50 text-slate-800' : 'rounded-[1.4rem] rounded-bl-md bg-white text-slate-800'} ${mine ? 'after:absolute after:bottom-0 after:right-[-6px] after:h-3 after:w-3 after:bg-blue-600 after:[clip-path:polygon(0_0,100%_100%,0_100%)]' : 'after:absolute after:bottom-0 after:left-[-6px] after:h-3 after:w-3 after:bg-white after:[clip-path:polygon(100%_0,100%_100%,0_100%)]'} ${isAi && !mine ? 'after:bg-amber-50' : ''}`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={`text-xs font-black ${mine ? 'text-sky-100' : isAi ? 'text-amber-700' : 'text-sky-700'}`}>{item.display_name || item.username}{item.role === 'Admin' && <Shield className="inline w-3 h-3 ml-1" />}{isAi && <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] text-amber-800">AI</span>}</span>
                <span className={`text-[10px] ${mine ? 'text-sky-100' : 'text-slate-400'}`}>{new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words leading-6">{item.message}</p>
              {((mine && !isAi) || isAdmin) && <button type="button" onClick={() => deleteMessage(item.id)} className={`mt-2 text-[10px] font-bold inline-flex items-center gap-1 ${mine ? 'text-sky-100 hover:text-white' : 'text-red-500'}`}><Trash2 className="w-3 h-3" />Xóa</button>}
            </div>
          </div>;
        })}
      </div>

      <form onSubmit={sendMessage} className="border-t border-sky-100 bg-sky-50/80 p-4 backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-sky-500"><Smile className="h-3.5 w-3.5" />Emoji</span>
          {quickEmojis.map((emoji) => <button key={emoji} type="button" onClick={() => addEmoji(emoji)} disabled={sending} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg shadow-sm transition hover:scale-110 hover:bg-sky-100 disabled:opacity-50">{emoji}</button>)}
        </div>
        <div className="flex gap-3">
          <textarea value={message} onChange={(e)=>setMessage(e.target.value)} onKeyDown={handleMessageKeyDown} maxLength={1000} rows={2} placeholder="Nhập tin nhắn... Enter để gửi, Shift+Enter để xuống dòng" className="flex-1 resize-none rounded-[1.5rem] border border-sky-100 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
          <button type="submit" disabled={!message.trim() || sending} className="rounded-full bg-gradient-to-br from-sky-500 to-blue-600 px-5 text-white font-black shadow-lg shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:from-sky-600 hover:to-blue-700"><Send className="w-4 h-4" />Gửi</button>
        </div>
      </form>
    </div>

    <aside className="space-y-4">
      <div className="bg-white border border-sky-100 rounded-3xl p-5 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center mb-4"><Users className="w-6 h-6" /></div>
        <h4 className="font-black text-slate-900">Thông tin phòng</h4>
        <p className="text-sm text-slate-500 mt-2 leading-6">Tin nhắn được lưu trong database và tự làm mới mỗi 4 giây. Nếu AI được bật, bot sẽ tự vào tán gẫu sau tin nhắn mới.</p>
      </div>
      {isAdmin && <button type="button" onClick={clearChat} className="w-full px-4 py-3 rounded-2xl border border-red-200 text-red-600 font-black text-sm hover:bg-red-50">Xóa toàn bộ chat</button>}
    </aside>
  </div>;
};

export default CommunityChatTab;
