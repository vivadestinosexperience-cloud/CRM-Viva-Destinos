/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../integrations/supabase/client';
import { 
  User, 
  Team, 
  WhatsAppAccount, 
  Customer, 
  Conversation, 
  Message,
  InternalMessage,
  Campaign,
  CampaignRecipient,
  Tag,
  InternalNote
} from '../types';
import {
  profilesService,
  teamService,
  queueService,
  whatsappService,
  customerService,
  conversationService,
  messageService,
  tagService,
  noteService,
  campaignService,
  campaignRecipientService
} from '../services/dataService';
import { toast } from 'sonner';
import { renderSafeText } from '../utils/renderSafeText';
import { getApiBaseUrl } from '../services/api';
import { normalizeBrazilPhone } from '../utils/phoneUtils';

interface AppearanceSettings {
  logoUrl: string;
  companyName: string;
  systemName: string;
  primaryColor: string;
  theme: 'light' | 'dark' | 'system';
  menuStyle: 'sidebar' | 'top' | 'compact';
  density: 'comfortable' | 'compact';
}

interface AppState {
  // Auth
  currentUser: User | null;
  
  // Settings
  appearance: AppearanceSettings;
  permissions: Record<string, string[]>;
  
  // Data
  users: User[];
  teams: Team[];
  whatsAppAccounts: WhatsAppAccount[];
  customers: Customer[];
  conversations: Conversation[];
  messages: Message[];
  campaigns: Campaign[];
  campaignRecipients: CampaignRecipient[];
  tags: Tag[];
  internalNotes: InternalNote[];
  
  // Internal Chat
  internalMessages: InternalMessage[];
  
  // UI State
  isLoading: boolean;
  isSaving: boolean;
  lastSyncAt: string | null;
  error: string | null;

  // Actions
  setAppearance: (settings: Partial<AppearanceSettings>) => void;
  setCurrentUser: (user: User | null) => void;
  setUserStatus: (userId: string, status: string) => void;
  
  // Initialization & Sync
  initializeAppData: () => Promise<void>;
  refreshData: () => Promise<void>;
  setupRealtimeListeners: () => void;

  // User CRUD
  addUser: (user: User) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;

  // Teams CRUD
  addTeam: (team: Team) => Promise<void>;
  updateTeam: (team: Team) => Promise<void>;
  deleteTeam: (id: string) => Promise<void>;
  
  // WhatsApp CRUD
  addWhatsAppAccount: (account: WhatsAppAccount) => Promise<void>;
  updateWhatsAppAccount: (account: WhatsAppAccount) => Promise<void>;
  deleteWhatsAppAccount: (id: string) => Promise<void>;

  // Customers
  addCustomer: (customer: Customer) => Promise<void>;
  updateCustomer: (customer: Customer) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;

  // Conversations
  addMessage: (message: Message) => Promise<void>;
  updateMessage: (id: string, updates: Partial<Message>) => Promise<void>;
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>;
  addConversation: (conversation: Partial<Conversation>) => Promise<void>;
  
