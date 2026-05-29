
-- NORMALIZAÇÃO DE TELEFONE
CREATE OR REPLACE FUNCTION normalize_phone(input text) RETURNS text AS $$
DECLARE
    phone text;
BEGIN
    phone := regexp_replace(input, '\D', '', 'g');
    IF phone = '' THEN RETURN ''; END IF;
    
    IF (length(phone) = 10 OR length(phone) = 11) AND NOT (phone LIKE '55%') THEN
        phone := '55' || phone;
    END IF;
    
    RETURN phone;
END;
$$ LANGUAGE plpgsql;

-- TABELAS CRM (Prefixadas para evitar conflitos se as originais não existirem)
-- O Nome final sugerido pelo usuário se as originais falharem é crm_customers etc.
-- Mas vamos tentar manter os nomes solicitados inicialmente: customers, conversations, messages.

-- Se as tabelas não existem, vamos criá-las.
-- Se existirem, vamos adicionar as colunas necessárias.

-- CUSTOMERS / CLIENTES
CREATE TABLE IF NOT EXISTS crm_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Cliente',
    phone TEXT,
    phone_normalized TEXT UNIQUE,
    email TEXT,
    origin TEXT,
    opt_in BOOLEAN DEFAULT TRUE,
    opt_out BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONVERSATIONS / ATENDIMENTOS
CREATE TABLE IF NOT EXISTS crm_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES crm_customers(id),
    customer_phone_normalized TEXT UNIQUE,
    status TEXT DEFAULT 'NEW',
    team_id UUID,
    assigned_user_id UUID,
    assigned_user_name TEXT,
    channel_id TEXT,
    whatsapp_account_id TEXT,
    source TEXT,
    last_message TEXT,
    last_message_at TIMESTAMPTZ,
    unread_count INT DEFAULT 0,
    campaign_id UUID,
    started_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- MESSAGES / MENSAGENS
CREATE TABLE IF NOT EXISTS crm_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES crm_conversations(id),
    customer_phone_normalized TEXT,
    external_message_id TEXT UNIQUE,
    sender_type TEXT, 
    sender_name TEXT,
    from_phone TEXT,
    to_phone TEXT,
    message_type TEXT DEFAULT 'text', 
    content TEXT,
    caption TEXT,
    media_url TEXT,
    media_storage_url TEXT,
    storage_path TEXT,
    media_mime_type TEXT,
    media_file_name TEXT,
    media_size BIGINT,
    status TEXT, 
    is_internal BOOLEAN DEFAULT FALSE,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ANOTAÇÕES
CREATE TABLE IF NOT EXISTS conversation_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES crm_conversations(id),
    content TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    pinned BOOLEAN DEFAULT FALSE
);

