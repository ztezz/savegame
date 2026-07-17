import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Bot, Copy, Hash, Lock, Pencil, Pin, Plus, Radio, Search, Send, Shield, Smile, Sparkles, Trash2, Users, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import api, { API_BASE_URL } from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

const chatPattern = {
  backgroundColor: '#f8fafc',
  backgroundImage: "radial-gradient(circle at 15% 20%, rgba(99, 102, 241, 0.07), transparent 28%), radial-gradient(circle at 85% 75%, rgba(14, 165, 233, 0.07), transparent 28%), url('/pattern.svg')",
  backgroundSize: 'auto, auto, 460px auto',
  backgroundPosition: 'center, center, top left',
  backgroundRepeat: 'no-repeat, no-repeat, repeat',
  backgroundBlendMode: 'normal, normal, soft-light',
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
  const reduceMotion = useReducedMotion();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [roomDraft, setRoomDraft] = useState({ name: '', description: '', isLocked: false, aiEnabled: true, aiBotName: '', aiTone: 'default', aiPrompt: '', aiAutoReply: true });
  const [unreadByRoom, setUnreadByRoom] = useState<Record<number, number>>({});
  const [typingUsers, setTypingUsers] = useState<Record<number, Record<number, string>>>({});
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
  const [roomMemory, setRoomMemory] = useState<{ summary: string; last_message_id: number; updated_at: string | null } | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastMessageIdRef = useRef(0);
  const activeRoomIdRef = useRef(activeRoomId);
  const roomCountsRef = useRef<Record<number, number>>({});
  const roomsInitializedRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingActiveRef = useRef(false);
  const remoteTypingTimeoutsRef = useRef<Map<string, number>>(new Map());
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

  const mergeIncomingMessage = (incoming: ChatMessage) => {
    setMessages((current) => {
      if (incoming.room_id && incoming.room_id !== activeRoomIdRef.current) return current;
      if (current.some((item) => item.id === incoming.id)) return current;
      const merged = [...current, incoming].slice(-200);
      lastMessageIdRef.current = merged.length > 0 ? merged[merged.length - 1].id : 0;
      return merged;
    });
    scrollToBottom();
  };

  useEffect(() => {
    fetchRooms();
    const timer = window.setInterval(fetchRooms, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let events: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;

    const removeTypingUser = (roomId: number, userId: number) => {
      setTypingUsers((current) => {
        const roomUsers = { ...(current[roomId] || {}) };
        delete roomUsers[userId];
        return { ...current, [roomId]: roomUsers };
      });
    };

    const connect = async () => {
      try {
        const response = await api.post('/community/events/ticket');
        if (closed) return;
        events = new EventSource(`${API_BASE_URL}/community/events?ticket=${encodeURIComponent(response.data.ticket)}`);
        events.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'message_created') {
              if (payload.roomId === activeRoomIdRef.current) mergeIncomingMessage(payload.message);
              fetchRooms();
            }
            if (payload.type === 'room_changed') fetchRooms();
            if (payload.type === 'typing' && payload.userId !== currentUser?.id) {
              const timeoutKey = `${payload.roomId}:${payload.userId}`;
              const existingTimeout = remoteTypingTimeoutsRef.current.get(timeoutKey);
              if (existingTimeout) window.clearTimeout(existingTimeout);
              if (payload.typing) {
                setTypingUsers((current) => ({
                  ...current,
                  [payload.roomId]: { ...(current[payload.roomId] || {}), [payload.userId]: payload.displayName },
                }));
                const timeout = window.setTimeout(() => {
                  remoteTypingTimeoutsRef.current.delete(timeoutKey);
                  removeTypingUser(payload.roomId, payload.userId);
                }, 5000);
                remoteTypingTimeoutsRef.current.set(timeoutKey, timeout);
              } else {
                remoteTypingTimeoutsRef.current.delete(timeoutKey);
                removeTypingUser(payload.roomId, payload.userId);
              }
            }
          } catch {
            // Ignore malformed event payloads.
          }
        };
        events.onerror = () => {
          events?.close();
          events = null;
          if (!closed && !reconnectTimer) {
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              void connect();
            }, 2000);
          }
        };
      } catch {
        if (!closed && !reconnectTimer) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            void connect();
          }, 5000);
        }
      }
    };

    void connect();
    return () => {
      closed = true;
      events?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      for (const timeout of remoteTypingTimeoutsRef.current.values()) window.clearTimeout(timeout);
      remoteTypingTimeoutsRef.current.clear();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
    setMessages([]);
    setReplyTo(null);
    setEditingMessageId(null);
    setEditingText('');
    lastMessageIdRef.current = 0;
    setLoading(true);
    setTypingUsers((current) => ({ ...current, [activeRoomId]: {} }));
    typingActiveRef.current = false;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    setUnreadByRoom((current) => ({ ...current, [activeRoomId]: 0 }));
    fetchMessages(true);
    const timer = window.setInterval(() => fetchMessages(false), 4000);
    return () => {
      window.clearInterval(timer);
      if (typingActiveRef.current) {
        void api.post('/community/typing', { roomId: activeRoomId, typing: false }).catch(() => undefined);
        typingActiveRef.current = false;
      }
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
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
      void api.post('/community/typing', { roomId: activeRoomId, typing: false }).catch(() => undefined);
      typingActiveRef.current = false;
      scrollToBottom();
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

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (roomLockedForUser) return;
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      void api.post('/community/typing', { roomId: activeRoomId, typing: true }).catch(() => undefined);
    }
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      typingActiveRef.current = false;
      void api.post('/community/typing', { roomId: activeRoomId, typing: false }).catch(() => undefined);
    }, 2500);
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
      aiAutoReply: room.ai_auto_reply !== false,
    });
    setRoomMemory(null);
  };

  const loadRoomMemory = async (roomId: number) => {
    setMemoryLoading(true);
    try {
      const res = await api.get(`/community/rooms/${roomId}/memory`);
      setRoomMemory(res.data);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không tải được bộ nhớ AI', 'error');
    } finally {
      setMemoryLoading(false);
    }
  };

  const clearRoomMemory = async (roomId: number) => {
    if (!window.confirm('Xóa toàn bộ bộ nhớ dài hạn của AI trong phòng này?')) return;
    try {
      await api.delete(`/community/rooms/${roomId}/memory`);
      setRoomMemory({ summary: '', last_message_id: 0, updated_at: null });
      showToast('Đã xóa bộ nhớ AI', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không xóa được bộ nhớ AI', 'error');
    }
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

  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 px-1 sm:px-0 xl:grid-cols-[280px_minmax(0,1fr)]">
    <div className="order-1 flex min-h-[680px] flex-col overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-2xl shadow-slate-200/60 xl:order-2 xl:h-[calc(100vh-9rem)]">
      <div className="relative overflow-hidden border-b border-white/10 bg-slate-950 p-5 text-white sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-inner shadow-white/5"><Hash className="h-5 w-5 text-indigo-300" /></div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h3 className="truncate text-lg font-black tracking-tight">{activeRoom?.name || 'Phòng chat cộng đồng'}</h3><span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300"><Radio className="h-2.5 w-2.5" />Live</span></div>
            <p className="mt-1 truncate text-xs text-slate-400">{activeRoom?.description || 'Không gian trò chuyện của cộng đồng CloudSave.'}</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[10px] font-black sm:flex">
          {activeRoom?.ai_enabled !== false && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-indigo-200"><Sparkles className="h-3 w-3" />{activeRoom?.ai_auto_reply ? 'AI tự động' : 'AI sẵn sàng'}</span>}
          {activeRoom?.is_locked && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-amber-200"><Lock className="h-3 w-3" />Đã khóa</span>}
        </div>
        </div>

        <div className="relative mt-4 flex gap-2 overflow-x-auto pb-1 xl:hidden">
          {rooms.map((room) => <button key={room.id} type="button" onClick={() => setActiveRoomId(room.id)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-black transition ${room.id === activeRoomId ? 'border-white bg-white text-slate-950 shadow-lg' : 'border-white/10 bg-white/[0.06] text-slate-300'}`}><span className="flex items-center gap-1.5"><Hash className="h-3 w-3" />{room.name}{!!unreadByRoom[room.id] && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] text-white">{unreadByRoom[room.id]}</span>}</span></button>)}
        </div>
      </div>

      <div className="border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm transition focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100/60">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Tìm trong phòng chat..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400" />
          {chatSearch && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-600">{visibleMessages.length}</span>}
          {chatSearch && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setChatSearch('')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200"><X className="h-3.5 w-3.5" /></button>}
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

      <div ref={listRef} onScroll={handleScroll} className="relative flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" style={chatPattern}>
        {loading ? <div className="rounded-2xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-500 shadow-sm backdrop-blur">Đang tải tin nhắn...</div> : visibleMessages.length === 0 ? <div className="h-full flex items-center justify-center text-center text-slate-600 text-sm"><div className="rounded-3xl bg-white/80 px-6 py-5 shadow-sm backdrop-blur">{chatSearch ? 'Không tìm thấy tin nhắn phù hợp.' : 'Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.'}</div></div> : visibleMessages.map((item, index) => {
          const mine = item.user_id === currentUser?.id || item.username === currentUser?.username;
          const isAi = item.sender_type === 'ai' || item.role === 'AI';
          const previous = visibleMessages[index - 1];
          const reply = findReply(item.reply_to_id);
          const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(item.created_at).toDateString();
          return <React.Fragment key={item.id}>
            {showDay && <div className="sticky top-2 z-10 flex justify-center"><span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-black text-sky-700 shadow-sm backdrop-blur">{formatDay(item.created_at)}</span></div>}
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25 }} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
            {!mine && <div className={`mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[10px] font-black text-white shadow-sm ${isAi ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-800'}`}>{isAi ? <Bot className="h-4 w-4" /> : avatarLabel(item)}</div>}
            <div className={`relative max-w-[88%] px-4 py-3 shadow-sm sm:max-w-[72%] ${mine ? 'rounded-2xl rounded-br-md bg-indigo-600 text-white shadow-indigo-100' : isAi ? 'rounded-2xl rounded-bl-md border border-violet-100 bg-violet-50 text-slate-800' : 'rounded-2xl rounded-bl-md border border-slate-200/70 bg-white text-slate-800'}`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={`text-xs font-black ${mine ? 'text-indigo-100' : isAi ? 'text-violet-700' : 'text-slate-700'}`}>{item.display_name || item.username}{item.role === 'Admin' && <Shield className="inline w-3 h-3 ml-1" />}{isAi && <span className="ml-1 rounded-full bg-violet-200 px-1.5 py-0.5 text-[9px] text-violet-800">AI</span>}</span>
                <span className={`text-[10px] ${mine ? 'text-indigo-100' : 'text-slate-400'}`}>{item.pinned_at && <Pin className="mr-1 inline h-3 w-3" />}{new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
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
            </motion.div>
          </React.Fragment>;
        })}
        {sending && <div className="flex justify-end"><div className="rounded-full bg-white/80 px-4 py-2 text-xs font-bold text-sky-700 shadow-sm backdrop-blur">Đang gửi...</div></div>}
        {Object.keys(typingUsers[activeRoomId] || {}).length > 0 && <div className="flex justify-start"><div className="rounded-full bg-white/85 px-4 py-2 text-xs font-bold text-slate-600 shadow-sm backdrop-blur">{Object.values(typingUsers[activeRoomId]).slice(0, 2).join(', ')} đang gõ...</div></div>}
        {aiTyping && <div className="flex justify-start"><div className="rounded-full bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 shadow-sm backdrop-blur">AI đang gõ...</div></div>}
        {showScrollButton && <button type="button" aria-label="Cuộn xuống tin nhắn mới nhất" onClick={scrollToBottom} className="sticky bottom-3 left-full ml-auto flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white shadow-xl transition hover:bg-indigo-600"><ArrowDown className="h-4 w-4" /></button>}
      </div>

      <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white/95 p-3 backdrop-blur sm:p-4">
        {roomLockedForUser && <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700">Phòng này đang bị khóa, chỉ admin có thể gửi tin nhắn.</div>}
        {replyTo && <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border-l-4 border-sky-400 bg-white px-4 py-2 text-sm shadow-sm">
          <div className="min-w-0">
            <p className="font-black text-sky-700">Đang trả lời {replyTo.display_name || replyTo.username}</p>
            <p className="truncate text-xs text-slate-500">{replyTo.message}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} className="rounded-full px-2 py-1 text-xs font-black text-slate-400 hover:bg-slate-100">Hủy</button>
        </div>}
        <div className="relative mb-2">
          <button type="button" onClick={() => setEmojiOpen((open) => !open)} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50"><Smile className="h-3.5 w-3.5" />Biểu cảm</button>
          {emojiOpen && <div className="absolute bottom-full left-0 z-20 mb-2 flex max-w-[min(92vw,420px)] gap-2 overflow-x-auto rounded-2xl border border-sky-100 bg-white p-3 shadow-2xl shadow-sky-200/60">
            {quickEmojis.map((emoji) => <button key={emoji} type="button" onClick={() => addEmoji(emoji)} disabled={sending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm transition hover:scale-110 hover:bg-sky-100 disabled:opacity-50">{emoji}</button>)}
          </div>}
        </div>
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2 transition focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100/60">
          <textarea value={message} onChange={(e)=>handleMessageChange(e.target.value)} onKeyDown={handleMessageKeyDown} maxLength={1000} rows={2} disabled={roomLockedForUser} placeholder={roomLockedForUser ? 'Phòng đang bị khóa' : `Nhắn tin tới #${activeRoom?.name || 'cộng đồng'}`} className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm font-medium outline-none placeholder:text-slate-400 disabled:text-slate-400" />
          <motion.button whileTap={reduceMotion ? undefined : { scale: 0.92 }} type="submit" disabled={!message.trim() || sending || roomLockedForUser} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"><Send className="h-4 w-4" /></motion.button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold text-slate-400"><span>Enter để gửi · Shift + Enter để xuống dòng</span><span>{message.length}/1000</span></div>
      </form>
    </div>

    <aside className="order-2 space-y-4 xl:order-1 xl:max-h-[calc(100vh-9rem)] xl:overflow-y-auto xl:pr-1">
      <div className="rounded-[1.75rem] border border-slate-200/80 bg-slate-950 p-5 text-white shadow-xl shadow-slate-200">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-indigo-300"><Users className="h-5 w-5" /></div>
          <div>
            <h4 className="font-black text-white">Kênh cộng đồng</h4>
            <p className="text-xs font-semibold text-slate-400">{rooms.length} kênh đang hoạt động</p>
          </div>
        </div>
        <div className="space-y-2">
          {rooms.map((room) => editingRoomId === room.id ? <div key={room.id} className="rounded-2xl border border-white/10 bg-white p-3 text-slate-900">
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
              <label className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={roomDraft.aiAutoReply} onChange={(e) => setRoomDraft((current) => ({ ...current, aiAutoReply: e.target.checked }))} />AI tự trả lời mọi tin nhắn</label>
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-violet-700">Bộ nhớ dài hạn</span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => loadRoomMemory(room.id)} disabled={memoryLoading} className="rounded-lg bg-white px-2 py-1 text-[10px] font-black text-violet-600 disabled:opacity-50">{memoryLoading ? 'Đang tải' : roomMemory ? 'Làm mới' : 'Xem'}</button>
                    {roomMemory?.summary && <button type="button" onClick={() => clearRoomMemory(room.id)} className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black text-red-600">Xóa</button>}
                  </div>
                </div>
                {roomMemory && <div className="mt-2">
                  <p className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-[10px] leading-relaxed text-slate-600">{roomMemory.summary || 'AI chưa tạo bộ nhớ cho phòng này.'}</p>
                  {roomMemory.updated_at && <p className="mt-1 text-[9px] font-bold text-violet-400">Cập nhật {new Date(roomMemory.updated_at).toLocaleString('vi-VN')}</p>}
                </div>}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => saveRoom(room.id)} className="flex-1 rounded-xl bg-sky-500 px-3 py-2 text-xs font-black text-white">Lưu</button>
              <button type="button" onClick={() => setEditingRoomId(null)} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-500">Hủy</button>
              {room.id !== 1 && <button type="button" onClick={() => deleteRoom(room.id)} className="rounded-xl bg-red-50 px-3 py-2 text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          </div> : <div key={room.id} className={`rounded-xl border transition ${room.id === activeRoomId ? 'border-indigo-400/30 bg-indigo-500/20 text-white' : 'border-transparent text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
            <button type="button" onClick={() => setActiveRoomId(room.id)} className="w-full px-4 py-3 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 truncate text-sm font-black"><Hash className="h-3.5 w-3.5 shrink-0" />{room.name}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${unreadByRoom[room.id] ? 'bg-rose-500 text-white' : room.id === activeRoomId ? 'bg-white/10 text-indigo-200' : 'bg-white/5 text-slate-500'}`}>{unreadByRoom[room.id] || room.message_count || 0}</span>
              </div>
              {room.description && <p className={`mt-1 line-clamp-2 pl-5 text-xs ${room.id === activeRoomId ? 'text-indigo-200/70' : 'text-slate-500'}`}>{room.description}</p>}
              <div className={`mt-2 flex items-center gap-2 pl-5 text-[10px] font-black ${room.id === activeRoomId ? 'text-indigo-200/70' : 'text-slate-600'}`}>
                {room.is_locked && <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />Khóa</span>}
                {room.ai_enabled === false && <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" />AI tắt</span>}
                {room.ai_auto_reply && <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" />Auto</span>}
              </div>
            </button>
            {isAdmin && <div className="flex justify-end px-3 pb-3"><button type="button" aria-label={`Chỉnh sửa ${room.name}`} onClick={() => startEditRoom(room)} className="rounded-lg bg-white/10 p-1.5 text-slate-300 hover:bg-white/20 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button></div>}
          </div>)}
        </div>
        {isAdmin && <form onSubmit={createRoom} className="mt-4 space-y-2">
          <div className="flex gap-2">
             <input value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} maxLength={80} placeholder="Tên kênh mới" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" />
             <button type="submit" disabled={!newRoomName.trim() || creatingRoom} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-sm disabled:opacity-50"><Plus className="h-4 w-4" /></button>
          </div>
          <textarea value={newRoomDescription} onChange={(e) => setNewRoomDescription(e.target.value)} maxLength={240} rows={2} placeholder="Mô tả ngắn" className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 text-xs font-semibold text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" />
        </form>}
      </div>
    </aside>
  </motion.div>;
};

export default CommunityChatTab;