  // Campaigns
  addCampaign: (campaign: Partial<Campaign>, recipients?: Partial<CampaignRecipient>[]) => Promise<Campaign>;
  updateCampaign: (id: string, updates: Partial<Campaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  pauseCampaign: (id: string) => Promise<void>;
  resumeCampaign: (id: string) => Promise<void>;
  cancelCampaign: (id: string) => Promise<void>;

  retryFailedCampaign: (id: string) => Promise<void>;
  processCampaignBatch: (id: string) => Promise<void>;
  getCampaignDebugInfo: (id: string) => Promise<any>;
  getSystemDebugInfo: () => Promise<any>;

  // Campaign Recipients
  getCampaignRecipients: (campaignId: string) => Promise<CampaignRecipient[]>;
  updateCampaignRecipient: (id: string, updates: Partial<CampaignRecipient>) => Promise<void>;

  // Tags CRUD
  addTag: (tag: Tag) => Promise<void>;
  updateTag: (tag: Tag) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;

  // Internal Note Actions
  addInternalNote: (note: Partial<InternalNote>) => Promise<void>;
  updateInternalNote: (id: string, updates: Partial<InternalNote>) => Promise<void>;
  deleteInternalNote: (id: string) => Promise<void>;
  
  // Internal Chat Actions
  addInternalMessage: (message: InternalMessage) => void;
  
  // New actions for API sync
  fetchConversationMessages: (conversationId: string) => Promise<void>;
  
  // Generic reset
  resetState: () => void;
}

const DEFAULT_APPEARANCE: AppearanceSettings = {
  logoUrl: 'https://i.postimg.cc/GpgPT0mq/Chat-GPT-Image-17-05-2026-11-32-44.png',
  companyName: 'Viva Destinos Experience',
  systemName: 'Viva CRM',
  primaryColor: '#2563eb', // Blue-600
  theme: 'light',
  menuStyle: 'sidebar',
  density: 'comfortable',
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      appearance: DEFAULT_APPEARANCE,
      permissions: {},
      users: [],
      teams: [],
      whatsAppAccounts: [],
      customers: [],
      conversations: [],
      messages: [],
      campaigns: [],
      campaignRecipients: [],
      tags: [],
      internalNotes: [],
      internalMessages: [],
      
      isLoading: false,
      isSaving: false,
      lastSyncAt: null,
      error: null,

      setAppearance: (newSettings) => set((state) => ({ 
        appearance: { ...state.appearance, ...newSettings } 
      })),
      
      setCurrentUser: (user) => set({ currentUser: user }),

      setUserStatus: (userId, status) => set((state) => ({
        users: state.users.map(u => u.id === userId ? { ...u, status } : u)
      })),

      initializeAppData: async () => {
        set({ isLoading: true, error: null });
        try {
          // Fetch current user FIRST
          const { authService } = await import('../services/authService');
          const { user } = await authService.getCurrentUser();
          
          if (user) {
            set({ currentUser: user });
          }

          const [
            users,
            teams,
            whatsapp,
            customers,
            conversations,
            messages,
            tags,
            campaigns
          ] = await Promise.all([
            profilesService.list(),
            teamService.list(),
            whatsappService.list(),
            customerService.list(),
            conversationService.list(),
            messageService.list(),
            tagService.list(),
            campaignService.list()
          ]);

          // Fetch all notes
          let allNotes: InternalNote[] = [];
          try {
            const { data } = await supabase.from('conversation_notes').select('*');
            allNotes = data || [];
          } catch (e) {
            console.warn('Could not fetch all notes', e);
          }

          set({
            users: users || [],
            teams: teams || [],
            whatsAppAccounts: whatsapp || [],
            customers: customers || [],
            conversations: conversations || [],
            messages: messages || [],
            campaigns: campaigns || [],
            tags: tags || [],
            internalNotes: allNotes,
            lastSyncAt: new Date().toISOString(),
            isLoading: false
          });

          // Setup realtime listeners after initial load
          get().setupRealtimeListeners();
        } catch (err) {
          console.error('Failed to initialize app data', err);
          set({ isLoading: false, error: 'Falha ao sincronizar com servidor.' });
        }
      },

      setupRealtimeListeners: () => {
        // Avoid duplicate subscriptions
        supabase.removeAllChannels();

        // 1. Listen to Conversations
        const conversationChannel = supabase
          .channel('conversations-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_conversations' }, (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              set(state => {
                const conv = newRecord as Conversation;
                const matchIndex = state.conversations.findIndex(c => c.id === conv.id);

                if (matchIndex > -1) {
                  const updatedConversations = [...state.conversations];
                  updatedConversations[matchIndex] = { ...updatedConversations[matchIndex], ...conv };
                  return { conversations: updatedConversations };
                }
                return { conversations: [conv, ...state.conversations] };
              });
              if (eventType === 'INSERT') toast.info(`Novo atendimento recebido`);
            } else if (eventType === 'DELETE') {
              set(state => ({
                conversations: state.conversations.filter(c => c.id !== oldRecord.id)
              }));
            }
          })
          .subscribe();

