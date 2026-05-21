-- Migration for Z-API webhook logs columns
ALTER TABLE public.zapi_webhook_logs ADD COLUMN IF NOT EXISTS direction text;
ALTER TABLE public.zapi_webhook_logs ADD COLUMN IF NOT EXISTS from_me boolean;
ALTER TABLE public.zapi_webhook_logs ADD COLUMN IF NOT EXISTS customer_phone_normalized text;
ALTER TABLE public.zapi_webhook_logs ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.zapi_webhook_logs ADD COLUMN IF NOT EXISTS message_id uuid;
ALTER TABLE public.zapi_webhook_logs ADD COLUMN IF NOT EXISTS ignored_reason text;
