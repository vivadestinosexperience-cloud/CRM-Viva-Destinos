/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { 
  User, 
  Team, 
  WhatsAppAccount, 
  Customer, 
  Conversation, 
  Message,
  InternalMessage
} from '../types';
import { 
  MOCK_USERS, 
  MOCK_TEAMS, 
  MOCK_WHATSAPP_ACCOUNTS, 
  MOCK_CUSTOMERS, 
  MOCK_CONVERSATIONS, 
  MOCK_MESSAGES
} from '../data/mockData';
import {
  profilesService,
  teamService,
  queueService,
  whatsappService,
  customerService,
  conversationService,
  messageService
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
  updateConversation: (id: string, updates: Partial<Conversation>) => Promise<void>;
  addConversation: (conversation: Partial<Conversation>) => Promise<void>;
  
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
            messages
          ] = await Promise.all([
            profilesService.list(),
            teamService.list(),
            whatsappService.list(),
            customerService.list(),
            conversationService.list(),
            messageService.list()
          ]);

          set({
            users: users?.length ? users : MOCK_USERS,
            teams: teams?.length ? (teams as Team[]) : get().teams,
            whatsAppAccounts: whatsapp?.length ? whatsapp : MOCK_WHATSAPP_ACCOUNTS,
            customers: customers?.length ? customers : MOCK_CUSTOMERS,
            conversations: (conversations as Conversation[])?.length ? (conversations as Conversation[]) : MOCK_CONVERSATIONS,
            messages: messages?.length ? messages : MOCK_MESSAGES,
            lastSyncAt: new Date().toISOString(),
            isLoading: false
          });
        } catch (err) {
          console.error('Failed to initialize app data from Supabase, using local/mock data', err);
          set({ isLoading: false, error: 'Falha ao sincronizar com servidor. Usando dados locais.' });
        }
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
