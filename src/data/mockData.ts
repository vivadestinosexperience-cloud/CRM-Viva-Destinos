import { User, Team, WhatsAppAccount, Customer, Conversation, Message, Quote, TravelPackage, Reservation, Campaign } from '../types';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Gustavo Alves', email: 'gustavo@vivaexperience.com.br', role: 'ADMIN', online: true, active: true },
  { id: 'u2', name: 'Ana Luiza', email: 'analuiza@vivaexperience.com.br', role: 'CONSULTANT', online: true, active: true, teamId: 't1' },
  { id: 'u3', name: 'Gabriel Paiva', email: 'gabriel@vivaexperience.com.br', role: 'SUPPORT', online: true, active: true, teamId: 't2' },
  { id: 'u4', name: 'Maria Júlia', email: 'mariajulia@vivaexperience.com.br', role: 'POSTVENDAS', online: false, active: true, teamId: 't3' },
  { id: 'u5', name: 'Higor Santos', email: 'higor@vivaexperience.com.br', role: 'FINANCE', online: false, active: true, teamId: 't4' },
];

export const MOCK_TEAMS: Team[] = [
  { id: 't1', name: 'Comercial', managerId: 'u1' },
  { id: 't2', name: 'Atendimento', managerId: 'u1' },
  { id: 't3', name: 'Pós-Venda', managerId: 'u4' },
  { id: 't4', name: 'Financeiro', managerId: 'u5' },
];

export const MOCK_WHATSAPP_ACCOUNTS: WhatsAppAccount[] = [
  { 
    id: 'wa1', 
    name: 'WhatsApp Comercial', 
    phone_number: '+5564999990001', 
    status: 'CONNECTED', 
    quality_status: 'HIGH', 
    type: 'WHATSAPP',
    provider: 'ZAPI',
    provider_type: 'zapi',
    last_sync_at: new Date().toISOString()
  },
  { 
    id: 'wa2', 
    name: 'WhatsApp Pós-venda', 
    phone_number: '+5564999990002', 
    status: 'CONNECTED', 
    quality_status: 'MEDIUM', 
    type: 'WHATSAPP',
    provider: 'ZAPI',
    provider_type: 'zapi',
    last_sync_at: new Date().toISOString()
  },
  { 
    id: 'wa3', 
    name: 'WhatsApp Suporte', 
    phone_number: '+5564999990003', 
    status: 'DISCONNECTED', 
    quality_status: 'LOW', 
    type: 'WHATSAPP',
    provider: 'ZAPI',
    provider_type: 'zapi',
    last_sync_at: new Date().toISOString()
  },
];

export const MOCK_CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'Mariana Oliveira', phone: '+5562988887777', email: 'mariana@email.com', city: 'Goiânia', temperature: 'HOT', tags: ['Alta Intenção', 'Porto de Galinhas'], origin: 'Instagram' },
  { id: 'c2', name: 'Carlos Mendes', phone: '+5511977776666', email: 'carlos@email.com', city: 'São Paulo', temperature: 'WARM', tags: ['Cotação Enviada'], origin: 'Indicação' },
  { id: 'c3', name: 'Fernanda Souza', phone: '+5521966665555', email: 'fernanda@email.com', city: 'Rio de Janeiro', temperature: 'COLD', tags: ['Follow-up'], origin: 'Facebook' },
  { id: 'c4', name: 'João Henrique', phone: '+5531955554444', city: 'Belo Horizonte', temperature: 'HOT', tags: ['Reserva Confirmada'], origin: 'Google' },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  { 
    id: '00000000-0000-0000-0000-000000000001', 
    customer_id: 'c1', 
    whatsapp_account_id: 'wa1', 
    status: 'OPEN', 
    last_message_at: '2026-05-17T15:30:00Z', 
    unread_count: 2, 
    queue_id: 'q2', 
    assigned_user_id: 'u2', 
    tags: ['Porto de Galinhas', 'Família'] 
  },
  { 
    id: '00000000-0000-0000-0000-000000000002', 
    customer_id: 'c2', 
    whatsapp_account_id: 'wa1', 
    status: 'WAITING_AGENT', 
    last_message_at: '2026-05-17T14:45:00Z', 
    unread_count: 0, 
    queue_id: 'q3', 
    assigned_user_id: 'u2', 
    tags: ['Internacional'] 
  },
  { 
    id: '00000000-0000-0000-0000-000000000003', 
    customer_id: 'c3', 
    whatsapp_account_id: 'wa1', 
    status: 'NEW', 
    last_message_at: '2026-05-17T16:10:00Z', 
    unread_count: 1, 
    queue_id: 'q1', 
    tags: ['Novos Leads'] 
  },
];

