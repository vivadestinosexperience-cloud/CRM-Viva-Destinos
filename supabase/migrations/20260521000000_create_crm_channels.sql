-- Migration: Create crm_channels table
CREATE TABLE IF NOT EXISTS public.crm_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  type text DEFAULT 'whatsapp_zapi',
  instance_id text,
  instance_token text,
  client_token text,
  connected_phone text,
  status text DEFAULT 'DISCONNECTED',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Turn on row level security or make it universally accessible to authenticated/service rolls
ALTER TABLE public.crm_channels DISABLE ROW LEVEL SECURITY;
