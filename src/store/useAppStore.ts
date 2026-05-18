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
  Tag,
  InternalNote
} from '../types';
import { 
  MOCK_USERS, 
  MOCK_TEAMS, 
  MOCK_WHATSAPP_ACCOUNTS, 
  MOCK_CUSTOMERS, 
  MOCK_CONVERSATIONS, 
  MOCK_MESSAGES,
  MOCK_CAMPAIGNS
} from '../data/mockData';
import {
  profilesService,
  teamService,
  queueService,
  whatsappService,
  customerService,
  conversationService,
  messageService,
  tagService,
  noteService
} from '../services/dataService';
import { toast } from 'sonner';

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
  addCampaign: (campaign: Campaign) => Promise<void>;
  updateCampaign: (campaign: Campaign) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;

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
      currentUser: MOCK_USERS[0],
      appearance: DEFAULT_APPEARANCE,
      permissions: {},
      users: MOCK_USERS,
      teams: MOCK_TEAMS.map(t => ({
        ...t,
        active: true,
        sla_minutes: 60
      })),
      whatsAppAccounts: MOCK_WHATSAPP_ACCOUNTS,
      customers: MOCK_CUSTOMERS,
      conversations: MOCK_CONVERSATIONS,
      messages: MOCK_MESSAGES,
      campaigns: MOCK_CAMPAIGNS,
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
          const [
            users,
            teams,
            whatsapp,
            customers,
            conversations,
            messages,
            tags
          ] = await Promise.all([
            profilesService.list(),
            teamService.list(),
            whatsappService.list(),
            customerService.list(),
            conversationService.list(),
            messageService.list(),
            tagService.list()
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
            users: users?.length ? users : MOCK_USERS,
            teams: teams?.length ? (teams as Team[]) : get().teams,
            whatsAppAccounts: whatsapp?.length ? whatsapp : MOCK_WHATSAPP_ACCOUNTS,
            customers: customers?.length ? customers : MOCK_CUSTOMERS,
            conversations: (conversations as Conversation[])?.length ? (conversations as Conversation[]) : MOCK_CONVERSATIONS,
            messages: messages?.length ? messages : MOCK_MESSAGES,
            tags: tags?.length ? (tags as Tag[]) : [],
            internalNotes: allNotes,
            lastSyncAt: new Date().toISOString(),
            isLoading: false
          });

          // Setup realtime listeners after initial load
          get().setupRealtimeListeners();
        } catch (err) {
          console.error('Failed to initialize app data from Supabase, using local/mock data', err);
          set({ isLoading: false, error: 'Falha ao sincronizar com servidor. Usando dados locais.' });
        }
      },

      setupRealtimeListeners: () => {
        // Avoid duplicate subscriptions
        supabase.removeAllChannels();

        // 1. Listen to Conversations
        const conversationChannel = supabase
          .channel('conversations-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
            console.log('Conversation change received:', payload);
            const { eventType, new: newRecord, old: oldRecord } = payload;
            
            if (eventType === 'INSERT') {
              set(state => ({
                conversations: [newRecord as Conversation, ...state.conversations]
              }));
              toast.info(`Nova conversa!`);
            } else if (eventType === 'UPDATE') {
              set(state => ({
                conversations: state.conversations.map(c => c.id === newRecord.id ? { ...c, ...newRecord } : c)
              }));
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
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
            console.log('Message insert received:', payload);
            const newMsg = payload.new as Message;
            
            // Add to state if not already there
            set(state => {
              if (state.messages.some(m => m.id === newMsg.id)) return state;
              return { messages: [...state.messages, newMsg] };
            });

            if (newMsg.sender_type === 'customer') {
              toast.info(`Nova mensagem recebida`);
            }
          })
          .subscribe();

        // 3. Listen to Customers
        const customerChannel = supabase
          .channel('customers-realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => {
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
          const newCust = await customerService.create(customer);
          set((state) => ({ customers: [...state.customers, newCust], isSaving: false }));
        } catch (err) {
          set((state) => ({ customers: [...state.customers, customer], isSaving: false }));
          toast.warning('Salvo localmente');
        }
      },
      updateCustomer: async (customer) => {
        set({ isSaving: true });
        try {
          const updated = await customerService.update(customer.id, customer);
          set((state) => ({
            customers: state.customers.map(c => c.id === customer.id ? updated : c),
            isSaving: false
          }));
        } catch (err) {
          set((state) => ({
            customers: state.customers.map(c => c.id === customer.id ? customer : c),
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
        set((state) => ({ messages: [...state.messages, message] }));
        try {
          await messageService.create({
            conversation_id: message.conversation_id || message.conversationId,
            content: message.content,
            sender_type: message.sender_type || 'agent',
            sender_name: message.sender_name,
            message_type: (message.message_type || message.type || 'text').toLowerCase() as any,
            status: (message.status || 'sent').toLowerCase() as any
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
          const newConv = await conversationService.create(conv);
          set((state) => ({ conversations: [newConv, ...state.conversations], isSaving: false }));
        } catch (err) {
          // Fallback manual ID if needed, but usually we ignore for mock-only
          set((state) => ({ 
            conversations: [{ id: `temp-${Date.now()}`, ...conv } as Conversation, ...state.conversations], 
            isSaving: false 
          }));
          toast.warning('Conexão instável, salvo localmente');
        }
      },

      // Campaign Actions
      addCampaign: async (campaign) => {
        set((state) => ({ campaigns: [campaign, ...state.campaigns] }));
      },
      updateCampaign: async (campaign) => {
        set((state) => ({
          campaigns: state.campaigns.map(c => c.id === campaign.id ? campaign : c)
        }));
      },
      deleteCampaign: async (id) => {
        set((state) => ({ campaigns: state.campaigns.filter(c => c.id !== id) }));
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
          set((state) => ({ 
            internalNotes: [...state.internalNotes, newNote],
            isSaving: false 
          }));
          toast.success('Anotação salva com sucesso');
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
        users: MOCK_USERS,
        teams: MOCK_TEAMS,
        whatsAppAccounts: MOCK_WHATSAPP_ACCOUNTS,
        customers: MOCK_CUSTOMERS,
        conversations: MOCK_CONVERSATIONS,
        messages: MOCK_MESSAGES,
      }),
    }),
    {
      name: 'viva-crm-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
