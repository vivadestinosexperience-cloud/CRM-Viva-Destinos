import { supabase } from '../integrations/supabase/client';

// Generic error handler
const handleError = (error: any, context: string) => {
  console.error(`Error in ${context}:`, error);
  throw error;
};

export const profilesService = {
  async list() {
    const { data, error } = await supabase.from('profiles').select('*').order('name');
    if (error) handleError(error, 'profilesService.list');
    return data;
  },
  async getById(id: string) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (error) handleError(error, 'profilesService.getById');
    return data;
  },
  async create(profile: any) {
    const { data, error } = await supabase.from('profiles').insert(profile).select().single();
    if (error) handleError(error, 'profilesService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'profilesService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('profiles').delete().eq('id', id);
    if (error) handleError(error, 'profilesService.remove');
  }
};

export const teamService = {
  async list() {
    const { data, error } = await supabase.from('teams').select('*').order('name');
    if (error) handleError(error, 'teamService.list');
    return data;
  },
  async create(team: any) {
    const { data, error } = await supabase.from('teams').insert(team).select().single();
    if (error) handleError(error, 'teamService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('teams').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'teamService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('teams').delete().eq('id', id);
    if (error) handleError(error, 'teamService.remove');
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
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (error) handleError(error, 'customerService.list');
    return data;
  },
  async create(customer: any) {
    const { data, error } = await supabase.from('customers').insert(customer).select().single();
    if (error) handleError(error, 'customerService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('customers').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'customerService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) handleError(error, 'customerService.remove');
  }
};

export const conversationService = {
  async list() {
    const { data, error } = await supabase.from('conversations').select(`
      *,
      customer:customer_id (*),
      whatsapp_account:whatsapp_account_id (*),
      queue:queue_id (*)
    `).order('last_message_at', { ascending: false });
    if (error) handleError(error, 'conversationService.list');
    return data;
  },
  async create(conversation: any) {
    const { data, error } = await supabase.from('conversations').insert(conversation).select().single();
    if (error) handleError(error, 'conversationService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('conversations').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'conversationService.update');
    return data;
  }
};

export const messageService = {
  async list() {
    const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
    if (error) handleError(error, 'messageService.list');
    return data;
  },
  async listByConversation(conversationId: string) {
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true });
    if (error) handleError(error, 'messageService.listByConversation');
    return data;
  },
  async create(message: any) {
    const { data, error } = await supabase.from('messages').insert(message).select().single();
    if (error) handleError(error, 'messageService.create');
    return data;
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
    const { data, error } = await supabase.from('tags').select('*').order('name');
    if (error) handleError(error, 'tagService.list');
    return data;
  },
  async create(tag: any) {
    const { data, error } = await supabase.from('tags').insert(tag).select().single();
    if (error) handleError(error, 'tagService.create');
    return data;
  },
  async update(id: string, updates: any) {
    const { data, error } = await supabase.from('tags').update(updates).eq('id', id).select().single();
    if (error) handleError(error, 'tagService.update');
    return data;
  },
  async remove(id: string) {
    const { error } = await supabase.from('tags').delete().eq('id', id);
    if (error) handleError(error, 'tagService.remove');
  }
};

export const reportService = {
  async getSummary() {
    const [
      { count: customersCount },
      { count: activeConversations }
    ] = await Promise.all([
      supabase.from('customers').select('*', { count: 'exact', head: true }),
      supabase.from('conversations').select('*', { count: 'exact', head: true }).neq('status', 'RESOLVED').neq('status', 'CLOSED')
    ]);

    return {
      customersCount: customersCount || 0,
      activeConversations: activeConversations || 0
    };
  }
};
