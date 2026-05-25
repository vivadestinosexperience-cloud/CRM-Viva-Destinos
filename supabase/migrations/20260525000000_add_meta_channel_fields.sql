-- Migration: Add Meta WhatsApp Cloud API fields to crm_channels
ALTER TABLE public.crm_channels ADD COLUMN IF NOT EXISTS meta_whatsapp_status text;
ALTER TABLE public.crm_channels ADD COLUMN IF NOT EXISTS meta_whatsapp_last_test_at timestamptz;
ALTER TABLE public.crm_channels ADD COLUMN IF NOT EXISTS meta_whatsapp_display_phone_number text;
ALTER TABLE public.crm_channels ADD COLUMN IF NOT EXISTS meta_whatsapp_verified_name text;
ALTER TABLE public.crm_channels ADD COLUMN IF NOT EXISTS meta_whatsapp_quality_rating text;
ALTER TABLE public.crm_channels ADD COLUMN IF NOT EXISTS meta_whatsapp_last_error text;

-- Create table for Meta webhook messages
CREATE TABLE IF NOT EXISTS public.meta_webhook_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text UNIQUE,
  "from" text,
  phone_number_id text,
  timestamp text,
  message_type text,
  message_body text,
  raw_payload jsonb,
  status text,
  created_at timestamptz DEFAULT now()
);

-- Disable row level security for ease of testing in development
ALTER TABLE public.meta_webhook_messages DISABLE ROW LEVEL SECURITY;