        // 2. Listen to Messages
        const messageChannel = supabase
          .channel('messages-realtime')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, (payload) => {
            console.log('Message insert received:', payload);
            const newMsg = payload.new as Message;
            
            // Add to state if not already there
            set(state => {
              if (state.messages.some(m => m.id === newMsg.id)) return state;
              
              const safeContent = renderSafeText(newMsg.content, "Mensagem recebida");
              const safeMsg = { ...newMsg, content: safeContent };
              
              // Find conversation to update its unread count and last message
              const updatedConversations = state.conversations.map(c => {
                if (c.id === safeMsg.conversation_id) {
                  return {
                    ...c,
                    last_message: safeContent,
                    last_message_at: safeMsg.created_at || new Date().toISOString(),
                    unread_count: safeMsg.sender_type === 'customer' ? (c.unread_count || 0) + 1 : c.unread_count
                  };
                }
                return c;
              });

              return { 
                messages: [...state.messages, safeMsg],
                conversations: updatedConversations
              };
            });

            if (newMsg.sender_type === 'customer') {
              toast.info(`Nova mensagem recebida`);
            }
          })
          .subscribe();

        // 3. Listen to Customers
        const customerChannel = supabase
          .channel('customers-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_customers' }, (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT') {
              set(state => ({ customers: [...state.customers, newRecord as Customer] }));
            } else if (eventType === 'UPDATE') {
              set(state => ({
                customers: state.customers.map(c => c.id === newRecord.id ? { ...c, ...newRecord } : c)
              }));
            }
          })
          .subscribe();

        // 4. Listen to Campaigns
        const campaignChannel = supabase
          .channel('campaigns-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_campaigns' }, (payload) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;
            if (eventType === 'INSERT' || eventType === 'UPDATE') {
              set(state => {
                const camp = newRecord as Campaign;
                const matchIndex = state.campaigns.findIndex(c => c.id === camp.id);
                if (matchIndex > -1) {
                  const updated = [...state.campaigns];
                  updated[matchIndex] = { ...updated[matchIndex], ...camp };
                  return { campaigns: updated };
                }
                return { campaigns: [camp, ...state.campaigns] };
              });
            } else if (eventType === 'DELETE') {
              set(state => ({
                campaigns: state.campaigns.filter(c => c.id !== oldRecord.id)
              }));
            }
          })
          .subscribe();

        // 5. SSE Fallback with auto-reconnection
        const baseUrl = getApiBaseUrl();
        let eventSource: EventSource | null = null;
        let reconnectTimeout: any = null;
        let isClosed = false;

        const connectSSE = () => {
          if (isClosed) return;

          if (eventSource) {
            eventSource.close();
          }

          eventSource = new EventSource(`${baseUrl}/api/events`);

          eventSource.onmessage = (event) => {
            try {
              const { event: eventName, data } = JSON.parse(event.data);
              if (eventName === 'message.received' && data && data.customer && data.conversation && data.message) {
                const { customer, conversation, message } = data;
                
                set(state => {
                  // Upsert customer with safety checks
                  const hasCustomer = Array.isArray(state.customers) && state.customers.some(c => c && customer && c.id === customer.id);
                  const updatedCustomers = hasCustomer 
                    ? state.customers.map(c => c && customer && c.id === customer.id ? { ...c, ...customer } : c)
                    : [...(Array.isArray(state.customers) ? state.customers : []), customer].filter(c => c && c.id);

                  // Upsert conversation and move to top with safety checks
                  const hasConv = Array.isArray(state.conversations) && state.conversations.some(c => c && conversation && c.id === conversation.id);
                  let updatedConversations;
                  if (hasConv) {
                    updatedConversations = [
                      conversation,
                      ...(Array.isArray(state.conversations) ? state.conversations : []).filter(c => c && conversation && c.id !== conversation.id)
                    ];
                  } else {
                    updatedConversations = [conversation, ...(Array.isArray(state.conversations) ? state.conversations : [])];
                  }

                  // Upsert message with safety checks
                  const hasMsg = Array.isArray(state.messages) && state.messages.some(m => m && message && m.id === message.id);
                  const updatedMessages = hasMsg
                    ? state.messages.map(m => m && message && m.id === message.id ? { ...m, ...message } : m)
                    : [...(Array.isArray(state.messages) ? state.messages : []), message].filter(m => m && m.id);

                  return {
                    customers: updatedCustomers.filter(item => item !== null && item !== undefined),
                    conversations: updatedConversations.filter(item => item !== null && item !== undefined),
                    messages: updatedMessages.filter(item => item !== null && item !== undefined)
                  };
                });

                if (message && message.sender_type === 'customer' && customer) {
                  toast.info(`Nova mensagem recebida de ${customer.name || 'Cliente'}`);
                }
              }
            } catch (err) {
              console.error('SSE Error:', err);
            }
          };

          eventSource.onerror = (err) => {
            console.warn('Store SSE Connection error. Retrying in 5 seconds...', err);
            if (eventSource) {
              eventSource.close();
            }
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
              connectSSE();
            }, 5000);
          };
        };

        connectSSE();

        return () => {
          isClosed = true;
          supabase.removeAllChannels();
          if (eventSource) {
            eventSource.close();
          }
          clearTimeout(reconnectTimeout);
        };
      },

      refreshData: async () => {
        await get().initializeAppData();
        toast.success('Dados sincronizados com sucesso!');
      },

      // User Actions
      addUser: async (user) => {
        set({ isSaving: true });
        try {
          const newUser = await profilesService.create(user);
          set((state) => ({ users: [...state.users, newUser], isSaving: false }));
        } catch (err) {
          set((state) => ({ users: [...state.users, user], isSaving: false }));
          toast.warning('Salvo localmente');
        }
      },
      updateUser: async (user) => {
        set({ isSaving: true });
        try {
          const updated = await profilesService.update(user.id, user);
          set((state) => ({
            users: state.users.map(u => u.id === user.id ? updated : u),
            isSaving: false
          }));
        } catch (err) {
          set((state) => ({
            users: state.users.map(u => u.id === user.id ? user : u),
            isSaving: false
          }));
          toast.warning('Atualizado localmente');
        }
      },
      deleteUser: async (id) => {
        set({ isSaving: true });
        try {
          await profilesService.remove(id);
          set((state) => ({ users: state.users.filter(u => u.id !== id), isSaving: false }));
        } catch (err) {
          set((state) => ({ users: state.users.filter(u => u.id !== id), isSaving: false }));
          toast.warning('Removido localmente');
        }
      },

      // Team Actions
      addTeam: async (team) => {
        set({ isSaving: true });
        try {
          const newTeam = await teamService.create(team);
          set((state) => ({ teams: [...state.teams, newTeam], isSaving: false }));
        } catch (err) {
          set((state) => ({ teams: [...state.teams, team], isSaving: false }));
          toast.warning('Salvo localmente');
        }
      },
      updateTeam: async (team) => {
        set({ isSaving: true });
        try {
          const updated = await teamService.update(team.id, team);
          set((state) => ({
            teams: state.teams.map(t => t.id === team.id ? updated : t),
            isSaving: false
          }));
        } catch (err) {
          set((state) => ({
            teams: state.teams.map(t => t.id === team.id ? team : t),
            isSaving: false
          }));
          toast.warning('Atualizado localmente');
        }
      },
      deleteTeam: async (id) => {
        set({ isSaving: true });
        try {
          await teamService.remove(id);
          set((state) => ({ teams: state.teams.filter(t => t.id !== id), isSaving: false }));
        } catch (err) {
          set((state) => ({ teams: state.teams.filter(t => t.id !== id), isSaving: false }));
          toast.warning('Removido localmente');
        }
      },

      fetchConversationMessages: async (conversationId: string) => {
        try {
          const fetchedMsgs = await messageService.listByConversation(conversationId);
          set(state => ({
            messages: [
              ...state.messages.filter(m => m.conversation_id !== conversationId),
              ...fetchedMsgs
            ]
          }));
        } catch (err) {
          console.error("Failed to fetch messages for conversation", conversationId, err);
        }
      },

      addInternalMessage: (message) => set((state) => ({
        internalMessages: [...state.internalMessages, message]
      })),

      // WhatsApp Actions
      addWhatsAppAccount: async (account) => {
        set({ isSaving: true });
        try {
          const newAccount = await whatsappService.create(account);
          set((state) => ({ whatsAppAccounts: [...state.whatsAppAccounts, newAccount], isSaving: false }));
        } catch (err) {
          set((state) => ({ whatsAppAccounts: [...state.whatsAppAccounts, account], isSaving: false }));
          toast.warning('Salvo localmente');
        }
      },
      updateWhatsAppAccount: async (account) => {
        set({ isSaving: true });
        try {
          const updated = await whatsappService.update(account.id, account);
          set((state) => ({
            whatsAppAccounts: state.whatsAppAccounts.map(a => a.id === account.id ? updated : a),
            isSaving: false
          }));
        } catch (err) {
          set((state) => ({
            whatsAppAccounts: state.whatsAppAccounts.map(a => a.id === account.id ? account : a),
            isSaving: false
          }));
          toast.warning('Atualizado localmente');
        }
      },
      deleteWhatsAppAccount: async (id) => {
        set({ isSaving: true });
        try {
          await whatsappService.remove(id);
          set((state) => ({ whatsAppAccounts: state.whatsAppAccounts.filter(a => a.id !== id), isSaving: false }));
        } catch (err) {
          set((state) => ({ whatsAppAccounts: state.whatsAppAccounts.filter(a => a.id !== id), isSaving: false }));
          toast.warning('Removido localmente');
        }
      },

      // Customer Actions
      addCustomer: async (customer) => {
        set({ isSaving: true });
        try {
          const normResult = normalizeBrazilPhone(customer.phone || "");
          const finalNormalized = normResult.phone || String(customer.phone || "").replace(/\D/g, "");
          
          const enrichedCustomer = {
            ...customer,
            phone_normalized: finalNormalized
          };
          
          const newCust = await customerService.create(enrichedCustomer);
          set((state) => ({ customers: [...state.customers, newCust], isSaving: false }));
        } catch (err) {
          const normResult = normalizeBrazilPhone(customer.phone || "");
          const finalNormalized = normResult.phone || String(customer.phone || "").replace(/\D/g, "");
          set((state) => ({ customers: [...state.customers, { ...customer, phone_normalized: finalNormalized }], isSaving: false }));
          toast.warning('Salvo localmente');
        }
      },
      updateCustomer: async (customer) => {
        set({ isSaving: true });
        try {
          const normResult = normalizeBrazilPhone(customer.phone || "");
          const finalNormalized = normResult.phone || String(customer.phone || "").replace(/\D/g, "");
          const enrichedCust = {
            ...customer,
            phone_normalized: finalNormalized
          };
          const updated = await customerService.update(customer.id, enrichedCust);
          set((state) => ({
            customers: state.customers.map(c => c.id === customer.id ? updated : c),
            isSaving: false
          }));
        } catch (err) {
          const normResult = normalizeBrazilPhone(customer.phone || "");
          const finalNormalized = normResult.phone || String(customer.phone || "").replace(/\D/g, "");
          const enrichedCust = {
            ...customer,
            phone_normalized: finalNormalized
          };
          set((state) => ({
            customers: state.customers.map(c => c.id === customer.id ? enrichedCust : c),
            isSaving: false
          }));
          toast.warning('Atualizado localmente');
        }
      },
      deleteCustomer: async (id) => {
        set({ isSaving: true });
        try {
          await customerService.remove(id);
          set((state) => ({ customers: state.customers.filter(c => c.id !== id), isSaving: false }));
        } catch (err) {
          set((state) => ({ customers: state.customers.filter(c => c.id !== id), isSaving: false }));
          toast.warning('Removido localmente');
        }
      },

      // Message/Conversation Actions
      addMessage: async (message) => {
        const safeContent = renderSafeText(message.content, "Mensagem enviada");
        const safeMessage = { ...message, content: safeContent };
        
        set((state) => ({ messages: [...state.messages, safeMessage] }));
        try {
          const conv = get().conversations.find(c => c.id === (safeMessage.conversation_id || safeMessage.conversationId));
          
          await messageService.create({
            conversation_id: safeMessage.conversation_id || safeMessage.conversationId,
            customer_phone_normalized: safeMessage.customer_phone_normalized || conv?.customer_phone_normalized,
            content: safeContent,
            sender_type: safeMessage.sender_type || 'agent',
            sender_name: safeMessage.sender_name,
            message_type: (safeMessage.message_type || safeMessage.type || 'text').toLowerCase() as any,
            is_internal: safeMessage.is_internal || safeMessage.message_type === 'internal_note',
            status: (safeMessage.status || 'sent').toLowerCase() as any
          });
        } catch (err) {
          console.error('Message only saved locally', err);
        }
      },

      updateMessage: async (id, updates) => {
        set((state) => ({
          messages: state.messages.map(m => m.id === id ? { ...m, ...updates } : m)
        }));
        try {
          await messageService.update(id, updates);
        } catch (err) {
          console.error('Message update only local', err);
        }
      },
      
      updateConversation: async (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map(c => c.id === id ? { ...c, ...updates } : c)
        }));
        try {
          await conversationService.update(id, updates);
        } catch (err) {
          console.error('Conversation update only local', err);
        }
      },

      addConversation: async (conv) => {
        set({ isSaving: true });
        try {
          // Find phone if not provided
          let phoneNormalized = conv.customer_phone_normalized;
          if (!phoneNormalized && conv.customer_id) {
            const cust = get().customers.find(c => c.id === conv.customer_id);
            if (cust) {
              phoneNormalized = cust.phone_normalized || normalizeBrazilPhone(cust.phone || "").phone;
            }
          }
          if (phoneNormalized) {
            phoneNormalized = normalizeBrazilPhone(phoneNormalized).phone;
          }

          const enrichedConv = {
            ...conv,
            customer_phone_normalized: phoneNormalized,
            last_message: renderSafeText(conv.last_message, "Conversa iniciada")
          };

          const newConv = await conversationService.create(enrichedConv);
          set((state) => ({ 
            conversations: [newConv, ...state.conversations.filter(c => c.customer_phone_normalized !== phoneNormalized)], 
            isSaving: false 
          }));
        } catch (err) {
          set((state) => ({ 
            conversations: [{ 
              id: `temp-${Date.now()}`, 
              ...conv, 
              last_message: renderSafeText(conv.last_message, "Conversa iniciada") 
            } as Conversation, ...state.conversations], 
            isSaving: false 
          }));
          toast.warning('Conexão instável, salvo localmente');
        }
      },

      // Campaign Actions
      addCampaign: async (campaign, recipients = []) => {
        set({ isSaving: true });
        try {
          const newCampaign = await campaignService.create({
            ...campaign,
            contacts: recipients,
            created_by: get().currentUser?.id
          });
          
          const campaignWithCount = {
            ...newCampaign,
            recipients_count: recipients?.length || 0
          };

          set((state) => ({ 
            campaigns: [campaignWithCount, ...state.campaigns],
            isSaving: false 
          }));
          return campaignWithCount;
        } catch (err) {
          console.error("Error creating campaign", err);
          set({ isSaving: false });
          throw err;
        }
      },
      updateCampaign: async (id, updates) => {
        set((state) => ({
          campaigns: state.campaigns.map(c => c.id === id ? { ...c, ...updates } : c)
        }));
        try {
          await campaignService.update(id, updates);
        } catch (err) {
          console.error('Campaign update error', err);
        }
      },
      deleteCampaign: async (id) => {
        set((state) => ({ campaigns: state.campaigns.filter(c => c.id !== id) }));
        try {
          await campaignService.remove(id);
          toast.success('Campanha excluída');
        } catch (err) {
          console.error('Campaign delete error', err);
        }
      },
      pauseCampaign: async (id) => {
        try {
          await campaignService.pause(id);
          set((state) => ({
            campaigns: state.campaigns.map(c => c.id === id ? { ...c, status: 'PAUSED' } : c)
          }));
          toast.info('Campanha pausada');
        } catch (err) {
          toast.error('Erro ao pausar campanha');
        }
      },
      resumeCampaign: async (id) => {
        try {
          await campaignService.resume(id);
          set((state) => ({
            campaigns: state.campaigns.map(c => c.id === id ? { ...c, status: 'SENDING' } : c)
          }));
          toast.info('Campanha retomada');
        } catch (err) {
          toast.error('Erro ao retomar campanha');
        }
      },
      cancelCampaign: async (id) => {
        try {
          await campaignService.cancel(id);
          set((state) => ({
            campaigns: state.campaigns.map(c => c.id === id ? { ...c, status: 'CANCELED' } : c)
          }));
          toast.info('Campanha cancelada');
        } catch (err) {
          toast.error('Erro ao cancelar campanha');
        }
      },
      retryFailedCampaign: async (id) => {
        try {
          const res = await campaignService.retryFailed(id);
          if (res.success) {
            toast.success('Retentativa iniciada');
          } else {
            throw new Error(res.error);
          }
        } catch (err: any) {
          toast.error('Erro ao reiniciar falhas: ' + err.message);
        }
      },
      processCampaignBatch: async (id) => {
        try {
          const res = await campaignService.processBatch(id);
          if (res.success) {
            toast.info('Lote processado!');
          } else {
            throw new Error(res.error);
          }
        } catch (err: any) {
          toast.error('Erro ao processar lote: ' + err.message);
        }
      },
      getCampaignDebugInfo: async (id) => {
        try {
          return await campaignService.getDebug(id);
        } catch (err: any) {
          toast.error('Erro ao buscar diagnóstico');
          return null;
        }
      },
      getSystemDebugInfo: async () => {
        try {
          return await campaignService.getSystemDebug();
        } catch (err: any) {
          toast.error('Erro ao buscar status do sistema');
          return null;
        }
      },

      // Campaign Recipients
      getCampaignRecipients: async (campaignId) => {
        try {
          const data = await campaignRecipientService.listByCampaign(campaignId);
          return data || [];
        } catch (err) {
          console.error('Failed to fetch recipients', err);
          return [];
        }
      },
      updateCampaignRecipient: async (id, updates) => {
        set((state) => ({
          campaignRecipients: state.campaignRecipients.map(r => r.id === id ? { ...r, ...updates } : r)
        }));
        try {
          await campaignRecipientService.update(id, updates);
        } catch (err) {
          console.error('Recipient update only local', err);
        }
      },

      // Tag Actions
      addTag: async (tag) => {
        set({ isSaving: true });
        try {
          const newTag = await tagService.create(tag);
          set((state) => ({ tags: [...state.tags, newTag], isSaving: false }));
        } catch (err) {
          set((state) => ({ tags: [...state.tags, tag], isSaving: false }));
          toast.warning('Etiqueta salva localmente');
        }
      },
      updateTag: async (tag) => {
        set({ isSaving: true });
        try {
          const updated = await tagService.update(tag.id, tag);
          set((state) => ({
            tags: state.tags.map(t => t.id === tag.id ? updated : t),
            isSaving: false
          }));
        } catch (err) {
          set((state) => ({
            tags: state.tags.map(t => t.id === tag.id ? tag : t),
            isSaving: false
          }));
          toast.warning('Etiqueta atualizada localmente');
        }
      },
      deleteTag: async (id) => {
        set({ isSaving: true });
        try {
          await tagService.remove(id);
          set((state) => ({ tags: state.tags.filter(t => t.id !== id), isSaving: false }));
        } catch (err) {
          set((state) => ({ tags: state.tags.filter(t => t.id !== id), isSaving: false }));
          toast.warning('Etiqueta removida localmente');
        }
      },

      // Internal Note Actions
      addInternalNote: async (note) => {
        set({ isSaving: true });
        try {
          const newNote = await noteService.create(note);
          
          // Also create an internal message in the conversation thread
          await messageService.create({
            conversation_id: note.conversation_id!,
            content: note.content!,
            sender_type: 'system',
            sender_name: get().currentUser?.name || 'Sistema',
            message_type: 'internal_note' as any,
            is_internal: true as any,
            status: 'sent'
          });

          set((state) => ({ 
            internalNotes: [...state.internalNotes, newNote],
            isSaving: false 
          }));
          toast.success('Anotação salva e adicionada à conversa');
        } catch (err) {
          const localNote = { 
            id: `temp-${Date.now()}`, 
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            pinned: true,
            ...note 
          } as InternalNote;
          set((state) => ({ 
            internalNotes: [...state.internalNotes, localNote],
            isSaving: false 
          }));
          toast.warning('Salvo localmente');
        }
      },
      updateInternalNote: async (id, updates) => {
        set({ isSaving: true });
        try {
          const updated = await noteService.update(id, updates);
          set((state) => ({
            internalNotes: state.internalNotes.map(n => n.id === id ? updated : n),
            isSaving: false
          }));
          toast.success('Anotação atualizada');
        } catch (err) {
          set((state) => ({
            internalNotes: state.internalNotes.map(n => n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n),
            isSaving: false
          }));
          toast.warning('Atualizado localmente');
        }
      },
      deleteInternalNote: async (id) => {
        set({ isSaving: true });
        try {
          await noteService.remove(id);
          set((state) => ({ 
            internalNotes: state.internalNotes.filter(n => n.id !== id),
            isSaving: false 
          }));
          toast.success('Anotação removida');
        } catch (err) {
          set((state) => ({ 
            internalNotes: state.internalNotes.filter(n => n.id !== id),
            isSaving: false 
          }));
          toast.warning('Removido localmente');
        }
      },

      resetState: () => set({
        appearance: DEFAULT_APPEARANCE,
        users: [],
        teams: [],
        whatsAppAccounts: [],
        customers: [],
        conversations: [],
        messages: [],
        campaigns: [],
        campaignRecipients: [],
        tags: [],
        internalNotes: []
      }),
    }),
    {
      name: 'viva-crm-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
