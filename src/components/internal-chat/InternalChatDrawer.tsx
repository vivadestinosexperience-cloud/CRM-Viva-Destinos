import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Send, 
  User as UserIcon,
  Circle
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { InternalMessage } from '../../types';

interface InternalChatDrawerProps {
  userId: string | null;
  onClose: () => void;
}

export function InternalChatDrawer({ userId, onClose }: InternalChatDrawerProps) {
  const { users, currentUser } = useAppStore();
  const [newMessage, setNewMessage] = useState('');
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(userId && userId !== 'LIST' ? userId : null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const safeUsers = Array.isArray(users) ? users : [];
  const safeMessages = Array.isArray(messages) ? messages : [];

  const selectedUser = safeUsers.find(u => u && u.id === currentChatId);

  // Sync internal current chat with prop
  useEffect(() => {
    if (userId && userId !== 'LIST') {
      setCurrentChatId(userId);
    } else if (userId === 'LIST') {
      setCurrentChatId(null);
    }
  }, [userId]);

  // Load messages
  useEffect(() => {
    if (currentChatId && currentUser) {
      const chatKey = `internal_chat_${[currentChatId, currentUser.id].sort().join('_')}`;
      const saved = localStorage.getItem(chatKey);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([]);
      }
    }
  }, [currentChatId, currentUser]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentChatId || !currentUser) return;

    const chatKey = `internal_chat_${[currentChatId, currentUser.id].sort().join('_')}`;
    const msg: InternalMessage = {
      id: `internal_${Date.now()}`,
      chat_id: chatKey,
      sender_id: currentUser.id,
      receiver_id: currentChatId,
      content: newMessage,
      read: false,
      created_at: new Date().toISOString()
    };

    const updated = [...messages, msg];
    setMessages(updated);
    localStorage.setItem(chatKey, JSON.stringify(updated));
    setNewMessage('');
  };

  if (!userId) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex justify-end pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px] pointer-events-auto"
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-sm bg-white shadow-2xl h-full flex flex-col pointer-events-auto"
        >
          {/* Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            {currentChatId && selectedUser ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setCurrentChatId(null)}
                  className="p-1.5 hover:bg-slate-50 rounded-xl text-slate-400 mr-1"
                >
                  <X className="w-4 h-4 rotate-45" />
                </button>
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold overflow-hidden border-2 border-white shadow-sm ring-1 ring-slate-100">
                    {selectedUser.avatar ? <img src={selectedUser.avatar} alt={selectedUser.name} className="w-full h-full object-cover" /> : selectedUser.name.charAt(0)}
                  </div>
                  <Circle className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 fill-current border-2 border-white rounded-full ${
                    selectedUser.online ? 'text-emerald-500' : 'text-slate-300'
                  }`} />
                </div>
                <div>
                  <p className="font-black text-slate-800 text-sm leading-tight">{selectedUser.name}</p>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                    {selectedUser.role} • {selectedUser.online ? 'Online' : 'Offline'}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="font-black text-slate-800 text-base uppercase tracking-tight">Equipe Viva</h3>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mt-1">Selecione um membro para conversar</p>
              </div>
            )}
            <button 
              onClick={onClose}
              className="p-2 hover:bg-red-50 rounded-xl text-slate-300 hover:text-red-500 transition-all active:scale-90"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* User List or Messages */}
          {!currentChatId ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50 custom-scrollbar">
              {safeUsers.filter(u => u && u.active && u.id !== currentUser?.id).map((user) => (
                <button
                  key={user.id}
                  onClick={() => setCurrentChatId(user.id)}
                  className="w-full flex items-center gap-4 p-4 bg-white rounded-3xl border border-slate-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5 transition-all group text-left"
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold border-2 border-white shadow-sm ring-1 ring-slate-100 overflow-hidden group-hover:scale-105 transition-transform">
                      {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : (user.name || "U").charAt(0)}
                    </div>
                    <span className={`absolute -bottom-1 -right-1 w-4 h-4 border-2 border-white rounded-full ${
                      user.online ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}></span>
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-slate-800 text-sm">{user.name}</p>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{user.role}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <Send className="w-4 h-4 text-blue-500" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar"
              >
                {safeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-slate-200/50 rotate-3 group">
                      <UserIcon className="w-10 h-10 text-slate-300 group-hover:scale-110 transition-transform" />
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] leading-loose max-w-[200px]">
                      Inicie uma conversa privada com {selectedUser?.name ? selectedUser?.name?.split(' ')[0] : "atendente"}
                    </p>
                  </div>
                ) : (
                  safeMessages.map((msg) => {
                    const isMine = msg.sender_id === currentUser?.id;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] group`}>
                          <div className={`px-5 py-3 rounded-2xl text-sm font-medium leading-relaxed ${
                            isMine 
                              ? 'bg-blue-600 text-white rounded-tr-none shadow-xl shadow-blue-100' 
                              : 'bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-sm'
                          }`}>
                            {msg.content}
                          </div>
                          <p className={`text-[9px] font-black text-slate-400 uppercase mt-2 px-1 tracking-widest ${isMine ? 'text-right' : 'text-left'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Input */}
              <div className="p-5 bg-white border-t border-slate-100 shrink-0">
                <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                  <input 
                    type="text"
                    placeholder="Digite sua mensagem interna..."
                    className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all font-bold placeholder:text-slate-300"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                  />
                  <button 
                    type="submit"
                    disabled={!newMessage.trim()}
                    className={`p-3.5 rounded-2xl transition-all active:scale-95 ${
                      newMessage.trim() 
                        ? 'bg-blue-600 text-white shadow-xl shadow-blue-200' 
                        : 'bg-slate-100 text-slate-300'
                    }`}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
                <p className="text-[9px] text-slate-400 text-center mt-4 font-black uppercase tracking-[0.2em] opacity-60">
                  Canal seguro e exclusivo para equipe
                </p>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
