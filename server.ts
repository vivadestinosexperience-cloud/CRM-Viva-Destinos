import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

function clean(value?: any) {
  return String(value || "").trim();
}

/**
 * Obtém a configuração da Z-API e lista variáveis faltantes.
 */
function getZapiConfig() {
  const config = {
    baseUrl: clean(process.env.ZAPI_BASE_URL) || "https://api.z-api.io",
    instanceId: clean(process.env.ZAPI_INSTANCE_ID),
    instanceToken: clean(process.env.ZAPI_INSTANCE_TOKEN),
    clientToken: clean(process.env.ZAPI_CLIENT_TOKEN),
  };

  const missing: string[] = [];
  if (!config.baseUrl) missing.push("ZAPI_BASE_URL");
  if (!config.instanceId) missing.push("ZAPI_INSTANCE_ID");
  if (!config.instanceToken) missing.push("ZAPI_INSTANCE_TOKEN");
  if (!config.clientToken) missing.push("ZAPI_CLIENT_TOKEN");

  return { config, missing };
}

function getZapiHeaders() {
  const { config } = getZapiConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  const clientToken = config.clientToken?.trim();
  if (clientToken && clientToken !== "undefined" && clientToken !== "null") {
    headers["Client-Token"] = clientToken;
  }
  return headers;
}

function getPublicAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://crm-viva-destinos-experience.onrender.com"
  ).replace(/\/$/, "");
}

