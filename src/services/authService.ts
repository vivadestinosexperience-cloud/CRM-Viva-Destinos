import { supabase } from '../integrations/supabase/client';

export const authService = {
  async signIn(email: string, password: string) {
    // Mock bypass for development credentials
    if (email === 'admin@viva.com' && password === '123456') {
      console.log('Using mock login for admin@viva.com');
      localStorage.setItem('viva_mock_auth', 'true');
      return { 
        data: { 
          user: { id: 'mock-user-id', email: 'admin@viva.com' },
          session: { access_token: 'mock-token', user: { id: 'mock-user-id', email: 'admin@viva.com' } }
        }, 
        error: null 
      };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  async signOut() {
    localStorage.removeItem('viva_mock_auth');
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  async getCurrentUser() {
    // Check mock first
    if (localStorage.getItem('viva_mock_auth') === 'true') {
      return { user: { id: 'mock-user-id', email: 'admin@viva.com', profile: { name: 'Gustavo Alves (Admin)' } }, error: null };
    }

    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (user) {
      const { data: profile } = await supabase
        .from('crm_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();
      
      // Fallback if crm_users doesn't have the entry yet (e.g. legacy/direct auth)
      if (!profile) {
        console.warn(`[AUTH] User ${user.id} has no crm_users entry.`);
        return { user: { ...user }, error: null };
      }

      return { user: { ...user, profile }, error: null };
    }
    
    return { user: null, error: null };
  },

  async getSession() {
    // Check mock first
    if (localStorage.getItem('viva_mock_auth') === 'true') {
      return { 
        session: { 
          access_token: 'mock-token', 
          user: { id: 'mock-user-id', email: 'admin@viva.com' } 
        }, 
        error: null 
      };
    }

    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  }
};