export const MOCK_MESSAGES: Message[] = [
  { id: 'm1', conversation_id: '00000000-0000-0000-0000-000000000001', sender_type: 'customer', content: 'Olá, gostaria de uma cotação para Porto de Galinhas em julho.', created_at: '2026-05-17T15:00:00Z', message_type: 'text', status: 'read' },
  { id: 'm2', conversation_id: '00000000-0000-0000-0000-000000000001', sender_type: 'agent', sender_name: 'Gabriel Agência', message_type: 'text', content: 'Olá Mariana! Seja bem-vinda à Viva Destinos Experience! Vou te ajudar. A viagem seria para quantas pessoas?', created_at: '2026-05-17T15:05:00Z', status: 'read' },
  { id: 'm3', conversation_id: '00000000-0000-0000-0000-000000000001', sender_type: 'customer', content: 'Seriam 2 adultos e 1 criança de 6 anos.', created_at: '2026-05-17T15:10:00Z', message_type: 'text', status: 'read' },
  { id: 'm4', conversation_id: '00000000-0000-0000-0000-000000000001', sender_type: 'agent', content: 'Vocês têm preferência por algum resort específico?', created_at: '2026-05-17T15:30:00Z', message_type: 'text', status: 'delivered' },
];

export const MOCK_QUOTES: Quote[] = [
  { id: 'qt1', customerId: 'c1', destination: 'Porto de Galinhas', origin: 'Goiânia', startDate: '2026-07-10', endDate: '2026-07-17', adults: 2, children: 1, budget: 8500, status: 'SEARCHING', responsibleId: 'u2' },
];

export const MOCK_PACKAGES: TravelPackage[] = [
  { id: 'p1', name: 'Inverno em Gramado', destination: 'Gramado, RS', type: 'NACIONAL', startDate: '2026-06-01', endDate: '2026-08-31', pricePerPerson: 1890, status: 'PROMO', slots: 20, occupiedSlots: 5 },
  { id: 'p2', name: 'Cancún All Inclusive', destination: 'Cancún, México', type: 'INTERNACIONAL', startDate: '2026-10-01', endDate: '2026-12-20', pricePerPerson: 6500, status: 'ACTIVE', slots: 15, occupiedSlots: 3 },
];

export const MOCK_RESERVATIONS: Reservation[] = [
  { id: 'r1', customerId: 'c4', destination: 'Orlando, EUA', travelDate: '2026-05-20', totalValue: 15400, paidValue: 15400, paymentStatus: 'TOTAL', status: 'CONFIRMED' },
];

export const MOCK_CAMPAIGNS: Campaign[] = [
  {
    id: 'cp1',
    name: 'Promoção Porto de Galinhas',
    type: 'Promoção',
    whatsapp_account_id: 'wa1',
    content: 'Olá {name}, temos uma oferta imperdível para Porto de Galinhas! Confira nossos resorts.',
    status: 'COMPLETED',
    recipients_count: 50,
    sent_count: 50,
    failed_count: 0,
    read_count: 35,
    replied_count: 5,
    opt_out_count: 0,
    created_by: 'u1',
    created_at: '2026-05-15T10:00:00Z',
    updated_at: '2026-05-15T10:15:00Z',
    completed_at: '2026-05-15T10:15:00Z',
    interval_seconds: 15,
    batch_size: 10,
    batch_interval_minutes: 5
  },
  {
    id: 'cp2',
    name: 'Aviso de Inverno Gramado',
    type: 'Promoção',
    whatsapp_account_id: 'wa2',
    content: 'Oi {name}, o inverno chegou em Gramado! Veja nossos pacotes exclusivos.',
    status: 'PAUSED',
    recipients_count: 120,
    sent_count: 45,
    failed_count: 2,
    read_count: 20,
    replied_count: 2,
    opt_out_count: 1,
    created_by: 'u1',
    created_at: '2026-05-17T09:00:00Z',
    updated_at: '2026-05-17T09:00:00Z',
    interval_seconds: 20,
    batch_size: 20,
    batch_interval_minutes: 10
  }
];
