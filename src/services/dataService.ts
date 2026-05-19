import { supabase } from '../integrations/supabase/client';

// Generic error handler
const handleError = (error: any, context: string) => {
  console.error(`Error in ${context}:`, error);
  throw error;
};

export const profilesService = {
  async list() {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar usuários');
      return data.users || [];
    } catch (err) {
      // Fallback for direct DB access if API fails or for non-admin list
      const { data, error } = await supabase.from('crm_users').select('*').order('name');
      if (error) handleError(error, 'profilesService.list');
      return data;
    }
  },
  async getById(id: string) {
    const { data, error } = await supabase.from('crm_users').select('*').eq('id', id).single();
    if (error) handleError(error, 'profilesService.getById');
    return data;
  },
  async create(user: any) {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário');
      return data.user;
    } catch (err: any) {
      handleError(err, 'profilesService.create');
    }
  },
  async update(id: string, updates: any) {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar usuário');
      return data.user;
    } catch (err: any) {
      handleError(err, 'profilesService.update');
    }
  },
  // Reset password helper
  async resetPassword(id: string, passwordData: any) {
    const res = await fetch(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passwordData)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao resetar senha');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('crm_users').delete().eq('id', id);
    if (error) handleError(error, 'profilesService.remove');
  }
};

export const teamService = {
  async list() {
    try {
      const res = await fetch('/api/teams');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar equipes');
      return data.teams || [];
    } catch (err) {
      // Fallback for direct DB access if API fails
      const { data, error } = await supabase.from('teams').select('*').order('name');
      if (error) handleError(error, 'teamService.list');
      return data;
    }
  },
  async create(team: any) {
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar equipe');
      return data.team;
    } catch (err: any) {
      handleError(err, 'teamService.create');
    }
  },
  async update(id: string, updates: any) {
    try {
      const res = await fetch(`/api/teams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar equipe');
      return data.team;
    } catch (err: any) {
      handleError(err, 'teamService.update');
    }
  },
  async remove(id: string) {
    try {
      const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir equipe');
      return data;
    } catch (err: any) {
      handleError(err, 'teamService.remove');
    }
  }
};

export const queueService = {
  async list() {
    const { data, error } = await supabase.from('queues').select('*').order('name');
    if (error) handleError(error, 'queueService.list');
    return data;
  },
  async create(queue: any) {
    const { data, error } = await supabase.from('queues').insert(queue).select().single();
    if (error) handleError(error, 'queueService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('queues').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'queueService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('queues').delete().eq('id', id);
    if (error) handleError(error, 'queueService.remove');
  }
};

export const whatsappService = {
  async list() {
    const { data, error } = await supabase.from('whatsapp_accounts').select('*').order('name');
    if (error) handleError(error, 'whatsappService.list');
    return data;
  },
  async create(account: any) {
    const { data, error } = await supabase.from('whatsapp_accounts').insert(account).select().single();
    if (error) handleError(error, 'whatsappService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('whatsapp_accounts').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'whatsappService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('whatsapp_accounts').delete().eq('id', id);
    if (error) handleError(error, 'whatsappService.remove');
  }
};

export const customerService = {
  async list() {
    const { data, error } = await supabase.from('crm_customers').select('*').order('created_at', { ascending: false });
    if (error) handleError(error, 'customerService.list');
    return data;
  },
  async create(customer: any) {
    const { data, error } = await supabase.from('crm_customers').insert(customer).select().single();
    if (error) handleError(error, 'customerService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('crm_customers').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'customerService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('crm_customers').delete().eq('id', id);
    if (error) handleError(error, 'customerService.remove');
  }
};

export const conversationService = {
  async list() {
    try {
      const res = await fetch('/api/omnichannel/conversations');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar conversas');
      return data.conversations || [];
    } catch (err) {
      handleError(err, 'conversationService.list (via API)');
      return [];
    }
  },
  async create(conversation: any) {
    const { data, error } = await supabase.from('crm_conversations').insert(conversation).select().single();
    if (error) handleError(error, 'conversationService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('crm_conversations').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'conversationService.update');
    return data;
  }
};

export const messageService = {
  async list() {
    const { data, error } = await supabase.from('crm_messages').select('*').order('created_at', { ascending: true });
    if (error) handleError(error, 'messageService.list');
    return data;
  },
  async listByConversation(conversationId: string) {
    try {
      const res = await fetch(`/api/omnichannel/conversations/${conversationId}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar mensagens');
      return data.messages || [];
    } catch (err) {
      handleError(err, 'messageService.listByConversation (via API)');
      return [];
    }
  },
  async create(message: any) {
    const { data, error } = await supabase.from('crm_messages').insert(message).select().single();
    if (error) handleError(error, 'messageService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('crm_messages').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'messageService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('crm_messages').delete().eq('id', id);
    if (error) handleError(error, 'messageService.remove');
  }
};

export const conversationTagService = {
  async list(conversationId: string) {
    try {
      const res = await fetch(`/api/omnichannel/conversations/${conversationId}/tags`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar etiquetas da conversa');
      return data.tags || [];
    } catch (err: any) {
      handleError(err, 'conversationTagService.list');
    }
  },
  async link(conversationId: string, tagId: string, userId?: string, userName?: string) {
    try {
      const res = await fetch(`/api/omnichannel/conversations/${conversationId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tagId, created_by: userId, created_by_name: userName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao vincular etiqueta');
      return data.tag;
    } catch (err: any) {
      handleError(err, 'conversationTagService.link');
    }
  },
  async unlink(conversationId: string, tagId: string) {
    try {
      const res = await fetch(`/api/omnichannel/conversations/${conversationId}/tags/${tagId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao desvincular etiqueta');
      return data;
    } catch (err: any) {
      handleError(err, 'conversationTagService.unlink');
    }
  }
};

export const noteService = {
  async listByConversation(conversationId: string) {
    const { data, error } = await supabase.from('conversation_notes').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false });
    if (error) handleError(error, 'noteService.listByConversation');
    return data;
  },
  async create(note: any) {
    const { data, error } = await supabase.from('conversation_notes').insert(note).select().single();
    if (error) handleError(error, 'noteService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('conversation_notes').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'noteService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('conversation_notes').delete().eq('id', id);
    if (error) handleError(error, 'noteService.remove');
  }
};

export const whatsappEventService = {
  async list(accountId: string) {
    const { data, error } = await supabase.from('whatsapp_events').select('*').eq('whatsapp_account_id', accountId).order('created_at', { ascending: false });
    if (error) handleError(error, 'whatsappEventService.list');
    return data;
  },
  async create(event: any) {
    const { data, error } = await supabase.from('whatsapp_events').insert(event).select().single();
    if (error) handleError(error, 'whatsappEventService.create');
    return data;
  }
};

export const templateService = {
  async list() {
    const { data, error } = await supabase.from('message_templates').select('*').order('created_at', { ascending: false });
    if (error) handleError(error, 'templateService.list');
    return data;
  },
  async create(template: any) {
    const { data, error } = await supabase.from('message_templates').insert(template).select().single();
    if (error) handleError(error, 'templateService.create');
    return data;
  }
};

export const tagService = {
  async list() {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar etiquetas');
      return data.tags || [];
    } catch (err) {
      const { data, error } = await supabase.from('crm_tags').select('*').eq('is_active', true).order('name');
      if (error) handleError(error, 'tagService.list');
      return data;
    }
  },
  async create(tag: any) {
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tag)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar etiqueta');
      return data.tag;
    } catch (err: any) {
      handleError(err, 'tagService.create');
    }
  },
  async update(id: string, updates: any) {
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar etiqueta');
      return data.tag;
    } catch (err: any) {
      handleError(err, 'tagService.update');
    }
  },
  async remove(id: string) {
    try {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir etiqueta');
      return data;
    } catch (err: any) {
      handleError(err, 'tagService.remove');
    }
  }
};

