/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  tagService,
  conversationTagService,
  conversationService,
  quickReplyService,
} from "../services/dataService";
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
  Smile,
  Shield,
  CheckCircle2,
  Database,
  ChevronRight,
  ListFilter,
  SlidersHorizontal,
  Settings2,
  Trash2,
  Pencil,
  Check,
  ChevronDown,
  User,
  LayoutGrid,
  Filter,
  Clock,
  History,
  Calendar,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useParams, useNavigate } from "react-router-dom";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { Conversation, Message, Customer, Team } from "../types";
import { supabase } from "../integrations/supabase/client";
import { useAppStore } from "../store/useAppStore";
import {
  initGoogleAuth,
  googleSignIn,
  googleSignOut,
  getAccessToken,
  getStoredSpreadsheetId,
  setStoredSpreadsheetId,
  getCustomFieldDefs,
  saveCustomFieldDefs,
  getCustomFieldValues,
  saveCustomFieldValues,
  syncConversationToSheet,
  syncAllConversationsToSheet,
  getCleanStatusLabel,
  CustomFieldDefinition,
  CustomFieldValues,
} from "../services/googleSheetsService";
import { User as FirebaseUser } from "firebase/auth";
import { authorizedFetch, safeReadJson, getApiBaseUrl } from "../services/api";
import { toast } from "sonner";
import { getErrorMessage, renderSafeText } from "../utils/renderSafeText";
import { safeAction } from "../utils/safeAction";
import { normalizeBrazilPhone } from "../utils/phoneUtils";

import {
  getAgentDisplayName,
  formatOutgoingWhatsAppMessage,
} from "../utils/userUtils";
import { getContrastTextColor } from "../utils/colorUtils";
import { TagManagementModal } from "../components/TagManagementModal";
import { LeadDetailsModal } from "../components/LeadDetailsModal";
import { FilterPanel } from "../components/FilterPanel";
import { MetaTemplateSenderModal } from "../components/MetaTemplateSenderModal";
import { getBoards, getCards, createCard, updateCard } from "../services/kanbanService";

function safeArray(value: any): any[] {
  return Array.isArray(value) ? value.filter(item => item !== null && item !== undefined) : [];
}

