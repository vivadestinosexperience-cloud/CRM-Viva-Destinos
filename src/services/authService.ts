import { supabase } from '../integrations/supabase/client';

export const authService = {
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  async getCurrentUser() {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) return { user: null, error: null };

    try {
      const res = await fetch('/api/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      
      if (!res.ok) {
        // Se o token expirou ou usuário foi deletado do backend
        if (res.status === 401 || res.status === 403 || data.error?.includes('inativo')) {
          await supabase.auth.signOut();
        }
        throw new Error(data.error || 'Erro ao carregar perfil');
      }
      
      return { user: data.user, error: null };
    } catch (err: any) {
      console.error('[AUTH] Failed to get current user:', err);
      return { user: null, error: err.message };
    }
  },

  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    return { session, error };
  }
};
