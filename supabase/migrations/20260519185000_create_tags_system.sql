-- Migration for Tags System
CREATE TABLE IF NOT EXISTS public.crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#2563EB',
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  tag_id uuid NOT NULL REFERENCES public.crm_tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  created_by text,
  created_by_name text,
  UNIQUE(conversation_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_tags_name
ON public.crm_tags(name);

CREATE INDEX IF NOT EXISTS idx_crm_conversation_tags_conversation_id
ON public.crm_conversation_tags(conversation_id);

CREATE INDEX IF NOT EXISTS idx_crm_conversation_tags_tag_id
ON public.crm_conversation_tags(tag_id);

-- Insert default tags
INSERT INTO public.crm_tags (name, color, description)
VALUES
('Quente', '#EF4444', 'Lead com alta intenção de compra'),
('Morno', '#F97316', 'Lead em análise ou negociação'),
('Frio', '#3B82F6', 'Lead com baixa intenção no momento'),
('Retorno', '#8B5CF6', 'Cliente para retomada futura'),
('Urgente', '#DC2626', 'Atendimento prioritário'),
('Pago', '#16A34A', 'Cliente com pagamento realizado')
ON CONFLICT (name) DO NOTHING;