function safeText(value: any, fallback: string = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    if (value.message) return String(value.message);
    if (value.text) return String(value.text);
    if (value.content) return String(value.content);
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

export default function OmnichannelPage() {
  const {
    whatsAppAccounts,
    teams,
    customers,
    users,
    currentUser,
    addCustomer,
    updateCustomer,
    internalNotes,
    addInternalNote,
    updateInternalNote,
    deleteInternalNote,
    fetchWhatsAppAccounts,
  } = useAppStore();

  const { conversationId } = useParams();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId || null);
  const [activeTab, setActiveTab] = useState<
    "novos" | "meus" | "concluidos" | "todos"
  >("novos");
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [newMessage, setNewMessage] = useState("");
  const [showIAPanel, setShowIAPanel] = useState(false);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [selectedImageFiles, setSelectedImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [imageCaption, setImageCaption] = useState("");
  const [isSendingImages, setIsSendingImages] = useState(false);
  const [showMultiImagePreview, setShowMultiImagePreview] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<
    "image" | "video" | "document" | null
  >(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recordedAudioDebug, setRecordedAudioDebug] = useState<any>(null);
  const [liveVolume, setLiveVolume] = useState(0);
  const [isSilentWarning, setIsSilentWarning] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isInternalMode, setIsInternalMode] = useState(false);
  const [transferData, setTransferData] = useState({
    type: "queue",
    teamId: "",
    userId: "",
    reason: "",
  });
  const [transferMembers, setTransferMembers] = useState<any[]>([]);
  const [loadingTransferMembers, setLoadingTransferMembers] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("all");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [showTagManagement, setShowTagManagement] = useState(false);
  const [showLeadDetails, setShowLeadDetails] = useState(false);
  const [leadDetails, setLeadDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [quickReplies, setQuickReplies] = useState<any[]>([]);
  const [quickReplyTriggerState, setQuickReplyTriggerState] = useState<{ index: number; filter: string } | null>(null);
  const [quickRepliesIndex, setQuickRepliesIndex] = useState(0);

  // META Templates state for manual chat initiation
  const [metaTemplatesForModal, setMetaTemplatesForModal] = useState<any[]>([]);
  const [selectedMetaTemplate, setSelectedMetaTemplate] = useState<any | null>(null);
  const [metaTemplateVariables, setMetaTemplateVariables] = useState<Record<string, string>>({});
  const [templateType, setTemplateType] = useState<"official" | "local" | "none">("none");
  const [selectedLocalTemplate, setSelectedLocalTemplate] = useState<any | null>(null);
  const [manualMessageText, setManualMessageText] = useState<string>("");

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState<string>("");
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);

  const [sessionTimerTick, setSessionTimerTick] = useState<number>(0);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setSessionTimerTick((t) => t + 1);
    }, 10000);
    return () => clearInterval(timerInterval);
  }, []);

  useEffect(() => {
    quickReplyService.list()
      .then(setQuickReplies)
      .catch(err => console.error("Error loading quick replies in omnichannel:", err));
  }, []);

  useEffect(() => {
    if (showNewChatModal) {
      const loadTemplatesForInitiation = async () => {
        try {
          const res = await authorizedFetch(`${getApiBaseUrl()}/api/meta/templates`);
          const data = await safeReadJson(res);
          if (data.success && data.templates) {
            // Filter only APPROVED templates
            const approved = data.templates.filter((t: any) => String(t.status).toUpperCase() === 'APPROVED' || String(t.status).toUpperCase() === 'APPROVED_BY_META');
            setMetaTemplatesForModal(approved);
          }
        } catch (err) {
          console.error("Erro ao carregar templates para o modal manual:", err);
        }
      };
      loadTemplatesForInitiation();
      setSelectedMetaTemplate(null);
      setMetaTemplateVariables({});
      setTemplateType("none");
      setSelectedLocalTemplate(null);
      setManualMessageText("");
    }
  }, [showNewChatModal]);
  const { tags, addTag, updateTag, deleteTag } = useAppStore();

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Helper to scroll messages body to bottom
  const scrollToBottom = (behavior: "auto" | "smooth" = "auto") => {
    // Standard delay ensures React has fully rendered new messages in the DOM including images/files.
    setTimeout(() => {
      if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior, block: "end" });
      }
    }, 150);
  };

  const lastConversationIdRef = useRef<string | null>(null);
  const lastMessagesCountRef = useRef<number>(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const loadFinishedForIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeConversationId) {
      const currentMessages = messages || [];
      const lastMsg = currentMessages[currentMessages.length - 1];
      const lastMsgId = lastMsg?.id || null;

      // Case 1: Switched to a different conversation
      if (lastConversationIdRef.current !== activeConversationId) {
        lastConversationIdRef.current = activeConversationId;
        lastMessagesCountRef.current = currentMessages.length;
        lastMessageIdRef.current = lastMsgId;
        
        // If loaded already, scroll instantly, otherwise wait for loadingMessages to turn false
        if (!loadingMessages) {
          scrollToBottom("auto");
          loadFinishedForIdRef.current = activeConversationId;
        } else {
          loadFinishedForIdRef.current = null;
        }
      } 
      // Case 2: Just finished loading a conversation (loadingMessages turned from true to false)
      else if (!loadingMessages && loadFinishedForIdRef.current !== activeConversationId) {
        loadFinishedForIdRef.current = activeConversationId;
        lastMessagesCountRef.current = currentMessages.length;
        lastMessageIdRef.current = lastMsgId;
        scrollToBottom("auto");
      }
      // Case 3: Brand new messages sent or received inside the same active conversation
      else if (
        !loadingMessages &&
        (currentMessages.length > lastMessagesCountRef.current ||
         (lastMsgId !== null && lastMsgId !== lastMessageIdRef.current))
      ) {
        lastMessagesCountRef.current = currentMessages.length;
        lastMessageIdRef.current = lastMsgId;
        scrollToBottom("smooth");
      } 
      // Case 4: Synchronize refs otherwise
      else {
        lastMessagesCountRef.current = currentMessages.length;
        lastMessageIdRef.current = lastMsgId;
      }
    } else {
      lastConversationIdRef.current = null;
      lastMessagesCountRef.current = 0;
      lastMessageIdRef.current = null;
      loadFinishedForIdRef.current = null;
    }
  }, [messages, activeConversationId, loadingMessages]);

  const handleLoadDetails = async (conversationId: string) => {
    setLoadingDetails(true);
    setShowLeadDetails(true);
    try {
      const baseUrl = getApiBaseUrl();
      const response = await authorizedFetch(
        `${baseUrl}/api/omnichannel/conversations/${conversationId}/details`,
      );
      const result = await safeReadJson(response);
      if (result.success) {
        setLeadDetails(result.details);
      } else {
        toast.error("Erro ao carregar detalhes: " + result.error);
      }
    } catch (err) {
      toast.error("Erro ao carregar detalhes");
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleLinkTag = async (conversationId: string, tagId: string) => {
    try {
      const tag = safeTags.find((t) => t && t.id === tagId);
      if (!tag) return;

      const response = await conversationTagService.link(
        conversationId,
        tagId,
        currentUser?.id,
        currentUser?.name,
      );

      if (response && response.success) {
        // Optimistic update
        const updatedConvs = safeConversations.map((c) => {
          if (c.id === conversationId) {
            const currentTags = c.tags || [];
            if (!currentTags.some((t) => t && t.id === tagId)) {
              return { ...c, tags: [...currentTags, tag] };
            }
          }
          return c;
        });
        setConversations(updatedConvs);
        useAppStore.setState({ conversations: updatedConvs });
        toast.success("Etiqueta vinculada");
      }
    } catch (err) {
      toast.error("Erro ao vincular etiqueta");
    }
  };

  const handleUnlinkTag = async (conversationId: string, tagId: string) => {
    try {
      const response = await conversationTagService.unlink(
        conversationId,
        tagId,
      );
      if (response && response.success) {
        // Optimistic update
        const updatedConvs = safeConversations.map((c) => {
          if (c.id === conversationId) {
            const currentTags = c.tags || [];
            return { ...c, tags: currentTags.filter((t) => t && t.id !== tagId) };
          }
          return c;
        });
        setConversations(updatedConvs);
        useAppStore.setState({ conversations: updatedConvs });

        // Also update leadDetails if open
        if (leadDetails?.id === conversationId) {
          setLeadDetails({
            ...leadDetails,
            tags: (leadDetails?.tags || []).filter((t: any) => t && t.id !== tagId),
          });
        }

        toast.success("Etiqueta removida");
      }
    } catch (err) {
      toast.error("Erro ao remover etiqueta");
    }
  };

  const isIgnoredConversation = (conversation: any) => {
    if (!conversation) return false;
    const status = String(conversation.status || "").toUpperCase();
    return ["IGNORED", "IGNORADO"].includes(status);
  };

  const isClosedConversation = (conversation: any) => {
    if (!conversation) return false;
    const status = String(conversation.status || "").toUpperCase();
    return [
      "CLOSED",
      "RESOLVED",
      "CONCLUIDO",
      "CONCLUÍDO",
      "FINALIZADO",
    ].includes(status);
  };

  const safeMessages = Array.isArray(messages) ? messages.filter(m => m && m.id) : [];

  const getUniqueById = <T extends { id: string }>(arr: T[]): T[] => {
    const seen = new Set<string>();
    return arr.filter(item => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const safeTags = getUniqueById(Array.isArray(tags) ? tags.filter(t => t && t.id) : []);
  const safeTeams = getUniqueById(Array.isArray(teams) ? teams.filter(t => t && t.id) : []);
  const safeUsers = getUniqueById(Array.isArray(users) ? users.filter(u => u && u.id) : []);
  const safeAccounts = getUniqueById(Array.isArray(whatsAppAccounts) ? whatsAppAccounts.filter(a => a && a.id) : []);
  const safeCustomers = getUniqueById(Array.isArray(customers) ? customers.filter(c => c && c.id) : []);

  const safeConversations = useMemo(() => {
    const rawList = Array.isArray(conversations) ? conversations.filter(c => c && c.id) : [];
    const uniqueMap = new Map<string, Conversation>();
    for (const c of rawList) {
      let p = c.customer_phone_normalized || "";
      if (!p) {
        const cust = c.customer || safeCustomers.find((cust) => cust.id === c.customer_id);
        p = cust?.phone_normalized || cust?.phone || "";
      }
      p = String(p).replace(/\D/g, "");
      
      const normResult = normalizeBrazilPhone(p);
      const key = normResult.valid ? normResult.phone : p;
      
      if (!key) {
        uniqueMap.set(c.id, c);
      } else if (!uniqueMap.has(key)) {
        uniqueMap.set(key, c);
      } else {
        const existing = uniqueMap.get(key)!;
        const existingTime = new Date(existing.last_message_at || existing.updated_at || existing.created_at || 0).getTime();
        const incomingTime = new Date(c.last_message_at || c.updated_at || c.created_at || 0).getTime();
        
        const mergedTags = [...(existing.tags || [])];
        for (const tg of (c.tags || [])) {
          if (tg && tg.id && !mergedTags.some(t => t && t.id === tg.id)) {
            mergedTags.push(tg);
          }
        }
        
        if (incomingTime > existingTime) {
          uniqueMap.set(key, {
            ...c,
            unread_count: (existing.unread_count || 0) + (c.unread_count || 0),
            tags: mergedTags
          });
        } else {
          uniqueMap.set(key, {
            ...existing,
            unread_count: (existing.unread_count || 0) + (c.unread_count || 0),
            tags: mergedTags
          });
        }
      }
    }
    return Array.from(uniqueMap.values());
  }, [conversations, safeCustomers]);

  // Align activeConversationId with the unique counterpart in safeConversations to prevent screen/selection jumps
  useEffect(() => {
    if (!activeConversationId || safeConversations.length === 0) return;
    const directMatch = safeConversations.some(c => c.id === activeConversationId);
    if (!directMatch) {
      // Find the raw one
      const rawFound = conversations.find(c => c && c.id === activeConversationId);
      if (rawFound) {
        let phone = rawFound.customer_phone_normalized || "";
        if (!phone) {
          const cust = rawFound.customer || safeCustomers.find((cust) => cust.id === rawFound.customer_id);
          phone = cust?.phone_normalized || cust?.phone || "";
        }
        phone = String(phone).replace(/\D/g, "");
        const normResult = normalizeBrazilPhone(phone);
        const key = normResult.valid ? normResult.phone : phone;

        if (key) {
          const uniqueFound = safeConversations.find(c => {
            let p = c.customer_phone_normalized || "";
            if (!p) {
              const cust = c.customer || safeCustomers.find((cust) => cust.id === c.customer_id);
              p = cust?.phone_normalized || cust?.phone || "";
            }
            p = String(p).replace(/\D/g, "");
            const nr = normalizeBrazilPhone(p);
            const k = nr.valid ? nr.phone : p;
            return k === key;
          });
          if (uniqueFound) {
            setActiveConversationId(uniqueFound.id);
          }
        }
      }
    }
  }, [activeConversationId, safeConversations, conversations, safeCustomers]);

  // Sync state if active conversation becomes ignored
  useEffect(() => {
    if (!activeConversationId) return;
    const active = safeConversations.find((c) => c.id === activeConversationId);
    if (active && isIgnoredConversation(active)) {
      setActiveConversationId(null);
      setMessages([]);
    }
  }, [safeConversations, activeConversationId]);

  const visibleConversations = safeConversations.filter(
    (c) => !isIgnoredConversation(c),
  );

  async function loadConversations(silent = false) {
    if (!silent) setLoadingConversations(true);
    try {
      const baseUrl = getApiBaseUrl();
      const teamParam =
        selectedTeamId !== "all" ? `?team_id=${selectedTeamId}` : "";
      const response = await authorizedFetch(
        `${baseUrl}/api/omnichannel/conversations${teamParam}`,
      );
      const data = await safeReadJson(response);

      if (data.success) {
        const ordered = [...(data.conversations || [])].sort((a, b) => {
          return (
            new Date(
              b.last_message_at || b.updated_at || b.created_at || 0,
            ).getTime() -
            new Date(
              a.last_message_at || a.updated_at || a.created_at || 0,
            ).getTime()
          );
        });
        setConversations(ordered);

        // Auto-select first conversation if requested (foreground load only, and if no conversation is currently active and no route param is present)
        if (!silent && !activeConversationIdRef.current && !conversationId && ordered.length > 0) {
          const firstNew = ordered.find(
            (c) => !c.assigned_user_id && !isClosedConversation(c),
          );
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
      const response = await authorizedFetch(
        `${baseUrl}/api/omnichannel/conversations/${conversationId}/messages`,
      );
      const data = await safeReadJson(response);

      if (data.success) {
        setMessages(data.messages || []);
      } else if (!silent) {
        toast.error(data.error || "Erro ao carregar histórico.");
      }
    } catch (error) {
      console.error("[LOAD MESSAGES ERROR]", error);
      if (!silent) toast.error("Erro ao conectar com o servidor.");
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }

  const handleSelectConversation = (conversation: Conversation) => {
    if (activeConversationId === conversation.id) return;

    // Clear previous state to avoid "leaks"
    setActiveConversationId(conversation.id);
    setMessages([]);
    setAiSummary(null);
    setShowIAPanel(false);

    // Mark as read locally and via API only if the conversation has been assumed by the current user
    if (conversation.assigned_user_id && conversation.assigned_user_id === currentUser?.id) {
      const baseUrl = getApiBaseUrl();
      authorizedFetch(
        `${baseUrl}/api/omnichannel/conversations/${conversation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unread_count: 0 }),
        },
      ).catch((err) => console.warn("Erro ao marcar como lida:", err));
    }
  };

  // Google Sheets configuration & states
  const [gUser, setGUser] = useState<FirebaseUser | null>(null);
  const [gToken, setGToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState(getStoredSpreadsheetId());
  const [isEditingSheetId, setIsEditingSheetId] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [authDomainError, setAuthDomainError] = useState(false);
  
  // Custom field definitions & conversation-specific values
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);
  const [activeCustomValues, setActiveCustomValues] = useState<CustomFieldValues>({});
  const [showAddFieldForm, setShowAddFieldForm] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "boolean" | "select">("text");

  // Kanban CRM linkage states
  const [allKanbanBoards, setAllKanbanBoards] = useState<any[]>([]);
  const [allKanbanCards, setAllKanbanCards] = useState<any[]>([]);
  const [linkedKanbanCard, setLinkedKanbanCard] = useState<any | null>(null);
  const [showLinkKanbanForm, setShowLinkKanbanForm] = useState(false);
  const [selectedKanbanBoardId, setSelectedKanbanBoardId] = useState("");
  const [selectedKanbanStageId, setSelectedKanbanStageId] = useState("");
  const [linkKanbanCardTitle, setLinkKanbanCardTitle] = useState("");

  // Load custom field definitions once on mount
  useEffect(() => {
    setCustomFieldDefs(getCustomFieldDefs());
  }, []);

  // Initialize Google OAuth state
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGUser(user);
        setGToken(token);
      },
      () => {
        setGUser(null);
        setGToken(null);
      }
    );

    const handleExpired = () => {
      setGUser(null);
      setGToken(null);
    };

    window.addEventListener("google-auth-expired", handleExpired);

    return () => {
      unsubscribe();
      window.removeEventListener("google-auth-expired", handleExpired);
    };
  }, []);

  // Handle active custom values whenever active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      setActiveCustomValues(getCustomFieldValues(activeConversationId));
    } else {
      setActiveCustomValues({});
    }
  }, [activeConversationId]);

  // Google Sheets Login & Logout handlers
  const handleGoogleLogin = async () => {
    try {
      setAuthDomainError(false);
      const result = await googleSignIn();
      if (result) {
        setGUser(result.user);
        setGToken(result.accessToken);
        toast.success(`Google Sheets conectado com sucesso!`);
      }
    } catch (err: any) {
      console.error("Erro completo ao conectar:", err);
      const errMsg = err.message || "";
      const errCode = err.code || "";
      const isDomainError = 
        errMsg.includes("auth/unauthorized-domain") || 
        errCode.includes("unauthorized-domain") ||
        errMsg.includes("unauthorized domain") ||
        errMsg.includes("unauthorized-client");
        
      if (isDomainError) {
        setAuthDomainError(true);
      }
      toast.error(`Falha ao conectar Google: ${errMsg || "Erro inesperado"}`);
    }
  };

  const handleGoogleLogout = async () => {
    await googleSignOut();
    setGUser(null);
    setGToken(null);
    toast.info("Conta Google desconectada.");
  };

  const handleSaveSheetId = () => {
    setStoredSpreadsheetId(spreadsheetId);
    setIsEditingSheetId(false);
    toast.success("Spreadsheet ID atualizado com sucesso!");
  };

  const handleCreateCustomField = async () => {
    if (!newFieldName.trim()) {
      toast.error("Por favor, informe o nome do campo.");
      return;
    }
    const slug = newFieldName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_+|_+$)/g, "");

    const exists = customFieldDefs.some((d) => d.id === slug);
    if (exists) {
      toast.error("Um campo com esse nome já existe!");
      return;
    }

    const newField: CustomFieldDefinition = {
      id: slug,
      name: newFieldName.trim(),
      type: newFieldType,
    };

    const updated = [...customFieldDefs, newField];
    saveCustomFieldDefs(updated);
    setCustomFieldDefs(updated);
    setNewFieldName("");
    setShowAddFieldForm(false);

    if (gToken) {
      toast.loading("Sincronizando colunas com a Planilha Google...", { id: "col-sync" });
      try {
        const currentRows = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:Z5000`,
          { headers: { Authorization: `Bearer ${gToken}` } }
        ).then(r => r.json()).catch(() => null);

        let headersRange = currentRows?.values?.[0] || [];
        if (!headersRange.includes(newFieldName.trim())) {
          const updatedHeaders = [...headersRange, newFieldName.trim()];
          const colLetter = String.fromCharCode(65 + updatedHeaders.length - 1);
          await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:${colLetter}1?valueInputOption=USER_ENTERED`,
            {
              method: "PUT",
              headers: {
                Authorization: `Bearer ${gToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                range: `A1:${colLetter}1`,
                majorDimension: "ROWS",
                values: [updatedHeaders],
              }),
            }
          );
        }
        toast.success(`Campo "${newFieldName}" criado e integrado na Planilha!`, { id: "col-sync" });
      } catch (e) {
        toast.warning(`Campo "${newFieldName}" criado no painel local (erro ao ajustar planilha).`, { id: "col-sync" });
      }
    } else {
      toast.success(`Campo "${newFieldName}" criado localmente! Conecte-se ao Sheets para sincronizar.`);
    }
  };

  const handleUpdateCustomFieldValue = async (fieldId: string, value: any) => {
    if (!activeConversation) return;
    const newValues = { ...activeCustomValues, [fieldId]: value };
    setActiveCustomValues(newValues);
    saveCustomFieldValues(activeConversation.id, newValues);

    if (gToken) {
      try {
        const res = await syncConversationToSheet(gToken, spreadsheetId, activeConversation, customFieldDefs);
        if (res) {
          console.log(`[Google Sheets] Sincronização automática para o campo "${fieldId}" concluída.`);
        }
      } catch (err: any) {
        console.warn("[Google Sheets] Sincronização automática falhou:", err);
      }
    }
  };

  const handleSyncActiveConversation = async () => {
    if (!gToken) {
      toast.error("Por favor, conecte-se com sua conta Google primeiro.");
      return;
    }
    if (!activeConversation) {
      toast.error("Nenhum atendimento ativo selecionado.");
      return;
    }
    toast.loading("Sincronizando atendimento...", { id: "sync-single" });
    try {
      const success = await syncConversationToSheet(gToken, spreadsheetId, activeConversation, customFieldDefs);
      if (success) {
        toast.success("Atendimento sincronizado com sucesso na planilha!", { id: "sync-single" });
      } else {
        toast.error("Erro ao sincronizar na planilha. Verifique se a planilha tem a estrutura correta.", { id: "sync-single" });
      }
    } catch (err: any) {
      toast.error(`Falha na sincronização: ${err.message}`, { id: "sync-single" });
    }
  };

  const handleSyncAllConversations = async () => {
    if (!gToken) {
      toast.error("Por favor, conecte-se com sua conta Google primeiro.");
      return;
    }
    setIsSyncingAll(true);
    toast.loading("Sincronizando lote completo com a planilha...", { id: "sync-batch" });
    try {
      const res = await syncAllConversationsToSheet(gToken, spreadsheetId, conversations, customFieldDefs);
      if (res.success) {
        toast.success(`Tudo pronto! ${res.count} atendimentos sincronizados com sucesso na planilha!`, { id: "sync-batch" });
      } else {
        toast.error("Falha ao subir atendimentos em lote. Verifique se a planilha é pública ou possui autorização.", { id: "sync-batch" });
      }
    } catch (e: any) {
      toast.error(`Erro na sincronização em lote: ${e.message}`, { id: "sync-batch" });
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Google Sheets real-time synchronization tracker
  const prevConversationsRef = useRef<Record<string, { status: string; lastMessageAt?: string | Date; lastMessage?: string }>>({});
  
  useEffect(() => {
    const autoSync = async () => {
      const token = await getAccessToken();
      const sheetId = getStoredSpreadsheetId();
      if (!token || !sheetId) return;

      const currentDefs = getCustomFieldDefs();

      for (const conv of conversations) {
        const prev = prevConversationsRef.current[conv.id];
        const currentCleanStatus = getCleanStatusLabel(conv);
        const hasChanged = !prev || 
          prev.status !== currentCleanStatus || 
          prev.lastMessageAt !== conv.last_message_at ||
          prev.lastMessage !== conv.last_message;

        if (hasChanged) {
          prevConversationsRef.current[conv.id] = {
            status: currentCleanStatus,
            lastMessageAt: conv.last_message_at,
            lastMessage: conv.last_message
          };

          syncConversationToSheet(token, sheetId, conv, currentDefs).then((success) => {
            if (success) {
              console.log(`[Google Sheets] Tempo Real - Sincronizado: "${conv.customer?.name || "Cliente"}"`);
            }
          }).catch((err) => {
            console.warn("[Google Sheets] Tempo Real autoSync erro:", err);
          });
        }
      }
    };

    if (conversations.length > 0) {
      autoSync();
    }
  }, [conversations]);

  // Initial load
  useEffect(() => {
    loadConversations();
    fetchWhatsAppAccounts();
  }, []);

  // Reload when team filter changes
  useEffect(() => {
    loadConversations();
  }, [selectedTeamId]);

  // Sync messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    } else {
      setMessages([]);
    }
  }, [activeConversationId]);

  // Auto-switch tab to make the active conversation visible in the sidebar list when it changes
  const lastParsedActiveConvId = useRef<string | null>(null);
  useEffect(() => {
    if (!activeConversationId || conversations.length === 0) return;
    
    if (lastParsedActiveConvId.current === activeConversationId) return;
    lastParsedActiveConvId.current = activeConversationId;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (!activeConv) return;

    const isClosed = [
      "CLOSED",
      "RESOLVED",
      "CONCLUIDO",
      "CONCLUÍDO",
      "FINALIZADO",
    ].includes(String(activeConv.status || "").toUpperCase());
    
    const assignedUserId = activeConv.assigned_user_id;

    if (isClosed) {
      setActiveTab("concluidos");
    } else if (assignedUserId && assignedUserId === currentUser?.id) {
      setActiveTab("meus");
    } else if (assignedUserId) {
      setActiveTab("todos");
    } else {
      setActiveTab("novos");
    }
  }, [activeConversationId, conversations, currentUser]);

  // Synchronize state with route param
  useEffect(() => {
    if (conversationId && conversationId !== activeConversationId) {
      setActiveConversationId(conversationId);
    } else if (!conversationId && activeConversationId) {
      setActiveConversationId(null);
    }
  }, [conversationId]);

  // Synchronize route param with state when user selects a conversation
  useEffect(() => {
    if (activeConversationId) {
      if (conversationId !== activeConversationId) {
        navigate(`/app/atendimentos/${activeConversationId}`);
      }
    } else {
      if (conversationId) {
        navigate("/app/atendimentos");
      }
    }
  }, [activeConversationId, conversationId, navigate]);

  // Ref-based stable handlers for SSE connections
  const activeConversationIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const latestLoadConversations = useRef(loadConversations);
  const latestLoadMessages = useRef(loadMessages);
  const latestFetchWhatsAppAccounts = useRef(fetchWhatsAppAccounts);

  useEffect(() => {
    latestLoadConversations.current = loadConversations;
  }, [loadConversations]);

  useEffect(() => {
    latestLoadMessages.current = loadMessages;
  }, [loadMessages]);

  useEffect(() => {
    latestFetchWhatsAppAccounts.current = fetchWhatsAppAccounts;
  }, [fetchWhatsAppAccounts]);

  // Real-time updates (SSE with active Auto-Reconnect + fast Polling fallback)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;
    let isDestroyed = false;

    function connectSSE() {
      if (isDestroyed) return;

      const baseUrl = getApiBaseUrl();
      if (eventSource) {
        eventSource.close();
      }

      console.log("[SSE] Conectando ao canal de eventos...");
      eventSource = new EventSource(`${baseUrl}/api/events`);

      eventSource.onopen = () => {
        console.log("[SSE] Conexão em tempo real estabelecida com sucesso.");
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (
            data.event === "message.received" ||
            data.event === "conversation.updated" ||
            data.event === "campaign.updated"
          ) {
            latestLoadConversations.current(true);
            latestFetchWhatsAppAccounts.current();
            const activeId = activeConversationIdRef.current;
            if (activeId) {
              latestLoadMessages.current(activeId, true);
            }
          }
        } catch (e) {
          console.error("[SSE] Erro ao parsear dados:", e);
        }
      };

      eventSource.onerror = (err) => {
        console.warn("[SSE] Erro na conexão. Tentando reconectar em 5 segundos...", err);
        if (eventSource) {
          eventSource.close();
        }
        
        // Carrega as atualizações imediatamente para garantir sincronia caso algo tenha atualizado durante a queda
        latestLoadConversations.current(true);
        latestFetchWhatsAppAccounts.current();
        const activeId = activeConversationIdRef.current;
        if (activeId) {
          latestLoadMessages.current(activeId, true);
        }

        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          connectSSE();
        }, 5000);
      };
    }

    connectSSE();

    // Polling rápido de 4s como fallback resiliente e em tempo real para múltiplos dispositivos
    const interval = setInterval(() => {
      latestLoadConversations.current(true);
      latestFetchWhatsAppAccounts.current();
      const activeId = activeConversationIdRef.current;
      if (activeId) {
        latestLoadMessages.current(activeId, true);
      }
    }, 4000);

    return () => {
      isDestroyed = true;
      if (eventSource) {
        eventSource.close();
      }
      clearTimeout(reconnectTimeout);
      clearInterval(interval);
    };
  }, []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeTimerRef = useRef<any>(null);
  const silentTicksRef = useRef<number>(0);
  const [recordedAudioFile, setRecordedAudioFile] = useState<File | null>(null);
  const timerRef = useRef<number | null>(null);

  const activeConversation = safeConversations.find(
    (c) => c.id === activeConversationId,
  );
  const activeCustomer =
    activeConversation?.customer ||
    safeCustomers.find((c) => c.id === activeConversation?.customer_id);
  const activeChatMessages = safeMessages;
  const currentAccount = safeAccounts.find(
    (a) => a.id === activeConversation?.whatsapp_account_id,
  ) || safeAccounts.find((a) => a.is_active) || safeAccounts[0];

  const isMetaConversation = activeConversation && currentAccount?.provider === "META_CLOUD";

  const sessionStatus = useMemo(() => {
    if (!activeConversation) {
      return {
        status: "no_conversation" as const,
        text: "",
        colorClass: "",
        description: "",
        timeLeftStr: ""
      };
    }

    const lastCustomerMsg = [...safeMessages]
      .reverse()
      .find((m) => m.sender_type === "customer");
    
    if (!lastCustomerMsg) {
      return {
        status: "no_message" as const,
        text: "Sem Janela Ativa",
        colorClass: "bg-slate-100/80 border-slate-200 text-slate-500",
        description: "Janela Meta de 24h só se inicia quando uma mensagem for recebida do cliente.",
        timeLeftStr: ""
      };
    }

    const lastMsgTime = new Date(lastCustomerMsg.created_at).getTime();
    const diffMs = Date.now() - lastMsgTime;
    const period24h = 24 * 60 * 60 * 1000;
    
    if (diffMs >= period24h) {
      return {
        status: "expired" as const,
        text: "Sessão Expirada (24h+)",
        colorClass: "bg-rose-50 border-rose-200 text-rose-700",
        description: "Mais de 24 horas desde a última mensagem do cliente. Envie um Modelo de Mensagem.",
        timeLeftStr: "Expirado"
      };
    } else {
      const remainingMs = period24h - diffMs;
      const hours = Math.floor(remainingMs / (3600 * 1000));
      const mins = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
      const secs = Math.floor((remainingMs % (60 * 1000)) / 1000);
      const timeLeftStr = `${hours}h ${mins}m restantes`;

      return {
        status: "active" as const,
        text: `Janela Ativa (${timeLeftStr})`,
        colorClass: "bg-emerald-50 border-emerald-200 text-emerald-700",
        description: "Uma janela de 24 horas está ativa para mensagens livres.",
        timeLeftStr
      };
    }
  }, [activeConversation, safeMessages, sessionTimerTick]);

  // Load and refresh Kanban linkage
  const refreshKanbanLinkage = () => {
    const listBoards = getBoards();
    const listCards = getCards();
    setAllKanbanBoards(listBoards);
    setAllKanbanCards(listCards);

    if (activeConversationId) {
      const match = listCards.find(c => c.conversation_id === activeConversationId);
      setLinkedKanbanCard(match || null);
      if (match) {
        setSelectedKanbanBoardId(match.board_id);
        setSelectedKanbanStageId(match.stage_id);
      } else {
        const firstBoard = listBoards[0];
        setSelectedKanbanBoardId(firstBoard?.id || "");
        setSelectedKanbanStageId(firstBoard?.stages[0]?.id || "");
        setLinkKanbanCardTitle(activeCustomer?.name || "");
      }
    } else {
      setLinkedKanbanCard(null);
    }
  };

  useEffect(() => {
    refreshKanbanLinkage();
  }, [activeConversationId, activeCustomer]);

  useEffect(() => {
    const handleUpdate = () => refreshKanbanLinkage();
    window.addEventListener('viva_crm_kanban_updated', handleUpdate);
    return () => window.removeEventListener('viva_crm_kanban_updated', handleUpdate);
  }, [activeConversationId, activeCustomer]);

  // Dynamically mark active conversation as read when new messages or updates arrive, if it's assigned to the current agent
  useEffect(() => {
    if (
      activeConversation &&
      (activeConversation.unread_count || 0) > 0 &&
      activeConversation.assigned_user_id === currentUser?.id
    ) {
      // Optimistically update conversations locally
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id ? { ...c, unread_count: 0 } : c,
        ),
      );

      const baseUrl = getApiBaseUrl();
      authorizedFetch(
        `${baseUrl}/api/omnichannel/conversations/${activeConversation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unread_count: 0 }),
        },
      ).catch((err) => console.warn("Erro ao marcar como lida:", err));
    }
  }, [activeConversation, currentUser]);

  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editCustomerForm, setEditCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
    temperature: "WARM" as "COLD" | "WARM" | "HOT",
  });

  useEffect(() => {
    if (activeCustomer) {
      setEditCustomerForm({
        name: activeCustomer.name || "",
        phone: activeCustomer.phone || "",
        email: activeCustomer.email || "",
        city: activeCustomer.city || "",
        temperature: activeCustomer.temperature || "WARM",
      });
      setIsEditingCustomer(false);
    } else {
      setIsEditingCustomer(false);
    }
  }, [activeCustomer]);

  const handleSaveCustomerEdit = async () => {
    if (!activeCustomer) return;
    if (!editCustomerForm.name.trim()) {
      toast.error("Nome do contato é obrigatório");
      return;
    }
    if (!editCustomerForm.phone.trim()) {
      toast.error("Telefone do contato é obrigatório");
      return;
    }

    try {
      await updateCustomer({
        ...activeCustomer,
        name: editCustomerForm.name.trim(),
        phone: editCustomerForm.phone.trim(),
        email: editCustomerForm.email.trim(),
        city: editCustomerForm.city.trim(),
        temperature: editCustomerForm.temperature,
      });
      setIsEditingCustomer(false);
      toast.success("Contato atualizado com sucesso!");
    } catch (error: any) {
      toast.error(`Falha ao atualizar contato: ${error.message || error}`);
    }
  };

  function getMessageImageSrc(message: Message) {
    if (!message) return null;
    const raw_payload = (message as any).raw_payload;
    return (
      (message as any).display_media_url ||
      (message as any).media_storage_url ||
      message.media_url ||
      raw_payload?.media_storage_url ||
      raw_payload?.publicUrl ||
      raw_payload?.imageUrl ||
      raw_payload?.zapiResponse?.imageUrl ||
      null
    );
  }

  function renderMessageContent(message: Message) {
    if (!message) return null;

    if (message.status === "deleted") {
      return (
        <p className="text-sm italic text-slate-400 flex items-center gap-1.5 select-none">
          <Trash2 className="w-3.5 h-3.5 text-slate-300 shrink-0" />
          Esta mensagem foi apagada
        </p>
      );
    }

    const type =
      (message as any).normalized_message_type ||
      (message as any).message_type ||
      (message as any).type ||
      "text";
    const content =
      (message as any).display_content || renderSafeText(message.content, "");
    const mediaUrl =
      (message as any).display_media_url ||
      (message as any).media_storage_url ||
      message.media_url;

    switch (type.toLowerCase()) {
      case "receivedcallback":
      case "text":
      case "chat":
        return (
          <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
        );

      case "image": {
        const imageSrc = getMessageImageSrc(message);
        const safeCaption = renderSafeText(message.caption);
        return (
          <div className="space-y-2">
            {imageSrc ? (
              <img
                referrerPolicy="no-referrer"
                src={imageSrc}
                alt={safeCaption || content || "Imagem"}
                className="max-w-xs rounded-xl border object-cover cursor-pointer hover:opacity-90 transition-opacity shadow-sm border-slate-100"
                onClick={() => window.open(imageSrc, "_blank")}
                onError={(e) => {
                  console.error("Erro ao carregar imagem", imageSrc);
                }}
              />
            ) : (
              <div className="text-[11px] text-amber-600 bg-amber-50/50 px-2 py-1 rounded border border-amber-100">
                Imagem enviada anteriormente sem arquivo salvo.
              </div>
            )}
            {(safeCaption ||
              (content &&
                content !== "Imagem enviada" &&
                content !== "Imagem recebida")) && (
              <p className="text-sm">{safeCaption || content}</p>
            )}
          </div>
        );
      }

      case "audio":
      case "ptt": {
        const audioSrc =
          (message as any).media_storage_url ||
          (message as any).media_url ||
          (message as any).display_media_url;

        if (audioSrc) {
          return <audio controls src={audioSrc} className="w-full h-10 min-w-[200px]" />;
        }

        return <p className="text-xs text-slate-400 italic">Áudio registrado, mas sem arquivo disponível.</p>;
      }

      case "video": {
        const safeCaption = renderSafeText(message.caption);
        return (
          <div className="space-y-2">
            {mediaUrl ? (
              <video
                controls
                src={mediaUrl}
                className="max-w-full rounded-lg shadow-sm border border-slate-100"
              />
            ) : (
              <div className="text-[10px] text-red-500 italic">
                Vídeo indisponível
              </div>
            )}
            {(safeCaption ||
              (content &&
                content !== "Vídeo enviado" &&
                content !== "Vídeo recebido")) && (
              <p className="text-sm">{safeCaption || content}</p>
            )}
          </div>
        );
      }

      case "document":
      case "file":
        return (
          <div className="space-y-2">
            {mediaUrl ? (
              <a
                href={mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 p-3 bg-black/5 rounded-xl hover:bg-black/10 transition-colors border border-black/5"
              >
                <FileIcon className="w-6 h-6 shrink-0 text-blue-600" />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">
                    {(message as any).media_file_name ||
                      (message.metadata as any)?.fileName ||
                      "Documento"}
                  </p>
                  <p className="text-[10px] opacity-60">
                    Clique para abrir/baixar
                  </p>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-black/5 rounded-lg opacity-50">
                <FileIcon className="w-5 h-5 font-bold" />
                <p className="text-xs">Documento indisponível</p>
              </div>
            )}
            {content &&
              content !== "Documento enviado" &&
              content !== "Documento recebido" && (
                <p className="text-sm">{content}</p>
              )}
          </div>
        );

      default:
        return (
          <p className="text-sm whitespace-pre-wrap break-words">
            {content || "Mensagem sem conteúdo exibível"}
          </p>
        );
    }
  }

  // Filtered Conversations
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => {
        setRecordingTime((t) => t + 1);
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
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
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
      setNewMessage((prev) => prev + emoji);
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

  const handleSelectQuickReply = (qr: any) => {
    if (!messageInputRef.current) return;
    const txt = newMessage;
    const cursor = messageInputRef.current.selectionStart || 0;
    
    // Find backslash trigger term
    const textBeforeCursor = txt.substring(0, cursor);
    const lastSlashIndex = textBeforeCursor.lastIndexOf("\\");
    if (lastSlashIndex === -1) return;
    
    const prefix = txt.substring(0, lastSlashIndex);
    const suffix = txt.substring(cursor);
    const insertedText = qr.content;
    const newText = prefix + insertedText + suffix;

    setNewMessage(newText);
    
    const newCursorPos = lastSlashIndex + insertedText.length;
    setTimeout(() => {
      if (messageInputRef.current) {
        messageInputRef.current.focus();
        messageInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);

    setQuickReplyTriggerState(null);
    setQuickRepliesIndex(0);
  };

  const handleNewMessageChange = (val: string) => {
    setNewMessage(val);
    
    // Detect trigger for quick reply modal
    setTimeout(() => {
      if (!messageInputRef.current) return;
      const cursor = messageInputRef.current.selectionStart || 0;
      const textBeforeCursor = val.substring(0, cursor);
      const lastSlashIndex = textBeforeCursor.lastIndexOf("\\");
      
      if (lastSlashIndex !== -1) {
        const trailingPart = textBeforeCursor.substring(lastSlashIndex + 1);
        // Ensure no spaces or further backslashes exist after it
        if (!trailingPart.includes(" ") && !trailingPart.includes("\\")) {
          setQuickReplyTriggerState({
            index: lastSlashIndex,
            filter: trailingPart.toLowerCase()
          });
          setQuickRepliesIndex(0);
          return;
        }
      }
      setQuickReplyTriggerState(null);
    }, 0);
  };

  const matchingQuickReplies = useMemo(() => {
    if (!quickReplyTriggerState) return [];
    const filter = quickReplyTriggerState.filter;
    return quickReplies.filter(qr => 
      (qr.shortcut || "").toLowerCase().includes(filter) ||
      (qr.content || "").toLowerCase().includes(filter)
    );
  }, [quickReplies, quickReplyTriggerState]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getSupportedAudioMimeType = () => {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];

    if (!window.MediaRecorder) return "";

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return "";
  };

  const startLiveVolumeMeter = (stream: MediaStream) => {
    try {
      stopLiveVolumeMeter();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 512;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.fftSize);
      silentTicksRef.current = 0;
      setIsSilentWarning(false);

      volumeTimerRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const value = (dataArray[i] - 128) / 128;
          sum += value * value;
        }

        const rms = Math.sqrt(sum / dataArray.length);
        setLiveVolume(rms);

        if (rms < 0.005) {
          silentTicksRef.current += 1;
          if (silentTicksRef.current >= 20) {
            setIsSilentWarning(true);
          }
        } else {
          silentTicksRef.current = 0;
          setIsSilentWarning(false);
        }
      }, 100);
    } catch (error) {
      console.warn("[LIVE VOLUME METER ERROR]", error);
    }
  };

  const stopLiveVolumeMeter = () => {
    if (volumeTimerRef.current) {
      clearInterval(volumeTimerRef.current);
      volumeTimerRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    silentTicksRef.current = 0;
    setIsSilentWarning(false);
    setLiveVolume(0);
  };

  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        toast.error("Seu navegador não permite acessar o microfone.");
        return;
      }

      if (!window.MediaRecorder) {
        toast.error("Seu navegador não suporta gravação de áudio.");
        return;
      }

      cancelRecordedAudio();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) {
        toast.error("Nenhum microfone foi encontrado.");
        return;
      }

      console.log("[AUDIO TRACK SETTINGS]", audioTracks[0].getSettings());

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      startLiveVolumeMeter(stream);

      const mimeType = getSupportedAudioMimeType();

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        console.log("[AUDIO CHUNK]", {
          size: event.data?.size,
          type: event.data?.type
        });
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error("[MEDIA RECORDER ERROR]", event);
        toast.error("Erro durante a gravação do áudio.");
      };

      recorder.onstop = async () => {
        try {
          stopLiveVolumeMeter();

          const finalMimeType = recorder.mimeType || mimeType || "audio/webm";

          const blob = new Blob(audioChunksRef.current, {
            type: finalMimeType,
          });

          const debug = {
            blobSize: blob.size,
            blobType: blob.type,
            chunks: audioChunksRef.current.length,
            recorderMimeType: recorder.mimeType,
            selectedMimeType: mimeType,
            recordingSeconds: recordingTime
          };

          console.log("[AUDIO FINAL BLOB]", debug);

          if (!blob || blob.size < 2000) {
            toast.error(
              "O áudio gravado ficou vazio ou curto demais. Fale perto do microfone e grave novamente.",
            );
            cancelRecordedAudio();
            return;
          }

          const extension = finalMimeType.includes("ogg")
            ? "ogg"
            : finalMimeType.includes("mp4")
              ? "m4a"
              : "webm";

          const file = new File([blob], `audio-${Date.now()}.${extension}`, {
            type: finalMimeType,
          });

          const previewUrl = URL.createObjectURL(blob);

          setAudioBlob(blob);
          setRecordedAudioFile(file);
          setAudioUrl(previewUrl);
          setRecordedAudioDebug(debug);
        } catch (error) {
          console.error("[AUDIO ONSTOP ERROR]", error);
          toast.error("Erro ao preparar a prévia do áudio.");
        } finally {
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
        }
      };

      recorder.start(250);

      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error: any) {
      console.error("[START AUDIO RECORDING ERROR]", error);

      if (error?.name === "NotAllowedError") {
        toast.error(
          "Permissão de microfone negada. Libere o microfone no navegador.",
        );
      } else if (error?.name === "NotFoundError") {
        toast.error("Nenhum microfone foi encontrado.");
      } else {
        toast.error("Não foi possível iniciar a gravação de áudio.");
      }
    }
  };

  const stopRecording = () => {
    try {
      const recorder = mediaRecorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.requestData();
        } catch {}

        setTimeout(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, 250);
      }

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      setIsRecording(false);
    } catch (error) {
      console.error("[STOP AUDIO RECORDING ERROR]", error);
      toast.error("Erro ao finalizar gravação.");
    }
  };

  const cancelRecordedAudio = () => {
    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      stopLiveVolumeMeter();
    } catch (error) {
      console.warn("[CANCEL AUDIO WARNING]", error);
    }

    setIsRecording(false);
    setRecordingTime(0);
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordedAudioFile(null);
    setRecordedAudioDebug(null);
    setLiveVolume(0);
    audioChunksRef.current = [];
  };

  const handleSendAudio = async () => {
    if (!activeConversationId) {
      toast.error("Nenhuma conversa selecionada.");
      return;
    }

    if (!recordedAudioFile || recordedAudioFile.size < 2000) {
      toast.error("Áudio inválido ou sem som detectável. Grave novamente.");
      return;
    }

    setIsSendingMedia(true);

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const formData = new FormData();
        formData.append("file", recordedAudioFile);
        formData.append(
          "originalMimeType",
          recordedAudioFile.type || "audio/webm",
        );
        formData.append(
          "frontendDebug",
          JSON.stringify(recordedAudioDebug || {}),
        );

        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/send-audio`,
          {
            method: "POST",
            body: formData,
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "Erro ao enviar áudio.");
        }

        await loadMessages(activeConversationId, true);
        await loadConversations(true);

        setShowAudioRecorder(false);
        cancelRecordedAudio();
        toast.success("Áudio enviado com sucesso!");
      },
      { label: "Erro ao enviar áudio" },
    );
    setIsSendingMedia(false);
  };
  function getFilteredConversations() {
    return visibleConversations.filter((conversation) => {
      const isClosed = isClosedConversation(conversation);
      const assignedUserId = conversation.assigned_user_id;

      // Filter by Team
      if (selectedTeamId !== "all") {
        if (conversation.team_id !== selectedTeamId) return false;
      }

      // Filter by Tags (Multiple)
      if (selectedTagIds.length > 0) {
        const convTags = conversation.tags || [];
        const hasMatch = selectedTagIds.every((id) =>
          convTags.some((t: any) => t && t.id === id),
        );
        if (!hasMatch) return false;
      }

      // Filter by Accounts
      if (selectedAccountIds.length > 0) {
        const conversationAccountId = conversation.whatsapp_account_id || conversation.channelId || "";
        if (
          !selectedAccountIds.includes(conversationAccountId)
        )
          return false;
      }

      // Filter by Users
      if (selectedUserIds.length > 0) {
        if (!selectedUserIds.includes(conversation.assigned_user_id || ""))
          return false;
      }

      // Filter by Search
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const cust =
          conversation.customer ||
          safeCustomers.find((c) => c.id === conversation.customer_id);
        const name = (
          cust?.name ||
          (conversation as any).customer_name ||
          ""
        ).toLowerCase();
        const phone =
          conversation.customer_phone_normalized || cust?.phone || "";
        const msg = String(conversation.last_message || "").toLowerCase();

        if (
          !name.includes(searchLower) &&
          !phone.includes(searchTerm) &&
          !msg.includes(searchLower)
        ) {
          return false;
        }
      }

      if (activeTab === "novos") {
        return !assignedUserId && !isClosed;
      }

      if (activeTab === "meus") {
        return (
          assignedUserId && assignedUserId === currentUser?.id && !isClosed
        );
      }

      if (activeTab === "concluidos") {
        return isClosed;
      }

      return true;
    });
  }

  const filteredConversations = getFilteredConversations().sort((a, b) => {
    const timeA = new Date(
      a.last_message_at || a.updated_at || a.created_at || 0,
    ).getTime();
    const timeB = new Date(
      b.last_message_at || b.updated_at || b.created_at || 0,
    ).getTime();
    return timeB - timeA;
  });

  const [newChatData, setNewChatData] = useState({
    customerId: "",
    newName: "",
    newPhone: "",
    accountId: "",
    teamId: "",
  });

  const loadTransferMembers = async (teamId: string) => {
    if (!teamId) {
      setTransferMembers([]);
      return;
    }
    setLoadingTransferMembers(true);
    try {
      const baseUrl = getApiBaseUrl();
      const res = await authorizedFetch(
        `${baseUrl}/api/teams/${teamId}/members`,
      );
      const data = await safeReadJson(res);
      if (data && data.success) {
        // Apenas membros ativos
        setTransferMembers(
          Array.isArray(data.members)
            ? data.members.filter((m: any) => m.is_active)
            : [],
        );
      }
    } catch (err) {
      console.error("Erro ao carregar membros para transferência", err);
    } finally {
      setLoadingTransferMembers(false);
    }
  };

  const handleAssumeConversation = async (conversationId: string) => {
    await safeAction(
      async () => {
        const agentName = getAgentDisplayName(currentUser);
        const baseUrl = getApiBaseUrl();

        // Determine the team to assign. Use user's team, or current conversation team, or default to comercial.
        const assignedTeamId =
          currentUser?.team_id || activeConversation?.team_id || "comercial";
        const assignedTeamName =
          safeTeams.find((t) => t && t.id === assignedTeamId)?.name || "Comercial";

        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${conversationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assigned_user_id: currentUser?.id,
              assigned_user_name: agentName,
              status: "OPEN",
              team_id: assignedTeamId,
              team_name: assignedTeamName,
              unread_count: 0,
            }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) throw data;

        await loadConversations(true);
        setActiveConversationId(conversationId);
        toast.success("Atendimento assumido com sucesso.");
      },
      { label: "Erro ao assumir atendimento" },
    );
  };

  const handleTransfer = async () => {
    if (!activeConversationId || !transferData.teamId) {
      toast.error("Selecione uma equipe de destino.");
      return;
    }

    if (transferData.type === "user" && !transferData.userId) {
      toast.error("Selecione um atendente para transferência direta.");
      return;
    }

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const selectedTeam = safeTeams.find((t) => t && t.id === transferData.teamId);
        const selectedUser = transferMembers.find(
          (m) => m.user_id === transferData.userId,
        );

        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/transfer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transfer_type: transferData.type,
              team_id: transferData.teamId,
              team_name: selectedTeam?.name || transferData.teamId,
              user_id: transferData.userId || null,
              user_name: selectedUser?.user_name || null,
              reason: transferData.reason,
            }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) throw data;

        await loadConversations(true);
        setShowTransferModal(false);
        setTransferData({ type: "queue", teamId: "", userId: "", reason: "" });
        toast.success("Atendimento transferido");
      },
      { label: "Erro ao transferir atendimento" },
    );
  };

  const handleCreateChat = async (e: React.FormEvent) => {
    e.preventDefault();

    const customerId = newChatData.customerId || null;
    const phone = customerId ? "has_customer" : String(newChatData.newPhone || "").trim();
    const name = customerId ? "has_customer" : String(newChatData.newName || "").trim();

    if (!customerId) {
      if (!phone) {
        toast.error("Informe o telefone do cliente.");
        return;
      }
      if (!name) {
        toast.error("Informe o nome do cliente.");
        return;
      }
    }

    const finalTeamId = newChatData.teamId || "comercial";
    const selectedTeamObj = safeTeams.find((t) => t.id === finalTeamId);
    const finalTeamName = selectedTeamObj?.name || "Comercial";
    const finalAccountId = newChatData.accountId || null;

    const selectedAccount = safeAccounts.find((a) => a.id === finalAccountId);

    if (templateType === "official" && !selectedMetaTemplate) {
      toast.error("Por favor, selecione um modelo de mensagem aprovado (template).");
      return;
    }

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const selectedCustomerObj = safeCustomers.find((c) => c.id === customerId);

        let finalPhone = selectedCustomerObj ? selectedCustomerObj.phone : (newChatData.newPhone || "");
        let finalCustomerName = selectedCustomerObj ? selectedCustomerObj.name : (newChatData.newName || "");

        // Normalização do telefone
        const normalizedPhoneObj = normalizeBrazilPhone(finalPhone);
        const normalizedPhone = normalizedPhoneObj ? normalizedPhoneObj.phone : finalPhone;

        let resData: any = {};

        if (templateType === "official" && selectedMetaTemplate) {
          // Enviar modelo Oficial (Meta ou Z-API transparente)
          const response = await authorizedFetch(
            `${baseUrl}/api/meta/messages/send-template`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone: normalizedPhone,
                customer_name: finalCustomerName,
                template_id: selectedMetaTemplate.id,
                variables: metaTemplateVariables,
                accountId: finalAccountId,
              }),
            }
          );
          resData = await safeReadJson(response);
          if (!response.ok) throw resData;

          if (resData.alreadyExisted) {
            toast.success("Conversa existente com este cliente foi aberta!");
          } else {
            toast.success("Modelo Meta enviado e conversa iniciada com sucesso!");
          }
        } else {
          // Começar canal padrão Z-API ou Meta Sessão com Mensagem customizada
          const startChatRes = await authorizedFetch(
            `${baseUrl}/api/omnichannel/start-chat`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerId: customerId || undefined,
                newName: newChatData.newName || "",
                newPhone: normalizedPhone,
                accountId: finalAccountId,
                teamId: finalTeamId,
                teamName: finalTeamName,
                message: manualMessageText,
              }),
            },
          );

          resData = await safeReadJson(startChatRes);
          if (!startChatRes.ok) throw resData;
          toast.success("Atendimento iniciado com sucesso!");
        }

        // 1. Recarregar conversas
        await loadConversations(true);
        
        // 2. Selecionar a conversa criada ou reaberta
        const finalConvId = resData?.conversation?.id || resData?.message?.conversation_id;
        if (finalConvId) {
          setActiveConversationId(finalConvId);
        }
        
        // 3. Mudar aba para "Meus"
        setActiveTab("meus");

        // 4. Deixar campo de resposta vazio
        setNewMessage("");

        // 5. Fechar modal e resetar dados
        setShowNewChatModal(false);
        setNewChatData({
          accountId: "",
          teamId: "",
          customerId: "",
          newName: "",
          newPhone: "",
        });
        setSelectedMetaTemplate(null);
        setMetaTemplateVariables({});
        setSelectedLocalTemplate(null);
        setManualMessageText("");
        setTemplateType("none");
      },
      { label: "Erro ao iniciar o atendimento" },
    );
  };

  const handleClose = async () => {
    if (!activeConversationId || !closeReason) {
      toast.error("Informe o motivo da finalização");
      return;
    }

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "RESOLVED",
              last_message: `Finalizado: ${closeReason}`,
            }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) throw data;

        await loadConversations(true);
        setShowCloseModal(false);
        toast.success("Atendimento finalizado com sucesso");
      },
      { label: "Erro ao finalizar atendimento" },
    );
  };

  const handleAISuggestion = async () => {
    if (!activeConversation) return;
    const history = safeMessages
      .map((m) => {
        const isClient = m.sender_type === "customer";
        const sender = isClient ? "Cliente" : "Agente";
        const text = (m as any).display_content || renderSafeText(m.content, "") || m.caption || "";
        return `${sender}: ${text}`;
      })
      .filter(line => line.trim().length > 0)
      .join("\n");

    toast.promise(
      authorizedFetch("/api/ai/suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      })
        .then(async (res) => {
          const data = await safeReadJson(res);
          if (!res.ok) throw data;
          return data;
        })
        .then((data) => {
          if (data.suggestion) {
            setNewMessage(data.suggestion);
            setShowIAPanel(false);
          }
        }),
      {
        loading: "Gerando sugestão...",
        success: "Sugestão inserida no campo de texto!",
        error: (err) => `Erro ao gerar sugestão: ${getErrorMessage(err)}`,
      },
    );
  };

  const handleAIClassify = async () => {
    if (!activeConversation) return;
    const history = safeMessages
      .map((m) => {
        const isClient = m.sender_type === "customer";
        const sender = isClient ? "Cliente" : "Agente";
        const text = (m as any).display_content || renderSafeText(m.content, "") || m.caption || "";
        return `${sender}: ${text}`;
      })
      .filter(line => line.trim().length > 0)
      .join("\n");

    toast.promise(
      authorizedFetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      })
        .then(async (res) => {
          const data = await safeReadJson(res);
          if (!res.ok) throw data;
          return data;
        })
        .then((data) => {
          if (data.classification && activeConversation?.customer_id) {
            toast.success(`Lead classificado como: ${data.classification}`);
            setShowIAPanel(false);
          }
        }),
      {
        loading: "Classificando lead...",
        success: "Classificação concluída",
        error: (err) => `Erro ao classificar: ${getErrorMessage(err)}`,
      },
    );
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConversationId) return;

    if (isInternalMode) {
      handleSaveInternalNote();
      return;
    }

    await safeAction(
      async () => {
        const originalContent = newMessage;
        const agentName = getAgentDisplayName(currentUser);

        setNewMessage("");

        const baseUrl = getApiBaseUrl();
        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/send-message`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: originalContent,
            }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) {
          setNewMessage(originalContent); // Restore on error
          throw data;
        }

        await loadMessages(activeConversationId, true);
        await loadConversations(true);
        toast.success("Mensagem enviada com sucesso");
      },
      { label: "Erro ao enviar mensagem" },
    );
  };

  const handleSummarize = async () => {
    if (!activeConversation) return;
    setIsSummarizing(true);
    await safeAction(
      async () => {
        const history = safeMessages
          .map((m) => {
            const isClient = m.sender_type === "customer";
            const sender = isClient ? "Cliente" : "Agente";
            const text = (m as any).display_content || renderSafeText(m.content, "") || m.caption || "";
            return `${sender}: ${text}`;
          })
          .filter(line => line.trim().length > 0)
          .join("\n");

        if (!history.trim()) {
          setAiSummary("Não há mensagens suficientes no histórico para gerar um resumo.");
          toast.warning("Histórico vazio");
          return;
        }

        const res = await authorizedFetch("/api/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });

        const data = await safeReadJson(res);
        if (!res.ok) {
          throw data;
        }

        if (data.summary) {
          setAiSummary(data.summary);
          toast.success("Resumo gerado pelo Assistente IA");
        } else {
          throw new Error("Resumo indisponível");
        }
      },
      { label: "Erro ao gerar resumo" },
    );
    setIsSummarizing(false);
  };

  const handleReopen = async () => {
    if (!activeConversation) return;
    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversation.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "OPEN" }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) throw data;

        await loadConversations(true);
        toast.success("Atendimento reaberto");
      },
      { label: "Erro ao reabrir atendimento" },
    );
  };

  const handleMultiFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowed.includes(file.type)) {
        toast.error(`Formato de imagem não permitido para "${file.name}". Use JPG, PNG ou WEBP.`);
        continue;
      }
      if (file.size < 1000) {
        toast.error(`Arquivo "${file.name}" está corrompido ou vazio.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`Arquivo "${file.name}" é muito grande (máximo 20MB).`);
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) return;

    const previews = validFiles.map((file) => URL.createObjectURL(file));

    setSelectedImageFiles((prev) => [...prev, ...validFiles]);
    setImagePreviewUrls((prev) => [...prev, ...previews]);
    setShowMultiImagePreview(true);
    setShowAttachmentMenu(false);
    
    e.target.value = "";
  };

  const handleRemoveImageFile = (index: number) => {
    setSelectedImageFiles((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      if (updated.length === 0) {
        setShowMultiImagePreview(false);
      }
      return updated;
    });
    setImagePreviewUrls((prev) => {
      URL.revokeObjectURL(prev[index]);
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleCancelMultiImage = () => {
    imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    setSelectedImageFiles([]);
    setImagePreviewUrls([]);
    setImageCaption("");
    setShowMultiImagePreview(false);
  };

  const handleSendImages = async () => {
    if (!activeConversationId) {
      toast.error("Nenhuma conversa selecionada.");
      return;
    }

    if (!selectedImageFiles.length) {
      toast.error("Nenhuma imagem selecionada.");
      return;
    }

    setIsSendingImages(true);

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const formData = new FormData();

        selectedImageFiles.forEach((file) => {
          formData.append("files", file);
        });

        formData.append("caption", imageCaption || "");

        const response = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/send-images`,
          {
            method: "POST",
            body: formData,
          }
        );

        const data = await safeReadJson(response);

        if (!response.ok || !data?.success) {
          throw new Error(data?.error || "Erro ao enviar imagens.");
        }

        toast.success(
          selectedImageFiles.length === 1
            ? "Imagem enviada com sucesso!"
            : "Imagens enviadas com sucesso!"
        );

        imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        setSelectedImageFiles([]);
        setImagePreviewUrls([]);
        setImageCaption("");
        setShowMultiImagePreview(false);

        await loadMessages(activeConversationId, true);
        await loadConversations(true);
      },
      { label: "Erro ao enviar imagem(ens)" }
    );

    setIsSendingImages(false);
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
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "video" | "document",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === "image") {
      const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
      if (!allowed.includes(file.type)) {
        toast.error("Formato de imagem não permitido. Use JPG, PNG ou WEBP.");
        return;
      }
      if (file.size < 1000) {
        toast.error("Imagem inválida ou vazia.");
        return;
      }
    }

    // Size limits
    const limits = {
      image: 5 * 1024 * 1024, // 5MB
      video: 25 * 1024 * 1024, // 25MB
      document: 20 * 1024 * 1024, // 20MB
    };

    if (file.size > (limits[type] || limits.document)) {
      toast.error(
        `Arquivo muito grande para envio (máximo ${type === "image" ? "5MB" : type === "video" ? "25MB" : "20MB"})`,
      );
      return;
    }

    setSelectedFile(file);
    setMediaType(type);
    setShowAttachmentMenu(false);

    if (type === "image" || type === "video") {
      const url = URL.createObjectURL(file);
      setMediaPreviewUrl(url);
      setShowMediaPreview(true);
    } else {
      setMediaPreviewUrl(null);
      setShowMediaPreview(true);
    }
  };

  const handleSendMedia = async () => {
    if (!selectedFile || !activeConversationId) return;

    setIsSendingMedia(true);
    const agentName = getAgentDisplayName(currentUser);

    setShowMediaPreview(false);

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const formData = new FormData();
        formData.append("file", selectedFile);

        let endpoint = `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/send-media`;
        if (mediaType === "image") {
          endpoint = `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/send-image`;
          formData.append("caption", mediaCaption || "");
        } else {
          formData.append("type", mediaType || "document");
          formData.append("caption", mediaCaption || "");
        }

        const res = await authorizedFetch(
          endpoint,
          {
            method: "POST",
            body: formData,
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) {
          throw data;
        }

        await loadMessages(activeConversationId, true);
        await loadConversations(true);
        toast.success("Mídia enviada com sucesso!");

        // Reset state
        setSelectedFile(null);
        setMediaType(null);
        setMediaCaption("");
        setMediaPreviewUrl(null);
      },
      { label: "Erro ao enviar mídia" },
    );
    setIsSendingMedia(false);
  };

  const retryMessage = async (msg: Message) => {
    if (!activeCustomer?.phone) return;

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        let endpoint = "";
        let body: any = { phone: activeCustomer.phone };
        const sentContent = msg.metadata?.sentContent || msg.content;

        if (msg.message_type === "text") {
          endpoint = `${baseUrl}/api/zapi/send-text`;
          body.message = sentContent;
        } else {
          toast.error(
            "Reenvio de mídia ainda não suportado. Tente enviar o arquivo novamente.",
          );
          return;
        }

        const res = await authorizedFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await safeReadJson(res);
        if (!res.ok) throw data;

        await loadMessages(activeConversationId!, true);
        toast.success("Mensagem reenviada com sucesso");
      },
      { label: "Erro ao reenviar mensagem" },
    );
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editingMessageText.trim() || !activeConversationId) return;

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/messages/${messageId}/edit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: editingMessageText,
            }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) throw data;

        await loadMessages(activeConversationId, true);
        setEditingMessageId(null);
        setEditingMessageText("");
        toast.success("Mensagem editada com sucesso!");
      },
      { label: "Erro ao editar mensagem" },
    );
  };

  const handleDeleteMessage = async (messageId: string, deleteForEveryone: boolean) => {
    if (!activeConversationId) return;

    await safeAction(
      async () => {
        const baseUrl = getApiBaseUrl();
        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/messages/${messageId}/delete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              owner: deleteForEveryone,
            }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) throw data;

        await loadMessages(activeConversationId, true);
        setDeletingMessageId(null);
        toast.success("Mensagem apagada com sucesso!");
      },
      { label: "Erro ao apagar mensagem" },
    );
  };

  const handleSaveInternalNote = async () => {
    if (!newMessage.trim() || !activeConversationId) return;

    await safeAction(
      async () => {
        const note = newMessage;
        const agentName = getAgentDisplayName(currentUser);

        setNewMessage("");
        setIsInternalMode(false);

        const baseUrl = getApiBaseUrl();
        const res = await authorizedFetch(
          `${baseUrl}/api/omnichannel/conversations/${activeConversationId}/internal-note`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              note,
            }),
          },
        );

        const data = await safeReadJson(res);
        if (!res.ok) {
          setNewMessage(note);
          setIsInternalMode(true);
          throw data;
        }

        await loadMessages(activeConversationId, true);
        toast.success("Nota interna salva no histórico");
      },
      { label: "Erro ao salvar nota interna" },
    );
  };

  const activeTeam = safeTeams.find(
    (t) =>
      t.id === (activeConversation?.team_id || activeConversation?.queue_id),
  );

  return (
    <div className="flex h-full w-full bg-white overflow-hidden">
      {/* 1. SIDEBAR: Inbox */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col shrink-0 bg-white shadow-sm z-10 ${activeConversationId ? "hidden md:flex" : "flex"}`}>
        <div className="p-5 border-b border-slate-50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              Conversas
              <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-xs">
                {safeConversations.length}
              </span>
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  loadConversations();
                  toast.success("Lista atualizada");
                }}
                className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
                title="Atualizar conversas"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingConversations ? "animate-spin" : ""}`}
                />
              </button>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="p-2 hover:bg-slate-50 rounded-lg text-blue-600 transition-colors"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex bg-slate-50 p-1 rounded-xl mb-4 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab("novos")}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === "novos" ? "bg-white shadow-md text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              Novos (
              {
                visibleConversations.filter(
                  (c) => !c.assigned_user_id && !isClosedConversation(c),
                ).length
              }
              )
            </button>
            <button
              onClick={() => setActiveTab("meus")}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === "meus" ? "bg-white shadow-md text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              Meus (
              {
                visibleConversations.filter(
                  (c) =>
                    c.assigned_user_id === currentUser?.id &&
                    !isClosedConversation(c),
                ).length
              }
              )
            </button>
            <button
              onClick={() => setActiveTab("concluidos")}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === "concluidos" ? "bg-white shadow-md text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              Concluídos (
              {
                visibleConversations.filter((c) => isClosedConversation(c))
                  .length
              }
              )
            </button>
            <button
              onClick={() => setActiveTab("todos")}
              className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === "todos" ? "bg-white shadow-md text-blue-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              Todos ({visibleConversations.length})
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar cliente ou mensagem..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-all shadow-sm font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowFilterPanel(true)}
              className={`p-2.5 rounded-xl border border-slate-200 flex items-center justify-center transition-all ${selectedTagIds.length > 0 || selectedAccountIds.length > 0 || selectedUserIds.length > 0 ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white text-slate-400 hover:bg-slate-50"}`}
              title="Filtros avançados"
            >
              <div className="relative">
                <SlidersHorizontal className="w-5 h-5" />
                {(selectedTagIds.length > 0 ||
                  selectedAccountIds.length > 0 ||
                  selectedUserIds.length > 0) && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full border-2 border-white"></span>
                )}
              </div>
            </button>
            <button
              onClick={() => setShowTagManagement(true)}
              className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 flex items-center justify-center transition-all"
              title="Gerenciar Etiquetas"
            >
              <Settings2 className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Quick Channel Filters */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1.5 mb-2.5 border-b border-slate-50/60">
            <button
              onClick={() => setSelectedAccountIds([])}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedAccountIds.length === 0 ? "bg-slate-800 text-white shadow-md animate-fade-in" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              Todos os Canais
            </button>
            {(() => {
              const seen = new Set();
              return safeAccounts.filter(acc => {
                if (!acc.id) return false;
                if (seen.has(acc.id)) return false;
                seen.add(acc.id);
                return true;
              });
            })().map((acc) => {
              const isSelected = selectedAccountIds.includes(acc.id);
              return (
                <button
                  key={acc.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedAccountIds(selectedAccountIds.filter((id) => id !== acc.id));
                    } else {
                      setSelectedAccountIds([...selectedAccountIds, acc.id]);
                    }
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isSelected ? "bg-emerald-600 text-white shadow-md animate-fade-in" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  {acc.name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <button
              onClick={() => setSelectedTeamId("all")}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedTeamId === "all" ? "bg-slate-800 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              Minhas Equipes
            </button>
            {safeTeams
              .filter((t) => t.is_active)
              .map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedTeamId === team.id ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                >
                  {team.name}
                </button>
              ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {filteredConversations.length === 0 ? (
            <div className="p-10 flex flex-col items-center justify-center text-center opacity-40">
              <MessageSquare className="w-12 h-12 mb-4" />
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {activeTab === "novos"
                  ? "Nenhuma conversa nova encontrada"
                  : activeTab === "meus"
                    ? "Nenhum atendimento atribuído a você"
                    : activeTab === "concluidos"
                      ? "Nenhum atendimento concluído"
                      : "Nenhuma conversa encontrada"}
              </p>
            </div>
          ) : (
            (() => {
              const seen = new Set<string>();
              return filteredConversations.filter((c) => {
                if (!c.id) return false;
                if (seen.has(c.id)) return false;
                seen.add(c.id);
                return true;
              });
            })().map((conv) => {
              const customer =
                conv.customer ||
                safeCustomers.find((c) => c.id === conv.customer_id);
              const isActive = activeConversationId === conv.id;
              const teamId = conv.team_id || conv.queue_id;
              const team = safeTeams.find((t) => t.id === teamId);
              const account = safeAccounts.find(
                (a) => a.id === conv.whatsapp_account_id,
              );
              const lastMsgAt =
                conv.last_message_at || conv.updated_at || conv.created_at;

              const customerName = (customer?.name ||
                (conv as any).customer_name ||
                (conv as any).name ||
                "Cliente") as string;
              const lastMessage =
                typeof conv.last_message === "string"
                  ? conv.last_message
                  : "Mensagem recebida";

              return (
                <button
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv)}
                  className={`w-full p-4 flex items-start gap-4 transition-all hover:bg-slate-50 text-left relative overflow-hidden ${isActive ? "bg-blue-50/50" : ""}`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>
                  )}

                  <div className="relative shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg border-2 border-white shadow-sm ring-1 ring-slate-100">
                      {customerName.charAt(0)}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full flex items-center justify-center">
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                        alt="WA"
                        className="w-3 h-3 invert pointer-events-none"
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-bold text-slate-800 text-sm truncate">
                        {customerName}
                      </h3>
                      <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                        {lastMsgAt
                          ? new Date(lastMsgAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider text-white"
                        style={{ backgroundColor: team?.color || "#cbd5e1" }}
                      >
                        {team?.name || "Sem Equipe"}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">
                        •
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                        {account?.name || "---"}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 truncate leading-relaxed mb-2">
                      {lastMessage}
                    </p>

                    <div className="flex flex-wrap gap-1">
                      {safeArray(conv.tags).slice(0, 2).map((tag: any, idx: number) => (
                        <span
                          key={`${tag.id || tag.name || ''}_${idx}`}
                          className="px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider shadow-sm"
                          style={{
                            backgroundColor: tag.color || "#e2e8f0",
                            color: getContrastTextColor(tag.color),
                          }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {(conv.tags?.length || 0) > 2 && (
                        <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                          +{(conv.tags?.length || 0) - 2}
                        </span>
                      )}
                    </div>
                  </div>

                  {(conv.unread_count || 0) > 0 && (
                    <div className="bg-blue-600 text-white w-5 h-5 rounded-lg flex items-center justify-center text-[10px] font-bold shadow-lg shadow-blue-200">
                      {conv.unread_count}
                    </div>
                  )}
                </button>
              );
            })
          )}
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
      <div className={`flex-1 flex flex-col min-w-0 bg-slate-50 ${activeConversationId ? "flex" : "hidden md:flex"}`}>
        {activeConversation ? (
          <>
            {/* Chat Header */}
            <header className="h-20 bg-white border-b border-slate-100 px-4 md:px-6 flex items-center justify-between shrink-0 z-20">
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <button
                  onClick={() => setActiveConversationId(null)}
                  className="p-2 hover:bg-slate-50 active:bg-slate-100 rounded-xl text-slate-500 md:hidden border border-slate-100 flex items-center justify-center shrink-0 transition-all mr-1"
                  title="Voltar para a lista"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 font-bold text-slate-600">
                  {activeCustomer?.name?.charAt(0) || activeCustomer?.phone?.charAt(0) || "C"}
                </div>
                <div className="min-w-0">
                  <h3
                    className="font-bold text-slate-800 truncate cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2"
                    onClick={() => handleLoadDetails(activeConversation.id)}
                  >
                    {activeCustomer?.name || activeCustomer?.phone || "Cliente"}
                    <Info className="w-3.5 h-3.5 opacity-40" />
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400">
                      {activeCustomer?.phone || "Sem telefone"}
                    </span>
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                    {activeTeam && (
                      <span
                        className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-[0.1em] text-white shadow-sm"
                        style={{
                          backgroundColor: activeTeam.color || "#3b82f6",
                        }}
                      >
                        Equipe {activeTeam.name}
                      </span>
                    )}
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>

                    {isMetaConversation && (
                      <>
                        <div
                          className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border flex items-center gap-1 shadow-sm ${sessionStatus.colorClass}`}
                          title={sessionStatus.description}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${sessionStatus.status === "active" ? "bg-emerald-500 animate-pulse" : sessionStatus.status === "expired" ? "bg-rose-500 animate-pulse" : "bg-slate-400"}`} />
                          {sessionStatus.text}
                        </div>
                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                      </>
                    )}

                    {/* Exibição de Etiquetas no Header */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {safeArray(activeConversation.tags).map((tag: any, idx: number) => (
                        <div
                          key={`${tag.id || tag.name || ''}_${idx}`}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: tag.color || "#eee",
                            color: getContrastTextColor(tag.color),
                          }}
                        >
                          {tag.name}
                          <button
                            onClick={() =>
                              handleUnlinkTag(activeConversation.id, tag.id)
                            }
                            className="hover:bg-black/10 rounded"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}

                      <div className="relative">
                        <button
                          onClick={() => setShowTagSelector(!showTagSelector)}
                          className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all flex items-center gap-1"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          Etiqueta
                        </button>

                        <AnimatePresence>
                          {showTagSelector && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: 5 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: 5 }}
                              className="absolute left-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 p-2 z-[60]"
                            >
                              <div className="p-2 border-b border-slate-50 mb-1">
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="Filtrar..."
                                  className="w-full text-[10px] px-2 py-1 bg-slate-50 rounded-md outline-none"
                                  value={tagSearch}
                                  onChange={(e) => setTagSearch(e.target.value)}
                                />
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {safeTags
                                  .filter((t) =>
                                    (t?.name || "")
                                      .toLowerCase()
                                      .includes((tagSearch || "").toLowerCase()),
                                  )
                                  .map((tag, idx) => (
                                    <button
                                      key={`${tag.id || tag.name || ''}_${idx}`}
                                      onClick={() => {
                                        if (activeConversation) {
                                          handleLinkTag(
                                            activeConversation.id,
                                            tag.id,
                                          );
                                        }
                                        setShowTagSelector(false);
                                        setTagSearch("");
                                      }}
                                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                                    >
                                      <div
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: tag.color || "#cbd5e1" }}
                                      />
                                      <span className="text-[10px] font-bold text-slate-600">
                                        {tag.name || "Sem Nome"}
                                      </span>
                                    </button>
                                  ))}
                                {safeTags.length === 0 && (
                                  <p className="text-[9px] text-slate-400 text-center py-2">
                                    Nenhuma etiqueta
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setShowIAPanel(!showIAPanel)}
                  className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border transition-all font-bold text-xs ${showIAPanel ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white border-slate-200 text-slate-600 hover:border-blue-300"}`}
                  title="Assistente IA"
                >
                  <Sparkles
                    className={`w-4 h-4 ${showIAPanel ? "animate-pulse" : "text-blue-500"}`}
                  />
                  <span className="hidden sm:inline">Assistente IA</span>
                </button>
                <div className="w-px h-6 bg-slate-200 mx-0.5 sm:mx-1"></div>
                <button
                  onClick={() => {
                    const link = `${window.location.origin}/app/atendimentos/${activeConversation.id}`;
                    navigator.clipboard.writeText(link);
                    toast.success("Link do atendimento copiado com sucesso!");
                  }}
                  className="p-2 sm:p-2.5 hover:bg-slate-50 hover:text-blue-600 rounded-xl text-slate-400 transition-all shrink-0 flex items-center gap-1.5"
                  title="Copiar Link da Conversa"
                >
                  <Copy className="w-5 h-5" />
                  <span className="hidden md:inline text-xs font-bold">Copiar Link</span>
                </button>
                <button
                  onClick={() => setShowTransferModal(true)}
                  className="p-2 sm:p-2.5 hover:bg-slate-50 rounded-xl text-slate-400 transition-all shrink-0"
                  title="Transferir Atendimento"
                >
                  <ArrowRightLeft className="w-5 h-5" />
                </button>
                {activeConversation && (
                  <button
                    onClick={() => setShowTemplateModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 rounded-xl border border-emerald-200 transition-all font-bold text-xs"
                    title="Reiniciar conversa com Modelos de Mensagem (Templates)"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Reiniciar (Modelos de Mensagem)</span>
                    <span className="lg:hidden">Modelos</span>
                  </button>
                )}
                {activeConversation.status === "RESOLVED" ||
                activeConversation.status === "CLOSED" ||
                activeConversation.status === "CONCLUIDO" ||
                activeConversation.status === "CONCLUÍDO" ? (
                  <button
                    onClick={handleReopen}
                    className="p-2 sm:p-2.5 bg-emerald-50 text-emerald-600 rounded-xl transition-all font-bold text-xs sm:text-sm px-3 sm:px-4 shrink-0"
                  >
                    Reabrir
                  </button>
                ) : (
                  <>
                    {activeConversation.assigned_user_id !==
                      currentUser?.id && (
                      <button
                        onClick={() =>
                          handleAssumeConversation(activeConversation.id)
                        }
                        className="p-2 sm:p-2.5 bg-blue-600 text-white rounded-xl transition-all font-bold text-xs sm:text-sm px-3 sm:px-4 shadow-lg shadow-blue-100 hover:scale-105 shrink-0"
                      >
                        Assumir<span className="hidden sm:inline"> Atendimento</span>
                      </button>
                    )}
                    <button
                      onClick={() => setShowCloseModal(true)}
                      className="p-2 sm:p-2.5 bg-blue-50 text-blue-600 rounded-xl transition-all font-bold text-xs sm:text-sm px-3 sm:px-4 shrink-0"
                    >
                      Concluir
                    </button>
                  </>
                )}
                <div className="relative">
                  <button
                    onClick={() => setShowChatMenu(!showChatMenu)}
                    className={`p-2.5 rounded-xl transition-all ${showChatMenu ? "bg-blue-50 text-blue-600 border border-blue-100" : "hover:bg-slate-50 text-slate-400"}`}
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
                          onClick={() => {
                            setShowChatMenu(false);
                            toast.info("Funcionalidade em desenvolvimento");
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                        >
                          <Info className="w-4 h-4" /> Detalhes do Lead
                        </button>
                        <button
                          onClick={() => {
                            setShowChatMenu(false);
                            toast.info("Exportando histórico...");
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                        >
                          <FileText className="w-4 h-4" /> Exportar Conversa
                          (PDF)
                        </button>
                        <div className="h-px bg-slate-50 my-1 mx-2" />
                        <button
                          onClick={() => {
                            setShowChatMenu(false);
                            toast.warning("Lead marcado como spam");
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 rounded-xl text-xs font-bold text-red-600 transition-colors"
                        >
                          <Plus className="w-4 h-4 rotate-45" /> Marcar como
                          Spam
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </header>

            {/* Quality Banner */}
            <div
              className={`px-6 py-2 border-b flex items-center justify-between gap-3 ${currentAccount?.status === "CONNECTED" ? "bg-blue-50/50 border-blue-100" : "bg-red-50/50 border-red-100"}`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full animate-pulse ${currentAccount?.status === "CONNECTED" ? "bg-emerald-500" : "bg-red-500"}`}
                ></div>
                <p
                  className={`text-[10px] font-bold uppercase tracking-widest ${currentAccount?.status === "CONNECTED" ? "text-blue-700" : "text-red-700"}`}
                >
                  Canal {currentAccount?.name || "Comercial"}{" "}
                  {currentAccount?.status === "CONNECTED"
                    ? "conectado com qualidade ALTA"
                    : "DESCONECTADO"}{" "}
                  • Atendimento{" "}
                  {currentAccount?.status === "CONNECTED"
                    ? "seguro"
                    : "PENDENTE"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                  Número:{" "}
                  {currentAccount?.phone_number ||
                    currentAccount?.number ||
                    "---"}
                </span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                  Equipe:{" "}
                  {safeTeams.find(
                    (t) =>
                      t && t.id ===
                      (activeConversation?.team_id ||
                        activeConversation?.queue_id),
                  )?.name || "Geral"}
                </span>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
              {loadingMessages ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/50 z-10 backdrop-blur-[1px]">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-4" />
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                    Carregando mensagens...
                  </p>
                </div>
              ) : safeMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-30 select-none grayscale">
                  <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest">
                    Nenhuma mensagem disponível
                  </p>
                </div>
              ) : null}

              {(() => {
                const seen = new Set<string>();
                return safeMessages.filter((m) => {
                  if (!m.id) return false;
                  if (seen.has(m.id)) return false;
                  seen.add(m.id);
                  return true;
                });
              })().map((msg: Message) => {
                const isMine =
                  msg.sender_type === "agent" ||
                  (msg.sender_type as any) === "agent_external" ||
                  msg.sender_type === "system" ||
                  (msg.sender_type as string) === "internal";
                const isInternal =
                  (msg as any).is_internal ||
                  msg.message_type === "internal_note";
                const timestamp = msg.created_at;
                const status = msg.status;

                if (isInternal) {
                  return (
                    <div key={msg.id} className="flex justify-center my-6">
                      <div className="max-w-[85%] lg:max-w-xl bg-amber-50 border border-amber-200 rounded-[2rem] p-5 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 bg-amber-400 h-full"></div>
                        <div className="flex items-center justify-between gap-4 mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-amber-200 flex items-center justify-center text-amber-700">
                              <FileText className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-black text-amber-800 uppercase tracking-widest">
                              {msg.sender_name || "Operador"}
                            </span>
                          </div>
                          <span className="text-[10px] font-black text-amber-600 uppercase tracking-tighter bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200">
                            Nota Interna
                          </span>
                        </div>
                        <div className="text-sm text-slate-800 leading-relaxed font-medium">
                          {renderMessageContent(msg)}
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <div className="text-[9px] text-amber-600/60 font-black uppercase tracking-widest flex items-center gap-1.5">
                            <Shield className="w-3 h-3" /> Visível apenas
                            internamente
                          </div>
                          <span className="text-[10px] font-bold text-amber-700 opacity-60">
                            {timestamp
                              ? new Date(timestamp).toLocaleString()
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] lg:max-w-[60%] flex gap-3 ${isMine ? "flex-row-reverse" : ""}`}
                    >
                      <div
                        className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border ${isMine ? "bg-blue-600 border-blue-500 text-white shadow-md" : "bg-white border-slate-200 text-slate-600 shadow-sm"}`}
                      >
                        {isMine ? "GA" : activeCustomer?.name?.charAt(0)}
                      </div>

                      <div className="space-y-1 relative group">
                        <div
                          className={`text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 px-1 ${isMine ? "text-right" : "text-left"}`}
                        >
                          {msg.sender_type === "system"
                            ? "Sistema"
                            : isMine
                              ? msg.sender_name || "Agente"
                              : activeCustomer?.name || "Cliente"}
                        </div>

                        {/* Hover Actions: Edit and Delete */}
                        {msg.status !== "deleted" && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1 bg-white border border-slate-100 rounded-xl shadow-lg p-1.5 z-25 ${
                              isMine ? "left-0 -translate-x-[110%]" : "right-0 translate-x-[110%]"
                            }`}
                          >
                            {isMine && msg.message_type === "text" && (
                              <button
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditingMessageText(msg.content);
                                  setDeletingMessageId(null);
                                }}
                                className="p-1 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"
                                title="Editar mensagem"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setDeletingMessageId(msg.id);
                                setEditingMessageId(null);
                              }}
                              className="p-1 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-red-500 transition-colors"
                              title="Apagar mensagem"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <div
                          className={`px-4 py-3 rounded-2xl shadow-sm text-sm leading-relaxed transition-all ${isMine ? (isInternal ? "bg-amber-100 text-amber-900 border-amber-200 rounded-tr-none" : "bg-blue-600 text-white rounded-tr-none") : "bg-white text-slate-700 rounded-tl-none border border-slate-100"} ${status === "failed" ? "border-red-300 bg-red-50 text-red-600" : ""}`}
                        >
                          {deletingMessageId === msg.id ? (
                            <div className="space-y-3 py-1 min-w-[210px]">
                              <p className={`text-xs font-bold leading-normal select-none ${isMine ? "text-white" : "text-slate-800"}`}>
                                Como deseja apagar esta mensagem?
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {isMine && (
                                  <button
                                    onClick={() => handleDeleteMessage(msg.id, true)}
                                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold leading-none select-none transition-all ${
                                      isMine
                                        ? "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                                        : "bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200"
                                    }`}
                                  >
                                    Apagar para todos (WhatsApp)
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteMessage(msg.id, false)}
                                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold leading-none select-none transition-all ${
                                    isMine
                                      ? "bg-white/10 hover:bg-white/20 text-white border border-white/20"
                                      : "bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200"
                                  }`}
                                >
                                  Apagar para mim (Apenas CRM)
                                </button>
                                <button
                                  onClick={() => setDeletingMessageId(null)}
                                  className={`w-full text-center py-1 rounded text-xs font-black uppercase select-none transition-all ${
                                    isMine ? "text-white/80 hover:text-white" : "text-slate-400 hover:text-slate-600"
                                  }`}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : editingMessageId === msg.id ? (
                            <div className="space-y-2 py-1 min-w-[210px]">
                              <textarea
                                value={editingMessageText}
                                onChange={(e) => setEditingMessageText(e.target.value)}
                                className="w-full bg-white/15 text-white placeholder-white/50 border border-white/25 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 resize-none font-sans"
                                rows={2}
                                style={!isMine ? { backgroundColor: '#f8fafc', color: '#1e293b', borderColor: '#cbd5e1' } : undefined}
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setEditingMessageId(null)}
                                  className={`px-2 py-1 text-xs rounded-xl font-bold border transition-colors ${
                                    isMine
                                      ? "bg-transparent border-white/25 hover:bg-white/15 text-white"
                                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                  }`}
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={() => handleEditMessage(msg.id)}
                                  className={`px-3 py-1 text-xs rounded-xl font-bold transition-colors ${
                                    isMine
                                      ? "bg-white text-blue-600 hover:bg-blue-50"
                                      : "bg-blue-600 text-white hover:bg-blue-700"
                                  }`}
                                >
                                  Salvar
                                </button>
                              </div>
                            </div>
                          ) : (
                            renderMessageContent(msg)
                          )}

                          <div
                            className={`flex items-center gap-1.5 mt-1 opacity-50 ${isMine ? "justify-end" : "justify-start"}`}
                          >
                            <span className="text-[9px] font-medium uppercase">
                              {timestamp
                                ? new Date(timestamp).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "--:--"}
                            </span>
                            {isMine && status === "read" && (
                              <CheckCheck className="w-3 h-3 text-blue-500" />
                            )}
                            {isMine && status === "sent" && (
                              <CheckCheck className="w-3 h-3 text-slate-300" />
                            )}
                            {isMine && (status as any) === "sending" && (
                              <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
                            )}
                            {isMine && status === "failed" && (
                              <button
                                onClick={() => retryMessage(msg)}
                                className="flex items-center gap-1 group"
                              >
                                <AlertCircle className="w-3 h-3 text-red-500" />
                                <span className="text-[8px] text-red-500 font-bold uppercase hover:underline">
                                  Falhou • Tentar novamente
                                </span>
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
                        <h4 className="font-bold text-slate-800 text-sm">
                          Assistente Viva IA
                        </h4>
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                          Modelo Gemini pro ativo
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowIAPanel(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
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
                        <RefreshCw
                          className={`w-4 h-4 text-blue-500 ${isSummarizing ? "animate-spin" : "group-hover:rotate-180 transition-transform"}`}
                        />
                        <span className="text-sm font-bold text-blue-700">
                          Resumir Atendimento
                        </span>
                      </div>
                      <Sparkles className="w-4 h-4 text-blue-400" />
                    </button>

                    {aiSummary ? (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative ring-1 ring-blue-100 flex flex-col gap-3">
                        <div className="max-h-[180px] overflow-y-auto pr-1 text-slate-700 text-xs font-medium leading-relaxed whitespace-pre-wrap">
                          {aiSummary}
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => {
                              setNewMessage(aiSummary);
                              setShowIAPanel(false);
                            }}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-100 transition-all active:scale-95"
                          >
                            Citar no Chat
                          </button>
                          <button
                            onClick={() => {
                              toast.success(
                                "Nota salva no histórico do atendimento",
                              );
                              setShowIAPanel(false);
                            }}
                            className="flex-1 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold shadow-sm transition-all"
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
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Sugestão
                          </span>
                        </button>
                        <button
                          onClick={handleAIClassify}
                          className="flex flex-col items-center justify-center gap-2 p-4 border border-slate-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group"
                        >
                          <TagIcon className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Classificar
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Chat Input */}
            <footer className="bg-white border-t border-slate-100 p-6 z-20">
              {activeConversation.status === "RESOLVED" ? (
                <div className="max-w-4xl mx-auto p-4 bg-slate-50 border border-dashed border-slate-300 rounded-2xl text-center">
                  <p className="text-sm text-slate-500 font-medium">
                    Este atendimento foi concluído em{" "}
                    {activeConversation.last_message_at
                      ? new Date(
                          activeConversation.last_message_at,
                        ).toLocaleDateString()
                      : "data recente"}
                    .
                  </p>
                  <button
                    onClick={handleReopen}
                    className="mt-2 text-blue-600 font-bold text-xs uppercase tracking-widest hover:underline"
                  >
                    Reabrir Atendimento para conversar
                  </button>
                </div>
              ) : (
                <div className="max-w-4xl mx-auto space-y-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsInternalMode(false)}
                      className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${!isInternalMode ? "bg-blue-600 text-white shadow-md" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      Responder Cliente
                    </button>
                    <button
                      onClick={() => setIsInternalMode(true)}
                      className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isInternalMode ? "bg-amber-500 text-white shadow-md" : "bg-amber-50 text-amber-600 hover:bg-amber-100"}`}
                    >
                      Nota Interna
                    </button>
                    {(activeConversation?.channelId || activeConversation?.whatsapp_account_id) && (
                      <button
                        type="button"
                        onClick={() => setShowTemplateModal(true)}
                        className="px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all bg-emerald-50 text-emerald-600 hover:bg-emerald-100 flex items-center gap-1 shadow-sm"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Modelo de Mensagem (Meta)
                      </button>
                    )}
                  </div>

                  {isMetaConversation && sessionStatus.status !== "active" && !isInternalMode ? (
                    <div className="bg-amber-50/60 border border-amber-200 p-6 text-center flex flex-col items-center justify-center space-y-4 shadow-sm animate-in fade-in duration-300 rounded-[2rem] w-full">
                      <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                        <Clock className="w-6 h-6 animate-pulse" />
                      </div>
                      <div className="max-w-md">
                        <h4 className="font-bold text-slate-800 text-sm">
                          Sessão WhatsApp da Meta Expirada (Janela de 24h)
                        </h4>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed font-semibold">
                          Já se passaram mais de 24 horas desde a última mensagem enviada por este cliente no WhatsApp. Para retomar o atendimento e liberar o envio de novas mensagens livres, envie um dos <strong className="text-amber-800 font-extrabold">Modelos de Mensagem Aprovados (Templates Meta)</strong>.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowTemplateModal(true)}
                        className="px-5 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all shadow-lg hover:scale-[1.02] active:scale-95 flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4 animate-spin" style={{ animationDuration: "3s" }} />
                        Reiniciar Conversa usando Modelos de Mensagem (Templates Meta)
                      </button>
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSendMessage}
                      className={`relative flex items-end gap-3.5 p-4 rounded-3xl focus-within:ring-2 transition-all shadow-md border ${isInternalMode ? "bg-amber-50/50 border-amber-200 focus-within:ring-amber-500" : "bg-slate-50 border-slate-200 focus-within:ring-blue-500"}`}
                    >
                    <div className="flex items-center gap-1 relative">
                      <button
                        type="button"
                        onClick={() =>
                          setShowAttachmentMenu(!showAttachmentMenu)
                        }
                        className={`p-2 rounded-xl transition-all ${showAttachmentMenu ? "bg-blue-600 text-white scale-110" : "text-slate-400 hover:bg-white hover:text-blue-600"}`}
                        title="Adicionar anexo"
                        disabled={isInternalMode}
                      >
                        <Plus
                          className={`w-5 h-5 transition-transform duration-300 ${showAttachmentMenu ? "rotate-45" : ""}`}
                        />
                      </button>

                      <AnimatePresence>
                        {showAttachmentMenu && !isInternalMode && (
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
                              <ImageIcon className="w-4 h-4 text-emerald-500" />{" "}
                              Foto / Imagem
                            </button>
                            <button
                              type="button"
                              onClick={() => videoInputRef.current?.click()}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                            >
                              <VideoIcon className="w-4 h-4 text-blue-500" />{" "}
                              Vídeo
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!activeConversation)
                                  return toast.info(
                                    "Selecione uma conversa antes de enviar arquivos.",
                                  );
                                if (!activeCustomer?.phone)
                                  return toast.info(
                                    "Cliente sem telefone válido.",
                                  );
                                docInputRef.current?.click();
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                            >
                              <FileIcon className="w-4 h-4 text-orange-500" />{" "}
                              Documento
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!activeConversation)
                                  return toast.info(
                                    "Selecione uma conversa antes de gravar áudio.",
                                  );
                                if (!activeCustomer?.phone)
                                  return toast.info(
                                    "Cliente sem telefone válido.",
                                  );
                                setShowAudioRecorder(true);
                                setShowAttachmentMenu(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                            >
                              <Mic className="w-4 h-4 text-rose-500" /> Gravar
                              Áudio
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowAttachmentMenu(false);
                                setIsInternalMode(true);
                                messageInputRef.current?.focus();
                              }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-600 transition-colors"
                            >
                              <FileText className="w-4 h-4 text-slate-400" />{" "}
                              Anotação Interna
                            </button>

                            <input
                              type="file"
                              ref={fileInputRef}
                              className="hidden"
                              accept="image/jpeg,image/png,image/webp"
                              multiple
                              onChange={(e) => handleMultiFileSelect(e)}
                            />
                            <input
                              type="file"
                              ref={videoInputRef}
                              className="hidden"
                              accept="video/*"
                              onChange={(e) => handleFileSelect(e, "video")}
                            />
                            <input
                              type="file"
                              ref={docInputRef}
                              className="hidden"
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
                              onChange={(e) => handleFileSelect(e, "document")}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`p-2 rounded-xl transition-all ${showEmojiPicker ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-white hover:text-blue-600"}`}
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

                    <AnimatePresence>
                      {quickReplyTriggerState && matchingQuickReplies.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: 15, scale: 0.95 }}
                          animate={{ opacity: 1, y: -4, scale: 1 }}
                          exit={{ opacity: 0, y: 15, scale: 0.95 }}
                          className="absolute bottom-full left-4 right-4 mb-3 z-[150] shadow-2xl rounded-2xl border border-slate-100 bg-white overflow-hidden max-h-96 flex flex-col focus:outline-none"
                        >
                          <div className="bg-slate-50 px-4 py-2.5 text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between border-b border-slate-100">
                            <span>Modelos de Mensagem (Use ↑ ↓ Enter)</span>
                            <button
                              type="button"
                              onClick={() => setQuickReplyTriggerState(null)}
                              className="text-slate-400 hover:text-slate-600 font-bold"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="overflow-y-auto divide-y divide-slate-50 max-h-80">
                            {matchingQuickReplies.map((qr, idx) => (
                              <button
                                key={`${qr.id || 'qr'}_${idx}`}
                                type="button"
                                onClick={() => handleSelectQuickReply(qr)}
                                className={`w-full text-left px-5 py-3.5 flex flex-col gap-1 transition-all text-sm ${idx === quickRepliesIndex ? "bg-blue-600 text-white" : "hover:bg-slate-50 text-slate-700"}`}
                              >
                                <div className="flex items-center gap-1.5 font-bold text-xs">
                                  <span className={`px-1.5 py-0.5 rounded ${idx === quickRepliesIndex ? "bg-white/20 text-white" : "bg-blue-50 text-blue-600"}`}>
                                    \{qr.shortcut}
                                  </span>
                                </div>
                                <p className={`text-xs leading-relaxed ${idx === quickRepliesIndex ? "text-blue-100" : "text-slate-500"}`}>
                                  {qr.content}
                                </p>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <textarea
                      ref={messageInputRef}
                      rows={1}
                      placeholder={
                        isInternalMode
                          ? "Adicionar nota interna ao atendimento..."
                          : "Escreva sua mensagem..."
                      }
                      className="flex-1 bg-transparent border-none outline-none text-sm md:text-base py-3.5 resize-none max-h-48 min-h-[48px] px-3 font-medium text-slate-800 placeholder-slate-400 leading-relaxed"
                      value={newMessage}
                      onChange={(e) => handleNewMessageChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (quickReplyTriggerState && matchingQuickReplies.length > 0) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setQuickRepliesIndex((prev) => (prev + 1) % matchingQuickReplies.length);
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setQuickRepliesIndex((prev) => (prev - 1 + matchingQuickReplies.length) % matchingQuickReplies.length);
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSelectQuickReply(matchingQuickReplies[quickRepliesIndex]);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setQuickReplyTriggerState(null);
                            return;
                          }
                        }

                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage(e);
                        }
                      }}
                    />

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className={`p-3 rounded-xl transition-all shadow-lg ${newMessage.trim() ? (isInternalMode ? "bg-amber-600 shadow-amber-200" : "bg-blue-600 shadow-blue-200") + " text-white scale-105 active:scale-100" : "bg-slate-200 text-slate-400 opacity-50 cursor-not-allowed"}`}
                      >
                        {isInternalMode ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </form>
                  )}
                </div>
              )}
            </footer>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-6 border-8 border-white shadow-xl shadow-blue-50">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">
              Bem-vindo ao Viva Experience
            </h3>
            <p className="text-slate-500 max-w-sm leading-relaxed">
              Selecione uma conversa ao lado para visualizar o histórico
              completo do cliente e iniciar o atendimento.
            </p>
          </div>
        )}
      </div>

      {/* 3. ASIDE: Customer Info */}
      <div className="w-80 lg:w-96 border-l border-slate-200 hidden xl:flex flex-col shrink-0 bg-white shadow-sm overflow-y-auto">
        {activeCustomer ? (
          <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
                Cadastro de Lead
              </h3>
              {!isEditingCustomer && (
                <button
                  id="btn-edit-customer"
                  onClick={() => setIsEditingCustomer(true)}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100"
                >
                  <Pencil className="w-3 h-3" />
                  Editar
                </button>
              )}
            </div>

            {isEditingCustomer ? (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Nome Completo
                    </label>
                    <input
                      id="edit-cust-name"
                      type="text"
                      value={editCustomerForm.name}
                      onChange={(e) =>
                        setEditCustomerForm({
                          ...editCustomerForm,
                          name: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700"
                      placeholder="Nome do cliente"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Telefone
                    </label>
                    <input
                      id="edit-cust-phone"
                      type="text"
                      value={editCustomerForm.phone}
                      onChange={(e) =>
                        setEditCustomerForm({
                          ...editCustomerForm,
                          phone: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700"
                      placeholder="Ex: 5511999999999"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      E-mail
                    </label>
                    <input
                      id="edit-cust-email"
                      type="email"
                      value={editCustomerForm.email}
                      onChange={(e) =>
                        setEditCustomerForm({
                          ...editCustomerForm,
                          email: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700"
                      placeholder="Ex: cliente@email.com"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Cidade / Localização
                    </label>
                    <input
                      id="edit-cust-city"
                      type="text"
                      value={editCustomerForm.city}
                      onChange={(e) =>
                        setEditCustomerForm({
                          ...editCustomerForm,
                          city: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700"
                      placeholder="Ex: São Paulo - SP"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                      Temperatura do Lead
                    </label>
                    <select
                      id="edit-cust-temp"
                      value={editCustomerForm.temperature}
                      onChange={(e) =>
                        setEditCustomerForm({
                          ...editCustomerForm,
                          temperature: e.target.value as "WARM" | "HOT",
                        })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-700 bg-white"
                    >
                      <option value="WARM">Morno</option>
                      <option value="HOT">Quente</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    id="btn-cancel-customer-edit"
                    onClick={() => setIsEditingCustomer(false)}
                    className="flex-1 px-4 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors uppercase tracking-wider"
                  >
                    Cancelar
                  </button>
                  <button
                    id="btn-save-customer-edit"
                    onClick={handleSaveCustomerEdit}
                    className="flex-1 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-colors uppercase tracking-wider"
                  >
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="w-24 h-24 rounded-3xl bg-slate-100 flex items-center justify-center text-3xl font-bold text-slate-600 mx-auto mb-4 border-2 border-white shadow-lg ring-1 ring-slate-100 relative">
                    {activeCustomer?.name?.charAt(0) || activeCustomer?.phone?.charAt(0) || "?"}
                    <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase border-2 border-white shadow-sm">
                      Online
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 truncate">
                    {activeCustomer?.name || activeCustomer?.phone || "Cliente"}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {activeCustomer.city || "Localização não informada"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Temperatura
                    </p>
                    <div
                      className={`text-xs font-bold uppercase flex items-center justify-center gap-2 ${activeCustomer.temperature === "HOT" ? "text-red-500" : "text-orange-500"}`}
                    >
                      <TrendingUp className="w-3 h-3" />
                      {activeCustomer.temperature === "HOT" ? "Quente" : "Morno"}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-center">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Origem
                    </p>
                    <p className="text-xs font-bold text-slate-700 uppercase">
                      {activeCustomer.origin || "Direto"}
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <Info className="w-4 h-4 text-blue-500" />
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Contato
                      </h4>
                    </div>
                    <div className="space-y-3">
                      <div
                        onClick={() => {
                          navigator.clipboard.writeText(activeCustomer.phone);
                          toast.success("Telefone copiado");
                        }}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:border-blue-100 transition-all shadow-sm">
                          <Phone className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">
                          {activeCustomer.phone}
                        </p>
                        <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div
                        onClick={() => {
                          if (activeCustomer.email) {
                            navigator.clipboard.writeText(activeCustomer.email);
                            toast.success("E-mail copiado");
                          }
                        }}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-md cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:border-blue-100 transition-all shadow-sm">
                          <Mail className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-700">
                          {activeCustomer.email || "Não informado"}
                        </p>
                        {activeCustomer.email && (
                          <Copy className="w-3 h-3 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </div>
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <TagIcon className="w-4 h-4 text-emerald-500" />
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Tags
                        </h4>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(activeCustomer.tags || []).map((tag, idx) => (
                        <span
                          key={`${tag || 'tag'}_${idx}`}
                          className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 shadow-sm transition-all"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </section>

                  {/* KANBAN / CRM LINKAGE SECTION */}
                  <section className="border-t border-slate-100 pt-5 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-indigo-500" />
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Vínculo CRM Kanban
                        </h4>
                      </div>
                      
                      {!linkedKanbanCard && (
                        <button
                          onClick={() => {
                            if (allKanbanBoards.length > 0) {
                              const b = allKanbanBoards[0];
                              setSelectedKanbanBoardId(b.id);
                              setSelectedKanbanStageId(b.stages[0]?.id || "");
                            }
                            setLinkKanbanCardTitle(activeCustomer?.name || "");
                            setShowLinkKanbanForm(!showLinkKanbanForm);
                          }}
                          className="text-[10px] font-black text-indigo-600 uppercase tracking-wider hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          {showLinkKanbanForm ? "Cancelar" : "+ Vincular Card"}
                        </button>
                      )}
                    </div>

                    {linkedKanbanCard ? (
                      (() => {
                        const board = allKanbanBoards.find(b => b.id === linkedKanbanCard.board_id);
                        const stage = board?.stages.find((s: any) => s.id === linkedKanbanCard.stage_id);
                        return (
                          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-3 shadow-sm">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">{board?.name || "PAINEL"}</span>
                              <h5 className="text-xs font-black text-slate-800 flex items-center justify-between gap-1 mt-0.5">
                                <span className="truncate">{linkedKanbanCard.title}</span>
                                <span className="font-mono text-[9px] bg-white border border-indigo-200 text-indigo-700 px-1 rounded uppercase tracking-wider shrink-0">{linkedKanbanCard.code}</span>
                              </h5>
                              
                              {/* Stage badge helper */}
                              <div className="inline-block mt-1">
                                <span className="px-2 py-0.5 bg-indigo-105 bg-indigo-100 text-indigo-800 rounded-lg text-[9px] font-extrabold uppercase tracking-wide border border-indigo-150">
                                  {stage?.name || "FASE ACTIVE"}
                                </span>
                              </div>
                            </div>

                            {/* Phase change trigger inline dropdown */}
                            <div className="pt-2 border-t border-slate-200 hover:border-slate-300 transition-all space-y-1.5">
                              <span className="text-[9px] font-black text-indigo-500 uppercase tracking-wider">Mudar a fase de atendimento:</span>
                              <select
                                value={linkedKanbanCard.stage_id}
                                onChange={(e) => {
                                  const updatedCard = {
                                    ...linkedKanbanCard,
                                    stage_id: e.target.value
                                  };
                                  updateCard(updatedCard);
                                  toast.success("Fase de atendimento CRM atualizada!");
                                  refreshKanbanLinkage();
                                }}
                                className="w-full px-2.5 py-1.5 text-xs border border-indigo-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium text-slate-705 cursor-pointer"
                              >
                                {board?.stages.map((stg: any) => (
                                  <option key={stg.id} value={stg.id}>{stg.name}</option>
                                ))}
                              </select>
                            </div>

                            {/* Anchor button links to Kanban view */}
                            <button
                              onClick={() => {
                                navigate(`/app/paineis/${linkedKanbanCard.board_id}?openCardId=${linkedKanbanCard.id}`);
                              }}
                              className="w-full flex items-center justify-center gap-1.5 p-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-xl uppercase tracking-wider transition-all shadow-sm hover:shadow-md cursor-pointer"
                            >
                              <span>Ver Histórico & CRM</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })()
                    ) : showLinkKanbanForm ? (
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 shadow-inner animate-in duration-200">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block">Preencha os dados do CRM</span>
                        
                        {/* Selector para o painel */}
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Escolha o Painel</label>
                          <select
                            value={selectedKanbanBoardId}
                            onChange={(e) => {
                              setSelectedKanbanBoardId(e.target.value);
                              const board = allKanbanBoards.find(b => b.id === e.target.value);
                              setSelectedKanbanStageId(board?.stages[0]?.id || "");
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:ring-1 focus:ring-indigo-500 text-slate-650 font-semibold"
                          >
                            {allKanbanBoards.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Selector para a fase do painel */}
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Escolha a Etapa</label>
                          <select
                            value={selectedKanbanStageId}
                            onChange={(e) => setSelectedKanbanStageId(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:ring-1 focus:ring-indigo-500 text-slate-650 font-semibold"
                          >
                            {allKanbanBoards.find(b => b.id === selectedKanbanBoardId)?.stages.map((stg: any) => (
                              <option key={stg.id} value={stg.id}>{stg.name}</option>
                            )) || <option value="">Sem etapas</option>}
                          </select>
                        </div>

                        {/* Custom Card Title */}
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Título do Card (Lead/Cliente)</label>
                          <input
                            type="text"
                            value={linkKanbanCardTitle}
                            onChange={(e) => setLinkKanbanCardTitle(e.target.value)}
                            placeholder="Nome do card ou cliente"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg focus:ring-1 focus:ring-indigo-500 font-medium text-slate-700"
                          />
                        </div>

                        {/* Submit Row */}
                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setShowLinkKanbanForm(false)}
                            className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 rounded-md uppercase font-bold transition-all cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!linkKanbanCardTitle.trim()) {
                                toast.error("Por favor, preencha o título do card.");
                                return;
                              }
                              if (!selectedKanbanStageId) {
                                toast.error("Dificuldade ao selecionar fase de destino.");
                                return;
                              }
                              
                              const newCardObj = createCard({
                                board_id: selectedKanbanBoardId,
                                stage_id: selectedKanbanStageId,
                                title: linkKanbanCardTitle.trim(),
                                description: `Iniciado através do atendimento ativo de ${activeCustomer?.name || 'Cliente'}.`,
                                conversation_id: activeConversationId || undefined,
                                customer_id: activeCustomer?.id || undefined,
                                responsible_id: currentUser?.id || undefined,
                                tags: activeCustomer?.tags || []
                              });

                              toast.success(`Card "${newCardObj.title}" criado e vinculado ao CRM!`);
                              setShowLinkKanbanForm(false);
                              refreshKanbanLinkage();
                            }}
                            className="px-2.5 py-1 text-[10px] text-white bg-indigo-600 hover:bg-indigo-700 rounded-md uppercase font-bold transition-all cursor-pointer shadow-sm"
                          >
                            Criar Card
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-slate-50 border border-dashed rounded-2xl select-none">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Sem vínculo no CRM</p>
                        <button
                          onClick={() => {
                            if (allKanbanBoards.length > 0) {
                              const b = allKanbanBoards[0];
                              setSelectedKanbanBoardId(b.id);
                              setSelectedKanbanStageId(b.stages[0]?.id || "");
                            }
                            setLinkKanbanCardTitle(activeCustomer?.name || "");
                            setShowLinkKanbanForm(true);
                          }}
                          className="px-3 py-1.5 bg-white border text-[9px] font-black uppercase text-indigo-600 border-indigo-150 hover:bg-indigo-50 rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          Vincular a um Painel
                        </button>
                      </div>
                    )}
                  </section>

                  {/* GOOGLE SHEETS & CUSTOM FIELDS */}
                  <section className="border-t border-slate-100 pt-5 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-blue-500" />
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Campos Customizados
                        </h4>
                      </div>
                      <button
                        onClick={() => setShowAddFieldForm(!showAddFieldForm)}
                        className="text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:text-blue-800 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Adicionar Campo
                      </button>
                    </div>

                    {/* Inline custom field creator */}
                    {showAddFieldForm && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl mb-4 space-y-3 shadow-inner">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Nome do Campo
                          </label>
                          <input
                            type="text"
                            value={newFieldName}
                            onChange={(e) => setNewFieldName(e.target.value)}
                            placeholder="Ex: Reserva Confirmada"
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Tipo do Campo
                          </label>
                          <select
                            value={newFieldType}
                            onChange={(e) => setNewFieldType(e.target.value as any)}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium text-slate-600"
                          >
                            <option value="text">Texto</option>
                            <option value="number">Número</option>
                            <option value="boolean">Sim/Não (Opção)</option>
                          </select>
                        </div>
                        <div className="flex gap-2 justify-end pt-1">
                          <button
                            onClick={() => {
                              setShowAddFieldForm(false);
                              setNewFieldName("");
                            }}
                            className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 rounded-md uppercase font-bold transition-all cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleCreateCustomField}
                            className="px-2.5 py-1 text-[10px] text-white bg-blue-600 hover:bg-blue-700 rounded-md uppercase font-bold transition-all cursor-pointer"
                          >
                            Criar Campo
                          </button>
                        </div>
                      </div>
                    )}

                    {customFieldDefs.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-1">Nenhum campo customizado criado.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {customFieldDefs.map((def) => {
                          const val = activeCustomValues[def.id];
                          return (
                            <div key={def.id} className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[150px]" title={def.name}>
                                  {def.name}
                                </span>
                                <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest">
                                  {def.type === "boolean" ? "Sim/Não" : def.type === "number" ? "Número" : "Texto"}
                                </span>
                              </div>

                              {def.type === "boolean" ? (
                                <label className="relative flex items-center gap-2 cursor-pointer py-0.5 select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!val}
                                    onChange={(e) => handleUpdateCustomFieldValue(def.id, e.target.checked)}
                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                  <span className={`text-xs font-bold ${val ? "text-emerald-600" : "text-slate-500"}`}>
                                    {val ? "Sim (Confirmado)" : "Não"}
                                  </span>
                                </label>
                              ) : (
                                <input
                                  type={def.type === "number" ? "number" : "text"}
                                  value={val === undefined || val === null ? "" : val}
                                  onChange={(e) => handleUpdateCustomFieldValue(def.id, def.type === "number" ? parseFloat(e.target.value) || "" : e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-slate-700 font-medium"
                                  placeholder={`Preencher ${def.name.toLowerCase()}`}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* GOOGLE SHEETS SYNC STATUS PANEL */}
                  <section className="border-t border-slate-100 pt-5 mt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="w-4 h-4 text-emerald-600 fill-current" viewBox="0 0 24 24">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9.33 17H7.5v-1.67H9.33V17m0-3.33H7.5V12h1.33v1.67M12.67 17H11v-1.67h1.67V17m0-3.33H11V12h1.67v1.67M16 17h-1.67v-1.67H16V17m0-3.33h-1.67V12H16v1.67M17 9H7V7h10v2z"/>
                      </svg>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Conexão com Planilha
                      </h4>
                    </div>

                    {!gUser ? (
                      <div className="p-4 bg-slate-50 border border-slate-200 border-dashed rounded-2xl text-center space-y-3">
                        <p className="text-[11px] leading-relaxed text-slate-400 font-medium">
                          Vincule sua conta Google com permissão para planilhar todos os atendimentos do CRM em tempo real.
                        </p>
                        <button
                          onClick={handleGoogleLogin}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                          <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                            <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.73 5.73 0 0 1 8.24 12.8a5.73 5.73 0 0 1 5.751-5.714c2.519 0 4.114 1.48 4.114 1.48l2.91-2.91s-2.812-2.583-7.024-2.583c-6.19 0-11 4.81-11 11s4.81 11 11 11c6.19 0 10.514-4.21 10.514-10.514a9.9 9.9 0 0 0-.154-1.783z"/>
                          </svg>
                          Conectar Conta Google
                        </button>

                        {authDomainError && (
                          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-2">
                            <div className="flex items-center gap-1.5 text-amber-800 font-bold text-xs">
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Domínio Não Autorizado</span>
                            </div>
                            <p className="text-[10px] text-amber-700 leading-normal">
                              Este erro (<code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-[9px]">auth/unauthorized-domain</code>) indica que o domínio deste ambiente de testes não está liberado no Firebase do seu projeto.
                            </p>
                            <div className="bg-white border border-amber-200 p-2 rounded-lg space-y-1.5">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Domínio Atual:</span>
                              <div className="flex items-center justify-between gap-2 overflow-x-hidden">
                                <span className="font-mono text-[9px] text-slate-600 truncate p-1 bg-slate-50 rounded border flex-1 leading-none select-all font-semibold">
                                  {window.location.hostname}
                                </span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(window.location.hostname);
                                    toast.success("Domínio copiado para a área de transferência!");
                                  }}
                                  className="p-1 px-2 bg-amber-600 hover:bg-amber-700 text-white text-[9px] rounded font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                  Copiar
                                </button>
                              </div>
                            </div>
                            <div className="text-[9px] text-amber-800 space-y-1 pl-1">
                              <p className="font-bold">Como resolver no Firebase Console:</p>
                              <ol className="list-decimal pl-3 space-y-1">
                                <li>Acesse o <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold text-amber-900">Console do Firebase</a> e abra seu projeto</li>
                                <li>Vá em <span className="font-bold">Authentication</span> &gt; aba <span className="font-bold">Settings</span> &gt; <span className="font-bold">Authorized Domains</span></li>
                                <li>Clique em <span className="font-bold">Add Domain</span>, cole o domínio acima e salve</li>
                                <li>Após salvar, clique novamente em "Conectar Conta Google"</li>
                              </ol>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="font-bold text-emerald-700 text-[11px]">Sincronização Ativa</span>
                          </div>
                          
                          <div className="border-t border-slate-200 mt-20 mt-2 pt-2">
                            <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">ID da Planilha (Clique para Abrir)</label>
                            <div className="flex items-center gap-1.5">
                              {isEditingSheetId ? (
                                <>
                                  <input
                                    type="text"
                                    value={spreadsheetId}
                                    onChange={(e) => setSpreadsheetId(e.target.value)}
                                    className="flex-1 px-2 py-1 text-[11px] border border-slate-200 rounded focus:outline-none bg-white font-mono"
                                    placeholder="Spreadsheet ID"
                                  />
                                  <button
                                    onClick={handleSaveSheetId}
                                    className="px-2 py-1 bg-blue-600 text-white text-[10px] rounded font-bold hover:bg-blue-700 transition"
                                  >
                                    Salvar
                                  </button>
                                </>
                              ) : (
                                <>
                                  <a
                                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
                                    target="_blank"
                                    referrerPolicy="no-referrer"
                                    className="font-mono text-[10px] text-blue-600 hover:underline truncate flex-1 leading-normal select-all font-bold"
                                    title="Abrir planilha no Google Docs"
                                  >
                                    {spreadsheetId}
                                  </a>
                                  <button
                                    onClick={() => setIsEditingSheetId(true)}
                                    className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition"
                                    title="Mudar ID da Planilha"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                          
                          <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between text-[10px]">
                            <span className="text-slate-400">Google Link:</span>
                            <span className="font-bold text-slate-600 truncate max-w-[130px]" title={gUser.email || ""}>
                              {gUser.displayName || gUser.email}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={handleSyncActiveConversation}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-bold transition-all shadow active:scale-95 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Planilhar Atendimento
                          </button>
                          
                          <button
                            onClick={handleGoogleLogout}
                            title="Desconectar Conta Google"
                            className="p-2 bg-slate-50 hover:bg-red-50 hover:text-red-500 text-slate-400 rounded-xl border border-slate-200 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          onClick={handleSyncAllConversations}
                          disabled={isSyncingAll}
                          className={`w-full py-2 px-3 rounded-xl text-[11px] font-bold transition-all border border-emerald-300 flex items-center justify-center gap-1.5 cursor-pointer ${
                            isSyncingAll 
                              ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" 
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100/60 active:scale-95"
                          }`}
                        >
                          <svg className={`w-3.5 h-3.5 shrink-0 ${isSyncingAll ? "animate-spin text-slate-400" : "text-emerald-600 fill-current"}`} viewBox="0 0 24 24">
                            {isSyncingAll ? (
                              <path d="M12 4V2C6.48 2 2 6.48 2 12h2c0-4.41 3.59-8 8-8zm0 16c4.41 0 8-3.59 8-8h2c0 5.52-4.48 10-10 10v-2z"/>
                            ) : (
                              <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"/>
                            )}
                          </svg>
                          {isSyncingAll ? "Sincronizando lote..." : "Sincronizar Todas as Conversas"}
                        </button>
                      </div>
                    )}
                  </section>

                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <Database className="w-4 h-4 text-slate-400" />
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                        Ações Adicionais
                      </h4>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={() => toast.info("Histórico de pedidos em breve")}
                        className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl transition-all text-[10px] font-bold text-slate-600 uppercase tracking-widest border border-slate-100"
                      >
                        <span>Ver Últimos Pedidos</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                      </button>
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="p-12 text-center h-full flex flex-col items-center justify-center bg-slate-50/30">
            <Info className="w-8 h-8 text-slate-300 mb-4" />
            <p className="text-sm text-slate-400 font-medium">
              Selecione um cliente para ver os detalhes
            </p>
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
                <div
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${isRecording ? "bg-red-500 scale-110 shadow-2xl shadow-red-200 animate-pulse" : "bg-blue-50 text-blue-600"}`}
                >
                  {isRecording ? (
                    <Square
                      className="w-8 h-8 text-white cursor-pointer"
                      onClick={stopRecording}
                    />
                  ) : (
                    <Mic className="w-10 h-10" />
                  )}
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                    {isRecording
                      ? "Gravando Áudio"
                      : audioUrl
                        ? "Prévia do Áudio"
                        : "Gravar Mensagem de Voz"}
                  </h3>
                  <p className="text-4xl font-black text-slate-800 mt-2 font-mono">
                    {formatTime(recordingTime)}
                  </p>
                </div>

                {isRecording && (
                  <div className="w-full space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-bold uppercase tracking-wider">
                      <span>Volume de Entrada</span>
                      <span>{(liveVolume * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
                      <motion.div
                        className="bg-blue-600 h-full rounded-full"
                        animate={{ width: `${Math.min(100, liveVolume * 300)}%` }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      />
                    </div>
                    {isSilentWarning && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl p-3 font-semibold mt-2 animate-pulse">
                        ⚠️ Não estou detectando som no microfone. Verifique se o microfone correto está selecionado nas configurações de privacidade do navegador.
                      </p>
                    )}
                  </div>
                )}

                {audioUrl && !isRecording && (
                  <div className="w-full bg-slate-50 p-4 rounded-3xl border border-slate-100 flex flex-col gap-3">
                    <audio src={audioUrl} controls className="w-full" />
                    {recordedAudioFile && (
                      <div className="flex justify-between items-center text-xs text-slate-500 font-mono bg-white p-2.5 rounded-xl border border-slate-100">
                        <span>MIME: <strong className="text-slate-750">{recordedAudioFile.type}</strong></span>
                        <span>Tamanho: <strong className="text-slate-750">{(recordedAudioFile.size / 1024).toFixed(1)} KB</strong></span>
                      </div>
                    )}
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
                        onClick={cancelRecordedAudio}
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
                        {isSendingMedia ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        {isSendingMedia ? "Enviando..." : "Enviar Áudio"}
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

        {showMultiImagePreview && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isSendingImages) handleCancelMultiImage();
              }}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden z-10"
            >
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                    Enviar {selectedImageFiles.length === 1 ? "Foto" : `${selectedImageFiles.length} Fotos`}
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    Viva Destinos Omnichannel
                  </p>
                </div>
                <button
                  onClick={handleCancelMultiImage}
                  disabled={isSendingImages}
                  className="p-3 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-2xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {imagePreviewUrls.map((url, index) => (
                    <div key={index} className="relative aspect-square bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden group">
                      <img
                        src={url}
                        className="w-full h-full object-cover"
                        alt={`Preview ${index + 1}`}
                      />
                      {!isSendingImages && (
                        <button
                          type="button"
                          onClick={() => handleRemoveImageFile(index)}
                          className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                    Legenda Opcional
                  </label>
                  <textarea
                    rows={2}
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-sm resize-none"
                    placeholder="Digite uma legenda para a sua mídia..."
                    value={imageCaption}
                    onChange={(e) => setImageCaption(e.target.value)}
                    disabled={isSendingImages}
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <button
                    onClick={handleCancelMultiImage}
                    disabled={isSendingImages}
                    className="flex-1 p-5 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSendImages}
                    disabled={isSendingImages}
                    className="flex-[2] p-5 bg-blue-600 text-white rounded-[1.5rem] text-xs font-black uppercase tracking-widest shadow-xl shadow-blue-100 hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                  >
                    {isSendingImages ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />{" "}
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> {selectedImageFiles.length === 1 ? "Enviar Foto" : `Enviar ${selectedImageFiles.length} Fotos`}
                      </>
                    )}
                  </button>
                </div>
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
              onClick={() => {
                if (!isSendingMedia) setShowMediaPreview(false);
              }}
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
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                    Enviar{" "}
                    {mediaType === "image"
                      ? "Foto"
                      : mediaType === "video"
                        ? "Vídeo"
                        : "Documento"}
                  </h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                    Viva Destinos Omnichannel
                  </p>
                </div>
                <button
                  onClick={() => setShowMediaPreview(false)}
                  className="p-3 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-2xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                {mediaType !== "document" && mediaPreviewUrl && (
                  <div className="w-full aspect-video bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden flex items-center justify-center">
                    {mediaType === "image" ? (
                      <img
                        src={mediaPreviewUrl}
                        className="max-w-full max-h-full object-contain"
                        alt="Preview"
                      />
                    ) : (
                      <video
                        src={mediaPreviewUrl}
                        controls
                        className="max-w-full max-h-full"
                      />
                    )}
                  </div>
                )}

                {mediaType === "document" && selectedFile && (
                  <div className="p-8 bg-blue-50 border border-blue-100 rounded-3xl flex flex-col items-center gap-4">
                    <div className="w-20 h-20 bg-white rounded-2xl shadow-md flex items-center justify-center text-blue-600">
                      <FileIcon className="w-10 h-10" />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-slate-800">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                )}

                {(mediaType === "image" || mediaType === "video") && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">
                      Legenda Opcional
                    </label>
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
                        <RefreshCw className="w-4 h-4 animate-spin" />{" "}
                        Enviando...
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

        <MetaTemplateSenderModal
          isOpen={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          conversationId={activeConversationId || ""}
          onSuccess={async () => {
            if (activeConversationId) {
              await loadMessages(activeConversationId, true);
              await loadConversations(true);
            }
          }}
        />

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
                  <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider">
                    Nova Conversa Manual
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Inicie um atendimento proativo via WhatsApp
                  </p>
                </div>
                <button
                  onClick={() => setShowNewChatModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl text-slate-400"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateChat} className="p-8 space-y-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                        Canal de Envio
                      </label>
                      <select
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                        value={newChatData.accountId}
                        onChange={(e) => {
                          const accId = e.target.value;
                          const selectedAcc = safeAccounts.find((a) => a.id === accId);
                          const isMeta = selectedAcc?.provider === "META_CLOUD";
                          setNewChatData({
                            ...newChatData,
                            accountId: accId,
                          });
                          setSelectedMetaTemplate(null);
                          setSelectedLocalTemplate(null);
                          setMetaTemplateVariables({});
                          setManualMessageText("");
                          setTemplateType(isMeta ? "official" : "none");
                        }}
                      >
                        <option value="">Selecione um canal</option>
                        {(() => {
                          const seen = new Set();
                          return safeAccounts.filter(acc => {
                            if (!acc.id) return false;
                            if (seen.has(acc.id)) return false;
                            seen.add(acc.id);
                            return true;
                          });
                        })().map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} (
                            {acc.status === "CONNECTED" ? "Ativo" : "Off"})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                        Equipe Responsável
                      </label>
                      <select
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                        value={newChatData.teamId}
                        onChange={(e) =>
                          setNewChatData({
                            ...newChatData,
                            teamId: e.target.value,
                          })
                        }
                      >
                        <option value="">Selecione uma equipe</option>
                        {safeTeams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                      Selecione o Cliente
                    </label>
                    <select
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none"
                      value={newChatData.customerId}
                      onChange={(e) =>
                        setNewChatData({
                          ...newChatData,
                          customerId: e.target.value,
                        })
                      }
                    >
                      <option value="">Novo Cliente...</option>
                      {safeCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} - {c.phone}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!newChatData.customerId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                          Nome Completo
                        </label>
                        <input
                          type="text"
                          placeholder="Nome do cliente..."
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                          value={newChatData.newName}
                          onChange={(e) =>
                            setNewChatData({
                              ...newChatData,
                              newName: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                          Telefone WhatsApp
                        </label>
                        <input
                          type="tel"
                          placeholder="(99) 99999-9999"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium"
                          value={newChatData.newPhone}
                          onChange={(e) =>
                            setNewChatData({
                              ...newChatData,
                              newPhone: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}

                  {(() => {
                    const selectedAccount = safeAccounts.find((a) => a.id === newChatData.accountId);
                    const isMetaAccountSelected = selectedAccount?.provider === "META_CLOUD";
                    
                    const getTemplateVariablesKeys = (bodyText: string): string[] => {
                      if (!bodyText) return [];
                      const matches = bodyText.match(/\{\{([0-9]+)\}\}/g);
                      if (!matches) return [];
                      const keys = matches.map(m => m.replace(/\{\{|\}\}/g, "")).sort((a, b) => Number(a) - Number(b));
                      return Array.from(new Set(keys));
                    };

                    if (!newChatData.accountId) return null;

                    return (
                      <div className="space-y-4 border-t border-slate-100 pt-5 text-left">
                        {/* Segmented Selector for Template Type */}
                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-1">
                            Tipo de Mensagem Inicial
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTemplateType("official");
                                setSelectedMetaTemplate(null);
                                setMetaTemplateVariables({});
                                setManualMessageText("");
                              }}
                              className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                                templateType === "official"
                                  ? "border-blue-600 bg-blue-50/50 text-blue-700 shadow-sm"
                                  : "border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100/80"
                              }`}
                            >
                              Modelo de Mensagem (Templates)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                  setTemplateType("local");
                                  setSelectedLocalTemplate(null);
                                  setManualMessageText("");
                              }}
                              className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                                  templateType === "local"
                                    ? "border-blue-600 bg-blue-50/50 text-blue-700 shadow-sm"
                                    : "border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100/80"
                              }`}
                            >
                              Modelo Local (Não Oficial)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setTemplateType("none");
                                setSelectedLocalTemplate(null);
                                setManualMessageText("");
                              }}
                              className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                                templateType === "none"
                                  ? "border-blue-600 bg-blue-50/50 text-blue-700 shadow-sm"
                                  : "border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100/80"
                              }`}
                            >
                              Sem Modelo (Livre)
                            </button>
                          </div>
                        </div>

                        {/* Renders Section Based on Chosen templateType */}
                        {templateType === "official" && (
                          <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="space-y-1.5 text-left">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">
                                Selecione o Modelo Aprovado <span className="text-red-500">*</span>
                              </label>
                              <select
                                id="modal_meta_template_select"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none font-medium"
                                value={selectedMetaTemplate?.id || ""}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  const templateObj = metaTemplatesForModal.find(t => t.id === selectedId || t.meta_template_id === selectedId);
                                  setSelectedMetaTemplate(templateObj || null);
                                  setMetaTemplateVariables({});
                                }}
                                required
                              >
                                <option value="">Selecione um modelo aprovado...</option>
                                {(() => {
                                  const seen = new Set<string>();
                                  return metaTemplatesForModal.filter((t) => {
                                    const key = t.id || t.meta_template_id || t.name;
                                    if (!key) return false;
                                    if (seen.has(key)) return false;
                                    seen.add(key);
                                    return true;
                                  });
                                })().map((t, idx) => (
                                  <option key={`${t.id || t.meta_template_id || t.name || ''}_${idx}`} value={t.id || t.meta_template_id || t.name}>
                                    {t.display_name || t.name} ({t.category} - {t.language})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {selectedMetaTemplate && (
                              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Pré-visualização do Modelo</label>
                                <div className="p-3 bg-white border border-slate-100 rounded-xl">
                                  {selectedMetaTemplate.header_text && (
                                    <div className="font-bold text-slate-800 text-xs border-b border-slate-100 pb-1 mb-2">
                                      {selectedMetaTemplate.header_text}
                                    </div>
                                  )}
                                  <p className="text-slate-600 text-xs whitespace-pre-wrap leading-relaxed">
                                    {selectedMetaTemplate.body_text}
                                  </p>
                                  {selectedMetaTemplate.footer_text && (
                                    <p className="text-[10px] text-slate-400 italic mt-2">
                                      {selectedMetaTemplate.footer_text}
                                    </p>
                                  )}
                                </div>

                                {/* Dynamic variable inputs */}
                                {getTemplateVariablesKeys(selectedMetaTemplate.body_text).length > 0 && (
                                  <div className="space-y-3 pt-2">
                                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Preencher Variáveis do Modelo</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      {getTemplateVariablesKeys(selectedMetaTemplate.body_text).map((key) => (
                                        <div key={key} className="space-y-1 text-left">
                                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                                            Variável {"{{"} {key} {"}}"}
                                          </label>
                                          <input
                                            type="text"
                                            required
                                            placeholder={`Valor para {{${key}}}...`}
                                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-xs font-semibold"
                                            value={metaTemplateVariables[key] || ""}
                                            onChange={(e) => {
                                              setMetaTemplateVariables({
                                                ...metaTemplateVariables,
                                                [key]: e.target.value
                                              });
                                            }}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {templateType === "local" && (
                          <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="space-y-1.5 text-left">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">
                                Selecione o Modelo Local (Não Oficial) <span className="text-red-500">*</span>
                              </label>
                              <select
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm appearance-none font-medium"
                                value={selectedLocalTemplate?.id || ""}
                                onChange={(e) => {
                                  const selectedId = e.target.value;
                                  const templateObj = quickReplies.find(qr => String(qr.id) === selectedId);
                                  setSelectedLocalTemplate(templateObj || null);
                                  setManualMessageText(templateObj ? templateObj.content : "");
                                }}
                                required
                              >
                                <option value="">Selecione um modelo local...</option>
                                {quickReplies.map((qr) => (
                                  <option key={qr.id} value={qr.id}>
                                    {qr.shortcut}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-1.5 text-left">
                              <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">
                                Pré-visualização e Edição do Texto
                              </label>
                              <textarea
                                rows={4}
                                placeholder="Conteúdo do modelo..."
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-xs font-semibold leading-relaxed"
                                value={manualMessageText}
                                onChange={(e) => setManualMessageText(e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        {templateType === "none" && (
                          <div className="space-y-2 animate-in fade-in duration-200">
                            <label className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">
                              Mensagem Inicial (Opcional)
                            </label>
                            <textarea
                              rows={3}
                              placeholder="Digite uma mensagem para ser enviada automaticamente ao iniciar a conversa..."
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 transition-all text-xs font-semibold leading-relaxed"
                              value={manualMessageText}
                              onChange={(e) => setManualMessageText(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center justify-end gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setShowNewChatModal(false)}
                    className="px-6 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3 bg-blue-600 text-white font-bold text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-100 transition-all hover:bg-blue-700"
                  >
                    Iniciar Chat
                  </button>
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
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTransferModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden"
            >
              <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                  Transferir Atendimento
                </h2>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="p-2 hover:bg-white rounded-xl text-slate-400 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    Tipo de Transferência
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() =>
                        setTransferData({ ...transferData, type: "queue" })
                      }
                      className={`py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${transferData.type === "queue" ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-[1.02]" : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"}`}
                    >
                      Fila da Equipe
                    </button>
                    <button
                      onClick={() =>
                        setTransferData({ ...transferData, type: "user" })
                      }
                      className={`py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${transferData.type === "user" ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-[1.02]" : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"}`}
                    >
                      Usuário Específico
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    Equipe de Destino
                  </label>
                  <select
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none"
                    value={transferData.teamId}
                    onChange={(e) => {
                      setTransferData({
                        ...transferData,
                        teamId: e.target.value,
                        userId: "",
                      });
                      loadTransferMembers(e.target.value);
                    }}
                  >
                    <option value="">Selecione uma equipe...</option>
                    {teams
                      .filter((t) => t.is_active)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>

                {transferData.type === "user" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                      Atendente de Destino
                    </label>
                    <div className="relative">
                      <select
                        disabled={
                          !transferData.teamId || loadingTransferMembers
                        }
                        className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all appearance-none disabled:opacity-50"
                        value={transferData.userId}
                        onChange={(e) =>
                          setTransferData({
                            ...transferData,
                            userId: e.target.value,
                          })
                        }
                      >
                        <option value="">Selecione um atendente...</option>
                        {transferMembers.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.user_name}
                          </option>
                        ))}
                      </select>
                      {loadingTransferMembers && (
                        <RefreshCw className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-600" />
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    Motivo/Observação (Opcional)
                  </label>
                  <textarea
                    placeholder="Ex: Cliente solicita suporte comercial avançado..."
                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm min-h-[100px] outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none font-medium text-slate-600"
                    value={transferData.reason}
                    onChange={(e) =>
                      setTransferData({
                        ...transferData,
                        reason: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="px-6 py-3 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleTransfer}
                  disabled={
                    !transferData.teamId ||
                    (transferData.type === "user" && !transferData.userId)
                  }
                  className={`px-10 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${transferData.teamId && (transferData.type === "queue" || transferData.userId) ? "bg-blue-600 text-white shadow-blue-100 hover:scale-105 active:scale-95" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                >
                  Concluir Transferência
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Close Modal */}
      <AnimatePresence>
        {showCloseModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCloseModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8"
            >
              <h2 className="text-lg font-bold text-slate-800 mb-6">
                Finalizar Atendimento
              </h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Motivo da Finalização
                  </label>
                  <select
                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl"
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                  >
                    <option value="">Escolha um motivo...</option>
                    <option value="Dúvida Sanada">Dúvida Sanada</option>
                    <option value="Cotação Enviada">Cotação Enviada</option>
                    <option value="Reserva Confirmada">
                      Reserva Confirmada
                    </option>
                    <option value="Spam/Erro">Spam / Erro</option>
                    <option value="Sem Retorno do Cliente">
                      Sem Retorno do Cliente
                    </option>
                  </select>
                </div>
                <textarea
                  placeholder="Observações finais (opcional)..."
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl min-h-[100px] text-sm"
                />
              </div>
              <div className="flex justify-end gap-3 mt-8">
                <button
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 text-slate-500 font-bold text-xs uppercase"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest"
                >
                  Finalizar Agora
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <TagManagementModal
        isOpen={showTagManagement}
        onClose={() => setShowTagManagement(false)}
        tags={tags}
        onAdd={addTag}
        onUpdate={updateTag}
        onDelete={deleteTag}
      />

      <LeadDetailsModal
        isOpen={showLeadDetails}
        onClose={() => setShowLeadDetails(false)}
        details={leadDetails}
        loading={loadingDetails}
        onUnlinkTag={(tagId) => handleUnlinkTag(leadDetails?.id, tagId)}
      />

      <FilterPanel
        isOpen={showFilterPanel}
        onClose={() => setShowFilterPanel(false)}
        teams={teams}
        tags={tags}
        accounts={whatsAppAccounts}
        users={users}
        selectedTagIds={selectedTagIds}
        setSelectedTagIds={setSelectedTagIds}
        selectedAccountIds={selectedAccountIds}
        setSelectedAccountIds={setSelectedAccountIds}
        selectedUserIds={selectedUserIds}
        setSelectedUserIds={setSelectedUserIds}
        tagSearch={tagSearch}
        setTagSearch={setTagSearch}
      />
    </div>
  );
}