function zapiUrl(pathname: string) {
  const { config } = getZapiConfig();
  const base = config.baseUrl.replace(/\/$/, "");
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}/instances/${config.instanceId}/token/${config.instanceToken}${cleanPath}`;
}

async function callZapi(pathname: string, options: RequestInit = {}) {
  const { missing } = getZapiConfig();
  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      data: { error: "Z-API não configurada.", missing },
    };
  }

  const url = zapiUrl(pathname);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...getZapiHeaders(), ...(options.headers as any || {}) },
    });
    const text = await response.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { ok: response.ok, status: response.status, data };
  } catch (error: any) {
    return { ok: false, status: 500, data: { error: error.message } };
  }
}

function normalizePhone(input: any) {
  const raw = String(input || "");
  if (!raw) return "";

  if (raw.includes("@newsletter")) return "";
  if (raw.includes("@broadcast")) return "";
  if (raw.includes("status@broadcast")) return "";

  let phone = raw.split("@")[0].replace(/\D/g, "");
  if (!phone) return "";

  // WhatsApp Group/Chat IDs often start with 120363
  if (phone.startsWith("120363")) return "";

  if ((phone.length === 10 || phone.length === 11) && !phone.startsWith("55")) {
    phone = `55${phone}`;
  }
  
  if (!(phone.length >= 12 && phone.length <= 13 && phone.startsWith("55"))) {
    return "";
  }
  
  return phone;
}

function shouldIgnoreZapiPayload(payload: any) {
  const phone = String(payload?.phone || "");

  if (payload?.isNewsletter === true) {
    return { ignore: true, reason: "Evento ignorado: mensagem de newsletter/canal do WhatsApp." };
  }

  if (phone.includes("@newsletter")) {
    return { ignore: true, reason: "Evento ignorado: phone contém @newsletter." };
  }

  if (payload?.broadcast === true) {
    return { ignore: true, reason: "Evento ignorado: broadcast." };
  }

  if (payload?.fromMe === true && !payload?.isTest) {
    return { ignore: true, reason: "Evento ignorado: mensagem enviada pela própria instância." };
  }

  if (payload?.isStatusReply === true || phone.includes("status@broadcast")) {
    return { ignore: true, reason: "Evento ignorado: status/story do WhatsApp." };
  }

  if (payload?.isGroup === true && !payload?.participantPhone && !payload?.participant) {
    return { ignore: true, reason: "Evento ignorado: grupo sem telefone real do participante." };
  }

  return { ignore: false, reason: null };
}

function extractRealCustomerPhone(payload: any) {
  const ignoreCheck = shouldIgnoreZapiPayload(payload);
  if (ignoreCheck.ignore) {
    return {
      rawPhone: payload?.phone || "",
      phoneNormalized: "",
      ignored: true,
      ignoreReason: ignoreCheck.reason
    };
  }

  const candidates = [
    payload?.phone,
    payload?.senderPhone,
    payload?.participantPhone,
    payload?.participant,
    payload?.from,
    payload?.sender?.phone,
    payload?.message?.phone,
    payload?.message?.from,
    payload?.data?.phone,
    payload?.data?.senderPhone,
    payload?.data?.from,
    payload?.key?.participant,
    payload?.key?.remoteJid
  ];

  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized) {
      return {
        rawPhone: candidate,
        phoneNormalized: normalized,
        ignored: false,
        ignoreReason: null
      };
    }
  }

  return {
    rawPhone: candidates.find(Boolean) || "",
    phoneNormalized: "",
    ignored: true,
    ignoreReason: "Telefone real do cliente não identificado no payload."
  };
}

function getLastMessageText(msg: any) {
  if (msg.type === "image") return msg.text || "Imagem recebida";
  if (msg.type === "audio") return "Áudio recebido";
  if (msg.type === "video") return msg.text || "Vídeo recebido";
  if (msg.type === "document") return msg.text || "Documento recebido";
  return msg.text || "Mensagem recebida";
}

function normalizeZapiIncomingMessage(payload: any) {
  const phoneData = extractRealCustomerPhone(payload);
  const phone = phoneData.phoneNormalized;

  const name =
    payload?.senderName ||
    payload?.pushName ||
    payload?.contactName ||
    payload?.name ||
    payload?.sender?.name ||
    payload?.data?.senderName ||
    payload?.data?.pushName ||
    "Cliente";

  const messageId =
    payload?.messageId ||
    payload?.id ||
    payload?.message?.id ||
    payload?.key?.id ||
    payload?.data?.messageId ||
    payload?.data?.id ||
    `zapi-${Date.now()}`;

  const text =
    payload?.text?.message ||
    payload?.text ||
    payload?.message?.text ||
    payload?.message?.body ||
    payload?.message ||
    payload?.body ||
    payload?.content ||
    payload?.data?.text?.message ||
    payload?.data?.text ||
    payload?.data?.body ||
    "";

  const type =
    payload?.type ||
    payload?.messageType ||
    payload?.mediaType ||
    payload?.data?.type ||
    "text";

  const mediaUrl =
    payload?.image?.imageUrl ||
    payload?.video?.videoUrl ||
    payload?.audio?.audioUrl ||
    payload?.document?.documentUrl ||
    payload?.mediaUrl ||
    payload?.data?.mediaUrl ||
    "";

  return {
    rawPhone: phoneData.rawPhone,
    phone,
    ignored: !!phoneData.ignored,
    ignoreReason: phoneData.ignoreReason,
    name,
    messageId,
    text: typeof text === "string" ? text : "",
    type: (type as string || "text").toLowerCase(),
    mediaUrl,
    fromMe: payload.fromMe === true,
    raw: payload
  };
}

function getErrorMessage(error: any): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  return error.message || error.error || "Erro inesperado.";
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  app.use(express.json({ limit: "10mb" }));

  // Middleware de Log para Diagnóstico
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API REQ] ${req.method} ${req.url}`);
    }
    next();
  });

  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  // SSE Clients
  let sseClients: any[] = [];

  function broadcastEvent(event: string, data: any) {
    const payload = JSON.stringify({ event, data });
    sseClients.forEach(client => {
      client.res.write(`data: ${payload}\n\n`);
    });
  }

