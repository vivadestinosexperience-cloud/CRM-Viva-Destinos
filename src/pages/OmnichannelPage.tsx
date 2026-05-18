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
  Copy,
  Image as ImageIcon,
  Video as VideoIcon,
  File as FileIcon,
  X,
  Mic,
  Square,
  RotateCcw,
  AlertCircle,
  Smile
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Conversation, Message, Customer, Team } from '../types';
import { supabase } from '../integrations/supabase/client';
import { useAppStore } from '../store/useAppStore';
import { toast } from 'sonner';
import { getErrorMessage, renderSafeText } from '../utils/renderSafeText';
import { safeAction } from '../utils/safeAction';

import { getAgentDisplayName, formatOutgoingWhatsAppMessage } from '../utils/userUtils';

export default function OmnichannelPage() {
  const { 
    whatsAppAccounts,
    teams,
    customers,
    users,
    currentUser,
    addCustomer,
    internalNotes,
    addInternalNote,
    updateInternalNote,
    deleteInternalNote,
  } = useAppStore();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'novos' | 'meus' | 'concluidos' | 'todos'>('novos');
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [newMessage, setNewMessage] = useState('');
  const [showIAPanel, setShowIAPanel] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'document' | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [transferData, setTransferData] = useState({ teamId: '', userId: '', reason: '' });
  const [closeReason, setCloseReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  function getApiBaseUrl() {
    const envUrl = import.meta.env.VITE_API_BASE_URL;
    if (envUrl) return envUrl.replace(/\/$/, "");
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname.includes("webcontainer") ||
      window.location.hostname.includes("preview") ||
      window.location.hostname.includes("aistudio")
    ) {
      return "https://crm-viva-destinos-experience.onrender.com";
    }
    return "";
  }

  const isClosedConversation = (conversation: any) => {
    const status = String(conversation.status || "").toUpperCase();
    return ["CLOSED", "RESOLVED", "CONCLUIDO", "CONCLUÍDO"].includes(status);
  };

  async function loadConversations(silent = false) {
    if (!silent) setLoadingConversations(true);
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/omnichannel/conversations`);
      const data = await response.json();

      if (data.success) {
        const ordered = [...(data.conversations || [])].sort((a, b) => {
          return new Date(b.last_message_at || b.updated_at || b.created_at || 0).getTime()
            - new Date(a.last_message_at || a.updated_at || a.created_at || 0).getTime();
        });
        setConversations(ordered);

        // Auto-select first conversation if requested
        if (!activeConversationId && ordered.length > 0) {
          const firstNew = ordered.find(c => !c.assigned_user_id && !isClosedConversation(c));
          setActiveConversationId(firstNew?.id || ordered[0].id);
        }
      }
    } catch (error) {
      console.error("[LOAD CONVERSATIONS ERROR]", error);
      if (!silent) toast.error("Erro ao carregar conversas.");
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId: string, silent = false) {
    if (!conversationId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/omnichannel/conversations/${conversationId}/messages`);
      const data = await response.json();
      if (data.success) {
        setMessages(data.messages || []);
      }
    } catch (error) {
      console.error("[LOAD MESSAGES ERROR]", error);
      if (!silent) toast.error("Erro ao carregar mensagens.");
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }

  // Initial load
  useEffect(() => {
    loadConversations();
  }, []);

  // Sync messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  // Real-time updates (SSE + Polling fallback)
  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    const eventSource = new EventSource(`${baseUrl}/api/events`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "message.received" || data.event === "conversation.updated") {
          loadConversations(true);
          if (activeConversationId) {
            loadMessages(activeConversationId, true);
          }
        }
      } catch (e) {
        console.error("Error parsing SSE data", e);
      }
    };

    eventSource.onerror = () => {
      console.warn("SSE connection error. Fallback to polling.");
    };

    const interval = setInterval(() => {
      loadConversations(true);
      if (activeConversationId) {
        loadMessages(activeConversationId, true);
      }
    }, 10000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [activeConversationId]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeCustomer = activeConversation?.customer || customers.find(c => c.id === activeConversation?.customer_id);
  const activeChatMessages = messages; 
  const currentAccount = whatsAppAccounts.find(a => a.id === activeConversation?.whatsapp_account_id);

  function renderMessageContent(message: Message) {
    if (!message) return null;

    const type = message.message_type || (message as any).type || "text";
    const content = renderSafeText(message.content, "Mensagem recebida");

    if (type === "internal_note" || (message as any).is_internal) {
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 opacity-70">
            <Info className="w-3 h-3" />
            <span className="text-[10px] font-black uppercase tracking-widest">Anotação Interna</span>
          </div>
          <p className="text-xs italic leading-relaxed">
            {content}
          </p>
        </div>
      );
    }

    if (type === "image") {
      return (
        <div className="space-y-2">
          {message.media_url && (
             <img 
               src={message.media_url} 
               alt="Anexo" 
               className="max-w-full rounded-lg cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
               onClick={() => window.open(message.media_url, '_blank')}
             />
          )}
          {content && content !== "Imagem enviada" && content !== "Imagem recebida" && (
            <p className="text-sm">{content}</p>
          )}
        </div>
      );
    }

    if (type === "audio") {
      return (
        <div className="space-y-2 min-w-[200px]">
          {message.media_url && (
            <audio controls src={message.media_url} className="w-full h-8" />
          )}
          {content && content !== "Áudio enviado" && content !== "Áudio recebido" && (
            <p className="text-sm">{content}</p>
          )}
        </div>
      );
    }

    if (type === "video") {
      return (
        <div className="space-y-2">
          {message.media_url && (
            <video controls src={message.media_url} className="max-w-full rounded-lg shadow-sm" />
          )}
          {content && content !== "Vídeo enviado" && content !== "Vídeo recebido" && (
            <p className="text-sm">{content}</p>
          )}
        </div>
      );
    }

    if (type === "document") {
      return (
        <div className="space-y-2">
          {message.media_url ? (
            <a 
              href={message.media_url} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-2 p-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors"
            >
              <FileIcon className="w-5 h-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{(message.metadata as any)?.fileName || 'Documento'}</p>
                <p className="text-[10px] opacity-60">Clique para abrir</p>
              </div>
            </a>
          ) : (
            <div className="flex items-center gap-2 p-2 bg-black/5 rounded-lg opacity-50">
              <FileIcon className="w-5 h-5" />
              <p className="text-xs">Documento indisponível</p>
            </div>
          )}
          {content && content !== "Documento enviado" && content !== "Documento recebido" && (
            <p className="text-sm">{content}</p>
          )}
        </div>
      );
    }

    return <p className="text-sm whitespace-pre-wrap">{content}</p>;
  }

  // Filtered Conversations
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    const emoji = emojiData.emoji;
    const input = messageInputRef.current;
    
    if (!input) {
      setNewMessage(prev => prev + emoji);
      return;
    }

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const text = newMessage;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    setNewMessage(before + emoji + after);
    
    // Reset focus and cursor position after state update
    setTimeout(() => {
      input.focus();
      const newPos = start + emoji.length;
      input.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSupportedAudioMimeType = () => {
    const types = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setAudioUrl(null);
      setAudioBlob(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Permissão de microfone negada ou não suportada.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleSendAudio = async () => {
    if (!audioBlob || !activeConversationId || !activeCustomer) return;
    
    // Max 16MB
    if (audioBlob.size > 16 * 1024 * 1024) {
      toast.error("Áudio muito grande (máximo 16MB)");
      return;
    }

    setIsSendingMedia(true);
    await safeAction(async () => {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => resolve(reader.result as string);
      });

      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/zapi/send-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: activeCustomer.phone, audio: base64 })
      });

      if (!res.ok) throw await res.json();

      await loadMessages(activeConversationId, true);
      await loadConversations(true);

      setShowAudioRecorder(false);
      setAudioUrl(null);
      setAudioBlob(null);
      toast.success('Áudio enviado com sucesso!');
    }, { label: 'Erro ao enviar áudio' });
    setIsSendingMedia(false);
  };
  function getFilteredConversations() {
    return conversations.filter((conversation) => {
      const isClosed = isClosedConversation(conversation);
      const assignedUserId = conversation.assigned_user_id;

      // Filter by Search
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const cust = conversation.customer || customers.find(c => c.id === conversation.customer_id);
        const name = (cust?.name || (conversation as any).customer_name || "").toLowerCase();
        const phone = (conversation.customer_phone_normalized || cust?.phone || "");
        const msg = String(conversation.last_message || "").toLowerCase();
        
        if (!name.includes(searchLower) && !phone.includes(searchTerm) && !msg.includes(searchLower)) {
          return false;
        }
      }

      if (activeTab === "novos") {
        return !assignedUserId && !isClosed;
      }

      if (activeTab === "meus") {
        return assignedUserId && assignedUserId === currentUser?.id && !isClosed;
      }

      if (activeTab === "concluidos") {
        return isClosed;
      }

      return true;
    });
  }

  const filteredConversations = getFilteredConversations().sort((a, b) => {
    const timeA = new Date(a.last_message_at || a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_message_at || b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
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

    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/omnichannel/conversations/${activeConversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue_id: transferData.teamId,
          assigned_user_id: transferData.userId || null,
          status: 'TRANSFERRED'
        })
      });

      if (!res.ok) throw await res.json();
      
      const teamName = teams.find(t => t.id === transferData.teamId)?.name || 'Nova Equipe';
      
      // Send system message
      await fetch(`${baseUrl}/api/omnichannel/conversations/${activeConversationId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: `Atendimento transferido para a equipe: ${teamName}${transferData.reason ? `. Motivo: ${transferData.reason}` : ''}`,
          agentId: currentUser?.id,
          agentName: 'Sistema'
        })
      });

      await loadConversations(true);
      setShowTransferModal(false);
      toast.success('Atendimento transferido');
    }, { label: 'Erro ao transferir atendimento' });
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatData.accountId || !newChatData.teamId) {
      toast.error('Informe o canal e a equipe');
      return;
    }

    await safeAction(async () => {
      let finalCustomerId = newChatData.customerId;
      const baseUrl = getApiBaseUrl();

      // 1. Create customer if new
      if (!finalCustomerId) {
        if (!newChatData.newName || !newChatData.newPhone) {
          toast.error('Informe o nome e o telefone do novo cliente');
          return;
        }
        
        const custRes = await fetch(`${baseUrl}/api/crm/customers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newChatData.newName,
            phone: newChatData.newPhone,
            source: 'Manual'
          })
        });
        const custData = await custRes.json();
        if (!custRes.ok) throw custData;
        finalCustomerId = custData.customer.id;
      }

      // 2. Create conversation
      const convRes = await fetch(`${baseUrl}/api/omnichannel/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: finalCustomerId,
          whatsapp_account_id: newChatData.accountId,
          queue_id: newChatData.teamId,
          assigned_user_id: currentUser?.id,
          assigned_user_name: getAgentDisplayName(currentUser),
          status: 'OPEN',
          source: 'WhatsApp Z-API'
        })
      });

      const convData = await convRes.json();
      if (!convRes.ok) throw convData;

      await loadConversations(true);
      setActiveConversationId(convData.conversation.id);
      setShowNewChatModal(false);
      setNewChatData({ accountId: '', teamId: '', customerId: '', newName: '', newPhone: '' });
      toast.success('Conversa iniciada com sucesso!');
    }, { label: 'Erro ao criar conversa' });
  };

  const handleClose = async () => {
    if (!activeConversationId || !closeReason) {
      toast.error('Informe o motivo da finalização');
      return;
    }

    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/omnichannel/conversations/${activeConversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'RESOLVED',
          last_message: `Finalizado: ${closeReason}`
        })
      });

      if (!res.ok) throw await res.json();

      await loadConversations(true);
      setShowCloseModal(false);
      toast.success('Atendimento finalizado com sucesso');
    }, { label: 'Erro ao finalizar atendimento' });
  };

  const handleAISuggestion = async () => {
    if (!activeConversation) return;
    const history = messages
      .map(m => `${m.sender_type === 'customer' ? 'Cliente' : 'Agente'}: ${m.content}`)
      .join('\n');

    toast.promise(
      fetch('/api/ai/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw data;
        return data;
      }).then(data => {
        if (data.suggestion) {
           setNewMessage(data.suggestion);
           setShowIAPanel(false);
        }
      }),
      {
        loading: 'Gerando sugestão...',
        success: 'Sugestão inserida no campo de texto!',
        error: (err) => `Erro ao gerar sugestão: ${getErrorMessage(err)}`
      }
    );
  };

  const handleAIClassify = async () => {
    if (!activeConversation) return;
    const history = messages
      .map(m => `${m.sender_type === 'customer' ? 'Cliente' : 'Agente'}: ${m.content}`)
      .join('\n');

    toast.promise(
      fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      }).then(async res => {
        const data = await res.json();
        if (!res.ok) throw data;
        return data;
      }).then(data => {
        if (data.classification && activeConversation.customer_id) {
           toast.success(`Lead classificado como: ${data.classification}`);
           setShowIAPanel(false);
        }
      }),
      {
        loading: 'Classificando lead...',
        success: 'Classificação concluída',
        error: (err) => `Erro ao classificar: ${getErrorMessage(err)}`
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

    if (currentAccount.status !== 'CONNECTED') {
      toast.error('Este canal está desconectado. Reconecte antes de enviar.');
      return;
    }

    await safeAction(async () => {
      const originalContent = newMessage;
      const agentName = getAgentDisplayName(currentUser);
      
      setNewMessage('');
      
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/omnichannel/conversations/${activeConversationId}/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: originalContent,
          agentId: currentUser?.id,
          agentName: agentName
        })
      });

      if (!res.ok) throw await res.json();
      
      await loadMessages(activeConversationId, true);
      await loadConversations(true);
      toast.success('Mensagem enviada com sucesso');
    }, { label: 'Erro ao enviar mensagem' });
  };

  const handleSummarize = async () => {
    if (!activeConversation) return;
    setIsSummarizing(true);
    await safeAction(async () => {
      // Simulate AI summary delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      setAiSummary("O cliente deseja uma viagem para Porto de Galinhas em julho, para 2 adultos e 1 criança de 6 anos. Demonstrou interesse em resort com café da manhã e orçamento médio. Lead classificado como QUENTE.");
      toast.success('Resumo gerado pelo Assistente IA');
    }, { label: 'Erro ao gerar resumo' });
    setIsSummarizing(false);
  };

  const handleReopen = async () => {
    if (!activeConversation) return;
    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/omnichannel/conversations/${activeConversation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'OPEN' })
      });

      if (!res.ok) throw await res.json();
      
      await loadConversations(true);
      toast.success('Atendimento reaberto');
    }, { label: 'Erro ao reabrir atendimento' });
  };
  
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Z-API expects base64 WITH or WITHOUT data prefix depending on implementation, 
        // usually it accepts the full data URI.
        resolve(result);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'document') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Size limits
    const limits = {
      image: 5 * 1024 * 1024,   // 5MB
      video: 25 * 1024 * 1024,  // 25MB
      document: 20 * 1024 * 1024 // 20MB
    };

    if (file.size > (limits[type] || limits.document)) {
      toast.error(`Arquivo muito grande para envio (máximo ${type === 'image' ? '5MB' : (type === 'video' ? '25MB' : '20MB')})`);
      return;
    }

    setSelectedFile(file);
    setMediaType(type);
    setShowAttachmentMenu(false);
    
    if (type === 'image' || type === 'video') {
      const url = URL.createObjectURL(file);
      setMediaPreviewUrl(url);
      setShowMediaPreview(true);
    } else {
      setMediaPreviewUrl(null);
      setShowMediaPreview(true);
    }
  };

  const handleSendMedia = async () => {
    if (!selectedFile || !activeConversationId || !activeCustomer) return;

    setIsSendingMedia(true);
    const agentName = getAgentDisplayName(currentUser);
    const formattedCaption = mediaCaption ? formatOutgoingWhatsAppMessage(mediaCaption, agentName) : '';
    
    setShowMediaPreview(false);

    await safeAction(async () => {
      const base64 = await fileToBase64(selectedFile);
      const baseUrl = getApiBaseUrl();
      
      let endpoint = '';
      let body: any = { phone: activeCustomer.phone };

      if (mediaType === 'image') {
        endpoint = `${baseUrl}/api/zapi/send-image`;
        body.image = base64;
        body.caption = formattedCaption;
      } else if (mediaType === 'video') {
        endpoint = `${baseUrl}/api/zapi/send-video`;
        body.video = base64;
        body.caption = formattedCaption;
      } else if (mediaType === 'document') {
        endpoint = `${baseUrl}/api/zapi/send-document`;
        body.document = base64;
        body.fileName = selectedFile.name;
        body.extension = selectedFile.name.split('.').pop() || '';
        body.caption = formattedCaption;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw await res.json();
      
      await loadMessages(activeConversationId, true);
      await loadConversations(true);
      toast.success(`${mediaType === 'image' ? 'Foto' : (mediaType === 'video' ? 'Vídeo' : 'Documento')} enviado com sucesso!`);

      // Reset state
      setSelectedFile(null);
      setMediaType(null);
      setMediaCaption('');
      setMediaPreviewUrl(null);
    }, { label: 'Erro ao enviar mídia' });
    setIsSendingMedia(false);
  };

  const retryMessage = async (msg: Message) => {
    if (!activeCustomer?.phone) return;

    await safeAction(async () => {
      const baseUrl = getApiBaseUrl();
      let endpoint = '';
      let body: any = { phone: activeCustomer.phone };
      const sentContent = msg.metadata?.sentContent || msg.content;

      if (msg.message_type === 'text') {
        endpoint = `${baseUrl}/api/zapi/send-text`;
        body.message = sentContent;
      } else {
        toast.error("Reenvio de mídia ainda não suportado. Tente enviar o arquivo novamente.");
        return;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw await res.json();
      
      await loadMessages(activeConversationId!, true);
      toast.success('Mensagem reenviada com sucesso');
    }, { label: 'Erro ao reenviar mensagem' });
  };

  const handleSaveNote = async () => {
    if (!noteContent.trim() || !activeConversationId) return;

    await safeAction(async () => {
      if (editingNoteId) {
        await updateInternalNote(editingNoteId, { content: noteContent });
      } else {
        await addInternalNote({
          conversation_id: activeConversationId,
          content: noteContent,
          created_by: currentUser?.id,
          created_by_name: getAgentDisplayName(currentUser),
          pinned: true
        });
      }
      setShowNoteModal(false);
      setNoteContent('');
      setEditingNoteId(null);
    }, { label: 'Erro ao salvar anotação' });
  };

  const currentNote = internalNotes.find(n => n.conversation_id === activeConversationId);

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
              onClick={() => setActiveTab('novos')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'novos' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Novos ({conversations.filter(c => !c.assigned_user_id && !isClosedConversation(c)).length})
            </button>
            <button 
              onClick={() => setActiveTab('meus')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'meus' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Meus ({conversations.filter(c => c.assigned_user_id === currentUser?.id && !isClosedConversation(c)).length})
            </button>
            <button 
              onClick={() => setActiveTab('concluidos')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'concluidos' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Concluídos ({conversations.filter(c => isClosedConversation(c)).length})
            </button>
            <button 
              onClick={() => setActiveTab('todos')}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'todos' ? 'bg-white shadow-md text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Todos ({conversations.length})
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
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {activeTab === 'novos' ? 'Nenhuma conversa nova encontrada' :
                 activeTab === 'meus' ? 'Nenhum atendimento atribuído a você' :
                 activeTab === 'concluidos' ? 'Nenhum atendimento concluído' :
                 'Nenhuma conversa encontrada'}
              </p>
            </div>
          ) : filteredConversations.map((conv) => {
            const customer = conv.customer || customers.find(c => c.id === conv.customer_id);
            const isActive = activeConversationId === conv.id;
            const team = teams.find(t => t.id === conv.queue_id);
            const account = whatsAppAccounts.find(a => a.id === conv.whatsapp_account_id);
            const lastMsgAt = conv.last_message_at || conv.updated_at || conv.created_at;

            const customerName = (customer?.name || (conv as any).customer_name || (conv as any).name || "Cliente") as string;
            const lastMessage = typeof conv.last_message === 'string' ? conv.last_message : "Mensagem recebida";

            return (
              <button 
                key={conv.id}
                onClick={async () => {
                  setActiveConversationId(conv.id);
                  // We don't update unread_count locally anymore, the API should handle it or we'd need a specific endpoint
                }}
                className={`w-full p-4 flex items-start gap-4 transition-all hover:bg-slate-50 text-left relative overflow-hidden ${isActive ? 'bg-blue-50/50' : ''}`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>}
                
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg border-2 border-white shadow-sm ring-1 ring-slate-100">
                    {customerName.charAt(0)}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg" alt="WA" className="w-3 h-3 invert pointer-events-none" />
                  </div>
                </div>

                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-slate-800 text-sm truncate">{customerName}</h3>
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
                    {lastMessage}
                  </p>
                </div>

                {(conv.unread_count || 0) > 0 && (
                  <div className="bg-blue-600 text-white w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-lg shadow-blue-200">
                    {conv.unread_count}
                  </div>
                )}
              </button>
            );
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
                    <span className={`text-xs font-bold uppercase tracking-wider ${activeConversation.status === 'RESOLVED' ? 'text-blue-500' : 'text-emerald-500'}`}>
                      {activeConversation.status === 'RESOLVED' ? 'Concluído' : 'Em Aberto'}
                    </span>
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
                {activeConversation.status === 'RESOLVED' || activeConversation.status === 'CLOSED' || activeConversation.status === 'CONCLUIDO' || activeConversation.status === 'CONCLUÍDO' ? (
                  <button 
                    onClick={handleReopen}
                    className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl transition-all font-bold text-sm px-4"
                  >
                    Reabrir
                  </button>
                ) : (
                  <>
                    {activeConversation.assigned_user_id !== currentUser?.id && (
                      <button 
                        onClick={async () => {
                          const agentName = getAgentDisplayName(currentUser);
                          const baseUrl = getApiBaseUrl();
                          const res = await fetch(`${baseUrl}/api/omnichannel/conversations/${activeConversation.id}/assign`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: currentUser?.id, userName: agentName })
                          });
                          
                          if (res.ok) {
                            await loadConversations(true);
                            toast.success('Atendimento iniciado e atribuído a você.');
                          } else {
                            toast.error('Erro ao assumir atendimento.');
                          }
                        }}
                        className="p-2.5 bg-blue-600 text-white rounded-xl transition-all font-bold text-sm px-4 shadow-lg shadow-blue-100 hover:scale-105"
                      >
                        Assumir Atendimento
                      </button>
                    )}
                    <button 
                      onClick={() => setShowCloseModal(true)}
                      className="p-2.5 bg-blue-50 text-blue-600 rounded-xl transition-all font-bold text-sm px-4"
                    >
                      Concluir
                    </button>
                  </>
                )}
                <div className="relative">
                  <button 
                    onClick={() => setShowChatMenu(!showChatMenu)}
                    className={`p-2.5 rounded-xl transition-all ${showChatMenu ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'hover:bg-slate-50 text-slate-400'}`}
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>

                  <AnimatePresence>
                    {showChatMenu && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-[60]"
                      >
                         <button 
                          onClick={() => { setShowChatMenu(false); toast.info('Funcionalidade em desenvolvimento'); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                         >
                            <Info className="w-4 h-4" /> Detalhes do Lead
                         </button>
                         <button 
                          onClick={() => { setShowChatMenu(false); toast.info('Exportando histórico...'); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                         >
                            <FileText className="w-4 h-4" /> Exportar Conversa (PDF)
                         </button>
                         <div className="h-px bg-slate-50 my-1 mx-2" />
                         <button 
                          onClick={() => { setShowChatMenu(false); toast.warning('Lead marcado como spam'); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 rounded-xl text-xs font-bold text-red-600 transition-colors"
                         >
                            <Plus className="w-4 h-4 rotate-45" /> Marcar como Spam
                         </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </header>

            {/* Quality Banner */}
            <div className={`px-6 py-2 border-b flex items-center justify-between gap-3 ${currentAccount?.status === 'CONNECTED' ? 'bg-blue-50/50 border-blue-100' : 'bg-red-50/50 border-red-100'}`}>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${currentAccount?.status === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${currentAccount?.status === 'CONNECTED' ? 'text-blue-700' : 'text-red-700'}`}>
                  Canal {currentAccount?.name || 'Comercial'} {currentAccount?.status === 'CONNECTED' ? 'conectado com qualidade ALTA' : 'DESCONECTADO'} • Atendimento {currentAccount?.status === 'CONNECTED' ? 'seguro' : 'PENDENTE'}
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
                const isInternal = (msg as any).is_internal || msg.message_type === 'internal_note';
                const timestamp = msg.created_at;
                const status = msg.status;
                
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] lg:max-w-[60%] flex gap-3 ${isMine ? 'flex-row-reverse' : ''}`}>
                      <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border ${isMine ? 'bg-blue-600 border-blue-500 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 shadow-sm'}`}>
                        {isMine ? 'GA' : activeCustomer?.name?.charAt(0)}
                      </div>
                      
                      <div className="space-y-1">
                        <div className={`text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 px-1 ${isMine ? 'text-right' : 'text-left'}`}>
                          {msg.sender_type === 'system' ? 'Sistema' : (isMine ? (msg.sender_name || 'Agente') : (activeCustomer?.name || 'Cliente'))}
                        </div>
                        <div className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed transition-all ${isMine ? (isInternal ? 'bg-amber-100 text-amber-900 border-amber-200 rounded-tr-none' : 'bg-blue-600 text-white rounded-tr-none') : 'bg-white text-slate-700 rounded-tl-none border border-slate-100'} ${status === 'failed' ? 'border-red-300 bg-red-50 text-red-600' : ''}`}>
                          {renderMessageContent(msg)}
                          
                          <div className={`flex items-center gap-1.5 mt-1 opacity-50 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            <span className="text-[9px] font-medium uppercase">
                              {timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                            </span>
                            {isMine && status === 'read' && <CheckCheck className="w-3 h-3 text-blue-500" />}
                            {isMine && status === 'sent' && <CheckCheck className="w-3 h-3 text-slate-300" />}
                            {isMine && (status as any) === 'sending' && <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />}
                            {isMine && status === 'failed' && (
                              <button onClick={() => retryMessage(msg)} className="flex items-center gap-1 group">
                                 <AlertCircle className="w-3 h-3 text-red-500" />
                                 <span className="text-[8px] text-red-500 font-bold uppercase hover:underline">Falhou • Tentar novamente</span>
                              </button>
                            )}
                          </div>
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
              {activeConversation.status === 'RESOLVED' ? (
                <div className="max-w-4xl mx-auto p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center">
                  <p className="text-sm text-slate-500 font-medium">Este atendimento foi concluído em {activeConversation.last_message_at ? new Date(activeConversation.last_message_at).toLocaleDateString() : 'data recente'}.</p>
                  <button 
                    onClick={handleReopen}
                    className="mt-2 text-blue-600 font-bold text-xs uppercase tracking-widest hover:underline"
                  >
                    Reabrir Atendimento para conversar
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex items-end gap-3 bg-slate-50 border border-slate-200 p-3 rounded-2xl focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all shadow-sm">
                  <div className="flex items-center gap-1 relative">
                    <button 
                      type="button" 
                      onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                      className={`p-2 rounded-xl transition-all ${showAttachmentMenu ? 'bg-blue-600 text-white scale-110' : 'text-slate-400 hover:bg-white hover:text-blue-600'}`}
                      title="Adicionar anexo"
                    >
                      <Plus className={`w-5 h-5 transition-transform duration-300 ${showAttachmentMenu ? 'rotate-45' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {showAttachmentMenu && (
                        <motion.div 
                          initial={{ opacity: 0, y: -20, scale: 0.9 }}
                          animate={{ opacity: 1, y: -10, scale: 1 }}
                          exit={{ opacity: 0, y: -20, scale: 0.9 }}
                          className="absolute bottom-full left-0 mb-4 w-48 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-[60]"
                        >
                           <button 
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                           >
                              <ImageIcon className="w-4 h-4 text-emerald-500" /> Foto / Imagem
                           </button>
                           <button 
                            type="button"
                            onClick={() => videoInputRef.current?.click()}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                           >
                              <VideoIcon className="w-4 h-4 text-blue-500" /> Vídeo
                           </button>
                           <button 
                            type="button"
                            onClick={() => {
                              if (!activeConversation) return toast.info("Selecione uma conversa antes de enviar arquivos.");
                              if (!activeCustomer?.phone) return toast.info("Cliente sem telefone válido.");
                              if (!currentAccount) return toast.info("Canal WhatsApp não configurado.");
                              docInputRef.current?.click();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                           >
                              <FileIcon className="w-4 h-4 text-orange-500" /> Documento
                           </button>
                           <button 
                            type="button"
                            onClick={() => {
                              if (!activeConversation) return toast.info("Selecione uma conversa antes de gravar áudio.");
                              if (!activeCustomer?.phone) return toast.info("Cliente sem telefone válido.");
                              if (!currentAccount) return toast.info("Canal WhatsApp não configurado.");
                              setShowAudioRecorder(true);
                              setShowAttachmentMenu(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                           >
                              <Mic className="w-4 h-4 text-rose-500" /> Gravar Áudio
                           </button>
                           <button 
                            type="button"
                            onClick={() => {
                              setShowAttachmentMenu(false);
                              if (currentNote) {
                                setNoteContent(currentNote.content);
                                setEditingNoteId(currentNote.id);
                              } else {
                                setNoteContent('');
                                setEditingNoteId(null);
                              }
                              setShowNoteModal(true);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                           >
                              <FileText className="w-4 h-4 text-slate-400" /> Anotação Interna
                           </button>
                           
                           <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileSelect(e, 'image')} />
                           <input type="file" ref={videoInputRef} className="hidden" accept="video/*" onChange={(e) => handleFileSelect(e, 'video')} />
                           <input type="file" ref={docInputRef} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" onChange={(e) => handleFileSelect(e, 'document')} />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <button 
                      type="button" 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className={`p-2 rounded-xl transition-all ${showEmojiPicker ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-white hover:text-blue-600'}`}
                      title="Emojis"
                    >
                      <Smile className="w-5 h-5" />
                    </button>

                    <AnimatePresence>
                      {showEmojiPicker && (
                        <motion.div 
                          ref={emojiPickerRef}
                          initial={{ opacity: 0, y: -20, scale: 0.9 }}
                          animate={{ opacity: 1, y: -10, scale: 1 }}
                          exit={{ opacity: 0, y: -20, scale: 0.9 }}
                          className="absolute bottom-full left-0 mb-4 z-[100] shadow-2xl rounded-2xl overflow-hidden bg-white border border-slate-200"
                        >
                          <EmojiPicker
                            onEmojiClick={handleEmojiClick}
                            searchDisabled={false}
                            skinTonesDisabled={false}
                            previewConfig={{ showPreview: false }}
                            width={340}
                            height={420}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <textarea 
                    ref={messageInputRef}
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
              )}
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

              <section className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 mt-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-amber-600 rotate-45" />
                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider">Anotação Interna</h4>
                  </div>
                  <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded text-[8px] font-black uppercase tracking-tighter">Operação</span>
                </div>

                {currentNote ? (
                  <div className="space-y-4">
                    <div className="relative">
                      <p className="text-xs text-amber-900 leading-relaxed font-medium italic">
                        "{currentNote.content}"
                      </p>
                      <div className="mt-3 pt-3 border-t border-amber-100 flex items-center justify-between">
                         <div className="min-w-0">
                           <p className="text-[10px] text-amber-700 font-bold truncate">{currentNote.created_by_name || 'Agente'}</p>
                           <p className="text-[9px] text-amber-600/60 font-medium">
                             {currentNote.updated_at ? new Date(currentNote.updated_at).toLocaleString() : ''}
                           </p>
                         </div>
                         <div className="flex items-center gap-1">
                           <button 
                             onClick={() => {
                               setNoteContent(currentNote.content);
                               setEditingNoteId(currentNote.id);
                               setShowNoteModal(true);
                             }}
                             className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-700 transition-colors"
                           >
                             <FileText className="w-3.5 h-3.5" />
                           </button>
                           <button 
                             onClick={() => {
                               if (window.confirm('Excluir esta anotação interna?')) {
                                 deleteInternalNote(currentNote.id);
                               }
                             }}
                             className="p-1.5 hover:bg-red-100 rounded-lg text-red-600 transition-colors"
                           >
                             <X className="w-3.5 h-3.5" />
                           </button>
                         </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-center">
                    <p className="text-[10px] text-amber-700/50 italic mb-3 font-medium">Nenhuma anotação registrada para este cliente.</p>
                    <button 
                      onClick={() => {
                        setNoteContent('');
                        setEditingNoteId(null);
                        setShowNoteModal(true);
                      }}
                      className="text-[10px] font-black text-amber-600 uppercase tracking-widest hover:underline"
                    >
                      + Criar Anotação
                    </button>
                  </div>
                )}
                
                <p className="text-[8px] text-amber-600 opacity-60 mt-3 text-center font-bold uppercase tracking-widest">⚠️ Visível apenas internamente</p>
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

      {/* Modals & Overlays */}
      <AnimatePresence>
        {/* Audio Recorder Modal */}
        {showAudioRecorder && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
               onClick={() => !isSendingMedia && setShowAudioRecorder(false)}
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-md bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-10"
            >
               <div className="flex flex-col items-center text-center space-y-6">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${isRecording ? 'bg-red-500 scale-110 shadow-2xl shadow-red-200 animate-pulse' : 'bg-blue-50 text-blue-600'}`}>
                    {isRecording ? <Square className="w-8 h-8 text-white cursor-pointer" onClick={stopRecording} /> : <Mic className="w-10 h-10" />}
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{isRecording ? 'Gravando Áudio' : (audioUrl ? 'Prévia do Áudio' : 'Gravar Mensagem de Voz')}</h3>
                    <p className="text-4xl font-black text-slate-800 mt-2 font-mono">{formatTime(recordingTime)}</p>
                  </div>

                  {audioUrl && !isRecording && (
                    <div className="w-full bg-slate-50 p-4 rounded-3xl border border-slate-100">
                      <audio src={audioUrl} controls className="w-full" />
                    </div>
                  )}

                  <div className="flex items-center gap-4 w-full">
                    {!isRecording && !audioUrl ? (
                      <button 
                        onClick={startRecording}
                        className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 hover:scale-105 transition-all"
                      >
                        Iniciar Gravação
                      </button>
                    ) : isRecording ? (
                      <button 
                        onClick={stopRecording}
                        className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-red-100 hover:scale-105 transition-all"
                      >
                        Parar Gravação
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => { setAudioUrl(null); setAudioBlob(null); setRecordingTime(0); }}
                          disabled={isSendingMedia}
                          className="p-4 bg-slate-100 text-slate-500 rounded-2xl hover:bg-slate-200 transition-all font-bold"
                        >
                          Regravar
                        </button>
                        <button 
                          onClick={handleSendAudio}
                          disabled={isSendingMedia}
                          className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-blue-100 hover:scale-105 transition-all flex items-center justify-center gap-3"
                        >
                          {isSendingMedia ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          {isSendingMedia ? 'Enviando...' : 'Enviar Áudio'}
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button 
                    onClick={() => setShowAudioRecorder(false)}
                    disabled={isSendingMedia}
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                  >
                    Fechar
                  </button>
               </div>
            </motion.div>
          </div>
        )}

        {showMediaPreview && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => { if (!isSendingMedia) setShowMediaPreview(false); }}
               className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 20 }}
               className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
               <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Enviar {mediaType === 'image' ? 'Foto' : (mediaType === 'video' ? 'Vídeo' : 'Documento')}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Viva Destinos Omnichannel</p>
                  </div>
                  <button onClick={() => setShowMediaPreview(false)} className="p-3 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-2xl transition-all">
                    <X className="w-6 h-6" />
                  </button>
               </div>

               <div className="p-8 space-y-6">
                  {mediaType !== 'document' && mediaPreviewUrl && (
                    <div className="w-full aspect-video bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden flex items-center justify-center">
                      {mediaType === 'image' ? (
                        <img src={mediaPreviewUrl} className="max-w-full max-h-full object-contain" alt="Preview" />
                      ) : (
                        <video src={mediaPreviewUrl} controls className="max-w-full max-h-full" />
                      )}
                    </div>
                  )}

                  {mediaType === 'document' && selectedFile && (
                    <div className="p-8 bg-blue-50 border border-blue-100 rounded-3xl flex flex-col items-center gap-4">
                       <div className="w-20 h-20 bg-white rounded-2xl shadow-md flex items-center justify-center text-blue-600">
                          <FileIcon className="w-10 h-10" />
                       </div>
                       <div className="text-center">
                          <p className="font-bold text-slate-800">{selectedFile.name}</p>
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                       </div>
                    </div>
                  )}

                  {(mediaType === 'image' || mediaType === 'video') && (
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Legenda Opcional</label>
                       <textarea 
                         rows={2}
                         className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-sm resize-none"
                         placeholder="Digite uma legenda para a sua mídia..."
                         value={mediaCaption}
                         onChange={(e) => setMediaCaption(e.target.value)}
                       />
                    </div>
                  )}

                  <div className="flex items-center gap-4 pt-4">
                    <button 
                      onClick={() => setShowMediaPreview(false)}
                      disabled={isSendingMedia}
                      className="flex-1 p-5 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleSendMedia}
                      disabled={isSendingMedia}
                      className="flex-[2] p-5 bg-blue-600 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-100 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                    >
                      {isSendingMedia ? (
                         <>
                           <RefreshCw className="w-4 h-4 animate-spin" /> Enviando...
                         </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" /> Enviar Agora
                        </>
                      )}
                    </button>
                  </div>
               </div>
            </motion.div>
          </div>
        )}

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
                          <option key={acc.id} value={acc.id}>{acc.name} ({acc.status === 'CONNECTED' ? 'Ativo' : 'Off'})</option>
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
      {/* Note Modal */}
      <AnimatePresence>
        {showNoteModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowNoteModal(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-50 bg-amber-50/30 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-amber-900 uppercase tracking-tight flex items-center gap-2">
                    <FileText className="w-5 h-5" /> 
                    {editingNoteId ? 'Editar Anotação Interna' : 'Nova Anotação Interna'}
                  </h2>
                  <p className="text-[10px] font-bold text-amber-700/60 uppercase tracking-widest mt-1">Esta informação nunca será enviada ao cliente</p>
                </div>
                <button onClick={() => setShowNoteModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Conteúdo da Observação</label>
                  <textarea 
                    autoFocus
                    placeholder="Digite observações importantes sobre este atendimento ou perfil do cliente..." 
                    className="w-full p-5 bg-slate-50 border border-slate-100 rounded-2xl text-sm min-h-[160px] outline-none focus:ring-2 focus:ring-amber-500 transition-all resize-none font-medium text-slate-700"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    maxLength={1000}
                  />
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Limite: 1.000 caracteres</span>
                    <span className={`text-[9px] font-bold uppercase ${noteContent.length > 900 ? 'text-red-500' : 'text-slate-400'}`}>
                      {noteContent.length} / 1000
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                    Anotações internas ajudam outros operadores a entenderem o contexto deste cliente caso o atendimento seja transferido futuramente.
                  </p>
                </div>
              </div>

              <div className="p-6 border-t border-slate-50 flex justify-end gap-3 bg-slate-50/30">
                 <button 
                  onClick={() => setShowNoteModal(false)} 
                  className="px-5 py-2.5 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 rounded-xl transition-all"
                 >
                  Cancelar
                 </button>
                 <button 
                  onClick={handleSaveNote} 
                  disabled={!noteContent.trim()}
                  className={`px-8 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${noteContent.trim() ? 'bg-amber-600 text-white shadow-amber-100 hover:scale-105' : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-50'}`}
                 >
                   {editingNoteId ? 'Salvar Alterações' : 'Fixar Anotação'}
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
