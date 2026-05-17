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
  managerId?: string;
  manager_name?: string;
  members?: string[]; 
}

export interface Queue {
  id: string;
  name: string;
  description?: string;
  teamId?: string;
  color: string;
  slaMinutes?: number;
  active?: boolean;
}

export type ChannelType = 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT' | 'MANUAL';

export interface WhatsAppAccount {
  id: string;
  name: string;
  number?: string;
  type: 'CLOUD_API' | 'EXTERNAL_QR';
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING' | 'ERROR';
  quality?: 'HIGH' | 'MEDIUM' | 'LOW';
  config?: any;
  last_sync?: string;
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
  queue?: Queue;
  
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