const TABLES = {
  customers: 'crm_customers',
  conversations: 'crm_conversations',
  messages: 'crm_messages',
  logs: 'zapi_webhook_logs',
  whatsapp_accounts: 'whatsapp_accounts'
};

  async function saveWebhookLog(data: any) {
    try {
      const { data: log, error } = await supabase.from(TABLES.logs).insert({
        ...data,
        processed: false,
        created_at: new Date().toISOString()
      }).select().single();
      if (error) console.error("Error saving log", error);
      return log?.id;
    } catch (err) {
      console.error("Log error", err);
    }
  }

  async function updateWebhookLog(id: string, data: any) {
    if (!id) return;
    try {
      // Ensure processed is false if IDs are missing for received events
      if (data.event_type === 'received' || id) {
        const isActuallyProcessed = !!(data.customer_id && data.conversation_id && data.message_db_id);
        if (data.processed === true && !isActuallyProcessed) {
           data.processed = false;
           data.error = data.error || "Faltou gerar IDs de atendimento.";
        }
      }
      await supabase.from(TABLES.logs).update(data).eq('id', id);
    } catch (err) {
      console.error("Update log error", err);
    }
  }

  async function processIncomingZapiMessage(payload: any) {
    const normalized = normalizeZapiIncomingMessage(payload);
    
    console.log(`[ZAPI PROCESS] Normalizado: ${normalized.phone} | Nome: ${normalized.name}`);

    if (normalized.ignored || !normalized.phone) {
      console.warn(`[ZAPI] Mensagem ignorada: ${normalized.ignoreReason}`);
      return { 
        ignored: true, 
        reason: normalized.ignoreReason || "Evento ignorado pelo sistema.", 
        rawPhone: normalized.rawPhone,
        phone: normalized.phone 
      };
    }

    try {
      // 1. Customer
      let { data: customer, error: custFetchErr } = await supabase.from(TABLES.customers).select('*').eq('phone_normalized', normalized.phone).maybeSingle();
      if (custFetchErr) {
        console.error("[ZAPI] Erro ao buscar cliente:", custFetchErr);
        throw new Error(`Erro ao buscar cliente: ${custFetchErr.message}`);
      }

      if (!customer) {
        const { data: newCust, error: custErr } = await supabase.from(TABLES.customers).insert({
          name: normalized.name || 'Cliente',
          phone: normalized.phone,
          phone_normalized: normalized.phone,
          origin: normalized.raw?.isTest ? 'Teste' : 'WhatsApp Z-API'
        }).select().single();
        if (custErr) throw new Error(`Erro ao criar cliente: ${custErr.message}`);
        customer = newCust;
      } else if ((customer.name === 'Cliente' || !customer.name) && normalized.name && normalized.name !== 'Cliente') {
        // Atualizar nome se for o default ou vazio
        await supabase.from(TABLES.customers).update({ name: normalized.name }).eq('id', customer.id);
        customer.name = normalized.name;
      }

      if (!customer?.id) throw new Error("Falha crítica: Cliente sem ID após criação/busca.");

      // 2. Conversation
      let { data: conversation, error: convFetchErr } = await supabase.from(TABLES.conversations).select('*').eq('customer_phone_normalized', normalized.phone).maybeSingle();
      if (convFetchErr) throw new Error(`Erro ao buscar conversa: ${convFetchErr.message}`);

      const lastMsgText = getLastMessageText(normalized);
      let finalConv: any = null;

      if (!conversation) {
        const { data: newConv, error: convErr } = await supabase.from(TABLES.conversations).insert({
          customer_id: customer.id,
          customer_phone_normalized: normalized.phone,
          status: 'NEW',
          unread_count: 1,
          last_message: String(lastMsgText || "Mensagem recebida"),
          last_message_at: new Date().toISOString(),
          source: 'WhatsApp Z-API'
        }).select().single();
        if (convErr) throw new Error(`Erro ao criar conversa: ${convErr.message}`);
        finalConv = newConv;
      } else {
        const updates: any = {
          last_message: String(lastMsgText || "Mensagem recebida"),
          last_message_at: new Date().toISOString(),
          unread_count: (conversation.unread_count || 0) + 1,
          updated_at: new Date().toISOString()
        };
        
        // Regra de status: Se não tiver responsável ou estiver concluído, volta para NOVO
        const currentStatus = String(conversation.status || "").toUpperCase();
        const isClosed = ["RESOLVED", "CLOSED", "CONCLUIDO", "CONCLUÍDO"].includes(currentStatus);
        
        if (!conversation.assigned_user_id || isClosed) {
          updates.status = 'NEW';
          updates.assigned_user_id = null;
          updates.assigned_user_name = null;
        }

        const { data: updatedConv, error: updateErr } = await supabase.from(TABLES.conversations).update(updates).eq('id', conversation.id).select().single();
        if (updateErr) throw new Error(`Erro ao atualizar conversa: ${updateErr.message}`);
        finalConv = updatedConv;
      }

      if (!finalConv?.id) throw new Error("Falha crítica: Conversa sem ID.");

      // 3. Message (Verificar duplicidade)
      const { data: existingMsg } = await supabase.from(TABLES.messages).select('id').eq('external_message_id', normalized.messageId).maybeSingle();
      
      let finalMessage = null;
      if (!existingMsg) {
        const { data: message, error: msgErr } = await supabase.from(TABLES.messages).insert({
          conversation_id: finalConv.id,
          customer_phone_normalized: normalized.phone,
          external_message_id: normalized.messageId,
          sender_type: 'customer',
          sender_name: normalized.name,
          from_phone: normalized.phone,
          message_type: normalized.type,
          content: String(normalized.text || lastMsgText || "Mensagem recebida"),
          media_url: normalized.mediaUrl,
          status: 'received',
          raw_payload: payload,
          created_at: new Date().toISOString()
        }).select().single();
        if (msgErr) throw new Error(`Erro ao inserir mensagem: ${msgErr.message}`);
        finalMessage = message;
      } else {
        const { data: fullExistingMsg } = await supabase.from(TABLES.messages).select('*').eq('id', existingMsg.id).single();
        finalMessage = fullExistingMsg;
      }

      // 4. Real-time Broadcast
      broadcastEvent("message.received", {
        customer,
        conversation: finalConv,
        message: finalMessage
      });

      return { 
        success: true,
        phone: normalized.phone,
        customer_id: customer.id,
        conversation_id: finalConv.id,
        message_db_id: finalMessage.id,
        customer, 
        conversation: finalConv, 
        message: finalMessage 
      };
    } catch (err: any) {
      console.error("[PROCESS ZAPI ERR]", err);
      throw err;
    }
  }

  // --- Routes ---
  app.get("/api/health", (req, res) => {
    console.log("[HEALTH] Checked at", new Date().toISOString());
    return res.json({
      success: true,
      service: "Viva CRM Backend",
      timestamp: new Date().toISOString(),
      env: process.env.NODE_ENV
    });
  });

  // Diagnóstico Webhook (GET) - Para ver no navegador
  app.get("/api/webhooks/zapi/received", (req, res) => {
    const host = req.get('host');
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const appUrl = (process.env.APP_URL || `${protocol}://${host}`).replace(/\/$/, "");
    const webhookUrl = `${appUrl}/api/webhooks/zapi/received`;
    
    console.log("[ZAPI DIAGNOSTIC] GET request received");
    return res.status(200).json({
      success: true,
      message: "Webhook Z-API ativo. Esta rota recebe POST da Z-API.",
      method: "GET",
      expectedMethod: "POST",
      webhookUrl,
      timestamp: new Date().toISOString()
    });
  });

  // Recebimento Real (POST) - Chamado pela Z-API
  app.post("/api/webhooks/zapi/received", async (req, res) => {
    const payload = req.body || {};
    let logId: string | null = null;
    
    // Log do payload bruto para diagnóstico em tempo real no console do Render/Host
    console.log("[ZAPI RAW PAYLOAD]", JSON.stringify(payload));

    try {
      const normalized = normalizeZapiIncomingMessage(payload);
      
      console.log("[ZAPI WEBHOOK RECEIVED]", { 
        timestamp: new Date().toISOString(),
        phone: normalized.phone || normalized.rawPhone
      });

      // 1. Log imediato (processed = false)
      logId = await saveWebhookLog({
        event_type: "received",
        payload,
        raw_phone: normalized.rawPhone,
        phone_normalized: normalized.phone,
        message_id: normalized.messageId,
        processed: false,
        error: null
      });

      // 2. Processamento central
      const result = await processIncomingZapiMessage(payload) as any;

      // 3. Atualizar log
      if (logId) {
        const isIgnored = !!result.ignored;
        await updateWebhookLog(logId, {
          processed: !isIgnored,
          ignored: isIgnored,
          phone_normalized: result.phone || normalized.phone,
          message_id: result.message?.external_message_id || normalized.messageId,
          customer_id: result.customer?.id,
          conversation_id: result.conversation?.id,
          message_db_id: result.message?.id,
          error: isIgnored ? result.reason : null
        });
      }

      return res.status(200).json({
        success: true,
        message: result.ignored ? `Webhook recebido mas ignorado: ${result.reason}` : "Webhook recebido e processado.",
        result
      });
    } catch (err: any) {
      console.error("[ZAPI WEBHOOK ERROR]", err);
      
      const errorMsg = getErrorMessage(err);

      // 4. Atualizar log com erro
      if (logId) {
        await updateWebhookLog(logId, {
          processed: false,
          error: errorMsg
        });
      }

      // Retornamos 200 para a Z-API não ficar tentando, mas indicamos success: false no JSON
      return res.status(200).json({
        success: false,
        message: "Webhook recebido, mas houve erro no processamento.",
        error: errorMsg
      });
    }
  });

  // Events SSE for fallback Real-time
  app.get("/api/events", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
  });

  app.get("/api/debug/conversations", async (req, res) => {
    try {
      const { data: convs } = await supabase.from('conversations').select(`
        *,
        customer:customer_id(*)
      `).order('updated_at', { ascending: false }).limit(20);

      const { data: msgs } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20);

      return res.json({
        success: true,
        tables: {
          customers: 'customers',
          conversations: 'conversations',
          messages: 'messages'
        },
        conversations: convs || [],
        messages: msgs || []
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/zapi/diagnostic", async (req, res) => {
    try {
      const { config, missing } = getZapiConfig();
      const { data: zapiStatus } = await callZapi("/status");
      
      const { count: custsCount } = await supabase.from(TABLES.customers).select('*', { count: 'exact', head: true });
      const { count: convsCount } = await supabase.from(TABLES.conversations).select('*', { count: 'exact', head: true });
      const { count: msgsCount } = await supabase.from(TABLES.messages).select('*', { count: 'exact', head: true });
      const { count: logsCount } = await supabase.from(TABLES.logs).select('*', { count: 'exact', head: true });
      
      const { data: logs } = await supabase.from(TABLES.logs).select('*').order('created_at', { ascending: false }).limit(5);
      const { data: convs } = await supabase.from(TABLES.conversations).select('*, customer:customer_id(*)').order('last_message_at', { ascending: false }).limit(5);
      
      return res.json({
        success: true,
        zapi: {
          configured: missing.length === 0,
          missing,
          connected: zapiStatus?.connected === true || zapiStatus?.status === 'CONNECTED',
          smartphoneConnected: zapiStatus?.smartphoneConnected === true,
          statusRaw: zapiStatus
        },
        webhooks: {
          receivedUrl: `${getPublicAppUrl()}/api/webhooks/zapi/received`,
          lastLogs: logs || []
        },
        database: {
          tablesUsed: TABLES,
          counts: {
            customers: custsCount || 0,
            conversations: convsCount || 0,
            messages: msgsCount || 0,
            logs: logsCount || 0
          },
          lastConversations: convs || []
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/omnichannel/debug", async (req, res) => {
    try {
      const { count: custsCount } = await supabase.from(TABLES.customers).select('*', { count: 'exact', head: true });
      const { count: convsCount } = await supabase.from(TABLES.conversations).select('*', { count: 'exact', head: true });
      const { count: msgsCount } = await supabase.from(TABLES.messages).select('*', { count: 'exact', head: true });
      
      const { data: logs } = await supabase.from(TABLES.logs).select('*').order('created_at', { ascending: false }).limit(10);
      const { data: convs } = await supabase.from(TABLES.conversations).select('*, customer:customer_id(*)').order('last_message_at', { ascending: false }).limit(5);
      const { data: msgs } = await supabase.from(TABLES.messages).select('*').order('created_at', { ascending: false }).limit(5);

      return res.json({
        success: true,
        configuredTables: TABLES,
        counts: {
          customers: custsCount || 0,
          conversations: convsCount || 0,
          messages: msgsCount || 0
        },
        lastLogs: logs || [],
        lastConversations: convs || [],
        lastMessages: msgs || [],
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/omnichannel/conversations", async (req, res) => {
    try {
      // 1. Listar do banco
      const { data: convs, error: fetchErr } = await supabase.from(TABLES.conversations).select(`
        *,
        customer:customer_id(*)
      `).order('last_message_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      return res.json({
        success: true,
        conversations: convs || []
      });
    } catch (err: any) {
      console.error("[OMNICHANNEL CONVS ERR]", err);
      // Fallback para lista vazia para não quebrar o front
      return res.json({
        success: false,
        error: getErrorMessage(err),
        conversations: []
      });
    }
  });

  app.post("/api/omnichannel/conversations", async (req, res) => {
    try {
      const data = req.body;
      const { data: newConv, error } = await supabase.from(TABLES.conversations)
        .insert({
          ...data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) throw error;

      broadcastEvent("conversation.updated", newConv);
      return res.json({ success: true, conversation: newConv });
    } catch (err: any) {
       return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/omnichannel/conversations/:id/assign", async (req, res) => {
    const { id } = req.params;
    const { userId, userName } = req.body;

    try {
      const { data, error } = await supabase.from(TABLES.conversations).update({
        assigned_user_id: userId,
        assigned_user_name: userName,
        status: 'OPEN',
        updated_at: new Date().toISOString()
      }).eq('id', id).select().single();

      if (error) throw error;

      broadcastEvent("conversation.updated", data);

      return res.json({ success: true, conversation: data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.patch("/api/omnichannel/conversations/:id", async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    try {
      const allowedFields = [
        "status",
        "assigned_user_id",
        "assigned_user_name",
        "team_id",
        "team_name",
        "last_message",
        "last_message_at",
        "unread_count",
        "started_at",
        "closed_at",
        "source"
      ];

      const updates: any = {};
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updates[field] = body[field];
        }
      }

      // Automatically set dates based on status
      if (updates.status === 'OPEN' && !updates.started_at) {
        updates.started_at = new Date().toISOString();
      }
      if (['RESOLVED', 'CLOSED', 'CONCLUIDO'].includes(String(updates.status || "").toUpperCase()) && !updates.closed_at) {
        updates.closed_at = new Date().toISOString();
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase.from(TABLES.conversations)
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error("[PATCH CONV ERR]", error);
        return res.status(error.code === 'PGRST116' ? 404 : 400).json({ 
          success: false, 
          error: error.message 
        });
      }

      broadcastEvent("conversation.updated", data);

      return res.json({ success: true, conversation: data });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/omnichannel/conversations/:id/messages", async (req, res) => {
    const { id } = req.params;
    
    // Validate UUID format to avoid Postgres errors with mock data like "conv3"
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      console.warn(`[OMNICHANNEL MSGS] Invalid UUID: ${id}. Returning empty list.`);
      return res.json({
        success: true,
        messages: [],
        warning: "Identificador inválido para o banco de dados real."
      });
    }

    try {
      const { data: msgs, error } = await supabase.from(TABLES.messages)
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return res.json({
        success: true,
        messages: msgs || []
      });
    } catch (err: any) {
      console.error("[OMNICHANNEL MSGS ERR]", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/omnichannel/conversations/:id/send-message", async (req, res) => {
    const { id } = req.params;
    const { message, agentId, agentName } = req.body;

    try {
      // 0. Check Z-API config
      const { missing } = getZapiConfig();
      if (missing.includes("ZAPI_INSTANCE_ID") || missing.includes("ZAPI_INSTANCE_TOKEN")) {
        return res.status(400).json({ 
          success: false, 
          error: "Z-API não configurada no servidor. Verifique o arquivo .env" 
        });
      }

      // 1. Get conversation and customer
      const { data: conversation, error: convErr } = await supabase.from(TABLES.conversations).select('*, customer:customer_id(*)').eq('id', id).single();
      if (convErr || !conversation) throw new Error("Conversa não encontrada.");

      const phone = conversation.customer_phone_normalized || (conversation.customer as any)?.phone_normalized || (conversation.customer as any)?.phone;
      if (!phone) throw new Error("Telefone do cliente não encontrado.");

      // 2. Send via Z-API
      const zapiResult = await callZapi("/send-text", {
        method: "POST",
        body: JSON.stringify({ phone, message })
      });

      if (!zapiResult.ok) {
        throw new Error(zapiResult.data?.error || "Erro ao enviar mensagem via Z-API");
      }

      // 3. Save to database
      const { data: newMsg, error: msgErr } = await supabase.from(TABLES.messages).insert({
        conversation_id: id,
        sender_type: 'agent',
        sender_name: agentName || 'Agente',
        content: message,
        message_type: 'text',
        status: 'sent',
        external_message_id: zapiResult.data?.messageId || `msg-${Date.now()}`,
        created_at: new Date().toISOString()
      }).select().single();

      if (msgErr) throw msgErr;

      // 4. Update conversation & Auto-assign if needed
      const convUpdates: any = {
        last_message: message,
        last_message_at: new Date().toISOString(),
        status: 'OPEN',
        updated_at: new Date().toISOString()
      };

      if (!conversation.assigned_user_id && agentId) {
        convUpdates.assigned_user_id = agentId;
        convUpdates.assigned_user_name = agentName || 'Agente';
        convUpdates.started_at = new Date().toISOString();
      }

      const { data: updatedConv, error: updateErr } = await supabase.from(TABLES.conversations)
        .update(convUpdates)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) console.error("Error auto-assigning/updating conv:", updateErr);

      broadcastEvent("message.received", {
        conversation: updatedConv || conversation,
        message: newMsg
      });

      return res.json({ success: true, message: newMsg, conversation: updatedConv || conversation });
    } catch (err: any) {
      console.error("[SEND MESSAGE ERR]", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/zapi/webhook-logs/:id/reprocess", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: log, error: logFetchErr } = await supabase.from(TABLES.logs).select('*').eq('id', id).single();
      if (logFetchErr) throw new Error(`Falha ao buscar log: ${logFetchErr.message}`);
      if (!log || !log.payload) throw new Error("Log sem payload.");

      const result = await processIncomingZapiMessage(log.payload);

      if (result.ignored) {
        await updateWebhookLog(id, {
          processed: false,
          error: result.reason || "Webhook ignorado."
        });
      } else {
        await updateWebhookLog(id, {
          processed: true,
          phone_normalized: result.phone || (result as any).customer?.phone_normalized,
          message_id: result.message?.external_message_id,
          customer_id: result.customer?.id,
          conversation_id: result.conversation?.id,
          message_db_id: result.message?.id,
          error: null
        });
      }

      return res.json({ success: true, message: "Webhook reprocessado.", result });
    } catch (err: any) {
      console.error("[REPROCESS ERR]", err);
      if (id) {
        await updateWebhookLog(id, { processed: false, error: getErrorMessage(err) });
      }
      return res.status(200).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/zapi/webhook-logs", async (req, res) => {
    try {
      const { data, error } = await supabase.from(TABLES.logs)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return res.json({ success: true, logs: data || [] });
    } catch (err) {
      return res.status(500).json({ success: false, error: "Falha ao buscar logs", details: getErrorMessage(err), logs: [] });
    }
  });

  app.get("/api/webhook-info", (req, res) => {
    const host = req.get('host');
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const baseUrl = `${protocol}://${host}`;
    res.json({
      baseUrl,
      webhookUrl: `${baseUrl}/api/webhooks/zapi/received`
    });
  });

  app.get("/api/zapi/webhook-urls", (req, res) => {
    const appUrl = getPublicAppUrl();
    return res.json({
      success: true,
      appUrl,
      webhooks: {
        received: `${appUrl}/api/webhooks/zapi/received`,
        sent: `${appUrl}/api/webhooks/zapi/sent`,
        disconnected: `${appUrl}/api/webhooks/zapi/disconnected`,
        connected: `${appUrl}/api/webhooks/zapi/connected`,
        chatPresence: `${appUrl}/api/webhooks/zapi/chat-presence`,
        messageStatus: `${appUrl}/api/webhooks/zapi/message-status`
      }
    });
  });

  app.get("/api/zapi/config-status", async (req, res) => {
    const { config, missing } = getZapiConfig();
    const appUrl = getPublicAppUrl();
    
    const checks = {
      appUrl: !!appUrl && !appUrl.includes("localhost"),
      instanceId: !!config.instanceId,
      instanceToken: !!config.instanceToken,
      healthRoute: true, // We are here
      receivedWebhookRoute: true  // Express handles this
    };

    return res.json({
      success: missing.length === 0,
      configured: missing.length === 0,
      provider: "Z-API",
      appUrl,
      missing,
      checks
    });
  });

  app.post("/api/zapi/register-webhook-received", async (req, res) => {
    try {
      const webhookUrl = `${getPublicAppUrl()}/api/webhooks/zapi/received`;
      console.log(`[ZAPI] Registering webhook-received: ${webhookUrl}`);
      
      const result = await callZapi("/update-webhook-received", {
        method: "PUT",
        body: JSON.stringify({ value: webhookUrl })
      });
      
      return res.status(200).json({
        success: result.ok,
        webhookUrl,
        status: result.status,
        zapiResponse: result.data
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: "Falha ao registrar webhook", details: getErrorMessage(err) });
    }
  });

  app.post("/api/zapi/register-all-webhooks", async (req, res) => {
    const appUrl = getPublicAppUrl();
    const webhooks = [
      { name: "received", path: "/update-webhook-received", url: `${appUrl}/api/webhooks/zapi/received` },
      { name: "sent", path: "/update-webhook-sent", url: `${appUrl}/api/webhooks/zapi/sent` },
      { name: "disconnected", path: "/update-webhook-disconnected", url: `${appUrl}/api/webhooks/zapi/disconnected` },
      { name: "connected", path: "/update-webhook-connected", url: `${appUrl}/api/webhooks/zapi/connected` },
      { name: "chat-presence", path: "/update-webhook-chat-presence", url: `${appUrl}/api/webhooks/zapi/chat-presence` },
      { name: "message-status", path: "/update-webhook-message-status", url: `${appUrl}/api/webhooks/zapi/message-status` }
    ];

    const results = [];
    for (const webhook of webhooks) {
      try {
        const result = await callZapi(webhook.path, {
          method: "PUT",
          body: JSON.stringify({ value: webhook.url })
        });
        results.push({
          name: webhook.name,
          url: webhook.url,
          success: result.ok,
          status: result.status,
          response: result.data
        });
      } catch (err) {
        results.push({
          name: webhook.name,
          url: webhook.url,
          success: false,
          error: getErrorMessage(err)
        });
      }
    }

    return res.json({ success: true, results });
  });

  app.post("/api/zapi/test-received-webhook", async (req, res) => {
    try {
      const payload = {
        type: "ReceivedCallback",
        phone: "5564992421171",
        senderName: "Cliente Teste VIVA",
        text: {
          message: "Mensagem de teste recebida - " + new Date().toLocaleString()
        },
        messageId: "test-" + Date.now(),
        fromMe: false,
        isNewsletter: false,
        isGroup: false,
        broadcast: false,
        status: "RECEIVED",
        isTest: true
      };

      const result = await processIncomingZapiMessage(payload) as any;

      const logId = await saveWebhookLog({
        event_type: "received",
        payload,
        raw_phone: result.rawPhone || "5564992421171",
        phone_normalized: result.phone || "5564992421171",
        message_id: result.message?.external_message_id || payload.messageId,
        processed: true,
        customer_id: result.customer_id,
        conversation_id: result.conversation_id,
        message_db_id: result.message_db_id,
        error: null
      });

      if (result.ignored) {
        throw new Error(result.reason || "Evento ignorado no teste.");
      }

      if (!result.customer_id || !result.conversation_id || !result.message_db_id) {
         throw new Error("O processamento ocorreu, mas não gerou todos os IDs necessários no banco.");
      }

      return res.json({ 
        success: true, 
        message: "Webhook manual processado com sucesso.", 
        phone_normalized: result.phone,
        customer_id: result.customer_id,
        conversation_id: result.conversation_id,
        message_db_id: result.message_db_id,
        result 
      });
    } catch (err) {
      return res.status(200).json({ 
        success: false, 
        message: "Falha ao processar webhook de teste.", 
        error: getErrorMessage(err) 
      });
    }
  });

  // Proxy Z-API send routes
  app.post("/api/zapi/send-text", async (req, res) => {
    const result = await callZapi("/send-text", { method: "POST", body: JSON.stringify(req.body) });
    res.status(result.status).json(result.data);
  });
  app.post("/api/zapi/send-image", async (req, res) => {
    const result = await callZapi("/send-image", { method: "POST", body: JSON.stringify(req.body) });
    res.status(result.status).json(result.data);
  });
  app.post("/api/zapi/send-video", async (req, res) => {
    const result = await callZapi("/send-video", { method: "POST", body: JSON.stringify(req.body) });
    res.status(result.status).json(result.data);
  });
  app.post("/api/zapi/send-audio", async (req, res) => {
    const result = await callZapi("/send-audio", { method: "POST", body: JSON.stringify(req.body) });
    res.status(result.status).json(result.data);
  });
  app.post("/api/zapi/send-document", async (req, res) => {
    const result = await callZapi(`/send-document/${req.body.extension}`, { method: "POST", body: JSON.stringify(req.body) });
    res.status(result.status).json(result.data);
  });

  app.get("/api/zapi/status", async (req, res) => {
    try {
      const result = await callZapi("/status");
      const connected = result.ok && (result.data?.connected === true || result.data?.status === 'CONNECTED');
      
      return res.status(200).json({
        success: result.ok,
        connected: connected,
        smartphoneConnected: result.data?.smartphoneConnected === true,
        status: connected ? "CONNECTED" : (result.data?.status || "DISCONNECTED"),
        raw: result.data
      });
    } catch (err: any) {
      return res.status(200).json({
        success: false,
        connected: false,
        smartphoneConnected: false,
        status: "ERROR",
        error: getErrorMessage(err)
      });
    }
  });

  app.get("/api/zapi/qrcode", async (req, res) => {
    try {
      // 1. Tentar imagem direta primeiro
      const imgResult = await callZapi("/qr-code/image");
      if (imgResult.ok && imgResult.data?.value) {
        return res.json({
          success: true,
          value: imgResult.data.value,
          source: "qr-code-image"
        });
      }

      // 2. Fallback para JSON normal
      const result = await callZapi("/qr-code");
      if (result.ok && result.data?.value) {
        let value = result.data.value;
        // Se não tiver o prefixo de data:image, e parecer base64, adicionamos
        if (!value.startsWith("data:") && value.length > 100) {
          value = `data:image/png;base64,${value}`;
        }
        return res.json({
          success: true,
          value: value,
          source: "qr-code"
        });
      }

      return res.status(200).json({
        success: false,
        error: "QR Code não disponível no momento. Verifique se a instância já está conectada.",
        details: result.data
      });
    } catch (err: any) {
      return res.status(200).json({
        success: false,
        error: "Falha ao buscar QR Code",
        details: getErrorMessage(err)
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server on port ${PORT}`));
}

startServer();
