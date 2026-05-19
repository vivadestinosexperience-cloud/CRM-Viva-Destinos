-- Migration for User Presence and Team Distribution
CREATE TABLE IF NOT EXISTS public.crm_user_presence (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT,
    user_email TEXT,
    is_online BOOLEAN DEFAULT false,
    last_seen_at TIMESTAMPTZ,
    current_route TEXT,
    socket_id TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.crm_team_members ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
ALTER TABLE public.crm_team_members ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

ALTER TABLE public.crm_teams ADD COLUMN IF NOT EXISTS distribution_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.crm_teams ADD COLUMN IF NOT EXISTS distribution_mode TEXT DEFAULT 'round_robin';

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_crm_user_presence_updated_at ON public.crm_user_presence;
CREATE TRIGGER update_crm_user_presence_updated_at
    BEFORE UPDATE ON public.crm_user_presence
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
