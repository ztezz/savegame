import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Bot, ChevronDown, Copy, ExternalLink, File, HardDrive, Hash, Loader2, Lock, Menu, Paperclip, Pin, Radio, Search, Send, Shield, Smile, Sparkles, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import api, { API_BASE_URL, API_ORIGIN } from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

const chatPattern = {
  backgroundColor: '#b7dca9',
  backgroundImage: "linear-gradient(135deg, rgba(226, 232, 132, 0.55), rgba(74, 171, 135, 0.3)), url('/pattern.svg')",
  backgroundSize: 'auto, 440px auto',
  backgroundPosition: 'center, center, top left',
  backgroundRepeat: 'no-repeat, repeat',
  backgroundBlendMode: 'normal, soft-light',
};

interface ChatMessage {
  id: number;
  room_id?: number;
  user_id: number;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
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
  onOpenMenu: () => void;
}

interface ChatMember {
  id: number;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: string;
}

interface ChatDriveShare {
  token: string;
  original_name: string;
  mime_type: string | null;
  file_size: number;
}

type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

const CHAT_DRAFT_KEY = 'communityChatDrafts';
const shareTokenPattern = /\/share\/([a-f0-9]{48})(?:\b|[/?#])/gi;

const extractShareTokens = (text: string) => Array.from(text.matchAll(shareTokenPattern), (match) => match[1].toLowerCase());

const formatDriveFileSize = (size: number) => {
  if (!size) return '0 B';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const getStoredDrafts = (): Record<number, string> => {
  try {
    return JSON.parse(localStorage.getItem(CHAT_DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
};

const CommunityChatTab: React.FC<CommunityChatTabProps> = ({ currentUser, onOpenMenu }) => {
  const { showToast } = useToast();
  const reduceMotion = useReducedMotion();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [unreadByRoom, setUnreadByRoom] = useState<Record<number, number>>({});
  const [typingUsers, setTypingUsers] = useState<Record<number, Record<number, string>>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [deletingMessage, setDeletingMessage] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [searchResults, setSearchResults] = useState<ChatMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveShares, setDriveShares] = useState<ChatDriveShare[]>([]);
  const [driveSharesLoading, setDriveSharesLoading] = useState(false);
  const [driveMetadata, setDriveMetadata] = useState<Record<string, ChatDriveShare>>({});
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const draftsRef = useRef<Record<number, string>>(getStoredDrafts());
  const listRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
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
  const visibleMessages = messages;
  const pinnedMessages = messages.filter((item) => item.pinned_at).slice(-3).reverse();
  const mentionSuggestions = mentionQuery === null ? [] : members
    .filter((member) => member.id !== currentUser?.id)
    .filter((member) => `${member.username} ${member.display_name || ''}`.toLocaleLowerCase('vi').includes(mentionQuery.toLocaleLowerCase('vi')))
    .slice(0, 6);
  const onlineMembers = members.filter((member) => onlineUserIds.includes(member.id));

  const isNearBottom = () => {
    const el = listRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    setNewMessageCount(0);
  };

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const awayFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight > 180;
    setShowScrollButton(awayFromBottom);
    if (!awayFromBottom) setNewMessageCount(0);
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
      if (incoming.length > 0 && !incoming.some((room) => room.id === activeRoomIdRef.current)) setActiveRoomId(incoming[0].id);
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không tải được danh sách phòng', 'error');
    }
  };

  const fetchMessages = async (roomId: number, initial = false) => {
    try {
      const lastId = initial ? 0 : lastMessageIdRef.current;
      const shouldStickToBottom = isNearBottom();
      const res = await api.get('/community/messages', { params: lastId ? { roomId, afterId: lastId } : { roomId, limit: 80 } });
      if (activeRoomIdRef.current !== roomId) return;
      const incoming = Array.isArray(res.data) ? res.data : [];
      if (initial) {
        setMessages(incoming);
        setHasOlder(incoming.length === 80);
        lastMessageIdRef.current = incoming.length > 0 ? incoming[incoming.length - 1].id : 0;
      } else if (incoming.length > 0) {
        setMessages((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const merged = [...current, ...incoming.filter((item) => !existingIds.has(item.id))].slice(-200);
          lastMessageIdRef.current = merged.length > 0 ? merged[merged.length - 1].id : 0;
          return merged;
        });
      }
      if (initial || (incoming.length > 0 && shouldStickToBottom)) scrollToBottom();
      else if (incoming.length > 0) setNewMessageCount((count) => count + incoming.length);
    } catch (err: any) {
      if (initial) showToast(err.response?.data?.error || 'Không tải được phòng chat', 'error');
    } finally {
      if (initial) setLoading(false);
    }
  };

  const mergeIncomingMessage = (incoming: ChatMessage) => {
    const shouldStickToBottom = isNearBottom();
    let added = false;
    setMessages((current) => {
      if (incoming.room_id && incoming.room_id !== activeRoomIdRef.current) return current;
      if (current.some((item) => item.id === incoming.id)) return current;
      added = true;
      const merged = [...current, incoming].slice(-200);
      lastMessageIdRef.current = merged.length > 0 ? merged[merged.length - 1].id : 0;
      return merged;
    });
    if (shouldStickToBottom) scrollToBottom();
    else if (added) setNewMessageCount((count) => count + 1);
  };

  const loadDriveShares = async () => {
    setDriveSharesLoading(true);
    try {
      const response = await api.get('/drive/shares');
      const shares = Array.isArray(response.data) ? response.data : response.data?.shares;
      if (!Array.isArray(shares)) throw new Error('Drive shares endpoint unavailable');
      setDriveShares(shares.map((share: any) => ({ token: share.token, original_name: share.original_name, mime_type: share.mime_type || null, file_size: Number(share.file_size || 0) })).filter((share: ChatDriveShare) => share.token && share.original_name));
    } catch {
      try {
        const response = await api.get('/drive/files', { params: { search: '%' } });
        const now = Date.now();
        const shares = Array.isArray(response.data?.files) ? response.data.files
          .filter((file: any) => file?.share_token && (!file.share_expires_at || new Date(file.share_expires_at).getTime() > now))
          .map((file: any) => ({ token: file.share_token, original_name: file.original_name, mime_type: file.mime_type || null, file_size: Number(file.file_size || 0) })) : [];
        setDriveShares(shares);
      } catch (err: any) {
        showToast(err.response?.data?.error || 'Không tải được file Drive đang chia sẻ', 'error');
      }
    } finally {
      setDriveSharesLoading(false);
    }
  };

  const insertDriveShare = (share: ChatDriveShare) => {
    const url = `${window.location.origin}/share/${share.token}`;
    setMessage((current) => {
      const next = `${current}${current && !current.endsWith('\n') ? '\n' : ''}${url}\n`;
      draftsRef.current[activeRoomId] = next;
      localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify(draftsRef.current));
      return next;
    });
    setDriveMetadata((current) => ({ ...current, [share.token.toLowerCase()]: share }));
    setDrivePickerOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasOlder || messages.length === 0) return;
    const roomId = activeRoomIdRef.current;
    const list = listRef.current;
    const previousHeight = list?.scrollHeight || 0;
    setLoadingOlder(true);
    try {
      const response = await api.get('/community/messages', { params: { roomId, beforeId: messages[0].id, limit: 60 } });
      if (activeRoomIdRef.current !== roomId) return;
      const incoming = Array.isArray(response.data) ? response.data : [];
      setHasOlder(incoming.length === 60);
      setMessages((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...incoming.filter((item) => !existingIds.has(item.id)), ...current];
      });
      requestAnimationFrame(() => {
        if (list) list.scrollTop += list.scrollHeight - previousHeight;
      });
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không tải được tin nhắn cũ', 'error');
    } finally {
      setLoadingOlder(false);
    }
  };

  const jumpToMessage = async (messageId: number) => {
    const scrollToTarget = () => {
      requestAnimationFrame(() => {
        document.getElementById(`community-message-${messageId}`)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        setHighlightedMessageId(messageId);
        window.setTimeout(() => setHighlightedMessageId((current) => current === messageId ? null : current), 2200);
      });
    };
    if (messages.some((item) => item.id === messageId)) {
      setChatSearch('');
      setSearchResults([]);
      scrollToTarget();
      return;
    }
    try {
      const response = await api.get(`/community/messages/${messageId}/context`, { params: { roomId: activeRoomIdRef.current } });
      const incoming = Array.isArray(response.data) ? response.data : [];
      setMessages(incoming);
      setHasOlder(incoming.length > 0 && incoming[0].id > 1);
      lastMessageIdRef.current = incoming.length ? incoming[incoming.length - 1].id : 0;
      setChatSearch('');
      setSearchResults([]);
      scrollToTarget();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Không mở được tin nhắn', 'error');
    }
  };

  useEffect(() => {
    fetchRooms();
    api.get('/community/members').then((response) => setMembers(Array.isArray(response.data) ? response.data : [])).catch(() => undefined);
    return undefined;
  }, []);

  useEffect(() => {
    const handleVisibility = () => setPageVisible(!document.hidden);
    const handleOnline = () => setConnectionState((state) => state === 'offline' ? 'connecting' : state);
    const handleOffline = () => setConnectionState('offline');
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
      if (!navigator.onLine) {
        setConnectionState('offline');
        return;
      }
      setConnectionState((state) => state === 'live' ? state : 'connecting');
      try {
        const response = await api.post('/community/events/ticket');
        if (closed) return;
        events = new EventSource(`${API_BASE_URL}/community/events?ticket=${encodeURIComponent(response.data.ticket)}`);
        events.addEventListener('ready', () => {
          setConnectionState('live');
          void fetchRooms();
          void fetchMessages(activeRoomIdRef.current, false);
        });
        events.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'message_created') {
              if (payload.roomId === activeRoomIdRef.current) mergeIncomingMessage(payload.message);
              fetchRooms();
            }
            if (payload.type === 'message_updated' && payload.roomId === activeRoomIdRef.current) {
              setMessages((current) => current.map((item) => item.id === payload.messageId ? { ...item, ...payload.changes } : item));
            }
            if (payload.type === 'message_deleted' && payload.roomId === activeRoomIdRef.current) {
              setMessages((current) => current.filter((item) => item.id !== payload.messageId));
              setReplyTo((current) => current?.id === payload.messageId ? null : current);
              setEditingMessageId((current) => current === payload.messageId ? null : current);
              fetchRooms();
            }
            if (payload.type === 'room_changed') fetchRooms();
            if (payload.type === 'presence') setOnlineUserIds(Array.isArray(payload.userIds) ? payload.userIds : []);
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
          setConnectionState(navigator.onLine ? 'reconnecting' : 'offline');
          setOnlineUserIds([]);
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
        setConnectionState(navigator.onLine ? 'reconnecting' : 'offline');
        if (!closed && !reconnectTimer) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            void connect();
          }, 5000);
        }
      }
    };

    void connect();
    const reconnectWhenOnline = () => {
      if (!closed && !events && !reconnectTimer) void connect();
    };
    window.addEventListener('online', reconnectWhenOnline);
    return () => {
      closed = true;
      setConnectionState('offline');
      window.removeEventListener('online', reconnectWhenOnline);
      events?.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      for (const timeout of remoteTypingTimeoutsRef.current.values()) window.clearTimeout(timeout);
      remoteTypingTimeoutsRef.current.clear();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!pageVisible) return;
    const fallbackInterval = connectionState === 'live' ? 30000 : 6000;
    const timer = window.setInterval(() => {
      void fetchRooms();
      if (connectionState !== 'live') void fetchMessages(activeRoomIdRef.current, false);
    }, fallbackInterval);
    return () => window.clearInterval(timer);
  }, [connectionState, pageVisible]);

  useEffect(() => {
    const tokens = Array.from(new Set(messages.flatMap((item) => extractShareTokens(item.message))))
      .filter((token) => !driveMetadata[token]);
    if (tokens.length === 0) return;
    let cancelled = false;
    api.post('/community/drive-shares/metadata', { tokens }).then((response) => {
      if (cancelled || !Array.isArray(response.data)) return;
      setDriveMetadata((current) => ({ ...current, ...Object.fromEntries(response.data.map((share: ChatDriveShare) => [share.token.toLowerCase(), share])) }));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [messages, driveMetadata]);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
    setMessages([]);
    setReplyTo(null);
    setEditingMessageId(null);
    setEditingText('');
    setDeletingMessage(null);
    setNewMessageCount(0);
    setMentionQuery(null);
    setMentionStart(null);
    setDrivePickerOpen(false);
    setSearchResults([]);
    setChatSearch('');
    setHighlightedMessageId(null);
    setMessage(draftsRef.current[activeRoomId] || '');
    requestAnimationFrame(() => {
      if (!composerRef.current) return;
      composerRef.current.style.height = 'auto';
      composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 128)}px`;
    });
    lastMessageIdRef.current = 0;
    setLoading(true);
    setTypingUsers((current) => ({ ...current, [activeRoomId]: {} }));
    typingActiveRef.current = false;
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    setUnreadByRoom((current) => ({ ...current, [activeRoomId]: 0 }));
    fetchMessages(activeRoomId, true);
    return () => {
      if (typingActiveRef.current) {
        void api.post('/community/typing', { roomId: activeRoomId, typing: false }).catch(() => undefined);
        typingActiveRef.current = false;
      }
      if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    };
  }, [activeRoomId]);

  useEffect(() => {
    const query = chatSearch.trim();
    if (!searchOpen || query.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await api.get('/community/messages/search', { params: { roomId: activeRoomId, q: query } });
        if (!cancelled) setSearchResults(Array.isArray(response.data) ? response.data : []);
      } catch (err: any) {
        if (!cancelled) showToast(err.response?.data?.error || 'Tìm kiếm tin nhắn thất bại', 'error');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeRoomId, chatSearch, searchOpen, showToast]);

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
      delete draftsRef.current[activeRoomId];
      localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify(draftsRef.current));
      if (composerRef.current) composerRef.current.style.height = 'auto';
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
    if (mentionSuggestions.length > 0 && mentionQuery !== null) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveMentionIndex((index) => event.key === 'ArrowDown' ? (index + 1) % mentionSuggestions.length : (index - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        insertMention(mentionSuggestions[activeMentionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setMentionQuery(null);
        setMentionStart(null);
        return;
      }
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!message.trim() || sending) return;
    event.currentTarget.form?.requestSubmit();
  };

  const handleMessageChange = (value: string, cursorPosition = value.length) => {
    setMessage(value);
    if (value) draftsRef.current[activeRoomId] = value;
    else delete draftsRef.current[activeRoomId];
    localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify(draftsRef.current));
    const match = value.slice(0, cursorPosition).match(/(?:^|\s)@([^\s@]{0,30})$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cursorPosition - match[1].length - 1);
      setActiveMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionStart(null);
    }
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
    setMessage((current) => {
      const next = `${current}${emoji}`;
      draftsRef.current[activeRoomId] = next;
      localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify(draftsRef.current));
      return next;
    });
    setEmojiOpen(false);
  };

  const avatarLabel = (item: ChatMessage) => (item.display_name || item.username || '?').slice(0, 1).toUpperCase();

  const renderMessageText = (text: string) => {
    const ownUsername = String(currentUser?.username || '').toLocaleLowerCase('vi');
    return text.split(/(@[\w.-]+)/g).map((part, index) => {
      if (!part.startsWith('@')) return <React.Fragment key={index}>{part}</React.Fragment>;
      const isMe = part.slice(1).toLocaleLowerCase('vi') === ownUsername;
      return <span key={index} className={`rounded-md px-1 py-0.5 font-black ${isMe ? 'bg-amber-300 text-amber-950 ring-2 ring-amber-200/60' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200'}`}>{part}</span>;
    });
  };

  const renderDriveCards = (text: string) => Array.from(new Set(extractShareTokens(text))).map((token) => {
    const share = driveMetadata[token];
    if (!share) return null;
    const shareUrl = `${window.location.origin}/share/${share.token}`;
    const downloadUrl = `${API_BASE_URL}/drive/share/${encodeURIComponent(share.token)}/download`;
    return <div key={token} className="mt-3 overflow-hidden rounded-2xl border border-indigo-100 bg-white/90 shadow-sm dark:border-indigo-900 dark:bg-slate-900/80">
      <div className="flex items-center gap-3 p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><File className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-black text-slate-800 dark:text-white">{share.original_name}</p><p className="mt-1 text-[10px] font-bold text-slate-400">{formatDriveFileSize(Number(share.file_size))} · Drive Share</p></div></div>
      <div className="grid grid-cols-2 border-t border-slate-100 dark:border-slate-800"><a href={shareUrl} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 border-r border-slate-100 px-3 py-2 text-[10px] font-black text-indigo-600 transition hover:bg-indigo-50 dark:border-slate-800 dark:text-indigo-300 dark:hover:bg-indigo-950"><ExternalLink className="h-3.5 w-3.5" />Mở file</a><a href={downloadUrl} className="inline-flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-black text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"><ArrowDown className="h-3.5 w-3.5" />Tải xuống</a></div>
    </div>;
  });

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

  const insertMention = (member: ChatMember) => {
    if (mentionStart === null) return;
    const textarea = composerRef.current;
    const cursor = textarea?.selectionStart ?? message.length;
    const mention = `@${member.username} `;
    const nextMessage = `${message.slice(0, mentionStart)}${mention}${message.slice(cursor)}`;
    setMessage(nextMessage);
    draftsRef.current[activeRoomId] = nextMessage;
    localStorage.setItem(CHAT_DRAFT_KEY, JSON.stringify(draftsRef.current));
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      if (!textarea) return;
      const nextCursor = mentionStart + mention.length;
      textarea.focus();
      textarea.setSelectionRange(nextCursor, nextCursor);
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
    });
  };

  const deleteMessage = async () => {
    if (!deletingMessage || deleting) return;
    setDeleting(true);
    try {
      await api.delete(`/community/messages/${deletingMessage.id}`);
      setMessages((current) => current.filter((item) => item.id !== deletingMessage.id));
      if (replyTo?.id === deletingMessage.id) setReplyTo(null);
      if (editingMessageId === deletingMessage.id) {
        setEditingMessageId(null);
        setEditingText('');
      }
      setDeletingMessage(null);
      showToast('Đã xóa tin nhắn', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Xóa tin nhắn thất bại', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return <motion.div initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="admin-dark-surface relative col-span-12 h-full min-h-0 overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-indigo-50 via-slate-100 to-emerald-50 p-1.5 dark:from-slate-950 dark:via-indigo-950/70 dark:to-emerald-950/60 sm:p-2">
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-55" style={{ backgroundImage: 'radial-gradient(circle at 12% 18%, rgba(99,102,241,.3), transparent 24%), radial-gradient(circle at 88% 82%, rgba(16,185,129,.22), transparent 25%), radial-gradient(rgba(100,116,139,.2) 1px, transparent 1px)', backgroundSize: 'auto, auto, 20px 20px' }} />
    <div aria-hidden="true" className="pointer-events-none absolute -left-12 top-1/3 h-40 w-40 rounded-full border border-indigo-300/40 dark:border-indigo-500/20" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-1/4 h-56 w-56 rounded-full border border-emerald-300/40 dark:border-emerald-500/20" />
    <div className="relative z-10 flex h-[calc(100dvh-8.5rem)] min-h-[34rem] flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-indigo-200/50 dark:border-slate-700/80 dark:shadow-black/40 sm:h-[calc(100dvh-10rem)] lg:h-full lg:min-h-[42rem]">
      <div className="relative overflow-hidden border-b border-white/10 bg-slate-950 p-5 text-white sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onOpenMenu} aria-label="Mở menu" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-slate-200 lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-inner shadow-white/5"><Hash className="h-5 w-5 text-indigo-300" /></div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative min-w-0">
                <select aria-label="Chọn phòng chat" value={activeRoomId} onChange={(event) => setActiveRoomId(Number(event.target.value))} className="max-w-[55vw] appearance-none truncate rounded-xl border border-white/10 bg-white/[0.08] py-2 pl-3 pr-9 text-sm font-black text-white outline-none transition hover:bg-white/[0.13] focus:border-indigo-400 sm:max-w-sm sm:text-base">
                  {rooms.map((room) => <option key={room.id} value={room.id} className="bg-slate-900 text-white">#{room.name}{unreadByRoom[room.id] ? ` (${unreadByRoom[room.id]} mới)` : ''}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-300" />
              </div>
              <span className={`hidden items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest sm:inline-flex ${connectionState === 'live' ? 'bg-emerald-400/10 text-emerald-300' : connectionState === 'offline' ? 'bg-red-400/10 text-red-300' : 'bg-amber-400/10 text-amber-300'}`}><Radio className={`h-2.5 w-2.5 ${connectionState !== 'live' && connectionState !== 'offline' ? 'animate-pulse' : ''}`} />{connectionState === 'live' ? 'Live' : connectionState === 'offline' ? 'Offline' : 'Đang nối'}</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-400">{activeRoom?.description || 'Không gian trò chuyện của cộng đồng.'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black">
          <div className="hidden items-center gap-2 sm:flex">
            {activeRoom?.ai_enabled !== false && <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-indigo-200"><Sparkles className="h-3 w-3" />{activeRoom?.ai_auto_reply ? 'AI tự động' : 'AI sẵn sàng'}</span>}
            {activeRoom?.is_locked && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-amber-200"><Lock className="h-3 w-3" />Đã khóa</span>}
          </div>
          <button type="button" onClick={() => { setSearchOpen((open) => !open); if (searchOpen) { setChatSearch(''); setSearchResults([]); } }} aria-label={searchOpen ? 'Đóng tìm kiếm' : 'Tìm trong phòng chat'} aria-expanded={searchOpen} className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${searchOpen ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-white/10 bg-white/[0.07] text-slate-300 hover:bg-white/15 hover:text-white'}`}>{searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}</button>
        </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex min-w-0 items-center gap-2"><div className="flex -space-x-2">{onlineMembers.slice(0, 5).map((member) => <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} key={member.id} title={member.display_name || member.username} className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-gradient-to-br from-indigo-500 to-violet-600 text-[9px] font-black text-white dark:border-slate-900">{member.avatar_url ? <img src={`${API_ORIGIN}${member.avatar_url}`} alt="" className="h-full w-full object-cover" /> : (member.display_name || member.username).slice(0, 1).toUpperCase()}<span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-emerald-400" /></motion.span>)}</div><p className="truncate text-[10px] font-bold text-slate-500">{connectionState === 'live' ? `${onlineMembers.length} thành viên đang online` : connectionState === 'offline' ? 'Mất kết nối mạng' : 'Đang khôi phục kết nối realtime...'}</p></div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider ${connectionState === 'live' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : connectionState === 'offline' ? 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>{connectionState === 'live' ? 'Realtime' : connectionState === 'offline' ? 'Ngoại tuyến' : 'Polling dự phòng'}</span>
      </div>

      {rooms.length > 1 && <div className="hidden gap-2 overflow-x-auto border-b border-slate-100 bg-white px-4 py-3 sm:flex dark:border-slate-800 dark:bg-slate-900">
        {rooms.map((room) => <motion.button layout key={room.id} type="button" onClick={() => setActiveRoomId(room.id)} className={`group relative flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition ${activeRoomId === room.id ? 'border-indigo-200 bg-indigo-600 text-white shadow-md shadow-indigo-100 dark:shadow-none' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-200 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
          <Hash className={`h-3.5 w-3.5 ${activeRoomId === room.id ? 'text-indigo-200' : 'text-slate-400 group-hover:text-indigo-500'}`} />
          <span>{room.name}</span>
          {unreadByRoom[room.id] > 0 && <motion.span initial={{ scale: 0.7 }} animate={{ scale: 1 }} className={`min-w-5 rounded-full px-1.5 py-0.5 text-[9px] ${activeRoomId === room.id ? 'bg-white text-indigo-700' : 'bg-rose-500 text-white'}`}>{Math.min(unreadByRoom[room.id], 99)}</motion.span>}
          {room.is_locked && <Lock className="h-3 w-3 text-amber-400" />}
        </motion.button>)}
      </div>}

      <AnimatePresence initial={false}>{searchOpen && <motion.div initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }} className="overflow-hidden border-b border-slate-100 bg-white">
        <div className="px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm transition focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100/60 dark:focus-within:bg-slate-800 dark:focus-within:ring-indigo-950">
          <Search className="h-4 w-4 text-slate-400" />
          <input autoFocus value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Tìm trong phòng chat..." className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:caret-indigo-400" />
           {searching ? <Loader2 className="h-4 w-4 animate-spin text-indigo-500" /> : chatSearch.trim().length >= 2 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">{searchResults.length}</span>}
          {chatSearch && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setChatSearch('')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <AnimatePresence>{chatSearch.trim().length >= 2 && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800">
          {!searching && searchResults.length === 0 ? <p className="px-3 py-5 text-center text-xs font-bold text-slate-400">Không tìm thấy tin nhắn phù hợp.</p> : searchResults.map((result) => <button key={result.id} type="button" onClick={() => jumpToMessage(result.id)} className="flex w-full items-start gap-3 rounded-xl bg-white px-3 py-2.5 text-left transition hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-950/70">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-800 text-[10px] font-black text-white">{result.avatar_url ? <img src={`${API_ORIGIN}${result.avatar_url}`} alt="" className="h-full w-full object-cover" /> : (result.display_name || result.username).slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black text-slate-800 dark:text-white">{result.display_name || result.username}</span><span className="shrink-0 text-[9px] font-bold text-slate-400">{new Date(result.created_at).toLocaleString('vi-VN')}</span></span><span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{result.message}</span></span>
          </button>)}
        </div></motion.div>}</AnimatePresence>
        </div>
      </motion.div>}</AnimatePresence>

      <AnimatePresence initial={false}>{pinnedMessages.length > 0 && <motion.div initial={reduceMotion ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="border-b border-amber-100 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/50">
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-700 dark:text-amber-300"><Pin className="h-3.5 w-3.5" />Tin ghim</div>
        <div className="space-y-2">
          {pinnedMessages.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-800">
            <button type="button" onClick={() => jumpToMessage(item.id)} className="min-w-0 flex-1 text-left">
              <p className="text-xs font-black text-amber-700 dark:text-amber-300">{item.display_name || item.username}</p>
              <p className="truncate font-semibold text-slate-700 dark:text-slate-200">{item.message}</p>
            </button>
            {isAdmin && <button type="button" onClick={() => togglePin(item)} className="rounded-full p-1 text-amber-600 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"><X className="h-4 w-4" /></button>}
          </div>)}
        </div>
      </motion.div>}</AnimatePresence>

      <div ref={listRef} onScroll={handleScroll} className="community-chat-pattern chat-scrollbar relative flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" style={chatPattern}>
        {!loading && hasOlder && <div className="flex justify-center pb-1"><button type="button" disabled={loadingOlder} onClick={loadOlderMessages} className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/85 px-4 py-2 text-[11px] font-black text-slate-600 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:text-indigo-600 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-300">{loadingOlder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 rotate-180" />}{loadingOlder ? 'Đang tải...' : 'Tải tin nhắn cũ hơn'}</button></div>}
        {loading ? <div className="space-y-4" aria-label="Đang tải tin nhắn">{[0, 1, 2, 3, 4].map((item) => <motion.div key={item} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: [0.45, 0.8, 0.45] }} transition={{ duration: 1.4, repeat: Infinity, delay: item * 0.08 }} className={`flex ${item % 2 ? 'justify-end' : 'justify-start'}`}><div className={`h-16 rounded-2xl bg-white/65 shadow-sm backdrop-blur ${item % 2 ? 'w-[58%]' : 'w-[68%]'}`} /></motion.div>)}</div> : visibleMessages.length === 0 ? <div className="h-full flex items-center justify-center text-center text-slate-600 text-sm"><motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl bg-white/80 px-6 py-5 shadow-sm backdrop-blur">{chatSearch ? 'Không tìm thấy tin nhắn phù hợp.' : 'Chưa có tin nhắn nào. Hãy bắt đầu cuộc trò chuyện.'}</motion.div></div> : visibleMessages.map((item, index) => {
          const mine = item.user_id === currentUser?.id || item.username === currentUser?.username;
          const isAi = item.sender_type === 'ai' || item.role === 'AI';
          const previous = visibleMessages[index - 1];
          const reply = findReply(item.reply_to_id);
          const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(item.created_at).toDateString();
          return <React.Fragment key={item.id}>
            {showDay && <div className="flex justify-center py-2"><span className="rounded-full border border-white/80 bg-white px-3 py-1 text-[11px] font-black text-sky-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-sky-300">{formatDay(item.created_at)}</span></div>}
            <motion.div id={`community-message-${item.id}`} layout initial={reduceMotion ? false : { opacity: 0, x: mine ? 10 : -10, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: highlightedMessageId === item.id && !reduceMotion ? [1, 1.025, 1] : 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className={`scroll-m-24 rounded-2xl transition-shadow ${highlightedMessageId === item.id ? 'ring-4 ring-amber-300/80 shadow-2xl shadow-amber-300/40' : ''} flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
            {!mine && <div className={`mb-1 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-[10px] font-black text-white shadow-sm ring-2 ring-white/70 ${isAi ? 'bg-gradient-to-br from-violet-500 to-indigo-600' : 'bg-slate-800'}`}>{isAi ? <Bot className="h-4 w-4" /> : item.avatar_url ? <img src={`${API_ORIGIN}${item.avatar_url}`} alt={item.display_name || item.username} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden'); }} /> : null}{!isAi && <span className={item.avatar_url ? 'hidden' : ''}>{avatarLabel(item)}</span>}</div>}
            <div className={`relative max-w-[88%] px-4 py-3 shadow-sm sm:max-w-[72%] ${item.message.toLocaleLowerCase('vi').includes(`@${String(currentUser?.username || '').toLocaleLowerCase('vi')}`) ? 'ring-2 ring-amber-300 ring-offset-2' : ''} ${mine ? 'rounded-2xl rounded-br-md border border-emerald-200/80 bg-emerald-100 text-slate-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-50' : isAi ? 'rounded-2xl rounded-bl-md border border-violet-100 bg-violet-50 text-slate-800 dark:border-violet-800 dark:bg-violet-950/90 dark:text-violet-100' : 'rounded-2xl rounded-bl-md border border-white/80 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'}`}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={`text-xs font-black ${mine ? 'text-emerald-800 dark:text-emerald-200' : isAi ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-200'}`}>{item.display_name || item.username}{item.role === 'Admin' && <Shield className="inline w-3 h-3 ml-1" />}{isAi && <span className="ml-1 rounded-full bg-violet-200 px-1.5 py-0.5 text-[9px] text-violet-800 dark:bg-violet-900 dark:text-violet-200">AI</span>}</span>
                <span className={`text-[10px] ${mine ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>{item.pinned_at && <Pin className="mr-1 inline h-3 w-3" />}{new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {reply && <div className={`mb-2 rounded-xl border-l-4 px-3 py-2 text-xs ${mine ? 'border-emerald-500 bg-white/45 text-slate-600 dark:bg-black/20 dark:text-emerald-100' : 'border-sky-300 bg-sky-50 text-slate-600 dark:border-sky-700 dark:bg-slate-900/70 dark:text-slate-300'}`}>
                <p className="font-black">{reply.display_name || reply.username}</p>
                <p className="line-clamp-2">{reply.message}</p>
              </div>}
              {editingMessageId === item.id ? <div className="space-y-2">
                <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} maxLength={1000} rows={3} className="w-full resize-none rounded-xl border border-sky-100 bg-white/90 px-3 py-2 text-sm text-slate-800 caret-indigo-500 outline-none focus:border-sky-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:caret-indigo-400" />
                <div className="flex gap-2">
                  <button type="button" onClick={saveEdit} className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-black text-white">Lưu</button>
                  <button type="button" onClick={() => { setEditingMessageId(null); setEditingText(''); }} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-700 dark:text-slate-200">Hủy</button>
                </div>
              </div> : <><p className="text-sm whitespace-pre-wrap break-words leading-6">{renderMessageText(item.message)}</p>{renderDriveCards(item.message)}</>}
              {item.edited_at && <p className={`mt-1 text-[10px] font-semibold ${mine ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>đã sửa</p>}
              {item.reactions_json && Object.keys(item.reactions_json).length > 0 && <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(item.reactions_json as Record<string, string[]>).map(([emoji, users]) => <button key={emoji} type="button" onClick={() => toggleReaction(item.id, emoji)} className={`rounded-full px-2 py-0.5 text-xs font-bold ${mine ? 'bg-white/60 text-emerald-800 dark:bg-white/10 dark:text-emerald-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200'}`}>{emoji} {users.length}</button>)}
              </div>}
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" onClick={() => setReplyTo(item)} className={`text-[10px] font-black ${mine ? 'text-emerald-700 hover:text-emerald-900 dark:text-emerald-300' : 'text-sky-600'}`}>Trả lời</button>
                {((mine && !isAi) || isAdmin) && <button type="button" onClick={() => startEdit(item)} className={`text-[10px] font-black ${mine ? 'text-emerald-700 hover:text-emerald-900 dark:text-emerald-300' : 'text-slate-500'}`}>Sửa</button>}
                {isAdmin && <button type="button" onClick={() => togglePin(item)} className={`inline-flex items-center gap-1 text-[10px] font-black ${mine ? 'text-emerald-700 hover:text-emerald-900 dark:text-emerald-300' : 'text-amber-600'}`}><Pin className="h-3 w-3" />{item.pinned_at ? 'Bỏ ghim' : 'Ghim'}</button>}
                <button type="button" onClick={() => copyMessage(item.message)} className={`inline-flex items-center gap-1 text-[10px] font-black ${mine ? 'text-emerald-700 hover:text-emerald-900 dark:text-emerald-300' : 'text-slate-500'}`}><Copy className="h-3 w-3" />Copy</button>
                {((mine && !isAi) || isAdmin) && <button type="button" onClick={() => setDeletingMessage(item)} className="inline-flex items-center gap-1 text-[10px] font-black text-red-500 transition hover:text-red-700"><Trash2 className="h-3 w-3" />Xóa</button>}
                {['👍', '😂', '❤️'].map((emoji) => <button key={emoji} type="button" onClick={() => toggleReaction(item.id, emoji)} className={`text-[11px] ${mine ? 'hover:bg-white/50 dark:hover:bg-white/10' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} rounded-full px-1`}>{emoji}</button>)}
              </div>
            </div>
            </motion.div>
          </React.Fragment>;
        })}
        <AnimatePresence>{sending && <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-end"><div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-bold text-sky-700 shadow-sm backdrop-blur"><Loader2 className="h-3.5 w-3.5 animate-spin" />Đang gửi...</div></motion.div>}</AnimatePresence>
        <AnimatePresence>{Object.keys(typingUsers[activeRoomId] || {}).length > 0 && <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }} className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-white/85 px-4 py-2 text-xs font-bold text-slate-600 shadow-sm backdrop-blur"><span>{Object.values(typingUsers[activeRoomId]).slice(0, 2).join(', ')} đang gõ</span><span className="ml-2 inline-flex gap-1">{[0, 1, 2].map((dot) => <motion.span key={dot} animate={reduceMotion ? undefined : { y: [0, -3, 0], opacity: [0.45, 1, 0.45] }} transition={{ duration: 0.8, repeat: Infinity, delay: dot * 0.14 }} className="h-1 w-1 rounded-full bg-slate-500" />)}</span></div></motion.div>}</AnimatePresence>
        <AnimatePresence>{aiTyping && <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex justify-start"><div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 shadow-sm backdrop-blur dark:bg-amber-950/70 dark:text-amber-300"><Sparkles className="h-3.5 w-3.5" />AI đang gõ<span className="inline-flex gap-1">{[0, 1, 2].map((dot) => <motion.span key={dot} animate={reduceMotion ? undefined : { opacity: [0.35, 1, 0.35] }} transition={{ duration: 0.9, repeat: Infinity, delay: dot * 0.16 }} className="h-1 w-1 rounded-full bg-amber-500" />)}</span></div></motion.div>}</AnimatePresence>
        <AnimatePresence>{showScrollButton && <motion.button initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.9 }} type="button" aria-label="Cuộn xuống tin nhắn mới nhất" onClick={scrollToBottom} className="sticky bottom-3 left-full ml-auto flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 text-white shadow-xl transition hover:bg-indigo-600"><ArrowDown className="h-4 w-4" />{newMessageCount > 0 && <span className="text-[10px] font-black">{newMessageCount} mới</span>}</motion.button>}</AnimatePresence>
      </div>

      <form onSubmit={sendMessage} className="border-t border-slate-200 bg-white/95 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 sm:p-4">
        <AnimatePresence initial={false}>{roomLockedForUser && <motion.div initial={reduceMotion ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">Phòng này đang bị khóa, chỉ admin có thể gửi tin nhắn.</motion.div>}</AnimatePresence>
        <AnimatePresence initial={false}>{replyTo && <motion.div initial={reduceMotion ? false : { opacity: 0, y: 6, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: 4, height: 0 }} className="mb-3 flex items-center justify-between gap-3 overflow-hidden rounded-2xl border-l-4 border-sky-400 bg-white px-4 py-2 text-sm shadow-sm dark:bg-slate-800">
          <div className="min-w-0">
            <p className="font-black text-sky-700">Đang trả lời {replyTo.display_name || replyTo.username}</p>
            <p className="truncate text-xs text-slate-500">{replyTo.message}</p>
          </div>
          <button type="button" onClick={() => setReplyTo(null)} className="rounded-full px-2 py-1 text-xs font-black text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">Hủy</button>
        </motion.div>}</AnimatePresence>
        <div className="relative mb-2">
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setEmojiOpen((open) => !open)} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50 dark:hover:bg-indigo-950 dark:hover:text-indigo-300"><Smile className="h-3.5 w-3.5" />Biểu cảm</button><button type="button" onClick={() => { const next = !drivePickerOpen; setDrivePickerOpen(next); setEmojiOpen(false); if (next && driveShares.length === 0) void loadDriveShares(); }} disabled={sending || roomLockedForUser} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition disabled:opacity-50 ${drivePickerOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950 dark:hover:text-indigo-300'}`}><Paperclip className="h-3.5 w-3.5" />Drive</button></div>
          <AnimatePresence>{emojiOpen && <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ duration: reduceMotion ? 0 : 0.16 }} className="absolute bottom-full left-0 z-20 mb-2 flex max-w-[min(92vw,420px)] gap-2 overflow-x-auto rounded-2xl border border-sky-100 bg-white p-3 shadow-2xl shadow-sky-200/60 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40">
            {quickEmojis.map((emoji) => <motion.button whileHover={reduceMotion ? undefined : { y: -3, scale: 1.12 }} whileTap={reduceMotion ? undefined : { scale: 0.9 }} key={emoji} type="button" onClick={() => addEmoji(emoji)} disabled={sending} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm transition hover:bg-sky-100 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600">{emoji}</motion.button>)}
          </motion.div>}</AnimatePresence>
          <AnimatePresence>{drivePickerOpen && <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-md overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-2xl shadow-indigo-200/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700"><div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-indigo-600" /><div><p className="text-xs font-black text-slate-800 dark:text-white">Chia sẻ từ Drive</p><p className="text-[9px] font-bold text-slate-400">Chỉ file có link công khai</p></div></div><button type="button" onClick={() => setDrivePickerOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-4 w-4" /></button></div>
            <div className="max-h-72 overflow-y-auto p-2">{driveSharesLoading ? <div className="flex items-center justify-center gap-2 py-8 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Đang tải file...</div> : driveShares.length === 0 ? <div className="px-4 py-8 text-center"><Paperclip className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-black text-slate-600 dark:text-slate-300">Chưa có file nào đang chia sẻ</p><p className="mt-1 text-[10px] text-slate-400">Mở Drive và tạo link công khai trước.</p></div> : driveShares.map((share) => <button key={share.token} type="button" onClick={() => insertDriveShare(share)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-indigo-50 dark:hover:bg-indigo-950/60"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"><File className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-slate-800 dark:text-white">{share.original_name}</span><span className="mt-1 block text-[10px] font-bold text-slate-400">{formatDriveFileSize(share.file_size)}</span></span><Paperclip className="h-4 w-4 text-slate-300" /></button>)}</div>
          </motion.div>}</AnimatePresence>
        </div>
        <div className="relative">
          <AnimatePresence>{mentionQuery !== null && mentionSuggestions.length > 0 && <motion.div initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-sm overflow-hidden rounded-2xl border border-indigo-100 bg-white p-2 shadow-2xl shadow-indigo-200/50 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/50">
            <p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-500">Nhắc thành viên</p>
            {mentionSuggestions.map((member, index) => <button key={member.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(member)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${activeMentionIndex === index ? 'bg-indigo-50 dark:bg-indigo-950/70' : 'hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-black text-white">{member.avatar_url ? <img src={`${API_ORIGIN}${member.avatar_url}`} alt="" className="h-full w-full object-cover" /> : (member.display_name || member.username).slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-black text-slate-800 dark:text-white">{member.display_name || member.username}</span><span className="block truncate text-xs font-medium text-slate-400">@{member.username}{member.role === 'Admin' ? ' · Admin' : ''}</span></span>
            </button>)}
            <p className="px-3 pb-1 pt-2 text-[9px] font-bold text-slate-400">↑ ↓ để chọn · Enter hoặc Tab để chèn</p>
          </motion.div>}</AnimatePresence>
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-2 transition focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100/60 dark:border-slate-700 dark:bg-slate-800 dark:focus-within:bg-slate-800 dark:focus-within:ring-indigo-950">
          <textarea ref={composerRef} value={message} onChange={(e) => { handleMessageChange(e.target.value, e.target.selectionStart); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`; }} onKeyDown={handleMessageKeyDown} maxLength={1000} rows={1} disabled={roomLockedForUser} placeholder={roomLockedForUser ? 'Phòng đang bị khóa' : `Nhắn tin tới #${activeRoom?.name || 'cộng đồng'}`} className="max-h-32 min-h-11 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-sm font-medium text-slate-800 caret-indigo-600 outline-none placeholder:text-slate-400 disabled:text-slate-400 dark:!bg-transparent dark:text-white dark:caret-indigo-400 dark:placeholder:text-slate-500" />
          <motion.button whileTap={reduceMotion ? undefined : { scale: 0.92 }} type="submit" disabled={!message.trim() || sending || roomLockedForUser} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:shadow-none dark:disabled:bg-slate-700 dark:disabled:text-slate-400"><Send className="h-4 w-4" /></motion.button>
        </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] font-semibold text-slate-400"><span>Enter để gửi · Shift + Enter để xuống dòng</span><span>{message.length}/1000</span></div>
      </form>
    </div>
    <AnimatePresence>{deletingMessage && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-4 backdrop-blur-sm sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setDeletingMessage(null); }}>
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 18, scale: 0.98 }} className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-white p-6 shadow-2xl dark:bg-slate-900">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500 dark:bg-red-950/60"><Trash2 className="h-5 w-5" /></span>
        <h3 className="mt-5 text-xl font-black text-slate-900 dark:text-white">Xóa tin nhắn?</h3>
        <p className="mt-2 text-sm leading-6 text-slate-500">Tin nhắn sẽ biến mất với tất cả thành viên và không thể khôi phục.</p>
        <blockquote className="mt-4 line-clamp-3 rounded-2xl border-l-4 border-red-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{deletingMessage.message}</blockquote>
        <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" disabled={deleting} onClick={() => setDeletingMessage(null)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Hủy</button><button type="button" disabled={deleting} onClick={deleteMessage} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-60">{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{deleting ? 'Đang xóa...' : 'Xóa tin nhắn'}</button></div>
      </motion.div>
    </motion.div>}</AnimatePresence>
  </motion.div>;
};

export default CommunityChatTab;
