-- Migration to fix Teams and Queues for Viva Experience CRM

-- 1. Ensure crm_teams table exists with correct ID format (string)
CREATE TABLE IF NOT EXISTS public.crm_teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Ensure Comercial team exists
INSERT INTO public.crm_teams (id, name, description, is_active)
VALUES ('comercial', 'Comercial', 'Equipe principal comercial e leads novos', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Create crm_team_members junction table
CREATE TABLE IF NOT EXISTS public.crm_team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id TEXT REFERENCES public.crm_teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- References auth.users or profiles
    user_name TEXT,
    user_email TEXT,
    role_in_team TEXT DEFAULT 'atendente',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Update crm_conversations to include team and queue fields if missing
-- Note: Assuming table name is crm_conversations per DEFAULT_TABLES in server.ts
-- If the table is 'conversations', we should adjust, but server.ts uses crm_conversations.

DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'crm_conversations') THEN
        ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS team_id TEXT DEFAULT 'comercial';
        ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS team_name TEXT DEFAULT 'Comercial';
        ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS queue_id TEXT DEFAULT 'comercial';
        ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS queue_name TEXT DEFAULT 'Comercial';
    END IF;
    
    -- Also check 'conversations' table just in case
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS team_id TEXT DEFAULT 'comercial';
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS team_name TEXT DEFAULT 'Comercial';
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS queue_id TEXT DEFAULT 'comercial';
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS queue_name TEXT DEFAULT 'Comercial';
    END IF;
END $$;

-- 5. Update profiles to have a default team if using profiles as crm_users
DO $$ 
BEGIN 
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_team_id TEXT DEFAULT 'comercial';
    END IF;
END $$;
