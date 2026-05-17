/*
  Viva Experience CRM - Supabase Initial Schema
  Agência: Viva Destinos Experience
*/

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- 2. TABLES

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id),
  name text,
  email text,
  phone text,
  avatar_url text,
  role text default 'VIEWER',
  team_id uuid,
  status text default 'OFFLINE',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Teams
create table if not exists public.teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  manager_id uuid references public.profiles(id),
  active boolean default true,
  created_at timestamptz default now()
);

-- Roles (Alternative to text roles for more granular control)
create table if not exists public.roles (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  active boolean default true
);

-- Permissions
create table if not exists public.permissions (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  name text not null,
  description text
);

-- Role-Permissions
create table if not exists public.role_permissions (
  id uuid primary key default uuid_generate_v4(),
  role_id uuid references public.roles(id) on delete cascade,
  permission_id uuid references public.permissions(id) on delete cascade
);

-- Queues
create table if not exists public.queues (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  team_id uuid references public.teams(id),
  color text,
  sla_minutes integer default 60,
  active boolean default true,
  created_at timestamptz default now()
);

-- Channels
create table if not exists public.channels (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null, -- 'WHATSAPP', 'INSTAGRAM', etc.
  active boolean default true,
  created_at timestamptz default now()
);

-- WhatsApp Accounts
create table if not exists public.whatsapp_accounts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone_number text,
  integration_type text, -- 'CLOUD_API', 'QR_CODE'
  status text default 'DISCONNECTED',
  quality_status text default 'HIGH',
  team_id uuid references public.teams(id),
  default_queue_id uuid references public.queues(id),
  responsible_user_id uuid references public.profiles(id),
  is_primary boolean default false,
  last_sync_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- WhatsApp Webhooks
create table if not exists public.whatsapp_webhooks (
  id uuid primary key default uuid_generate_v4(),
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete cascade,
  webhook_url text,
  verify_token text,
  status text,
  last_event_at timestamptz,
  created_at timestamptz default now()
);

-- WhatsApp Events
create table if not exists public.whatsapp_events (
  id uuid primary key default uuid_generate_v4(),
  whatsapp_account_id uuid references public.whatsapp_accounts(id) on delete cascade,
  event_type text,
  status text,
  description text,
  payload jsonb,
  created_at timestamptz default now()
);

-- Customers
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone text,
  email text,
  city text,
  origin text,
  main_interest text,
  desired_destination text,
  travel_origin text,
  desired_departure_date date,
  desired_return_date date,
  adults integer default 1,
  children integer default 0,
  children_ages text,
  estimated_budget numeric,
  lead_temperature text default 'COLD', -- 'COLD', 'WARM', 'HOT'
  responsible_user_id uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Conversations
create table if not exists public.conversations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  channel_id uuid references public.channels(id),
  queue_id uuid references public.queues(id),
  assigned_user_id uuid references public.profiles(id),
  status text default 'NEW', -- 'NEW', 'OPEN', 'RESOLVED', etc.
  last_message text,
  last_message_at timestamptz,
  unread_count integer default 0,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Messages
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_type text, -- 'CUSTOMER', 'AGENT', 'SYSTEM'
  sender_user_id uuid references public.profiles(id),
  content text,
  message_type text default 'text',
  media_url text,
  audio_duration integer,
  status text default 'SENT',
  external_message_id text,
  created_at timestamptz default now()
);

-- Conversation Events
create table if not exists public.conversation_events (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id),
  event_type text,
  description text,
  from_queue_id uuid references public.queues(id),
  to_queue_id uuid references public.queues(id),
  created_at timestamptz default now()
);

-- Tags
create table if not exists public.tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  color text,
  category text,
  active boolean default true
);

-- Junction Tables for Tags
create table if not exists public.conversation_tags (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade
);

create table if not exists public.customer_tags (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade
);

-- Notes
create table if not exists public.notes (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id),
  content text not null,
  created_at timestamptz default now()
);

-- Follow-Ups
create table if not exists public.follow_ups (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id),
  scheduled_at timestamptz,
  status text default 'PENDING',
  observation text,
  completed_at timestamptz,
  created_at timestamptz default now()
);

