import { supabase } from '../integrations/supabase/client';
import { authorizedFetch, safeReadJson } from './api';
import { WhatsAppAccount } from '../types';

// Generic error handler
const handleError = (error: any, context: string) => {
  console.error(`Error in ${context}:`, error);
  throw error;
};

export const profilesService = {
  async list() {
    try {
      const res = await authorizedFetch('/api/admin/users');
      const data = await safeReadJson(res);
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
      const res = await authorizedFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(user)
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário');
      return data.user;
    } catch (err: any) {
      handleError(err, 'profilesService.create');
    }
  },
  async update(id: string, updates: any) {
    try {
      const res = await authorizedFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar usuário');
      return data.user;
    } catch (err: any) {
      handleError(err, 'profilesService.update');
    }
  },
  // Reset password helper
  async resetPassword(id: string, passwordData: any) {
    const res = await authorizedFetch(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(passwordData)
    });
    const data = await safeReadJson(res);
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
      const res = await authorizedFetch('/api/teams');
      const data = await safeReadJson(res);
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
      const res = await authorizedFetch('/api/teams', {
        method: 'POST',
        body: JSON.stringify(team)
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao criar equipe');
      return data.team;
    } catch (err: any) {
      handleError(err, 'teamService.create');
    }
  },
  async update(id: string, updates: any) {
    try {
      const res = await authorizedFetch(`/api/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar equipe');
      return data.team;
    } catch (err: any) {
      handleError(err, 'teamService.update');
    }
  },
  async remove(id: string) {
    try {
      const res = await authorizedFetch(`/api/teams/${id}`, { method: 'DELETE' });
      const data = await safeReadJson(res);
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
    try {
      const res = await authorizedFetch('/api/channels');
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar canais');
      
      const channels = data.channels || [];
      return channels.map((c: any) => ({
        id: c.id,
        name: c.name,
        type: 'WHATSAPP',
        provider: 'ZAPI',
        phone_number: c.connected_phone || '',
        status: c.status || 'DISCONNECTED',
        instance_id: c.instance_id,
        instance_token: c.instance_token,
        client_token: c.client_token,
        is_active: c.is_active
      } as WhatsAppAccount));
    } catch (err: any) {
      console.error("[whatsappService.list error, falling back to empty]", err);
      return [];
    }
  },
  async create(account: any) {
    try {
      const res = await authorizedFetch('/api/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: account.name,
          type: 'whatsapp_zapi',
          instance_id: account.instance_id || '',
          instance_token: account.instance_token || '',
          client_token: account.client_token || '',
          is_active: account.is_active !== undefined ? account.is_active : true
        })
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao criar canal');
      
      const c = data.channel;
      return {
        id: c.id,
        name: c.name,
        type: 'WHATSAPP',
        provider: 'ZAPI',
        phone_number: c.connected_phone || '',
        status: (c.status || 'DISCONNECTED') as any,
        instance_id: c.instance_id,
        instance_token: c.instance_token,
        client_token: c.client_token,
        is_active: c.is_active
      } as WhatsAppAccount;
    } catch (err: any) {
      console.error("[whatsappService.create error]", err);
      throw err;
    }
  },
  async update(id: string, updates: any) {
    try {
      const res = await authorizedFetch(`/api/channels/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: updates.name,
          instance_id: updates.instance_id,
          instance_token: updates.instance_token,
          client_token: updates.client_token,
          connected_phone: updates.phone_number || updates.phone,
          status: updates.status,
          is_active: updates.is_active
        })
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar canal');
      
      const c = data.channel;
      return {
        id: c.id,
        name: c.name,
        type: 'WHATSAPP',
        provider: 'ZAPI',
        phone_number: c.connected_phone || '',
        status: (c.status || 'DISCONNECTED') as any,
        instance_id: c.instance_id,
        instance_token: c.instance_token,
        client_token: c.client_token,
        is_active: c.is_active
      } as WhatsAppAccount;
    } catch (err: any) {
      console.error("[whatsappService.update error]", err);
      throw err;
    }
  },
  async remove(id: string) {
    try {
      const res = await authorizedFetch(`/api/channels/${id}`, {
        method: 'DELETE'
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao deletar canal');
    } catch (err: any) {
      console.error("[whatsappService.remove error]", err);
      throw err;
    }
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
      const res = await authorizedFetch('/api/omnichannel/conversations');
      const data = await safeReadJson(res);
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
      const res = await authorizedFetch(`/api/omnichannel/conversations/${conversationId}/messages`);
      const data = await safeReadJson(res);
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
      const res = await authorizedFetch(`/api/omnichannel/conversations/${conversationId}/tags`);
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar etiquetas da conversa');
      return data.tags || [];
    } catch (err: any) {
      handleError(err, 'conversationTagService.list');
    }
  },
  async link(conversationId: string, tagId: string, userId?: string, userName?: string) {
    try {
      const res = await authorizedFetch(`/api/omnichannel/conversations/${conversationId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag_id: tagId, created_by: userId, created_by_name: userName })
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao vincular etiqueta');
      return data.tag;
    } catch (err: any) {
      handleError(err, 'conversationTagService.link');
    }
  },
  async unlink(conversationId: string, tagId: string) {
    try {
      const res = await authorizedFetch(`/api/omnichannel/conversations/${conversationId}/tags/${tagId}`, {
        method: 'DELETE'
      });
      const data = await safeReadJson(res);
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
      const res = await authorizedFetch('/api/tags');
      const data = await safeReadJson(res);
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
      const res = await authorizedFetch('/api/tags', {
        method: 'POST',
        body: JSON.stringify(tag)
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao criar etiqueta');
      return data.tag;
    } catch (err: any) {
      handleError(err, 'tagService.create');
    }
  },
  async update(id: string, updates: any) {
    try {
      const res = await authorizedFetch(`/api/tags/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar etiqueta');
      return data.tag;
    } catch (err: any) {
      handleError(err, 'tagService.update');
    }
  },
  async remove(id: string) {
    try {
      const res = await authorizedFetch(`/api/tags/${id}`, { method: 'DELETE' });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir etiqueta');
      return data;
    } catch (err: any) {
      handleError(err, 'tagService.remove');
    }
  }
};

export const campaignService = {
  async list() {
    try {
      const res = await authorizedFetch('/api/campaigns');
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar campanhas');
      return data.campaigns || [];
    } catch (err: any) {
      handleError(err, 'campaignService.list');
      return [];
    }
  },
  async create(campaign: any) {
    try {
      const res = await authorizedFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify(campaign)
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao criar campanha');
      return data.campaign;
    } catch (err: any) {
      handleError(err, 'campaignService.create');
      throw err;
    }
  },
  async update(id: string, updates: any) {
    try {
      const { data, error } = await supabase.from('crm_campaigns').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    } catch (err: any) {
      handleError(err, 'campaignService.update');
      throw err;
    }
  },
  async remove(id: string) {
    try {
      const res = await authorizedFetch(`/api/campaigns/${id}`, {
        method: 'DELETE'
      });
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir campanha');
      return data;
    } catch (err: any) {
      handleError(err, 'campaignService.remove');
      throw err;
    }
  },
  async start(id: string) {
    const res = await authorizedFetch(`/api/campaigns/${id}/start`, { method: 'POST' });
    return safeReadJson(res);
  },
  async pause(id: string) {
    const res = await authorizedFetch(`/api/campaigns/${id}/pause`, { method: 'POST' });
    return safeReadJson(res);
  },
  async resume(id: string) {
    const res = await authorizedFetch(`/api/campaigns/${id}/resume`, { method: 'POST' });
    return safeReadJson(res);
  },
  async cancel(id: string) {
    const res = await authorizedFetch(`/api/campaigns/${id}/cancel`, { method: 'POST' });
    return safeReadJson(res);
  },
  async retryFailed(id: string) {
    const res = await authorizedFetch(`/api/campaigns/${id}/retry-failed`, { method: 'POST' });
    return safeReadJson(res);
  },
  async processBatch(id: string) {
    const res = await authorizedFetch(`/api/campaigns/${id}/process`, { method: 'POST' });
    return safeReadJson(res);
  },
  async getDebug(id: string) {
    const res = await authorizedFetch(`/api/campaigns/${id}/debug`);
    return safeReadJson(res);
  },
  async getSystemDebug() {
    const res = await authorizedFetch('/api/debug/campaigns');
    return safeReadJson(res);
  },
  async optimize(raw_contacts: string) {
    const res = await authorizedFetch('/api/campaigns/optimize', {
      method: 'POST',
      body: JSON.stringify({ raw_contacts })
    });
    return safeReadJson(res);
  }
};

export const campaignRecipientService = {
  async listByCampaign(campaignId: string) {
    try {
      const res = await authorizedFetch(`/api/campaigns/${campaignId}/recipients`);
      const data = await safeReadJson(res);
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar destinatários');
      return data.recipients || [];
    } catch (err: any) {
      handleError(err, 'campaignRecipientService.listByCampaign');
      return [];
    }
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('crm_campaign_recipients').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'campaignRecipientService.update');
    return data;
  },
  async bulkCreate(recipients: any[]) {
    // Note: Creating many recipients might be slow via direct Supabase if the list is huge,
    // but the POST /api/campaigns already handles creation of campaign + recipients in one go usually.
    const { data, error } = await supabase.from('crm_campaign_recipients').insert(recipients).select();
    if (error) handleError(error, 'campaignRecipientService.bulkCreate');
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
