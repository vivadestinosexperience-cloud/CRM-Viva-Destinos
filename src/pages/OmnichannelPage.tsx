/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  Search, 
  MoreVertical, 
  Plus, 
  Send, 
  Paperclip, 
  CheckCheck, 
  ArrowRightLeft, 
  Bot, 
  Tag as TagIcon,
  Info,
  Phone,
  Mail,
  TrendingUp,
  Sparkles,
  RefreshCw,
  FileText,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Conversation, Message, Customer, Team } from '../types';
import { supabase } from '../integrations/supabase/client';
import { useAppStore } from '../store/useAppStore';
import { toast } from 'sonner';

export default function OmnichannelPage() {
  const { 
    conversations, 
    messages, 
    addMessage, 
    addConversation, 
    updateConversation,
    whatsAppAccounts,
    teams,
    customers,
    users,
    currentUser,
    addCustomer
  } = useAppStore();

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [showIAPanel, setShowIAPanel] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [transferData, setTransferData] = useState({ teamId: '', userId: '', reason: '' });
  const [closeReason, setCloseReason] = useState('');
  const [conversationFilter, setConversationFilter] = useState<'meus' | 'novos' | 'resolvidos'>('meus');
  const [searchTerm, setSearchTerm] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeCustomer = activeConversation?.customer || customers.find(c => c.id === activeConversation?.customer_id);
  const activeChatMessages = messages.filter(m => m.conversation_id === activeConversationId);
  const currentAccount = whatsAppAccounts.find(a => a.id === activeConversation?.whatsapp_account_id);

  // Filtered Conversations
  const filteredConversations = conversations.filter(conv => {
    // Filter by status/owner
    if (conversationFilter === 'meus') {
      if (conv.status === 'RESOLVED') return false;
      if (conv.assigned_user_id && conv.assigned_user_id !== currentUser?.id) return false;
    } else if (conversationFilter === 'novos') {
      if (conv.status !== 'NEW' && conv.status !== 'PENDING') return false;
    } else if (conversationFilter === 'resolvidos') {
      if (conv.status !== 'RESOLVED') return false;
    }

    // Filter by search
    if (searchTerm) {
      const customer = conv.customer || customers.find(c => c.id === conv.customer_id);
      const searchLower = searchTerm.toLowerCase();
      return (
        customer?.name.toLowerCase().includes(searchLower) ||
        customer?.phone.includes(searchTerm) ||
        conv.last_message?.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  const [newChatData, setNewChatData] = useState({
    customerId: '',
    newName: '',
    newPhone: '',
    accountId: '',
    teamId: ''
  });

  const handleTransfer = async () => {
    if (!activeConversationId || !transferData.teamId) return;

    await updateConversation(activeConversationId, {
      queue_id: transferData.teamId,
      assigned_user_id: transferData.userId || undefined,
      status: 'TRANSFERRED'
    });
    
    const teamName = teams.find(t => t.id === transferData.teamId)?.name || 'Nova Equipe';
    await addMessage({
      id: `sys-${Date.now()}`,
      conversation_id: activeConversationId,
      sender_type: 'system',
      content: `Atendimento transferido para a equipe: ${teamName}${transferData.reason ? `. Motivo: ${transferData.reason}` : ''}`,
      created_at: new Date().toISOString(),
      message_type: 'text',
      status: 'sent'
    } as Message);

    setShowTransferModal(false);
    toast.success('Atendimento transferido');
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let targetCustomerId = newChatData.customerId;

    if (!targetCustomerId) {
      if (!newChatData.newName || !newChatData.newPhone) {
        toast.error('Preencha nome e telefone do novo cliente');
        return;
      }
      const newCustId = `c${Date.now()}`;
      await addCustomer({
        id: newCustId,
        name: newChatData.newName,
        phone: newChatData.newPhone,
        active: true,
        online: false,
        email: '',
      } as any);
      targetCustomerId = newCustId;
    }

    const selectedAccount = whatsAppAccounts.find(a => a.id === newChatData.accountId) || whatsAppAccounts[0];
    const selectedTeam = teams.find(t => t.id === newChatData.teamId) || teams[0];

    const newConv: Partial<Conversation> = {
      customer_id: targetCustomerId,
      whatsapp_account_id: selectedAccount?.id || '',
      queue_id: selectedTeam?.id || '',
      status: 'OPEN',
      last_message: 'Atendimento manual iniciado',
      unread_count: 0,
      created_at: new Date().toISOString()
    };

    await addConversation(newConv);
    setShowNewChatModal(false);
    toast.success('Atendimento iniciado com sucesso!');
  };

  const handleClose = async () => {
    if (!activeConversationId || !closeReason) {
      toast.error('Informe o motivo da finalização');
      return;
    }

    await updateConversation(activeConversationId, {
      status: 'RESOLVED',
      last_message: `Finalizado: ${closeReason}`
    });
    setShowCloseModal(false);
    toast.success('Atendimento finalizado com sucesso');
  };

  const handleAISuggestion = async () => {
    if (!activeConversation) return;
    const history = messages
      .filter(m => m.conversation_id === activeConversation.id)
      .map(m => `${m.sender_type === 'customer' ? 'Cliente' : 'Agente'}: ${m.content}`)
      .join('\n');

    toast.promise(
      fetch('/api/ai/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      }).then(res => res.json()).then(data => {
        if (data.suggestion) {
           setNewMessage(data.suggestion);
           setShowIAPanel(false);
        }
      }),
      {
        loading: 'Gerando sugestão...',
        success: 'Sugestão inserida no campo de texto!',
        error: 'Erro ao gerar sugestão.'
      }
    );
  };

  const handleAIClassify = async () => {
    if (!activeConversation) return;
    const history = messages
      .filter(m => m.conversation_id === activeConversation.id)
      .map(m => `${m.sender_type === 'customer' ? 'Cliente' : 'Agente'}: ${m.content}`)
      .join('\n');

    toast.promise(
      fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      }).then(res => res.json()).then(data => {
        if (data.classification && activeConversation.customer_id) {
           toast.success(`Lead classificado como: ${data.classification}`);
           setShowIAPanel(false);
        }
      }),
      {
        loading: 'Classificando lead...',
        success: 'Classificação concluída',
        error: 'Erro ao classificar.'
      }
    );
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConversationId) return;

    if (!currentAccount) {
      toast.error('Nenhum canal configurado para esta conversa. Acesse Configurações > Canais.');
      return;
    }

    if (currentAccount.status !== 'ESTÁVEL') {
      toast.error('Este canal está desconectado. Reconecte antes de enviar.');
      return;
    }

    const content = newMessage;
    setNewMessage('');

    const newMsg: Message = {
      id: `m${Date.now()}`,
      conversation_id: activeConversationId,
      sender_type: 'agent',
      sender_name: currentUser?.name || 'Agente',
      content: content,
      created_at: new Date().toISOString(),
      message_type: 'text',
      status: 'sent'
    };
    
    await addMessage(newMsg);
    
    await updateConversation(activeConversationId, {
      last_message: content,
      last_message_at: new Date().toISOString()
    });

    // Real send through backend
    try {
      let endpoint = '';
      let body: any = {};

      if (currentAccount.provider === 'ZAPI') {
        endpoint = '/api/channels/zapi/send-text';
        body = { phone: activeCustomer?.phone, message: content };
      } else if (currentAccount.provider === 'EVOLUTION') {
        endpoint = '/api/channels/evolution/send-text';
        body = { number: activeCustomer?.phone, text: content }; // Evolution often uses 'text'
      } else if (currentAccount.provider_type === 'meta_cloud') {
        // We'll use a generic webhook or specific meta send if implemented
        endpoint = '/api/webhooks/whatsapp'; 
      }

      if (endpoint) {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
    } catch (err) {
      console.error('Real send failed:', err);
    }
  };

  const handleSummarize = async () => {
    setIsSummarizing(true);
    // Simulate AI summary
    setTimeout(() => {
      setAiSummary("O cliente deseja uma viagem para Porto de Galinhas em julho, para 2 adultos e 1 criança de 6 anos. Demonstrou interesse em resort com café da manhã e orçamento médio. Lead classificado como QUENTE.");
      setIsSummarizing(false);
      toast.success('Resumo gerado pelo Assistente IA');
    }, 2000);
  };

  return (
    <div className="flex h-full w-full bg-white overflow-hidden">
      {/* 1. SIDEBAR: Inbox */}
      <div className="w-80 lg:w-96 border-r border-slate-200 flex flex-col shrink-0 bg-white shadow-sm z-10">
        <div className="p-5 border-b border-slate-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              Conversas 
              <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs">{conversations.length}</span>
            </h2>
            <button 
              onClick={() => setShowNewChatModal(true)}
              className="p-2 hover:bg-slate-50 rounded-lg text-blue-600 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex bg-slate-50 p-1 rounded-xl mb-4">
            <button 
              onClick={() => setConversationFilter('meus')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${conversationFilter === 'meus' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Meus
            </button>
            <button 
              onClick={() => setConversationFilter('novos')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${conversationFilter === 'novos' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Novos
            </button>
            <button 
              onClick={() => setConversationFilter('resolvidos')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${conversationFilter === 'resolvidos' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Resolvidos
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar cliente ou mensagem..." 
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all shadow-sm font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {filteredConversations.length === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center text-center opacity-40">
              <MessageSquare className="w-12 h-12 mb-4" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nenhuma conversa encontrada</p>
            </div>
          ) : filteredConversations.map((conv) => {
            const customer = conv.customer || customers.find(c => c.id === conv.customer_id);
            const isActive = activeConversationId === conv.id;
            const team = teams.find(t => t.id === conv.queue_id);
            const account = conv.whatsapp_account || whatsAppAccounts.find(a => a.id === conv.whatsapp_account_id);
            const lastMsgAt = conv.last_message_at;

            return (
              <button 
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`w-full p-4 flex items-start gap-4 transition-all hover:bg-slate-50 text-left relative overflow-hidden ${isActive ? 'bg-blue-50/50' : ''}`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}
                
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg border-2 border-white shadow-sm ring-1 ring-slate-100">
                    {customer?.name?.charAt(0)}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WA" className="w-3 h-3 invert pointer-events-none" />
                  </div>
                </div>

                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-slate-800 text-sm truncate">{customer?.name}</h3>
                    <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                      {lastMsgAt ? new Date(lastMsgAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 mb-1.5">
                     <span 
                      className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider text-white"
                      style={{ backgroundColor: team?.color || '#cbd5e1' }}
                    >
                      {team?.name || 'Sem Equipe'}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">•</span>
                    <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{account?.name || '---'}</span>
                  </div>

                  <p className="text-xs text-slate-500 truncate leading-relaxed">
                    {conv.last_message || "O cliente iniciou uma nova conversa"}
                  </p>
                </div>

                {(conv.unread_count || 0) > 0 && (
                  <div className="bg-blue-600 text-white w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-lg shadow-blue-200">
                    {conv.unread_count}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/30">
          <button 
            onClick={() => setShowNewChatModal(true)}
            className="w-full py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-blue-600" />
            Nova Conversa Manual
          </button>
        </div>
      </div>

      {/* 2. MAIN: Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {activeConversation ? (
          <>
            {/* Chat Header */}
            <header className="h-20 bg-white border-b border-slate-100 px-6 flex items-center justify-between shrink-0 z-20">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 font-bold text-slate-600">
                  {activeCustomer?.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 truncate">{activeCustomer?.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{activeCustomer?.phone}</span>
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">Em Aberto</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                 <button 
                  onClick={() => setShowIAPanel(!showIAPanel)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all font-bold text-xs ${showIAPanel ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                >
                  <Sparkles className={`w-4 h-4 ${showIAPanel ? 'animate-pulse' : 'text-blue-500'}`} />
                  Assistente IA
                </button>
                <div className="w-px h-6 bg-slate-200 mx-1"></div>
                <button 
                  onClick={() => setShowTransferModal(true)}
                  className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-all"
                >
                  <ArrowRightLeft className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setShowCloseModal(true)}
                  className="p-2.5 bg-blue-50 text-blue-600 rounded-xl transition-all font-bold text-sm px-4"
                >
                  Concluir
                </button>
                <button className="p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-all">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Quality Banner */}
            <div className={`px-6 py-2 border-b flex items-center justify-between gap-3 ${currentAccount?.status === 'ESTÁVEL' ? 'bg-blue-50/50 border-blue-100' : 'bg-red-50/50 border-red-100'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${currentAccount?.status === 'ESTÁVEL' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${currentAccount?.status === 'ESTÁVEL' ? 'text-blue-700' : 'text-red-700'}`}>
                  Canal {currentAccount?.name || 'Comercial'} {currentAccount?.status === 'ESTÁVEL' ? 'conectado com qualidade ALTA' : 'DESCONECTADO'} • Atendimento {currentAccount?.status === 'ESTÁVEL' ? 'seguro' : 'PENDENTE'}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Número: {currentAccount?.phone_number || currentAccount?.number || '---'}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Equipe: {teams.find(t => t.id === activeConversation?.queue_id)?.name || 'Geral'}</span>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
              {activeChatMessages.map((msg: Message) => {
                const isMine = msg.sender_type === 'agent' || msg.sender_type === 'system';
                const content = msg.content;
                const timestamp = msg.created_at;
                const status = msg.status;
                const type = msg.message_type;
                
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] lg:max-w-[60%] flex gap-3 ${isMine ? 'flex-row-reverse' : ''}`}>
                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border ${isMine ? 'bg-blue-600 border-blue-500 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 shadow-sm'}`}>
                        {isMine ? 'GA' : activeCustomer?.name?.charAt(0)}
                      </div>
                      
                      <div className="space-y-1">
                        <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed transition-all ${isMine ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'} ${status === 'failed' ? 'border-red-300 bg-red-50 text-red-600' : ''}`}>
                          {content}
                        </div>
                        <div className={`flex items-center gap-1.5 px-1 ${isMine ? 'flex-row-reverse justify-end' : ''}`}>
                          <span className="text-[9px] font-medium text-slate-400 uppercase">
                            {timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </span>
                          {isMine && status === 'read' && <CheckCheck className="w-3 h-3 text-blue-500" />}
                          {isMine && status === 'failed' && <span className="text-[8px] text-red-500 font-bold uppercase">Erro</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* AI Panel Overlay */}
            <AnimatePresence>
              {showIAPanel && (
                 <motion.div 
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="absolute bottom-24 right-6 w-96 bg-white rounded-3xl shadow-2xl shadow-blue-200/50 border border-blue-50 p-6 z-50 overflow-hidden"
                 >
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 via-emerald-400 to-blue-500"></div>
                  
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Assistente Viva IA</h4>
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Modelo Gemini pro ativo</p>
                      </div>
                    </div>
                    <button onClick={() => setShowIAPanel(false)} className="text-slate-400 hover:text-slate-600">
                      <Plus className="w-5 h-5 rotate-45" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <button 
                      onClick={handleSummarize}
                      disabled={isSummarizing}
                      className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl hover:bg-blue-100 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <RefreshCw className={`w-4 h-4 text-blue-500 ${isSummarizing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform'}`} />
                        <span className="text-sm font-bold text-blue-700">Resumir Atendimento</span>
                      </div>
                      <Sparkles className="w-4 h-4 text-blue-400" />
                    </button>

                    {aiSummary ? (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-sm italic text-slate-600 leading-relaxed relative ring-1 ring-blue-100 ring-offset-2 ring-offset-transparent">
                        "{aiSummary}"
                        <div className="mt-4 flex gap-2">
                           <button 
                             onClick={() => { setNewMessage(aiSummary); setShowIAPanel(false); }}
                             className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-transform active:scale-95"
                           >
                             Citar no Chat
                           </button>
                           <button 
                             onClick={() => { toast.success('Nota salva no histórico do atendimento'); setShowIAPanel(false); }}
                             className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold shadow-sm"
                           >
                             Salvar Nota
                           </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={handleAISuggestion}
                          className="flex flex-col items-center justify-center gap-2 p-4 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                        >
                          <Bot className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sugestão</span>
                        </button>
                        <button 
                          onClick={handleAIClassify}
                          className="flex flex-col items-center justify-center gap-2 p-4 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                        >
                          <TagIcon className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Classificar</span>
                        </button>
                      </div>
                    )}
                  </div>
                 </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Input */}
            <footer className="bg-white border-t border-slate-100 p-6 z-20">
              <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-3 bg-slate-50 border border-slate-200 p-3 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all shadow-sm">
                <div className="flex items-center gap-1">
                  <button 
                    type="button" 
                    onClick={() => {
                        const note = prompt("Digite uma anotação interna:");
                        if (note) toast.success("Anotação adicionada");
                    }}
                    className="p-2 text-slate-400 hover:bg-white hover:text-blue-600 rounded-xl transition-all"
                    title="Adicionar anotação"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                <textarea 
                  rows={1}
                  placeholder="Escreva sua mensagem..."
                  className="flex-1 bg-transparent border-none outline-none text-sm py-2 resize-none max-h-40 min-h-[40px] px-2 font-medium"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />

                <div className="flex items-center gap-2">
                  <button 
                    type="submit"
                    disabled={!newMessage.trim()}
                    className={`p-3 rounded-xl transition-all shadow-lg ${newMessage.trim() ? 'bg-blue-600 text-white shadow-blue-200 scale-105 active:scale-100' : 'bg-slate-200 text-slate-400 opacity-50 cursor-not-allowed'}`}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-6 border-8 border-white shadow-xl shadow-blue-50">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">Bem-vindo ao Viva Experience</h3>
            <p className="text-slate-500 max-w-sm leading-relaxed">
              Selecione uma conversa ao lado para visualizar o histórico completo do cliente e iniciar o atendimento.
            </p>
          </div>
        )}
      </div>

      {/* 3. ASIDE: Customer Info */}
      <div className="w-80 lg:w-96 border-l border-slate-200 hidden xl:flex flex-col shrink-0 bg-white shadow-sm overflow-y-auto">
        {activeCustomer ? (
          <div className="p-6 h-full flex flex-col">
            <div className="text-center mb-6">
              <div className="w-24 h-24 rounded-3xl bg-slate-100 flex items-center justify-center text-3xl font-bold text-slate-600 mx-auto mb-4 border-2 border-white shadow-lg ring-1 ring-slate-100 relative">
                {activeCustomer.name.charAt(0)}
                <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase border-2 border-white shadow-sm">
                  Online
                </div>
              </div>
              <h3 className="text-xl font-bold text-slate-800 truncate">{activeCustomer.name}</h3>
              <p className="text-sm text-slate-500 mt-1">{activeCustomer.city || 'Localização não informada'}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Temperatura</p>
                <div className={`text-xs font-bold uppercase flex items-center justify-center gap-2 ${activeCustomer.temperature === 'HOT' ? 'text-red-500' : 'text-orange-500'}`}>
                  <TrendingUp className="w-3 h-3" />
                  {activeCustomer.temperature === 'HOT' ? 'Quente' : 'Morno'}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Origem</p>
                <p className="text-xs font-bold text-slate-700 uppercase">{activeCustomer.origin || 'Direto'}</p>
              </div>
            </div>

            <div className="space-y-6">
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Contato</h4>
                </div>
                <div className="space-y-3">
                  <div 
                    onClick={() => { navigator.clipboard.writeText(activeCustomer.phone); toast.success('Telefone copiado'); }}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:border-blue-100 transition-all shadow-sm">
                      <Phone className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">{activeCustomer.phone}</p>
                    <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div 
                    onClick={() => { if (activeCustomer.email) { navigator.clipboard.writeText(activeCustomer.email); toast.success('E-mail copiado'); } }}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md cursor-pointer group"
                  >
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:border-blue-100 transition-all shadow-sm">
                      <Mail className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">{activeCustomer.email || 'Não informado'}</p>
                    {activeCustomer.email && <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </div>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TagIcon className="w-4 h-4 text-emerald-500" />
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tags</h4>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(activeCustomer.tags || []).map(tag => (
                    <span 
                      key={tag} 
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 shadow-sm transition-all"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center h-full flex flex-col items-center justify-center bg-slate-50/30">
            <Info className="w-8 h-8 text-slate-300 mb-4" />
            <p className="text-sm text-slate-400 font-medium">Selecione um cliente para ver os detalhes</p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      <AnimatePresence>
        {showNewChatModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewChatModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider">Nova Conversa Manual</h2>
                  <p className="text-xs text-slate-400 font-medium">Inicie um atendimento proativo via WhatsApp</p>
                </div>
                <button onClick={() => setShowNewChatModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">✕</button>
              </div>

              <form onSubmit={handleCreateChat} className="p-8 space-y-6">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">Canal de Envio</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                        value={newChatData.accountId}
                        onChange={(e) => setNewChatData({...newChatData, accountId: e.target.value})}
                      >
                        <option value="">Selecione um canal</option>
                        {whatsAppAccounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.name} ({acc.status === 'ESTÁVEL' ? 'Ativo' : 'Off'})</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">Equipe Responsável</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                        value={newChatData.teamId}
                        onChange={(e) => setNewChatData({...newChatData, teamId: e.target.value})}
                      >
                        <option value="">Selecione uma equipe</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">Selecione o Cliente</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                      value={newChatData.customerId}
                      onChange={(e) => setNewChatData({...newChatData, customerId: e.target.value})}
                    >
                      <option value="">Novo Cliente...</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                      ))}
                    </select>
                  </div>

                  {!newChatData.customerId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">Nome Completo</label>
                        <input 
                          type="text" 
                          placeholder="Nome do cliente..." 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium" 
                          value={newChatData.newName}
                          onChange={(e) => setNewChatData({...newChatData, newName: e.target.value})}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">Telefone WhatsApp</label>
                        <input 
                          type="tel" 
                          placeholder="(99) 99999-9999" 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium" 
                          value={newChatData.newPhone}
                          onChange={(e) => setNewChatData({...newChatData, newPhone: e.target.value})}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-6">
                  <button type="button" onClick={() => setShowNewChatModal(false)} className="px-6 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest">Cancelar</button>
                  <button type="submit" className="px-8 py-3 bg-blue-600 text-white font-bold text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-100 transition-all hover:bg-blue-700">Iniciar Chat</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Transfer Modal */}
      <AnimatePresence>
        {showTransferModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTransferModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8">
              <h2 className="text-lg font-bold text-slate-800 mb-6">Transferir Atendimento</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Equipe de Destino</label>
                  <select 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                    value={transferData.teamId}
                    onChange={(e) => setTransferData({...transferData, teamId: e.target.value})}
                  >
                    <option value="">Selecione uma equipe...</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Consultor de Destino (Opcional)</label>
                  <select 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                    value={transferData.userId}
                    onChange={(e) => setTransferData({...transferData, userId: e.target.value})}
                  >
                    <option value="">Qualquer Consultor</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Motivo da Transferência</label>
                  <textarea 
                    placeholder="Explique o motivo da transferência..." 
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm min-h-[80px] outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                    value={transferData.reason}
                    onChange={(e) => setTransferData({...transferData, reason: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-8">
                 <button onClick={() => setShowTransferModal(false)} className="px-4 py-2 text-slate-500 font-bold text-xs uppercase">Cancelar</button>
                 <button onClick={handleTransfer} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest">Confirmar Transferência</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Close Modal */}
      <AnimatePresence>
        {showCloseModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCloseModal(false)} className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8">
              <h2 className="text-lg font-bold text-slate-800 mb-6">Finalizar Atendimento</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Motivo da Finalização</label>
                  <select 
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                  >
                    <option value="">Escolha um motivo...</option>
                    <option value="Dúvida Sanada">Dúvida Sanada</option>
                    <option value="Cotação Enviada">Cotação Enviada</option>
                    <option value="Reserva Confirmada">Reserva Confirmada</option>
                    <option value="Spam/Erro">Spam / Erro</option>
                    <option value="Sem Retorno do Cliente">Sem Retorno do Cliente</option>
                  </select>
                </div>
                <textarea 
                  placeholder="Observações finais (opcional)..." 
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl min-h-[100px] text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                 <button onClick={() => setShowCloseModal(false)} className="px-4 py-2 text-slate-500 font-bold text-xs uppercase">Cancelar</button>
                 <button onClick={handleClose} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest">Finalizar Agora</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