-- Quotes
create table if not exists public.quotes (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  conversation_id uuid references public.conversations(id),
  destination text,
  travel_origin text,
  departure_date date,
  return_date date,
  adults integer,
  children integer,
  children_ages text,
  travel_type text,
  national_or_international text,
  estimated_budget numeric,
  hotel_preference text,
  transport_preference text,
  status text default 'NEW',
  responsible_user_id uuid references public.profiles(id),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Packages
create table if not exists public.packages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  destination text,
  type text,
  description text,
  departure_date date,
  return_date date,
  price_per_person numeric,
  included_items text,
  not_included_items text,
  image_url text,
  status text default 'ACTIVE',
  created_at timestamptz default now()
);

-- Reservations
create table if not exists public.reservations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id) on delete cascade,
  quote_id uuid references public.quotes(id),
  package_id uuid references public.packages(id),
  destination text,
  travel_date date,
  total_amount numeric,
  paid_amount numeric,
  remaining_amount numeric,
  payment_method text,
  payment_status text default 'PENDING',
  reservation_status text default 'PRE',
  pending_documents text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Destinations
create table if not exists public.destinations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  country text,
  state_city text,
  type text,
  best_season text,
  description text,
  image_url text,
  status text default 'ACTIVE',
  created_at timestamptz default now()
);

-- Suppliers
create table if not exists public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text,
  phone text,
  email text,
  website text,
  contact_person text,
  notes text,
  status text default 'ACTIVE',
  created_at timestamptz default now()
);

