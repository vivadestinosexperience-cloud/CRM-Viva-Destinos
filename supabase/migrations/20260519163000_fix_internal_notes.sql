-- Migration to improve Internal Notes in crm_messages
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS internal_note BOOLEAN DEFAULT false;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS sender_type TEXT;
ALTER TABLE public.crm_messages ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- Update existing internal notes if any (legacy check)
UPDATE public.crm_messages 
SET is_internal = true, internal_note = true 
WHERE message_type = 'internal_note' OR is_internal = true;