-- WEBHOOK LOGS
CREATE TABLE IF NOT EXISTS zapi_webhook_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    received_at TIMESTAMPTZ DEFAULT NOW(),
    webhook_type TEXT,
    phone_normalized TEXT,
    customer_id UUID,
    conversation_id UUID,
    message_db_id UUID,
    payload JSONB,
    processed BOOLEAN DEFAULT FALSE,
    ignored BOOLEAN DEFAULT FALSE,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ÍNDICES E CONSTRAINTS EXTRAS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_crm_customers_phone_normalized') THEN
        CREATE UNIQUE INDEX idx_crm_customers_phone_normalized ON crm_customers(phone_normalized);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_crm_conversations_phone_normalized') THEN
        CREATE UNIQUE INDEX idx_crm_conversations_phone_normalized ON crm_conversations(customer_phone_normalized);
    END IF;

    -- ADD MEDIA COLUMNS IF THEY MISSING (IDEMPOTENT)
    -- crm_messages
    ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS caption TEXT;
    ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS media_storage_url TEXT;
    ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS storage_path TEXT;
    ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS media_mime_type TEXT;
    ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS media_file_name TEXT;
    ALTER TABLE crm_messages ADD COLUMN IF NOT EXISTS media_size BIGINT;

    -- zapi_webhook_logs
    ALTER TABLE zapi_webhook_logs ADD COLUMN IF NOT EXISTS ignored BOOLEAN DEFAULT FALSE;
    ALTER TABLE zapi_webhook_logs ADD COLUMN IF NOT EXISTS event_type TEXT;
    ALTER TABLE zapi_webhook_logs ADD COLUMN IF NOT EXISTS message_id TEXT;
    ALTER TABLE zapi_webhook_logs ADD COLUMN IF NOT EXISTS raw_phone TEXT;
    ALTER TABLE zapi_webhook_logs ADD COLUMN IF NOT EXISTS origin TEXT;
    ALTER TABLE zapi_webhook_logs ADD COLUMN IF NOT EXISTS diagnostic JSONB;

    -- crm_conversations
    ALTER TABLE crm_conversations ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
    ALTER TABLE crm_conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

    -- CRM USERS
    CREATE TABLE IF NOT EXISTS public.crm_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      auth_user_id uuid UNIQUE,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      role text NOT NULL DEFAULT 'agent',
      team_id text DEFAULT 'comercial',
      team_name text DEFAULT 'Comercial',
      is_active boolean DEFAULT true,
      must_change_password boolean DEFAULT true,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_crm_users_auth_user_id') THEN
      CREATE INDEX idx_crm_users_auth_user_id ON public.crm_users(auth_user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_crm_users_email') THEN
      CREATE INDEX idx_crm_users_email ON public.crm_users(email);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_crm_users_team_id') THEN
      CREATE INDEX idx_crm_users_team_id ON public.crm_users(team_id);
    END IF;

    -- WHATSAPP MESSAGE TEMPLATES Table
    CREATE TABLE IF NOT EXISTS public.whatsapp_message_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meta_template_id TEXT UNIQUE,
      name TEXT NOT NULL,
      display_name TEXT,
      category TEXT NOT NULL DEFAULT 'UTILITY',
      language TEXT NOT NULL DEFAULT 'pt_BR',
      status TEXT NOT NULL DEFAULT 'PENDING',
      waba_id TEXT,
      phone_number_id TEXT,
      components JSONB,
      body_text TEXT,
      header_type TEXT,
      header_text TEXT,
      footer_text TEXT,
      buttons JSONB,
      quality_score JSONB,
      rejection_reason TEXT,
      last_meta_response JSONB,
      synced_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ,
      paused_at TIMESTAMPTZ
    );

    -- Ensure columns exist in existing deployments
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_message_templates' AND column_name='header_type') THEN
      ALTER TABLE public.whatsapp_message_templates ADD COLUMN header_type TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_message_templates' AND column_name='header_text') THEN
      ALTER TABLE public.whatsapp_message_templates ADD COLUMN header_text TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_message_templates' AND column_name='footer_text') THEN
      ALTER TABLE public.whatsapp_message_templates ADD COLUMN footer_text TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_message_templates' AND column_name='buttons') THEN
      ALTER TABLE public.whatsapp_message_templates ADD COLUMN buttons JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='whatsapp_message_templates' AND column_name='synced_at') THEN
      ALTER TABLE public.whatsapp_message_templates ADD COLUMN synced_at TIMESTAMPTZ DEFAULT NOW();
    END IF;

    -- ADD PAID TRAFFIC REFERRAL COLUMNS TO CRM_CONVERSATIONS
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_conversations' AND column_name='traffic_source') THEN
      ALTER TABLE public.crm_conversations ADD COLUMN traffic_source TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_conversations' AND column_name='traffic_campaign') THEN
      ALTER TABLE public.crm_conversations ADD COLUMN traffic_campaign TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_conversations' AND column_name='traffic_headline') THEN
      ALTER TABLE public.crm_conversations ADD COLUMN traffic_headline TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_conversations' AND column_name='traffic_medium') THEN
      ALTER TABLE public.crm_conversations ADD COLUMN traffic_medium TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_conversations' AND column_name='traffic_content') THEN
      ALTER TABLE public.crm_conversations ADD COLUMN traffic_content TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='crm_conversations' AND column_name='traffic_access_url') THEN
      ALTER TABLE public.crm_conversations ADD COLUMN traffic_access_url TEXT;
    END IF;

    -- Update quality_score type if it was TEXT to support JSONB or keep text-friendly handles
    -- PostgreSQL doesn't allow direct simple text-to-jsonb cast without USING, so we use USING clause or fallback.
    -- (No changes to quality_score column unless needed, but we can store JSON string or keep it as text)

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_whatsapp_templates_name') THEN
      CREATE INDEX idx_whatsapp_templates_name ON public.whatsapp_message_templates(name);
    END IF;

    -- PLATFORM NOTIFICATIONS Table
    CREATE TABLE IF NOT EXISTS public.platform_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      read_at TIMESTAMPTZ
    );

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_platform_notifs_status') THEN
      CREATE INDEX idx_platform_notifs_status ON public.platform_notifications(status);
    END IF;
END $$;
