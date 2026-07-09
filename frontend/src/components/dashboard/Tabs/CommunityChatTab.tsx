import React, { useEffect, useRef, useState } from 'react';
import { Bot, Copy, Lock, MessageCircle, Pencil, Pin, Plus, Search, Send, Shield, Smile, Trash2, Users, X } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

const telegramPattern = {
  backgroundColor: '#9fcd94',
  backgroundImage: "linear-gradient(135deg, rgba(218, 230, 123, 0.72) 0%, rgba(98, 174, 151, 0.78) 48%, rgba(238, 234, 169, 0.7) 100%), url('/pattern.svg')",
  backgroundSize: 'cover, 520px auto',
  backgroundPosition: 'center, top left',
  backgroundRepeat: 'no-repeat, repeat',
  backgroundBlendMode: 'normal, soft-light',
};

interface ChatMessage {
  id: number;
  room_id?: number;
  user_id: number;
  username: string;
  display_name?: string | null;
  role?: string;
  sender_type?: 'user' | 'ai';
  reply_to_id?: number | null;
  reactions_json?: Record<string, string[]>;
  edited_at?: string | null;
  pinned_at?: string | null;
  message: string;
  created_at: string;
}

interface ChatRoom {
  id: number;
  name: string;
  description?: string | null;
  is_locked?: boolean;
  ai_enabled?: boolean;
  ai_bot_name?: string | null;
  ai_tone?: string | null;
  ai_prompt?: string | null;
  ai_auto_reply?: boolean;
  sort_order?: number;
  message_count?: number;
  latest_at?: string | null;
}

interface CommunityChatTabProps {
  currentUser: any;
}

