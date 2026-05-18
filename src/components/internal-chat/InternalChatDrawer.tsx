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
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedUser = users.find(u => u.id === userId);

  // In a real app, this would be in the store and synced with Supabase
  // For now, we use a local state and localStorage for demonstration
  useEffect(() => {
    if (userId && currentUser) {
      const chatKey = `internal_chat_${[userId, currentUser.id].sort().join('_')}`;
      const saved = localStorage.getItem(chatKey);
      if (saved) {
        setMessages(JSON.parse(saved));
      } else {
        setMessages([]);
      }
    }
  }, [userId, currentUser]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId || !currentUser) return;

    const chatKey = `internal_chat_${[userId, currentUser.id].sort().join('_')}`;
    const msg: InternalMessage = {
      id: `internal_${Date.now()}`,
      chat_id: chatKey,
      sender_id: currentUser.id,
      receiver_id: userId,
      content: newMessage,
      read: false,
      created_at: new Date().toISOString()
    };

    const updated = [...messages, msg];
    setMessages(updated);
    localStorage.setItem(chatKey, JSON.stringify(updated));
    setNewMessage('');
  };

  if (!userId || !selectedUser) return null;

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
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold overflow-hidden">
                  {selectedUser.avatar ? <img src={selectedUser.avatar} alt={selectedUser.name} /> : selectedUser.name.charAt(0)}
                </div>
                <Circle className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 fill-current border-2 border-white rounded-full ${
                  selectedUser.online ? 'text-emerald-500' : 'text-slate-300'
                }`} />
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm leading-tight">{selectedUser.name}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {selectedUser.role} • {selectedUser.online ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-50 rounded-xl text-slate-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50"
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                  <UserIcon className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest leading-loose">
                  Inicie uma conversa interna com {selectedUser.name.split(' ')[0]}
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === currentUser?.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] group`}>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMine 
                          ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-100' 
                          : 'bg-white text-slate-700 rounded-tl-none border border-slate-100 shadow-sm'
                      }`}>
                        {msg.content}
                      </div>
                      <p className={`text-[9px] font-bold text-slate-400 uppercase mt-1 px-1 ${isMine ? 'text-right' : 'text-left'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Input */}
          <div className="p-4 bg-white border-t border-slate-100">
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input 
                type="text"
                placeholder="Digite sua mensagem interna..."
                className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className={`p-2.5 rounded-xl transition-all ${
                  newMessage.trim() 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' 
                    : 'bg-slate-100 text-slate-300'
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <p className="text-[9px] text-slate-400 text-center mt-3 font-bold uppercase tracking-wider">
              Conversas internas são privadas para sua equipe
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
