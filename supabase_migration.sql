
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
    media_url TEXT,
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
    error TEXT
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
END $$;