export const campaignService = {
  async list() {
    const { data, error } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (error) handleError(error, 'campaignService.list');
    return data;
  },
  async create(campaign: any) {
    const { data, error } = await supabase.from('campaigns').insert(campaign).select().single();
    if (error) handleError(error, 'campaignService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('campaigns').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'campaignService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('campaigns').delete().eq('id', id);
    if (error) handleError(error, 'campaignService.remove');
  }
};

export const campaignRecipientService = {
  async listByCampaign(campaignId: string) {
    const { data, error } = await supabase.from('campaign_recipients').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true });
    if (error) handleError(error, 'campaignRecipientService.listByCampaign');
    return data;
  },
  async create(recipient: any) {
    const { data, error } = await supabase.from('campaign_recipients').insert(recipient).select().single();
    if (error) handleError(error, 'campaignRecipientService.create');
    return data;
  },
  async bulkCreate(recipients: any[]) {
    const { data, error } = await supabase.from('campaign_recipients').insert(recipients).select();
    if (error) handleError(error, 'campaignRecipientService.bulkCreate');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('campaign_recipients').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'campaignRecipientService.update');
    return data;
  },
  async updateMany(campaignId: string, updates: any, filters: any = {}) {
    let query = supabase.from('campaign_recipients').update(updates).eq('campaign_id', campaignId);
    Object.keys(filters).forEach(key => {
      query = query.eq(key, filters[key]);
    });
    const { data, error } = await query;
    if (error) handleError(error, 'campaignRecipientService.updateMany');
    return data;
  }
};

export const reportService = {
  async getSummary() {
    const [
      { count: customersCount },
      { count: activeConversations }
    ] = await Promise.all([
      supabase.from('crm_customers').select('*', { count: 'exact', head: true }),
      supabase.from('crm_conversations').select('*', { count: 'exact', head: true }).neq('status', 'RESOLVED').neq('status', 'CLOSED')
    ]);

    return {
      customersCount: customersCount || 0,
      activeConversations: activeConversations || 0
    };
  }
};
