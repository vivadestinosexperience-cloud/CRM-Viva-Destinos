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
  let phone = String(input || "").replace(/\D/g, "");
  if (!phone) return "";

  // IDs de grupo/chat do WhatsApp geralmente começam com 120363.
  // Não tratar isso como telefone de cliente.
  if (phone.startsWith("120363")) {
    return "";
  }

  if ((phone.length === 10 || phone.length === 11) && !phone.startsWith("55")) {
    phone = `55${phone}`;
  }
  return phone;
}

function extractRealCustomerPhone(payload: any) {
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
    if (normalized && normalized.length >= 12 && normalized.length <= 13) {
      return {
        rawPhone: candidate,
        phoneNormalized: normalized
      };
    }
  }

  return {
    rawPhone: candidates.find(Boolean) || "",
    phoneNormalized: ""
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

  async function saveWebhookLog(data: any) {
    try {
      const { data: log, error } = await supabase.from('zapi_webhook_logs').insert({
        ...data,
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
      await supabase.from('zapi_webhook_logs').update(data).eq('id', id);
    } catch (err) {
      console.error("Update log error", err);
    }
  }

  async function processIncomingZapiMessage(payload: any) {
    const normalized = normalizeZapiIncomingMessage(payload);
    
    if (!normalized.phone) {
      console.warn("[ZAPI] Telefone real do cliente não identificado no payload.");
      return { ignored: true, reason: "Telefone real não identificado no payload da Z-API.", rawPhone: normalized.rawPhone };
    }

    try {
      // 1. Customer
      let { data: customer, error: custFetchErr } = await supabase.from('customers').select('*').eq('phone_normalized', normalized.phone).maybeSingle();
      if (custFetchErr) throw new Error(`Erro ao buscar cliente: ${custFetchErr.message}`);

      if (!customer) {
        const { data: newCust, error: custErr } = await supabase.from('customers').insert({
          name: normalized.name || 'Cliente',
          phone: normalized.phone,
          phone_normalized: normalized.phone,
          origin: normalized.raw?.isTest ? 'Teste' : 'WhatsApp Z-API'
        }).select().single();
        if (custErr) throw new Error(`Erro ao criar cliente: ${custErr.message}`);
        customer = newCust;
      } else if ((customer.name === 'Cliente' || !customer.name) && normalized.name && normalized.name !== 'Cliente') {
        // Atualizar nome se for o default ou vazio
        await supabase.from('customers').update({ name: normalized.name }).eq('id', customer.id);
        customer.name = normalized.name;
      }

      if (!customer?.id) throw new Error("Falha crítica: Cliente sem ID após criação/busca.");

      // 2. Conversation
      let { data: conversation, error: convFetchErr } = await supabase.from('conversations').select('*').eq('customer_phone_normalized', normalized.phone).maybeSingle();
      if (convFetchErr) throw new Error(`Erro ao buscar conversa: ${convFetchErr.message}`);

      const lastMsgText = getLastMessageText(normalized);
      let finalConv: any = null;

      if (!conversation) {
        const { data: newConv, error: convErr } = await supabase.from('conversations').insert({
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
        }

        const { data: updatedConv, error: updateErr } = await supabase.from('conversations').update(updates).eq('id', conversation.id).select().single();
        if (updateErr) throw new Error(`Erro ao atualizar conversa: ${updateErr.message}`);
        finalConv = updatedConv;
      }

      if (!finalConv?.id) throw new Error("Falha crítica: Conversa sem ID.");

      // 3. Message (Verificar duplicidade)
      const { data: existingMsg } = await supabase.from('messages').select('id').eq('external_message_id', normalized.messageId).maybeSingle();
      
      let finalMessage = null;
      if (!existingMsg) {
        const { data: message, error: msgErr } = await supabase.from('messages').insert({
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
        finalMessage = { id: existingMsg.id, alreadyExists: true };
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
      const result = await processIncomingZapiMessage(payload);

      // 3. Atualizar log com sucesso
      if (logId) {
        await updateWebhookLog(logId, {
          processed: !(result as any).ignored,
          phone_normalized: result.phone || (result as any).customer?.phone_normalized,
          message_id: result.message?.external_message_id || normalized.messageId,
          customer_id: result.customer?.id,
          conversation_id: result.conversation?.id,
          message_db_id: result.message?.id,
          error: (result as any).ignored ? (result as any).reason : null
        });
      }

      return res.status(200).json({
        success: true,
        message: (result as any).ignored ? "Webhook recebido mas ignorado." : "Webhook recebido e processado.",
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

  app.get("/api/zapi/receive-debug", async (req, res) => {
    try {
      const { data: logs } = await supabase.from('zapi_webhook_logs').select('*').order('created_at', { ascending: false }).limit(10);
      const { data: convs } = await supabase.from('conversations').select('*, customer:customer_id(*)').order('last_message_at', { ascending: false }).limit(5);
      const { data: msgs } = await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(5);
      
      const { count: logsCount } = await supabase.from('zapi_webhook_logs').select('*', { count: 'exact', head: true });
      const { count: convsCount } = await supabase.from('conversations').select('*', { count: 'exact', head: true });
      const { count: msgsCount } = await supabase.from('messages').select('*', { count: 'exact', head: true });

      return res.json({
        success: true,
        tablesUsed: {
          customers: 'customers',
          conversations: 'conversations',
          messages: 'messages',
          logs: 'zapi_webhook_logs'
        },
        counts: {
          logs: logsCount,
          conversations: convsCount,
          messages: msgsCount
        },
        lastLogs: logs || [],
        lastConversations: convs || [],
        lastMessages: msgs || []
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/omnichannel/conversations", async (req, res) => {
    try {
      const { data: convs, error } = await supabase.from('conversations').select(`
        *,
        customer:customer_id(*)
      `).order('last_message_at', { ascending: false });

      if (error) throw error;

      return res.json({
        success: true,
        conversations: convs || []
      });
    } catch (err: any) {
      console.error("[OMNICHANNEL CONVS ERR]", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/omnichannel/conversations/:id/messages", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: msgs, error } = await supabase.from('messages')
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

  app.post("/api/zapi/webhook-logs/:id/reprocess", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: log, error: logFetchErr } = await supabase.from('zapi_webhook_logs').select('*').eq('id', id).single();
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
      const { data, error } = await supabase.from('zapi_webhook_logs')
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

  app.post("/api/zapi/register-webhook-received", async (req, res) => {
    try {
      const host = req.get('host');
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
      const appUrl = process.env.APP_URL || `${protocol}://${host}`;
      const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/zapi/received`;
      
      console.log(`[ZAPI] Registering webhook: ${webhookUrl}`);
      const result = await callZapi("/update-webhook-received", {
        method: "POST",
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

  app.post("/api/zapi/test-received-webhook", async (req, res) => {
    try {
      const result = await processIncomingZapiMessage({
        phone: "5564999999999",
        senderName: "Cliente Teste",
        text: {
          message: "Mensagem de teste recebida pelo webhook"
        },
        messageId: "test-message-" + Date.now(),
        type: "text",
        isTest: true
      });
      return res.json({ 
        success: true, 
        message: "Webhook manual processado com sucesso. Verifique a aba 'Novos' no Omnichannel.", 
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
    const result = await callZapi("/status");
    res.status(result.status).json(result.data);
  });
  app.get("/api/zapi/qrcode", async (req, res) => {
    const result = await callZapi("/qr-code");
    res.status(result.status).json(result.data);
  });
  app.get("/api/zapi/config-status", (req, res) => {
    const { missing } = getZapiConfig();
    res.json({ configured: missing.length === 0, missing });
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
