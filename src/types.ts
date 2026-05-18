/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'ADMIN' | 'MANAGER' | 'SUPERVISOR' | 'CONSULTANT' | 'SUPPORT' | 'FINANCE' | 'POSTVENDAS' | 'VIEWER';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  avatar?: string;
  online: boolean;
  active: boolean;
  status?: string;
  teamId?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  managerId?: string;
  manager_name?: string;
  members?: string[]; 
  color?: string;
  active?: boolean;
  whatsapp_ids?: string[];
  sector?: string;
  working_hours?: string;
  sla_minutes?: number;
  welcome_message?: string;
  allow_new_chats?: boolean;
}

export type InternalChatStatus = 'online' | 'busy' | 'away' | 'offline' | 'invisible';

export interface InternalMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: string;
}

export interface InternalChat {
  id: string;
  participants: string[];
  last_message?: string;
  unread_count?: number;
  updated_at: string;
}

export type ChannelType = 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT' | 'MANUAL';

export interface WhatsAppAccount {
  id: string;
  name: string;
  type: 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK';
  provider: string; // 'META_CLOUD' | '360DIALOG' | 'ZAPI' | 'EVOLUTION'
  provider_type?: 'meta_cloud' | '360dialog' | 'zapi' | 'evolution';
  phone_number?: string;
  number?: string; // Legacy compatibility
  instance_id?: string;
  status: 'ESTÁVEL' | 'DISCONNECTED' | 'PENDING' | 'ERROR' | 'WAITING_QR' | 'WAITING_CREDENTIALS' | 'CONECTANDO';
  quality_status?: 'HIGH' | 'MEDIUM' | 'LOW';
  quality?: 'HIGH' | 'MEDIUM' | 'LOW'; // Legacy compatibility
  team_id?: string;
  default_team_id?: string; // Legacy compatibility
  responsible_user_id?: string;
  is_primary?: boolean;
  config?: any;
  last_sync_at?: string;
  last_sync?: string; // Legacy compatibility
  created_at?: string;
  updated_at?: string;
}

export type ConversationStatus = 'NEW' | 'PENDING' | 'OPEN' | 'WAITING_CLIENT' | 'WAITING_AGENT' | 'RESOLVED' | 'EXPIRED' | 'TRANSFERRED';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  origin?: string;
  temperature?: 'COLD' | 'WARM' | 'HOT';
  responsibleId?: string;
  tags?: string[];
  opt_out?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  whatsapp_account_id?: string;
  external_message_id?: string;
  sender_type: 'customer' | 'agent' | 'system';
  sender_name?: string;
  from_phone?: string;
  to_phone?: string;
  message_type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'template';
  content: string;
  media_url?: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
  raw_payload?: any;
  created_at?: string;
  
  // Legacy compatibility
  timestamp?: string;
  conversationId?: string;
  type?: string;
  senderId?: string;
}

export interface Conversation {
  id: string;
  customer_id: string;
  whatsapp_account_id?: string;
  status: ConversationStatus;
  assigned_user_id?: string;
  queue_id?: string;
  last_message?: string;
  last_message_at?: string;
  unread_count?: number;
  created_at?: string;
  updated_at?: string;

  // Joins & UI compatibility
  customer?: Customer;
  whatsapp_account?: WhatsAppAccount;
  team?: Team;
  
  // Legacy fields
  customerId?: string;
  channelId?: string;
  lastActivity?: string;
  unreadCount?: number;
  queueId?: string;
  responsibleId?: string;
  tags?: string[];
  timestamp?: string;
}

export interface Quote {
  id: string;
  customerId: string;
  destination: string;
  origin: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  budget?: number;
  status: 'NEW' | 'SEARCHING' | 'SENT' | 'NEGOTIating' | 'APPROVED' | 'LOST' | 'CANCELLED';
  responsibleId: string;
}

export interface TravelPackage {
  id: string;
  name: string;
  destination: string;
  description?: string;
  type: 'NACIONAL' | 'INTERNACIONAL' | 'CRUZEIRO' | 'PERSONALIZADO';
  startDate: string;
  endDate: string;
  pricePerPerson: number;
  slots: number;
  occupiedSlots: number;
  status: 'ACTIVE' | 'INACTIVE' | 'SOLD_OUT' | 'PROMO';
  imageUrl?: string;
}

export interface Reservation {
  id: string;
  customerId: string;
  destination: string;
  quoteId?: string;
  packageId?: string;
  travelDate: string;
  totalValue: number;
  paidValue: number;
  paymentStatus: 'PENDING' | 'PARTIAL' | 'TOTAL';
  status: 'PRE' | 'CONFIRMED' | 'WAITING_PAYMENT' | 'TRAVELING' | 'FINISHED' | 'CANCELLED';
}

export interface Campaign {
  id: string;
  name: string;
  whatsapp_account_id: string;
  content: string;
  status: 'PENDING' | 'SENDING' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
  target_tags?: string[];
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  read_count: number;
  created_at: string;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
}
