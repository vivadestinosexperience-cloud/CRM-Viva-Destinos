-- Migration: Create zapi_send_logs table
CREATE TABLE IF NOT EXISTS public.zapi_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text,
  source_id text,
  phone text,
  endpoint text,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  success boolean DEFAULT false,
  error text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zapi_send_logs_source
ON public.zapi_send_logs(source, source_id);

CREATE INDEX IF NOT EXISTS idx_zapi_send_logs_created_at
ON public.zapi_send_logs(created_at);
