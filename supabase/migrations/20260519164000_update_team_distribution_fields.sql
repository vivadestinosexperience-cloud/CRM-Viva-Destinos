-- Migration to update crm_team_members with queue distribution fields
ALTER TABLE public.crm_team_members ADD COLUMN IF NOT EXISTS receives_queue BOOLEAN DEFAULT true;
ALTER TABLE public.crm_team_members ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true;
ALTER TABLE public.crm_team_members ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ;
ALTER TABLE public.crm_team_members ADD COLUMN IF NOT EXISTS total_assigned INTEGER DEFAULT 0;
ALTER TABLE public.crm_team_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Ensure unique constraint for team-member pair if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_team_members_team_id_user_id_key') THEN
        ALTER TABLE public.crm_team_members ADD CONSTRAINT crm_team_members_team_id_user_id_key UNIQUE (team_id, user_id);
    END IF;
END $$;
