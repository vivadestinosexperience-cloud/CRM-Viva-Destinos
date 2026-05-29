-- Add paid traffic/referral fields to crm_conversations
ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS traffic_source TEXT;
ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS traffic_campaign TEXT;
ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS traffic_headline TEXT;
ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS traffic_medium TEXT;
ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS traffic_content TEXT;
ALTER TABLE public.crm_conversations ADD COLUMN IF NOT EXISTS traffic_access_url TEXT;

-- Also add to conversions if exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS traffic_source TEXT;
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS traffic_campaign TEXT;
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS traffic_headline TEXT;
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS traffic_medium TEXT;
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS traffic_content TEXT;
        ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS traffic_access_url TEXT;
    END IF;
END $$;