-- Campaigns
create table if not exists public.campaigns (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  channel_id uuid references public.channels(id),
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  target_audience text,
  status text default 'DRAFT',
  scheduled_at timestamptz,
  total_contacts integer default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Message Templates
create table if not exists public.message_templates (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text,
  content text not null,
  channel_type text default 'WHATSAPP',
  active boolean default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Scheduled Messages
create table if not exists public.scheduled_messages (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references public.customers(id),
  conversation_id uuid references public.conversations(id),
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  template_id uuid references public.message_templates(id),
  message text,
  scheduled_at timestamptz,
  status text default 'PENDING',
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- AI Logs
create table if not exists public.ai_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  conversation_id uuid references public.conversations(id),
  action text,
  input text,
  output text,
  created_at timestamptz default now()
);

-- Audit Logs
create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.profiles(id),
  action text,
  entity_type text,
  entity_id uuid,
  description text,
  created_at timestamptz default now()
);

-- 3. RLS (Row Level Security)

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.queues enable row level security;
alter table public.channels enable row level security;
alter table public.whatsapp_accounts enable row level security;
alter table public.customers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_events enable row level security;
alter table public.tags enable row level security;
alter table public.conversation_tags enable row level security;
alter table public.customer_tags enable row level security;
alter table public.notes enable row level security;
alter table public.follow_ups enable row level security;
alter table public.quotes enable row level security;
alter table public.packages enable row level security;
alter table public.reservations enable row level security;
alter table public.destinations enable row level security;
alter table public.suppliers enable row level security;
alter table public.campaigns enable row level security;
alter table public.message_templates enable row level security;
alter table public.scheduled_messages enable row level security;
alter table public.ai_logs enable row level security;
alter table public.audit_logs enable row level security;

-- BASIC POLICIES (MVP - To be refined in production)

-- For all tables: Permit all actions for authenticated users for now
-- In a real production app, you would restrict based on roles and ownership.

create policy "Enable all for authenticated users" on public.profiles for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.teams for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.queues for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.channels for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.whatsapp_accounts for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.customers for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.conversations for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.messages for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.conversation_events for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.tags for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.conversation_tags for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.customer_tags for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.notes for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.follow_ups for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.quotes for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.packages for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.reservations for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.destinations for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.suppliers for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.campaigns for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.message_templates for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.scheduled_messages for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.ai_logs for all to authenticated using (true);
create policy "Enable all for authenticated users" on public.audit_logs for all to authenticated using (true);

-- 4. INITIAL SEED DATA

-- Insert Teams
insert into public.teams (name) values 
('Comercial'),
('Consultores de Viagens'),
('Pós-venda'),
('Financeiro'),
('Suporte'),
('Gestão');

-- Insert Queues
insert into public.queues (name, description, color, sla_minutes) values 
('Novos Leads', 'Leads recém-chegados', '#3B82F6', 15),
('Cotação Nacional', 'Cotações de viagens no Brasil', '#10B981', 60),
('Cotação Internacional', 'Viagens para fora do país', '#8B5CF6', 120),
('Pacotes Promocionais', 'Interessados em ofertas', '#F59E0B', 30),
('Excursões', 'Viagens em grupo', '#EF4444', 45),
('Lua de Mel', 'Atendimento especializado casais', '#EC4899', 60),
('Grupos e Famílias', 'Grandes grupos', '#14B8A6', 90),
('Pós-venda', 'Suporte após a viagem', '#F97316', 30),
('Financeiro', 'Questões de pagamento', '#6366F1', 120),
('Suporte ao Cliente', 'Dúvidas em geral', '#64748B', 30);

-- Insert Channels
insert into public.channels (name, type) values 
('WhatsApp', 'WHATSAPP'),
('Instagram', 'INSTAGRAM'),
('Facebook', 'FACEBOOK'),
('Webchat', 'WEBCHAT'),
('Manual', 'MANUAL');

-- Insert Tags
insert into public.tags (name, color, category) values 
('Tráfego Pago', '#3B82F6', 'Origem'),
('Instagram', '#EC4899', 'Origem'),
('Indicação', '#10B981', 'Origem'),
('Cliente Recorrente', '#8B5CF6', 'Perfil'),
('Alta Intenção', '#EF4444', 'Comercial'),
('Baixa Intenção', '#64748B', 'Comercial'),
('Orçamento Enviado', '#F59E0B', 'Status'),
('Aguardando Pagamento', '#F97316', 'Status'),
('Reserva Confirmada', '#10B981', 'Status'),
('Follow-up', '#6366F1', 'Ação'),
('Urgente', '#EF4444', 'SLA'),
('Lua de Mel', '#EC4899', 'Interesse'),
('Família', '#3B82F6', 'Interesse'),
('Internacional', '#8B5CF6', 'Interesse');

-- Insert Destinations
insert into public.destinations (name, country, state_city, type, best_season) values 
('Porto de Galinhas', 'Brasil', 'Pernambuco', 'Praia', 'Setembro a Março'),
('Gramado', 'Brasil', 'Rio Grande do Sul', 'Serra', 'Junho a Agosto'),
('Cancún', 'México', 'Quintana Roo', 'Internacional', 'Dezembro a Maio'),
('Orlando', 'EUA', 'Flórida', 'Parques', 'Outubro a Novembro'),
('Buenos Aires', 'Argentina', 'Buenos Aires', 'Cultural', 'Março a Maio');

-- Insert Packages
insert into public.packages (name, destination, type, price_per_person, status) values 
('Porto de Galinhas em Família', 'Porto de Galinhas', 'Nacional', 2450.00, 'ACTIVE'),
('Lua de Mel em Cancún', 'Cancún', 'Internacional', 8900.00, 'ACTIVE'),
('Gramado Especial de Inverno', 'Gramado', 'Nacional', 3200.00, 'ACTIVE'),
('Orlando Experience', 'Orlando', 'Internacional', 12500.00, 'ACTIVE'),
('Buenos Aires Cultural', 'Buenos Aires', 'Internacional', 4800.00, 'ACTIVE');

-- Insert WhatsApp Accounts
insert into public.whatsapp_accounts (name, phone_number, integration_type, status, quality_status, is_primary) values 
('WhatsApp Comercial', '+5564999990001', 'CLOUD_API', 'CONNECTED', 'HIGH', true),
('WhatsApp Pós-venda', '+5564999990002', 'CLOUD_API', 'CONNECTED', 'MEDIUM', false),
('WhatsApp Financeiro', '+5564999990003', 'CLOUD_API', 'DISCONNECTED', 'LOW', false);

-- Insert Message Templates
insert into public.message_templates (title, category, content) values 
('Primeiro atendimento', 'Boas-vindas', 'Olá, tudo bem? Seja bem-vindo(a) à Viva Destinos Experience! Me conta: qual destino você sonha em conhecer?'),
('Briefing', 'Comercial', 'Perfeito! Para montar a melhor opção para você, preciso confirmar algumas informações: data desejada, quantidade de pessoas, cidade de saída e orçamento aproximado.'),
('Envio de cotação', 'Comercial', 'Preparei sua cotação com muito carinho. Separei opções pensando em conforto, custo-benefício e experiência. Posso te enviar agora?'),
('Follow-up', 'Acompanhamento', 'Passando para saber se conseguiu analisar a proposta da sua viagem. Posso te ajudar com alguma dúvida?'),
('Reserva', 'Finalização', 'Sua reserva foi confirmada! Agora começa a contagem regressiva para sua experiência.');

-- 5. FUNCTION & TRIGGER FOR PROFILES
-- Keep profiles in sync with auth.users

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, avatar_url, role)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    coalesce(new.raw_user_meta_data->>'role', 'VIEWER')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Enable Realtime
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversation_events;