const CommunityChatTab: React.FC<CommunityChatTabProps> = ({ currentUser }) => {
  const { showToast } = useToast();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [roomDraft, setRoomDraft] = useState({ name: '', description: '', isLocked: false, aiEnabled: true, aiBotName: '', aiTone: 'default', aiPrompt: '', aiAutoReply: false });
  const [unreadByRoom, setUnreadByRoom] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [aiTyping, setAiTyping] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef(0);
  const activeRoomIdRef = useRef(activeRoomId);
  const roomCountsRef = useRef<Record<number, number>>({});
  const roomsInitializedRef = useRef(false);
  const isAdmin = currentUser?.role === 'Admin' || currentUser?.username === 'admin';
  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const roomLockedForUser = !!activeRoom?.is_locked && !isAdmin;
  const quickEmojis = ['😀', '😂', '🤣', '😍', '😎', '🤔', '😭', '😡', '👍', '🙏', '🔥', '🎮', '❤️', '✨', '💯', '🍻'];
  const visibleMessages = chatSearch.trim()
    ? messages.filter((item) => `${item.display_name || item.username} ${item.message}`.toLowerCase().includes(chatSearch.trim().toLowerCase()))
    : messages;
  const pinnedMessages = messages.filter((item) => item.pinned_at).slice(-3).reverse();

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setShowScrollButton(el.scrollHeight - el.scrollTop - el.clientHeight > 180);
  };

  const formatDay = (value: string) => {
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Hôm nay';
    if (date.toDateString() === yesterday.toDateString()) return 'Hôm qua';
    return date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const fetchRooms = async () => {
    try {
      const res = await api.get('/community/rooms');
      const incoming = Array.isArray(res.data) ? res.data : [];
      const nextCounts = incoming.reduce((acc: Record<number, number>, room: ChatRoom) => {
        acc[room.id] = room.message_count || 0;
        return acc;
      }, {});
      if (roomsInitializedRef.current) {
        setUnreadByRoom((current) => {
          const next = { ...current };
          incoming.forEach((room: ChatRoom) => {
            const previous = roomCountsRef.current[room.id] || 0;
            const latest = room.message_count || 0;
            if (room.id === activeRoomIdRef.current) next[room.id] = 0;
            else if (latest > previous) next[room.id] = (next[room.id] || 0) + latest - previous;
          });
          return next;
        });
      }
      roomCountsRef.current = nextCounts;
      roomsInitializedRef.current = true;
      setRooms(incoming);
      if (incoming.length > 0 && !incoming.some((room) => room.id === activeRoomId)) setActiveRoomId(incoming[0].id);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không tải được danh sách phòng', 'error');
    }
  };

  const fetchMessages = async (initial = false) => {
    try {
      const lastId = initial ? 0 : lastMessageIdRef.current;
      const res = await api.get('/community/messages', { params: lastId ? { roomId: activeRoomId, afterId: lastId } : { roomId: activeRoomId, limit: 80 } });
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
    fetchRooms();
    const timer = window.setInterval(fetchRooms, 8000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
    setMessages([]);
    setReplyTo(null);
    setEditingMessageId(null);
    setEditingText('');
    lastMessageIdRef.current = 0;
    setLoading(true);
    setUnreadByRoom((current) => ({ ...current, [activeRoomId]: 0 }));
    fetchMessages(true);
    const timer = window.setInterval(() => fetchMessages(false), 4000);
    return () => window.clearInterval(timer);
  }, [activeRoomId]);

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text || sending || roomLockedForUser) return;
    setSending(true);
    const mentionsAi = /@ai|@mây mặn|mây mặn/i.test(text) || !!activeRoom?.ai_auto_reply;
    if (mentionsAi) setAiTyping(true);
    try {
      const res = await api.post('/community/messages', { roomId: activeRoomId, message: text, replyToId: replyTo?.id || null });
      const nextMessages = res.data?.message ? [res.data.message, res.data.aiMessage].filter(Boolean) : [res.data];
      setMessages((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        const merged = [...current, ...nextMessages.filter((item) => !existingIds.has(item.id))].slice(-200);
        lastMessageIdRef.current = merged.length > 0 ? merged[merged.length - 1].id : 0;
        return merged;
      });
      setMessage('');
      setReplyTo(null);
      scrollToBottom();
      fetchRooms();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Gửi tin nhắn thất bại', 'error');
    } finally {
      setSending(false);
      if (mentionsAi) window.setTimeout(() => setAiTyping(false), 5000);
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
    setEmojiOpen(false);
  };

  const avatarLabel = (item: ChatMessage) => (item.display_name || item.username || '?').slice(0, 1).toUpperCase();

  const createRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newRoomName.trim();
    if (!name || creatingRoom) return;
    setCreatingRoom(true);
    try {
      const res = await api.post('/community/rooms', { name, description: newRoomDescription.trim() || null });
      setRooms((current) => [...current, res.data]);
      setActiveRoomId(res.data.id);
      setNewRoomName('');
      setNewRoomDescription('');
      showToast('Đã tạo phòng chat', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Tạo phòng chat thất bại', 'error');
    } finally {
      setCreatingRoom(false);
    }
  };

  const startEditRoom = (room: ChatRoom) => {
    setEditingRoomId(room.id);
    setRoomDraft({
      name: room.name,
      description: room.description || '',
      isLocked: !!room.is_locked,
      aiEnabled: room.ai_enabled !== false,
      aiBotName: room.ai_bot_name || '',
      aiTone: room.ai_tone || 'default',
      aiPrompt: room.ai_prompt || '',
      aiAutoReply: !!room.ai_auto_reply,
    });
  };

  const saveRoom = async (roomId: number) => {
    const name = roomDraft.name.trim();
    if (!name) return;
    try {
      const res = await api.patch(`/community/rooms/${roomId}`, {
        name,
        description: roomDraft.description.trim() || null,
        isLocked: roomDraft.isLocked,
        aiEnabled: roomDraft.aiEnabled,
        aiBotName: roomDraft.aiBotName.trim() || null,
        aiTone: roomDraft.aiTone,
        aiPrompt: roomDraft.aiPrompt.trim() || null,
        aiAutoReply: roomDraft.aiAutoReply,
      });
      setRooms((current) => current.map((room) => room.id === roomId ? { ...room, ...res.data } : room));
      setEditingRoomId(null);
      showToast('Đã cập nhật phòng chat', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Cập nhật phòng chat thất bại', 'error');
    }
  };

  const deleteRoom = async (roomId: number) => {
    if (!window.confirm('Xóa phòng chat này? Tin nhắn sẽ không hiển thị nữa.')) return;
    try {
      await api.delete(`/community/rooms/${roomId}`);
      const nextRooms = rooms.filter((room) => room.id !== roomId);
      setRooms(nextRooms);
      if (activeRoomId === roomId) setActiveRoomId(nextRooms[0]?.id || 1);
      showToast('Đã xóa phòng chat', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa phòng chat thất bại', 'error');
    }
  };

  const startEdit = (item: ChatMessage) => {
    setEditingMessageId(item.id);
    setEditingText(item.message);
  };

  const saveEdit = async () => {
    if (!editingMessageId || !editingText.trim()) return;
    try {
      const res = await api.patch(`/community/messages/${editingMessageId}`, { message: editingText.trim() });
      setMessages((current) => current.map((item) => item.id === editingMessageId ? { ...item, message: res.data.message, edited_at: res.data.edited_at } : item));
      setEditingMessageId(null);
      setEditingText('');
      showToast('Đã sửa tin nhắn', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Sửa tin nhắn thất bại', 'error');
    }
  };

  const toggleReaction = async (id: number, emoji: string) => {
    try {
      const res = await api.post(`/community/messages/${id}/reactions`, { emoji });
      setMessages((current) => current.map((item) => item.id === id ? { ...item, reactions_json: res.data.reactions_json } : item));
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không cập nhật được reaction', 'error');
    }
  };

  const findReply = (id?: number | null) => id ? messages.find((item) => item.id === id) : null;

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã copy tin nhắn', 'success');
    } catch {
      showToast('Không copy được tin nhắn', 'error');
    }
  };

  const togglePin = async (item: ChatMessage) => {
    try {
      const res = await api.post(`/community/messages/${item.id}/pin`, { pinned: !item.pinned_at });
      setMessages((current) => current.map((messageItem) => messageItem.id === item.id ? { ...messageItem, pinned_at: res.data.pinned_at } : messageItem));
      showToast(res.data.pinned_at ? 'Đã ghim tin nhắn' : 'Đã bỏ ghim tin nhắn', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không cập nhật được tin ghim', 'error');
    }
  };

  return <div className="col-span-12 h-full min-h-[calc(100vh-7rem)] grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_240px] gap-4 px-1 sm:px-0">
    <div className="overflow-hidden rounded-[2rem] border border-sky-100 bg-white shadow-2xl shadow-sky-100/70 flex flex-col min-h-[760px]">
      <div className="p-5 border-b border-sky-100 bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 text-white flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 ring-4 ring-white/10 flex items-center justify-center"><MessageCircle className="w-6 h-6" /></div>
          <div>
            <h3 className="font-black text-lg">{activeRoom?.name || 'Phòng chat cộng đồng'}</h3>
            <p className="text-xs text-white/75">{activeRoom?.description || 'Chọn phòng bên phải để đổi chủ đề trò chuyện.'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold">
          {activeRoom?.ai_enabled === false && <span className="rounded-full bg-white/20 px-3 py-1.5 backdrop-blur">AI tắt</span>}
          {activeRoom?.ai_auto_reply && <span className="rounded-full bg-white/20 px-3 py-1.5 backdrop-blur">AI auto</span>}
          {activeRoom?.is_locked && <span className="rounded-full bg-white/20 px-3 py-1.5 backdrop-blur">Đang khóa</span>}
          <span className="rounded-full bg-white/20 px-3 py-1.5 backdrop-blur">Live</span>
        </div>
      </div>

      <div className="border-b border-sky-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-sky-500" />
          <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Tìm trong phòng chat..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400" />
          {chatSearch && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-sky-600">{visibleMessages.length}</span>}
          {chatSearch && <button type="button" onClick={() => setChatSearch('')} className="text-xs font-black text-slate-400">Xóa</button>}
        </div>
      </div>

      {pinnedMessages.length > 0 && <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-700"><Pin className="h-3.5 w-3.5" />Tin ghim</div>
        <div className="space-y-2">
          {pinnedMessages.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-black text-amber-700">{item.display_name || item.username}</p>
              <p className="truncate font-semibold text-slate-700">{item.message}</p>
            </div>
            {isAdmin && <button type="button" onClick={() => togglePin(item)} className="rounded-full p-1 text-amber-600 hover:bg-amber-100"><X className="h-4 w-4" /></button>}
          </div>)}
        </div>
      </div>}

      <div ref={listRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto p-4 sm:p-6 space-y-4" style={telegramPattern}>
        {loading ? <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-500 shadow-sm backdrop-blur">Đang tải tin nhắn...</div> : visibleMessages.length === 0 ? <div className="h-full flex items-center justify-center text-center text-slate-600 text-sm"><div className="rounded-3xl bg-white/80 px-6 py-5 shadow-sm backdrop-blur">{chatSearch ? 'Không tìm thấy tin nhắn phù hợp.' : 'Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.'}</div></div> : visibleMessages.map((item, index) => {
          const mine = item.user_id === currentUser?.id || item.username === currentUser?.username;
          const isAi = item.sender_type === 'ai' || item.role === 'AI';
          const previous = visibleMessages[index - 1];
          const reply = findReply(item.reply_to_id);
          const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(item.created_at).toDateString();
          return <React.Fragment key={item.id}>
            {showDay && <div className="sticky top-2 z-10 flex justify-center"><span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black text-sky-700 shadow-sm backdrop-blur">{formatDay(item.created_at)}</span></div>}
            <div className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
            {!mine && <div className={`mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black text-white shadow-sm ${isAi ? 'bg-amber-500' : 'bg-sky-500'}`}>{isAi ? 'AI' : avatarLabel(item)}</div>}
            <div className={`relative max-w-[92%] px-4 py-3 shadow-md ${mine ? 'rounded-[1.4rem] rounded-br-md bg-gradient-to-br from-sky-500 to-blue-600 text-white' : isAi ? 'rounded-[1.4rem] rounded-bl-md border border-amber-200 bg-amber-50 text-slate-800' : 'rounded-[1.4rem] rounded-bl-md bg-white text-slate-800'} ${mine ? 'after:absolute after:bottom-0 after:right-[-6px] after:h-3 after:w-3 after:bg-blue-600 after:[clip-path:polygon(0_0,100%_100%,0_100%)]' : 'after:absolute after:bottom-0 after:left-[-6px] after:h-3 after:w-3 after:bg-white after:[clip-path:polygon(100%_0,100%_100%,0_100%)]'} ${isAi && !mine ? 'after:bg-amber-50' : ''}`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={`text-xs font-black ${mine ? 'text-sky-100' : isAi ? 'text-amber-700' : 'text-sky-700'}`}>{item.display_name || item.username}{item.role === 'Admin' && <Shield className="inline w-3 h-3 ml-1" />}{isAi && <span className="ml-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] text-amber-800">AI</span>}</span>
                <span className={`text-[10px] ${mine ? 'text-sky-100' : 'text-slate-400'}`}>{item.pinned_at && <Pin className="mr-1 inline h-3 w-3" />}{new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {reply && <div className={`mb-2 rounded-xl border-l-4 px-3 py-2 text-xs ${mine ? 'border-white/70 bg-white/10 text-sky-50' : 'border-sky-300 bg-sky-50 text-slate-600'}`}>
                <p className="font-black">{reply.display_name || reply.username}</p>
                <p className="line-clamp-2">{reply.message}</p>
              </div>}
              {editingMessageId === item.id ? <div className="space-y-2">
                <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} maxLength={1000} rows={3} className="w-full resize-none rounded-xl border border-sky-100 bg-white/90 px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-300" />
                <div className="flex gap-2">
                  <button type="button" onClick={saveEdit} className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-black text-white">Lưu</button>
                  <button type="button" onClick={() => { setEditingMessageId(null); setEditingText(''); }} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">Hủy</button>
                </div>
              </div> : <p className="text-sm whitespace-pre-wrap break-words leading-6">{item.message}</p>}
              {item.edited_at && <p className={`mt-1 text-[10px] font-semibold ${mine ? 'text-sky-100' : 'text-slate-400'}`}>đã sửa</p>}
              {item.reactions_json && Object.keys(item.reactions_json).length > 0 && <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(item.reactions_json as Record<string, string[]>).map(([emoji, users]) => <button key={emoji} type="button" onClick={() => toggleReaction(item.id, emoji)} className={`rounded-full px-2 py-0.5 text-xs font-bold ${mine ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{emoji} {users.length}</button>)}
              </div>}
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" onClick={() => setReplyTo(item)} className={`text-[10px] font-black ${mine ? 'text-sky-100 hover:text-white' : 'text-sky-600'}`}>Trả lời</button>
                {((mine && !isAi) || isAdmin) && <button type="button" onClick={() => startEdit(item)} className={`text-[10px] font-black ${mine ? 'text-sky-100 hover:text-white' : 'text-slate-500'}`}>Sửa</button>}
                {isAdmin && <button type="button" onClick={() => togglePin(item)} className={`inline-flex items-center gap-1 text-[10px] font-black ${mine ? 'text-sky-100 hover:text-white' : 'text-amber-600'}`}><Pin className="h-3 w-3" />{item.pinned_at ? 'Bỏ ghim' : 'Ghim'}</button>}
                <button type="button" onClick={() => copyMessage(item.message)} className={`inline-flex items-center gap-1 text-[10px] font-black ${mine ? 'text-sky-100 hover:text-white' : 'text-slate-500'}`}><Copy className="h-3 w-3" />Copy</button>
                {['👍', '😂', '❤️'].map((emoji) => <button key={emoji} type="button" onClick={() => toggleReaction(item.id, emoji)} className={`text-[11px] ${mine ? 'hover:bg-white/10' : 'hover:bg-slate-100'} rounded-full px-1`}>{emoji}</button>)}
              </div>
            </div>
            </div>
          </React.Fragment>;
        })}
        {sending && <div className="flex justify-end"><div className="rounded-full bg-white/80 px-4 py-2 text-xs font-bold text-sky-700 shadow-sm backdrop-blur">Đang gửi...</div></div>}
        {aiTyping && <div className="flex justify-start"><div className="rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 shadow-sm backdrop-blur">AI đang gõ...</div></div>}
        {showScrollButton && <button type="button" onClick={scrollToBottom} className="sticky bottom-3 left-full ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-sky-600 shadow-lg transition hover:bg-sky-50">↓</button>}
      </div>

      <form onSubmit={sendMessage} className="border-t border-sky-100 bg-sky-50/80 p-4 backdrop-blur">
        {roomLockedForUser && <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">Phòng này đang bị khóa, chỉ admin có thể gửi tin nhắn.</div>}
        {replyTo && <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border-l-4 border-sky-400 bg-white px-4 py-2 text-sm shadow-sm">
          <div className="min-w-0">
            <p className="font-black text-sky-700">Đang trả lời {replyTo.display_name || replyTo.username}</p>
            <p className="truncate text-xs text-slate-500">{replyTo.message}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} className="rounded-full px-2 py-1 text-xs font-black text-slate-400 hover:bg-slate-100">Hủy</button>
        </div>}
        <div className="relative mb-3">
          <button type="button" onClick={() => setEmojiOpen((open) => !open)} disabled={sending} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-sky-500 shadow-sm transition hover:bg-sky-100 disabled:opacity-50"><Smile className="h-3.5 w-3.5" />Emoji</button>
          {emojiOpen && <div className="absolute bottom-full left-0 z-20 mb-2 flex max-w-[min(92vw,420px)] gap-2 overflow-x-auto rounded-2xl border border-sky-100 bg-white p-3 shadow-2xl shadow-sky-200/60">
            {quickEmojis.map((emoji) => <button key={emoji} type="button" onClick={() => addEmoji(emoji)} disabled={sending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm transition hover:scale-110 hover:bg-sky-100 disabled:opacity-50">{emoji}</button>)}
          </div>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <textarea value={message} onChange={(e)=>setMessage(e.target.value)} onKeyDown={handleMessageKeyDown} maxLength={1000} rows={2} disabled={roomLockedForUser} placeholder={roomLockedForUser ? 'Phòng đang bị khóa' : 'Nhập tin nhắn... Enter để gửi, Shift+Enter để xuống dòng'} className="flex-1 resize-none rounded-[1.5rem] border border-sky-100 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400" />
          <button type="submit" disabled={!message.trim() || sending || roomLockedForUser} className="inline-flex items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 px-5 py-3 text-white font-black shadow-lg shadow-sky-200 disabled:opacity-50 disabled:cursor-not-allowed gap-2 hover:from-sky-600 hover:to-blue-700"><Send className="w-4 h-4" />Gửi</button>
        </div>
      </form>
    </div>

    <aside className="space-y-4">
      <div className="bg-white border border-sky-100 rounded-3xl p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-600"><Users className="h-5 w-5" /></div>
          <div>
            <h4 className="font-black text-slate-900">Phòng chat</h4>
            <p className="text-xs font-semibold text-slate-400">{rooms.length} phòng</p>
          </div>
        </div>
        <div className="space-y-2">
          {rooms.map((room) => editingRoomId === room.id ? <div key={room.id} className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
            <input value={roomDraft.name} onChange={(e) => setRoomDraft((current) => ({ ...current, name: e.target.value }))} maxLength={80} className="mb-2 w-full rounded-xl border border-sky-100 px-3 py-2 text-sm font-bold outline-none" />
            <textarea value={roomDraft.description} onChange={(e) => setRoomDraft((current) => ({ ...current, description: e.target.value }))} maxLength={240} rows={2} placeholder="Mô tả phòng" className="mb-2 w-full resize-none rounded-xl border border-sky-100 px-3 py-2 text-xs font-semibold outline-none" />
            <label className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={roomDraft.isLocked} onChange={(e) => setRoomDraft((current) => ({ ...current, isLocked: e.target.checked }))} />Khóa phòng</label>
            <label className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={roomDraft.aiEnabled} onChange={(e) => setRoomDraft((current) => ({ ...current, aiEnabled: e.target.checked }))} />Bật AI</label>
            <div className="mb-3 rounded-2xl bg-white p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-black text-sky-700"><Bot className="h-3.5 w-3.5" />AI riêng của phòng</div>
              <input value={roomDraft.aiBotName} onChange={(e) => setRoomDraft((current) => ({ ...current, aiBotName: e.target.value }))} maxLength={80} placeholder="Tên bot riêng" className="mb-2 w-full rounded-xl border border-sky-100 px-3 py-2 text-xs font-semibold outline-none" />
              <select value={roomDraft.aiTone} onChange={(e) => setRoomDraft((current) => ({ ...current, aiTone: e.target.value }))} className="mb-2 w-full rounded-xl border border-sky-100 px-3 py-2 text-xs font-semibold outline-none">
                <option value="default">Mặc định vui vẻ</option>
                <option value="support">Hỗ trợ kỹ thuật</option>
                <option value="fun">Vui nhộn</option>
                <option value="serious">Nghiêm túc</option>
                <option value="gaming">Game thủ</option>
              </select>
              <textarea value={roomDraft.aiPrompt} onChange={(e) => setRoomDraft((current) => ({ ...current, aiPrompt: e.target.value }))} maxLength={1500} rows={4} placeholder="Prompt riêng. Để trống sẽ dùng tone bên trên." className="mb-2 w-full resize-none rounded-xl border border-sky-100 px-3 py-2 text-xs font-semibold outline-none" />
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={roomDraft.aiAutoReply} onChange={(e) => setRoomDraft((current) => ({ ...current, aiAutoReply: e.target.checked }))} />AI tự trả lời mọi tin nhắn</label>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => saveRoom(room.id)} className="flex-1 rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-white">Lưu</button>
              <button type="button" onClick={() => setEditingRoomId(null)} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-500">Hủy</button>
              {room.id !== 1 && <button type="button" onClick={() => deleteRoom(room.id)} className="rounded-xl bg-red-50 px-3 py-2 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div> : <div key={room.id} className={`rounded-2xl transition ${room.id === activeRoomId ? 'bg-sky-500 text-white shadow-lg shadow-sky-100' : 'bg-slate-50 text-slate-700 hover:bg-sky-50'}`}>
            <button type="button" onClick={() => setActiveRoomId(room.id)} className="w-full px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-black">{room.name}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${unreadByRoom[room.id] ? 'bg-emerald-500 text-white' : room.id === activeRoomId ? 'bg-white/20 text-white' : 'bg-white text-sky-600'}`}>{unreadByRoom[room.id] || room.message_count || 0}</span>
              </div>
              {room.description && <p className={`mt-1 line-clamp-2 text-xs ${room.id === activeRoomId ? 'text-white/75' : 'text-slate-400'}`}>{room.description}</p>}
              <div className={`mt-2 flex items-center gap-2 text-[10px] font-black ${room.id === activeRoomId ? 'text-white/75' : 'text-slate-400'}`}>
                {room.is_locked && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />Khóa</span>}
                {room.ai_enabled === false && <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" />AI tắt</span>}
                {room.ai_auto_reply && <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" />Auto</span>}
              </div>
            </button>
            {isAdmin && <div className="flex justify-end px-3 pb-3"><button type="button" onClick={() => startEditRoom(room)} className={`rounded-full p-1.5 ${room.id === activeRoomId ? 'bg-white/15 text-white' : 'bg-white text-slate-500'}`}><Pencil className="h-3.5 w-3.5" /></button></div>}
          </div>)}
        </div>
        {isAdmin && <form onSubmit={createRoom} className="mt-4 space-y-2">
          <div className="flex gap-2">
            <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} maxLength={80} placeholder="Tên phòng mới" className="min-w-0 flex-1 rounded-2xl border border-sky-100 px-3 py-2 text-sm font-semibold outline-none focus:border-sky-300" />
            <button type="submit" disabled={!newRoomName.trim() || creatingRoom} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm disabled:opacity-50"><Plus className="h-4 w-4" /></button>
          </div>
          <textarea value={newRoomDescription} onChange={(e) => setNewRoomDescription(e.target.value)} maxLength={240} rows={2} placeholder="Mô tả ngắn" className="w-full resize-none rounded-2xl border border-sky-100 px-3 py-2 text-xs font-semibold outline-none focus:border-sky-300" />
        </form>}
      </div>
    </aside>
  </div>;
};

export default CommunityChatTab;
