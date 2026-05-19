import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import multer from "multer";

dotenv.config();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB limit
  }
});

function getExtensionFromMimeOrFileName(mimeType: string, fileName: string): string {
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop() || 'bin';
  }
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'video/mp4': 'mp4',
    'application/pdf': 'pdf'
  };
  return map[mimeType] || 'bin';
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
}

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

function flattenObject(obj: any, prefix = "", result: Record<string, any> = {}) {
  if (!obj || typeof obj !== "object") return result;

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value, path, result);
    } else {
      result[path] = value;
    }
  }

  return result;
}

function isFilled(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value === true;
  if (typeof value === "number") return true;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v !== "" && v !== "null" && v !== "undefined" && v !== "false";
  }
  return true;
}

function normalizeDirectIndividualPhone(input: any): string {
  const raw = String(input || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "";

  if (lower.includes("-group")) return "";
  if (lower.includes("@g.us")) return "";
  if (lower.includes("@newsletter")) return "";
  if (lower.includes("@broadcast")) return "";
  if (lower.includes("status@broadcast")) return "";

  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("120363")) return "";

  let phone = digits;

  if ((phone.length === 10 || phone.length === 11) && !phone.startsWith("55")) {
    phone = `55${phone}`;
  }

  if (!phone.startsWith("55")) return "";
  if (phone.length < 12 || phone.length > 13) return "";

  return phone;
}

function diagnoseZapiPayloadOrigin(payload: any) {
  const signals: any[] = [];

  const rawPhone = String(payload?.phone || "").trim();
  const lowerPhone = rawPhone.toLowerCase();
  const digitsPhone = rawPhone.replace(/\D/g, "");

  function addSignal(type: string, path: string, value: any, reason: string) {
    signals.push({
      type,
      path,
      value: value === undefined || value === null ? null : String(value),
      reason
    });
  }

  // Bloqueios reais
  if (payload?.fromMe === true) {
    addSignal("from_me", "fromMe", payload.fromMe, "Mensagem enviada pela própria instância.");
  }

  if (payload?.isGroup === true) {
    addSignal("group", "isGroup", payload.isGroup, "Mensagem de grupo detectada por isGroup=true.");
  }

  if (payload?.isNewsletter === true) {
    addSignal("newsletter", "isNewsletter", payload.isNewsletter, "Mensagem de newsletter/canal.");
  }

  if (payload?.broadcast === true) {
    addSignal("broadcast", "broadcast", payload.broadcast, "Mensagem de broadcast.");
  }

  if (payload?.isStatusReply === true) {
    addSignal("status", "isStatusReply", payload.isStatusReply, "Mensagem de status/story.");
  }

  // Bloqueios pelo phone principal
  if (lowerPhone.includes("-group")) {
    addSignal("group", "phone", rawPhone, "Phone contém -group.");
  }

  if (lowerPhone.includes("@g.us")) {
    addSignal("group", "phone", rawPhone, "Phone contém @g.us.");
  }

  if (digitsPhone.startsWith("120363")) {
    addSignal("group_or_channel", "phone", rawPhone, "Phone começa com 120363.");
  }

  if (lowerPhone.includes("@newsletter")) {
    addSignal("newsletter", "phone", rawPhone, "Phone contém @newsletter.");
  }

  if (lowerPhone.includes("@broadcast")) {
    addSignal("broadcast", "phone", rawPhone, "Phone contém @broadcast.");
  }

  if (lowerPhone.includes("status@broadcast")) {
    addSignal("status", "phone", rawPhone, "Phone contém status@broadcast.");
  }

  // Participant só bloqueia se estiver preenchido de verdade
  // Null, false, undefined ou vazio NÃO bloqueiam
  if (isFilled(payload?.participantPhone)) {
    addSignal("group", "participantPhone", payload.participantPhone, "participantPhone preenchido indica mensagem de grupo.");
  }

  if (isFilled(payload?.participant)) {
    addSignal("group", "participant", payload.participant, "participant preenchido indica mensagem de grupo.");
  }

  if (isFilled(payload?.participantLid)) {
    addSignal("group", "participantLid", payload.participantLid, "participantLid preenchido indica mensagem de grupo.");
  }

  if (isFilled(payload?.key?.participant)) {
    addSignal("group", "key.participant", payload.key.participant, "key.participant preenchido indica mensagem de grupo.");
  }

  const phoneNormalized = normalizeDirectIndividualPhone(rawPhone);

  const hasBlockingSignal = signals.some(s =>
    ["group", "group_or_channel", "newsletter", "broadcast", "status", "from_me"].includes(s.type)
  );

  const allowed =
    !hasBlockingSignal &&
    !!phoneNormalized &&
    phoneNormalized.startsWith("55") &&
    phoneNormalized.length >= 12 &&
    phoneNormalized.length <= 13;

  return {
    allowed,
    origin: allowed ? "direct" : ((signals[0]?.type as any) || "invalid"),
    reason: allowed ? null : (signals[0]?.reason || "Payload não é conversa individual válida."),
    rawPhone,
    phoneNormalized: allowed ? phoneNormalized : null,
    signals
  };
}


function normalizeDiagnosticPhone(input: any): string {
  const raw = String(input || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "";

  if (lower.includes("-group")) return "";
  if (lower.includes("@g.us")) return "";
  if (lower.includes("@newsletter")) return "";
  if (lower.includes("@broadcast")) return "";
  if (lower.includes("status@broadcast")) return "";

  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("120363")) return "";

  let phone = digits;

  if ((phone.length === 10 || phone.length === 11) && !phone.startsWith("55")) {
    phone = `55${phone}`;
  }

  if (!phone.startsWith("55")) return "";
  if (phone.length < 12 || phone.length > 13) return "";

  return phone;
}

function diagnosisZapiPayloadForDebug(payload: any) {
  const flat = flattenObject(payload);
  const signals: any[] = [];

  function addSignal(type: string, path: string, value: any, reason: string) {
    signals.push({
      type,
      path,
      value: value === undefined || value === null ? null : String(value),
      reason
    });
  }

  const rawPhone = String(payload?.phone || "").trim();
  const lowerPhone = rawPhone.toLowerCase();
  const digitsPhone = rawPhone.replace(/\D/g, "");

  for (const [path, value] of Object.entries(flat)) {
    const key = String(path).toLowerCase();
    const rawValue = String(value || "");
    const lowerValue = rawValue.toLowerCase();
    const digits = rawValue.replace(/\D/g, "");

    if (key === "fromme" && value === true) {
      addSignal("from_me", path, value, "fromMe=true, mensagem enviada pela própria instância.");
    }

    if (key === "isgroup" && value === true) {
      addSignal("group", path, value, "isGroup=true, mensagem de grupo.");
    }

    if (key.includes("participantphone") && isFilled(value)) {
      addSignal("group", path, value, "participantPhone preenchido, indício de grupo.");
    }

    if ((key.endsWith("participant") || key.includes("participantlid")) && isFilled(value)) {
      addSignal("group", path, value, "participant/participantLid preenchido, indício de grupo.");
    }

    if (key.includes("remotejid") && lowerValue.includes("@g.us")) {
      addSignal("group", path, value, "remoteJid contém @g.us.");
    }

    if (key.includes("chatid") && lowerValue.includes("@g.us")) {
      addSignal("group", path, value, "chatId contém @g.us.");
    }

    if (lowerValue.includes("@g.us")) {
      addSignal("group", path, value, "Valor contém @g.us.");
    }

    if (lowerValue.includes("-group")) {
      addSignal("group", path, value, "Valor contém -group.");
    }

    if (digits.startsWith("120363")) {
      addSignal("group_or_channel", path, value, "Valor começa com 120363.");
    }

    if (lowerValue.includes("@newsletter")) {
      addSignal("newsletter", path, value, "Valor contém @newsletter.");
    }

    if (lowerValue.includes("@broadcast")) {
      addSignal("broadcast", path, value, "Valor contém @broadcast.");
    }

    if (lowerValue.includes("status@broadcast")) {
      addSignal("status", path, value, "Valor contém status@broadcast.");
    }
  }

  if (lowerPhone.includes("-group")) {
    addSignal("group", "phone", rawPhone, "phone contém -group.");
  }

  if (lowerPhone.includes("@g.us")) {
    addSignal("group", "phone", rawPhone, "phone contém @g.us.");
  }

  if (digitsPhone.startsWith("120363")) {
    addSignal("group_or_channel", "phone", rawPhone, "phone começa com 120363.");
  }

  const phoneNormalized = normalizeDiagnosticPhone(rawPhone);

  const hasBlockingSignal = signals.some(s =>
    ["group", "group_or_channel", "newsletter", "broadcast", "status", "from_me"].includes(s.type)
  );

  const shouldAllowAsDirect =
    !hasBlockingSignal &&
    !!phoneNormalized &&
    phoneNormalized.startsWith("55") &&
    phoneNormalized.length >= 12 &&
    phoneNormalized.length <= 13;

  return {
    shouldAllowAsDirect,
    suggestedOrigin: shouldAllowAsDirect ? "direct" : (signals[0]?.type || "invalid"),
    suggestedReason: shouldAllowAsDirect ? null : (signals[0]?.reason || "Payload não parece conversa individual."),
    rawPhone,
    phoneNormalized: shouldAllowAsDirect ? phoneNormalized : null,
    signals,
    flatKeys: Object.keys(flat),
    importantFields: {
      phone: payload?.phone ?? null,
      fromMe: payload?.fromMe ?? null,
      isGroup: payload?.isGroup ?? null,
      participantPhone: payload?.participantPhone ?? null,
      participant: payload?.participant ?? null,
      participantLid: payload?.participantLid ?? null,
      keyParticipant: payload?.key?.participant ?? null,
      keyRemoteJid: payload?.key?.remoteJid ?? null,
      chatId: payload?.chatId ?? null,
      remoteJid: payload?.remoteJid ?? null,
      isNewsletter: payload?.isNewsletter ?? null,
      broadcast: payload?.broadcast ?? null,
      isStatusReply: payload?.isStatusReply ?? null,
      senderName: payload?.senderName ?? null,
      chatName: payload?.chatName ?? null,
      messageId: payload?.messageId ?? null
    }
  };
}

function classifyZapiChatOrigin(payload: any): any {
  return diagnoseZapiPayloadOrigin(payload);
}

function extractDirectCustomerPhone(payload: any) {
  const origin = classifyZapiChatOrigin(payload);

  if (!origin.allowed) {
    return {
      rawPhone: payload?.phone || "",
      phoneNormalized: "",
      ignored: true,
      origin: origin.origin,
      reason: origin.reason
    };
  }

  const normalized = normalizeDirectIndividualPhone(payload?.phone);

  if (!normalized) {
    return {
      rawPhone: payload?.phone || "",
      phoneNormalized: "",
      ignored: true,
      origin: "invalid_phone",
      reason: "Ignorado: telefone individual inválido."
    };
  }

  return {
    rawPhone: payload?.phone || "",
    phoneNormalized: normalized,
    ignored: false,
    origin: "direct",
    reason: null
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
  const phoneData = extractDirectCustomerPhone(payload);
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

  let messageType = "text";
  let content = "";
  let caption = "";
  let mediaUrl = "";
  let mimeType = "";
  let fileName = "";

  if (payload?.image?.imageUrl) {
    messageType = "image";
    mediaUrl = payload.image.imageUrl;
    caption = payload.image.caption || "";
    content = caption || "Imagem recebida";
    mimeType = payload.image.mimeType || "image/jpeg";
    fileName = payload.image.fileName || `img-${messageId}.jpg`;
  } else if (payload?.audio?.audioUrl) {
    messageType = "audio";
    mediaUrl = payload.audio.audioUrl;
    content = "Áudio recebido";
    mimeType = payload.audio.mimeType || "audio/ogg";
    fileName = `audio-${messageId}.ogg`;
  } else if (payload?.video?.videoUrl) {
    messageType = "video";
    mediaUrl = payload.video.videoUrl;
    caption = payload.video.caption || "";
    content = caption || "Vídeo recebido";
    mimeType = payload.video.mimeType || "video/mp4";
    fileName = `video-${messageId}.mp4`;
  } else if (payload?.document?.documentUrl) {
    messageType = "document";
    mediaUrl = payload.document.documentUrl;
    fileName = payload.document.fileName || payload.document.title || `doc-${messageId}`;
    content = fileName || "Documento recebido";
    mimeType = payload.document.mimeType || "application/octet-stream";
  } else {
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

    messageType = "text";
    content = typeof text === "string" ? text : "Mensagem recebida";
  }

  return {
    rawPhone: phoneData.rawPhone,
    phone,
    ignored: !!phoneData.ignored,
    reason: phoneData.reason,
    origin: phoneData.origin,
    name,
    messageId,
    text: content,
    caption,
    type: (messageType as string || "text").toLowerCase(),
    mediaUrl,
    mimeType,
    fileName,
    fromMe: payload.fromMe === true,
    raw: payload
  };
}

function getErrorMessage(error: any): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  return error.message || error.error || "Erro inesperado.";
}

async function persistRemoteMediaToStorage(supabase: any, { mediaUrl, messageId, mimeType, fileName }: { mediaUrl: string, messageId: string, mimeType: string, fileName: string }) {
  if (!mediaUrl) return null;

  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      console.error(`[STORAGE] Failed to fetch remote media: ${response.statusText}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extension = getExtensionFromMimeOrFileName(mimeType, fileName);
    const safeName = sanitizeFileName(fileName || `${messageId}.${extension}`);
    const datePath = new Date().toISOString().slice(0, 10);
    const path = `received/${datePath}/${messageId}-${safeName}`;

    const { error } = await supabase.storage
      .from("chat-media")
      .upload(path, buffer, {
        contentType: mimeType || "application/octet-stream",
        upsert: true
      });

    if (error) {
      console.error("[STORAGE] Error uploading to bucket:", error);
      return null;
    }

    const { data } = supabase.storage
      .from("chat-media")
      .getPublicUrl(path);

    return {
      storagePath: path,
      publicUrl: data.publicUrl
    };
  } catch (err) {
    console.error("[STORAGE] Critical persistence error:", err);
    return null;
  }
}

function getOutgoingMediaLabel(type: string, caption: string, fileName: string): string {
  if (type === 'image') return caption || "Imagem";
  if (type === 'audio') return "Áudio";
  if (type === 'video') return caption || "Vídeo";
  if (type === 'document') return fileName || "Documento";
  return "Mídia";
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
  const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);

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
  whatsapp_accounts: 'whatsapp_accounts',
  teams: 'crm_teams',
  users: 'crm_users'
};

const DEFAULT_TEAM = {
  id: "comercial",
  name: "Comercial"
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
      // If we are marking as processed, ensure it really has the IDs
      if (data.processed === true) {
        const isActuallyProcessed = !!(data.customer_id && data.conversation_id && data.message_db_id);
        if (!isActuallyProcessed && !data.ignored) {
           data.processed = false;
           data.error = data.error || "Faltou gerar IDs de atendimento.";
        }
      }
      await supabase.from(TABLES.logs).update(data).eq('id', id);
    } catch (err) {
      console.error("Update log error", err);
    }
  }

  async function processIncomingZapiMessage(payload: any, logId?: string | null) {
    const diagnosis = diagnoseZapiPayloadOrigin(payload);
    
    if (!diagnosis.allowed) {
      console.warn(`[ZAPI] Mensagem bloqueada: ${diagnosis.reason} [${diagnosis.origin}]`);
      
      if (logId) {
        await supabaseAdmin
          .from("zapi_webhook_logs")
          .update({
            processed: false,
            ignored: true,
            origin: diagnosis.origin,
            raw_phone: diagnosis.rawPhone || null,
            phone_normalized: null,
            customer_id: null,
            conversation_id: null,
            message_db_id: null,
            error: diagnosis.reason,
            diagnostic: diagnosis
          })
          .eq("id", logId);
      }

      return { 
        success: true,
        ignored: true, 
        reason: diagnosis.reason, 
        origin: diagnosis.origin,
        signals: diagnosis.signals,
        rawPhone: String(payload?.phone || ""),
        phone: null 
      };
    }

    const phone = diagnosis.phoneNormalized;
    const normalized = normalizeZapiIncomingMessage(payload);
    
    console.log(`[ZAPI PROCESS] Individual Validado: ${phone} | Nome: ${normalized.name}`);

    // Re-verify after normalization just in case
    if (!phone) {
      const reason = "Telefone individual válido não identificado no processamento final.";
      console.warn(`[ZAPI] Mensagem ignorada: ${reason}`);
      
      if (logId) {
        await supabaseAdmin
          .from("zapi_webhook_logs")
          .update({
            processed: false,
            ignored: true,
            origin: "invalid_phone",
            error: reason,
            diagnostic: diagnosis
          })
          .eq("id", logId);
      }

      return { 
        ignored: true, 
        reason: reason, 
        rawPhone: normalized.rawPhone,
        phone: null 
      };
    }

    try {
      // 0. Persist Media if present
      let storageUrl = "";
      let storagePath = "";
      if (normalized.mediaUrl) {
        const stored = await persistRemoteMediaToStorage(supabase, {
          mediaUrl: normalized.mediaUrl,
          messageId: normalized.messageId,
          mimeType: normalized.mimeType,
          fileName: normalized.fileName
        });
        if (stored) {
          storageUrl = stored.publicUrl;
          storagePath = stored.storagePath;
        }
      }

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
          source: 'WhatsApp Z-API',
          team_id: DEFAULT_TEAM.id,
          team_name: DEFAULT_TEAM.name,
          queue_id: DEFAULT_TEAM.id,
          queue_name: DEFAULT_TEAM.name
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
        
        // Ensure team fallback if missing
        if (!conversation.team_id) {
          updates.team_id = DEFAULT_TEAM.id;
          updates.team_name = DEFAULT_TEAM.name;
          updates.queue_id = DEFAULT_TEAM.id;
          updates.queue_name = DEFAULT_TEAM.name;
        }

        // Regra de status: Se não tiver responsável ou estiver concluído ou ignorado, volta para NOVO
        const currentStatus = String(conversation.status || "").toUpperCase();
        const isClosed = ["RESOLVED", "CLOSED", "CONCLUIDO", "CONCLUÍDO", "IGNORED", "IGNORADO"].includes(currentStatus);
        
        if (!conversation.assigned_user_id || isClosed) {
          updates.status = 'NEW';
          updates.assigned_user_id = null;
          updates.assigned_user_name = null;
          updates.closed_at = null;
          updates.origin = 'direct';
          updates.team_id = DEFAULT_TEAM.id;
          updates.team_name = DEFAULT_TEAM.name;
          updates.queue_id = DEFAULT_TEAM.id;
          updates.queue_name = DEFAULT_TEAM.name;
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
          caption: normalized.caption,
          media_url: normalized.mediaUrl,
          media_storage_url: storageUrl,
          storage_path: storagePath,
          media_mime_type: normalized.mimeType,
          media_file_name: normalized.fileName,
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

      // 5. Update Webhook Log Success
      if (logId) {
        await supabaseAdmin
          .from("zapi_webhook_logs")
          .update({
            processed: true,
            ignored: false,
            origin: "direct",
            phone_normalized: phone,
            customer_id: customer.id,
            conversation_id: finalConv.id,
            message_db_id: finalMessage?.id,
            error: null,
            diagnostic: diagnosis
          })
          .eq("id", logId);
      }

      return { 
        success: true,
        phone: normalized.phone,
        customer_id: customer.id,
        conversation_id: finalConv.id,
        message_db_id: finalMessage?.id,
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
    
    console.log("[ZAPI RAW PAYLOAD]", JSON.stringify(payload));

    try {
      // 1. Criar log bruto (processed = false)
      const initialLog = await supabaseAdmin
        .from("zapi_webhook_logs")
        .insert({
          event_type: "received",
          payload,
          raw_phone: payload?.phone || null,
          processed: false,
          ignored: false,
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();

      logId = initialLog.data?.id || null;

      const origin = classifyZapiChatOrigin(payload);

      if (!origin.allowed) {
        if (logId) {
          await supabaseAdmin
            .from("zapi_webhook_logs")
            .update({
              processed: false,
              ignored: true,
              origin: origin.origin,
              raw_phone: payload?.phone || null,
              phone_normalized: null,
              customer_id: null,
              conversation_id: null,
              message_db_id: null,
              error: origin.reason
            })
            .eq("id", logId);
        }

        return res.status(200).json({
          success: true,
          ignored: true,
          origin: origin.origin,
          reason: origin.reason
        });
      }

      const result = await processIncomingZapiMessage(payload, logId) as any;

      return res.status(200).json({
        success: true,
        ignored: false,
        result
      });
    } catch (err: any) {
      console.error("[ZAPI WEBHOOK ERROR]", err);
      const errorMsg = getErrorMessage(err);

      if (logId) {
        await supabaseAdmin
          .from("zapi_webhook_logs")
          .update({
            processed: false,
            ignored: false,
            error: errorMsg
          })
          .eq("id", logId);
      }

      return res.status(200).json({
        success: false,
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

  app.get("/api/teams", async (req, res) => {
    try {
      const { data: teams, error } = await supabase.from(TABLES.teams || 'crm_teams').select('*').eq('is_active', true);
      
      const defaultTeamsList = [
        { id: DEFAULT_TEAM.id, name: DEFAULT_TEAM.name, is_active: true, color: '#3b82f6' }
      ];

      const combined = [...defaultTeamsList];
      if (teams && teams.length > 0) {
        teams.forEach((t: any) => {
          if (!combined.find(ct => ct.id === t.id)) {
             combined.push(t);
          }
        });
      }

      return res.json({
        success: true,
        teams: combined
      });
    } catch (err: any) {
      return res.json({
        success: true,
        teams: [{ id: DEFAULT_TEAM.id, name: DEFAULT_TEAM.name, is_active: true, color: '#3b82f6' }]
      });
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

      // Filter out IGNORED conversations strictly
      const hiddenStatuses = ["IGNORED", "IGNORADO"];
      const filtered = (convs || []).filter(c => {
        const s = String(c.status || "").toUpperCase();
        return !hiddenStatuses.includes(s);
      });

      const mapped = (filtered || []).map(c => ({
        ...c,
        team_id: c.team_id || DEFAULT_TEAM.id,
        team_name: c.team_name || DEFAULT_TEAM.name,
        queue_id: c.queue_id || c.team_id || DEFAULT_TEAM.id,
        queue_name: c.queue_name || c.team_name || DEFAULT_TEAM.name
      }));

      return res.json({
        success: true,
        conversations: mapped
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
        "queue_id",
        "queue_name",
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

      // Apply fallbacks for team/queue
      if (updates.team_id === undefined && !updates.assigned_user_id && !updates.status) {
         // We might not want to force fallback on EVERY patch, but if we are assigning or changing status, ensure team exists
      }

      if (updates.assigned_user_id || updates.status === 'OPEN') {
         if (!updates.team_id) {
           updates.team_id = DEFAULT_TEAM.id;
           updates.team_name = DEFAULT_TEAM.name;
         }
      }

      if (updates.team_id) {
        if (!updates.team_name) updates.team_name = updates.team_id === DEFAULT_TEAM.id ? DEFAULT_TEAM.name : updates.team_id;
        if (!updates.queue_id) updates.queue_id = updates.team_id;
        if (!updates.queue_name) updates.queue_name = updates.team_name;
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

      // Filter out ignored messages (groups/leaks)
      const filteredMsgs = (msgs || []).filter((m: any) => {
        if (m.ignored) return false;
        
        const payloadStr = JSON.stringify(m.raw_payload || {}).toLowerCase();
        const blockingKeywords = [
          "isgroup\":true",
          "participantphone",
          "participantlid",
          "@g.us",
          "-group",
          "120363",
          "@newsletter",
          "@broadcast",
          "status@broadcast"
        ];

        return !blockingKeywords.some(kw => payloadStr.includes(kw));
      });

      const mappedMsgs = (filteredMsgs || []).map((m: any) => ({
        ...m,
        display_media_url: m.media_storage_url || m.media_url || ""
      }));

      return res.json({
        success: true,
        messages: mappedMsgs
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

      if (!conversation.team_id) {
        convUpdates.team_id = DEFAULT_TEAM.id;
        convUpdates.team_name = DEFAULT_TEAM.name;
        convUpdates.queue_id = DEFAULT_TEAM.id;
        convUpdates.queue_name = DEFAULT_TEAM.name;
      }

      if (!conversation.assigned_user_id && agentId) {
        convUpdates.assigned_user_id = agentId;
        convUpdates.assigned_user_name = agentName || 'Agente';
        if (!conversation.started_at) {
          convUpdates.started_at = new Date().toISOString();
        }
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

  app.post("/api/omnichannel/conversations/:id/send-media", (req, res) => {
    upload.single("file")(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, error: 'Arquivo muito grande. Limite de 25 MB.' });
        }
        return res.status(400).json({ success: false, error: `Erro no upload: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ success: false, error: `Erro inesperado: ${err.message}` });
      }

      const { id } = req.params;
      const { type, caption, sender_user_id, sender_name } = req.body;
      const file = req.file;

      try {
        if (!file) throw new Error("Arquivo não recebido.");

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

        // 2. Upload to Supabase Storage
        const extension = getExtensionFromMimeOrFileName(file.mimetype, file.originalname);
        const safeName = sanitizeFileName(file.originalname || `file-${Date.now()}.${extension}`);
        const datePath = new Date().toISOString().slice(0, 10);
        const storagePath = `sent/${datePath}/${Date.now()}-${safeName}`;

        const { error: uploadErr } = await supabase.storage
          .from("chat-media")
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });

        if (uploadErr) throw uploadErr;

        const { data: storageData } = supabase.storage.from("chat-media").getPublicUrl(storagePath);
        const publicUrl = storageData.publicUrl;

        // 3. Send via Z-API
        let zapiPath = "";
        let zapiBody: any = { phone };

        if (type === 'image') {
          zapiPath = "/send-image";
          zapiBody.image = publicUrl;
          zapiBody.caption = caption || "";
        } else if (type === 'audio') {
          zapiPath = "/send-audio";
          zapiBody.audio = publicUrl;
        } else if (type === 'video') {
          zapiPath = "/send-video";
          zapiBody.video = publicUrl;
          zapiBody.caption = caption || "";
        } else if (type === 'document') {
          zapiPath = `/send-document/${extension}`;
          zapiBody.document = publicUrl;
          zapiBody.fileName = file.originalname;
        } else {
          throw new Error("Tipo de mídia inválido.");
        }

        const zapiResult = await callZapi(zapiPath, {
          method: "POST",
          body: JSON.stringify(zapiBody)
        });

        if (!zapiResult.ok) {
          throw new Error(zapiResult.data?.error || "Erro ao enviar mídia via Z-API");
        }

        // 4. Save to database
        const content = getOutgoingMediaLabel(type, caption, file.originalname);
        const { data: newMsg, error: msgErr } = await supabase.from(TABLES.messages).insert({
          conversation_id: id,
          sender_type: 'agent',
          sender_name: sender_name || 'Agente',
          content,
          caption,
          message_type: type,
          media_url: publicUrl,
          media_storage_url: publicUrl,
          storage_path: storagePath,
          media_mime_type: file.mimetype,
          media_file_name: file.originalname,
          media_size: file.size,
          status: 'sent',
          external_message_id: zapiResult.data?.messageId || `msg-media-${Date.now()}`,
          created_at: new Date().toISOString()
        }).select().single();

        if (msgErr) throw msgErr;

        // 5. Update conversation
        const convUpdates: any = {
          last_message: content,
          last_message_at: new Date().toISOString(),
          status: 'OPEN',
          updated_at: new Date().toISOString()
        };

        if (!conversation.assigned_user_id && sender_user_id) {
          convUpdates.assigned_user_id = sender_user_id;
          convUpdates.assigned_user_name = sender_name || 'Agente';
          convUpdates.started_at = new Date().toISOString();
        }

        const { data: updatedConv, error: updateErr } = await supabase.from(TABLES.conversations)
          .update(convUpdates)
          .eq('id', id)
          .select()
          .single();

        broadcastEvent("message.received", {
          conversation: updatedConv || conversation,
          message: newMsg
        });

        return res.json({ success: true, message: newMsg, conversation: updatedConv || conversation });
      } catch (err: any) {
        console.error("[SEND MEDIA ERR]", err);
        return res.status(500).json({ success: false, error: getErrorMessage(err) });
      }
    });
  });

  // Cleanup route at 1427 removed.


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
          ignored: true,
          error: result.reason || "Webhook ignorado."
        });
      } else {
        await updateWebhookLog(id, {
          processed: true,
          ignored: false,
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

  // --- User Management Admin routes ---

  app.get("/api/admin/users", async (req, res) => {
    try {
      const { data: users, error } = await supabase.from(TABLES.users).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ success: true, users: users || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/admin/users", async (req, res) => {
    const { name, email, password, confirmPassword, role, team_id, team_name, is_active } = req.body;

    try {
      if (!name || !email || !password) throw new Error("Campos obrigatórios: Nome, e-mail e senha.");
      if (password !== confirmPassword) throw new Error("A senha e a confirmação não conferem.");
      if (password.length < 8) throw new Error("A senha deve ter no mínimo 8 caracteres.");

      // 1. Check if user already exists in DB
      const { data: existingUser } = await supabase.from(TABLES.users).select('id').eq('email', email).maybeSingle();
      if (existingUser) throw new Error("Já existe um usuário cadastrado com este e-mail.");

      // 2. Create in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, team_id, team_name }
      });

      if (authError) throw authError;

      // 3. Create in crm_users
      const { data: newUser, error: dbError } = await supabase.from(TABLES.users).insert({
        auth_user_id: authData.user.id,
        name,
        email,
        role: role || 'agent',
        team_id: team_id || DEFAULT_TEAM.id,
        team_name: team_name || DEFAULT_TEAM.name,
        is_active: is_active !== undefined ? is_active : true,
        must_change_password: true
      }).select().single();

      if (dbError) {
        // Rollback Auth user
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw dbError;
      }

      return res.json({ success: true, message: "Usuário criado com sucesso.", user: newUser });
    } catch (err: any) {
      console.error("[CREATE USER ERR]", err);
      return res.status(400).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.patch("/api/admin/users/:id", async (req, res) => {
    const { id } = req.params;
    const { name, role, team_id, team_name, is_active } = req.body;

    try {
      const { data: updatedUser, error } = await supabase.from(TABLES.users)
        .update({
          name,
          role,
          team_id,
          team_name,
          is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Also update auth user metadata if possible
      if (updatedUser.auth_user_id) {
        await supabaseAdmin.auth.admin.updateUserById(updatedUser.auth_user_id, {
          user_metadata: { name, role, team_id, team_name }
        });
      }

      return res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/admin/users/:id/reset-password", async (req, res) => {
    const { id } = req.params;
    const { password, confirmPassword } = req.body;

    try {
      if (!password || password !== confirmPassword) throw new Error("Senhas não conferem.");
      
      const { data: user } = await supabase.from(TABLES.users).select('*').eq('id', id).single();
      if (!user) throw new Error("Usuário não encontrado.");
      if (!user.auth_user_id) throw new Error("Usuário não possui ID de autenticação.");

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.auth_user_id, { password });
      if (authError) throw authError;

      await supabase.from(TABLES.users).update({ must_change_password: true }).eq('id', id);

      return res.json({ success: true, message: "Senha redefinida com sucesso." });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/admin/cleanup-group-conversations", async (req, res) => {
    try {
      // Find conversations that have group-like messages
      const { data: convs, error: fetchErr } = await supabaseAdmin
        .from(TABLES.messages)
        .select('conversation_id')
        .or('raw_payload->>isGroup.eq.true,raw_payload->>phone.ilike.%-group%,raw_payload->>phone.ilike.%@g.us%,raw_payload->>phone.ilike.%@newsletter%,raw_payload->>phone.ilike.%@broadcast%,raw_payload->>phone.ilike.120363%');
      
      if (fetchErr) throw fetchErr;

      const conversationIds = Array.from(new Set(convs?.map(m => m.conversation_id) || []));

      if (conversationIds.length === 0) {
        return res.json({ success: true, message: "Nenhuma conversa de grupo encontrada para limpeza.", count: 0 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from(TABLES.conversations)
        .update({ 
          status: 'IGNORED',
          last_message: 'Conversa ignorada: origem de grupo/canal detectada por limpeza administrativa.',
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', conversationIds);

      if (updateErr) throw updateErr;

      return res.json({ success: true, message: `${conversationIds.length} conversas detectadas como grupo foram marcadas como IGNORADO.`, count: conversationIds.length });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/me/change-password", async (req, res) => {
    const { auth_user_id, password } = req.body;
    try {
      if (!auth_user_id || !password) throw new Error("Faltam dados.");
      
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(auth_user_id, { password });
      if (authError) throw authError;

      await supabase.from(TABLES.users).update({ must_change_password: false }).eq('auth_user_id', auth_user_id);

      return res.json({ success: true, message: "Senha alterada com sucesso." });
    } catch (err: any) {
      return res.status(400).json({ success: false, error: getErrorMessage(err) });
    }
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

  app.post("/api/zapi/diagnose-payload", (req, res) => {
    try {
      const diagnosis = diagnosisZapiPayloadForDebug(req.body || {});
      return res.json({ success: true, diagnosis });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/zapi/diagnostic-test-direct", (req, res) => {
    const payload = {
      "type": "ReceivedCallback",
      "phone": "5564999999999",
      "photo": null,
      "fromMe": false,
      "isEdit": false,
      "status": "RECEIVED",
      "chatLid": null,
      "fromApi": false,
      "isGroup": false,
      "momment": 1779123553000,
      "chatName": "Cliente Individual",
      "broadcast": false,
      "forwarded": false,
      "messageId": "diagnostic-direct-test",
      "instanceId": "diagnostic",
      "senderName": "Cliente Individual",
      "senderPhoto": null,
      "isNewsletter": false,
      "isStatusReply": false,
      "connectedPhone": "556493228859",
      "participantLid": null,
      "participantPhone": null,
      "participant": null,
      "waitingMessage": false,
      "text": {
        "message": "Mensagem individual de diagnóstico"
      }
    };
    return res.json({
      success: true,
      payloadType: "direct",
      diagnosis: diagnosisZapiPayloadForDebug(payload)
    });
  });

  app.get("/api/zapi/diagnostic-test-group", (req, res) => {
    const payload = {
      "type": "ReceivedCallback",
      "phone": "120363019502650977-group",
      "participantPhone": "5564999999999",
      "fromMe": false,
      "isGroup": true,
      "senderName": "Pessoa do Grupo",
      "text": {
        "message": "Mensagem enviada dentro do grupo"
      },
      "messageId": "diagnostic-group-test",
      "status": "RECEIVED"
    };
    return res.json({
      success: true,
      payloadType: "group",
      diagnosis: diagnosisZapiPayloadForDebug(payload)
    });
  });

  app.get("/api/zapi/audit-last-webhooks", async (req, res) => {
    try {
      const limit = Number(req.query.limit || 30);
      const { data: logs, error } = await supabaseAdmin
        .from("zapi_webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      const items = (logs || []).map(log => {
        const payload = log.payload || {};
        const diagnosis = diagnosisZapiPayloadForDebug(payload);
        
        return {
          id: log.id,
          created_at: log.created_at,
          event_type: log.event_type,
          raw_phone: log.raw_phone,
          phone_normalized: log.phone_normalized,
          processed: log.processed,
          ignored: log.ignored,
          origin: log.origin,
          error: log.error,
          customer_id: log.customer_id,
          conversation_id: log.conversation_id,
          message_db_id: log.message_db_id,
          payloadSummary: diagnosis.importantFields,
          diagnosis,
          divergence: {
            createdConversationButDiagnosisSaysBlock: Boolean(log.conversation_id && diagnosis.shouldAllowAsDirect === false),
            ignoredButDiagnosisSaysDirect: Boolean(log.ignored === true && diagnosis.shouldAllowAsDirect === true),
            processedButNoConversation: Boolean(log.processed === true && !log.conversation_id),
            processedButNoMessage: Boolean(log.processed === true && !log.message_db_id)
          }
        };
      });

      return res.json({ success: true, total: items.length, items });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/zapi/audit-visible-conversation-leaks", async (req, res) => {
    try {
      const limit = Number(req.query.limit || 50);
      
      // 1. Get visible conversations (not closed/ignored)
      const hiddenStatuses = ["IGNORED", "IGNORADO", "CLOSED", "RESOLVED", "CONCLUIDO", "CONCLUÍDO", "FINALIZADO"];
      const { data: convs, error: convErr } = await supabaseAdmin
        .from(TABLES.conversations)
        .select('id, status, customer_phone_normalized, assigned_user_id, last_message, created_at')
        .not('status', 'in', `(${hiddenStatuses.join(',')})`)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (convErr) throw convErr;

      const leaks: any[] = [];
      
      for (const conv of (convs || [])) {
        // Get last 5 messages for each conversation to check for group payloads
        const { data: msgs, error: msgErr } = await supabaseAdmin
          .from(TABLES.messages)
          .select('id, created_at, message_type, content, raw_payload')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(5);
        
        if (msgErr) continue;

        for (const msg of (msgs || [])) {
          const diagnosis = diagnosisZapiPayloadForDebug(msg.raw_payload || {});
          if (!diagnosis.shouldAllowAsDirect) {
            leaks.push({
              conversation_id: conv.id,
              conversation_status: conv.status,
              customer_phone_normalized: conv.customer_phone_normalized,
              assigned_user_id: conv.assigned_user_id,
              last_message: conv.last_message,
              conversation_created_at: conv.created_at,
              message_id: msg.id,
              message_created_at: msg.created_at,
              message_type: msg.message_type,
              message_content: msg.content,
              rawPayloadSummary: diagnosis.importantFields,
              diagnosis
            });
            break; // Found a leak in this conversation, move to next
          }
        }
      }

      return res.json({ success: true, total: leaks.length, leaks });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/zapi/audit-conversation-list-logic", async (req, res) => {
    try {
      const { count: allConversations } = await supabaseAdmin.from(TABLES.conversations).select('*', { count: 'exact', head: true });
      
      const { data: statusCounts, error: statusErr } = await supabaseAdmin.rpc('get_conversation_status_counts');
      // Fallback if RPC doesn't exist
      let stats = [];
      if (statusErr) {
        const { data: rawStats } = await supabaseAdmin.from(TABLES.conversations).select('status');
        const counts: Record<string, number> = {};
        (rawStats || []).forEach(c => {
          const s = String(c.status || "UNKNOWN").toUpperCase();
          counts[s] = (counts[s] || 0) + 1;
        });
        stats = Object.entries(counts).map(([status, count]) => ({ status, count }));
      } else {
        stats = statusCounts;
      }

      const hiddenStatuses = ["IGNORED", "IGNORADO"];
      const { count: ignoredCount } = await supabaseAdmin.from(TABLES.conversations).select('*', { count: 'exact', head: true }).in('status', hiddenStatuses);
      
      const closedStatuses = ["CLOSED", "RESOLVED", "CONCLUIDO", "CONCLUÍDO", "FINALIZADO"];
      const { count: closedCount } = await supabaseAdmin.from(TABLES.conversations).select('*', { count: 'exact', head: true }).in('status', closedStatuses);

      const { data: sampleVisible } = await supabaseAdmin
        .from(TABLES.conversations)
        .select('id, status, customer_phone_normalized, last_message, assigned_user_id, team_id, created_at')
        .not('status', 'in', `(${hiddenStatuses.join(',')})`)
        .limit(5);

      const { data: sampleIgnored } = await supabaseAdmin
        .from(TABLES.conversations)
        .select('id, status, customer_phone_normalized, last_message, assigned_user_id, team_id, created_at')
        .in('status', hiddenStatuses)
        .limit(5);

      return res.json({
        success: true,
        totals: {
          allConversations: allConversations || 0,
          ignored: ignoredCount || 0,
          closed: closedCount || 0,
          operational: (allConversations || 0) - (ignoredCount || 0) - (closedCount || 0)
        },
        statuses: stats,
        sampleVisible: sampleVisible || [],
        sampleIgnored: sampleIgnored || []
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/zapi/cleanup-group-leaks", async (req, res) => {
    try {
      // 1. Marcar conversas com mensagens de grupo/canal detectadas
      const { data: leaks, error: fetchErr } = await supabaseAdmin
        .from(TABLES.messages)
        .select('conversation_id')
        .or('raw_payload->>isGroup.eq.true,raw_payload->>phone.ilike.%-group%,raw_payload->>phone.ilike.%@g.us%,raw_payload->>phone.ilike.%@newsletter%,raw_payload->>phone.ilike.%@broadcast%,raw_payload->>phone.ilike.120363%,raw_payload::text.ilike.%participant%');

      if (fetchErr) throw fetchErr;

      // 2. Marcar conversas cujo last_message indica ignorado
      const { data: keywordLeaks, error: kwErr } = await supabaseAdmin
        .from(TABLES.conversations)
        .select('id')
        .or('last_message.ilike.%conversa ignorada%,last_message.ilike.%origem de grupo%,last_message.ilike.%origem de canal%,last_message.ilike.%grupo/canal%');

      if (kwErr) throw kwErr;

      const conversationIds = Array.from(new Set([
        ...(leaks?.map(m => m.conversation_id) || []),
        ...(keywordLeaks?.map(k => k.id) || [])
      ].filter(id => id)));

      if (conversationIds.length === 0) {
        return res.json({ success: true, message: "Nenhuma conversa de grupo encontrada para limpeza.", updated: 0 });
      }

      const { error: updateErr } = await supabaseAdmin
        .from(TABLES.conversations)
        .update({
          status: 'IGNORED',
          last_message: "Conversa ignorada: limpeza definitiva via sistema.",
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .in('id', conversationIds);

      if (updateErr) throw updateErr;

      return res.json({ success: true, updated: conversationIds.length, conversationIds });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/zapi/test-group-block", async (req, res) => {
    try {
      const payload = {
        "type": "ReceivedCallback",
        "phone": "120363019502650977-group",
        "participantPhone": "5564999999999",
        "fromMe": false,
        "isGroup": true,
        "senderName": "Pessoa do Grupo",
        "text": {
          "message": "Mensagem enviada dentro do grupo"
        },
        "messageId": "test-group-" + Date.now(),
        "status": "RECEIVED"
      };

      const result = await processIncomingZapiMessage(payload, null) as any;
      return res.json({
        success: true,
        allowed: !result.ignored,
        ignored: !!result.ignored,
        origin: result.origin,
        reason: result.reason,
        signals: result.signals
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/zapi/test-direct-block", async (req, res) => {
    try {
      const payload = {
        "type": "ReceivedCallback",
        "phone": "5564999999999",
        "photo": null,
        "fromMe": false,
        "isEdit": false,
        "status": "RECEIVED",
        "chatLid": null,
        "fromApi": false,
        "isGroup": false,
        "momment": 1779123553000,
        "chatName": "Cliente Individual",
        "broadcast": false,
        "forwarded": false,
        "messageId": "test-direct-" + Date.now(),
        "instanceId": "3F3486DDE78151B5C6B536ADC5527576",
        "senderName": "Cliente Individual",
        "senderPhoto": null,
        "isNewsletter": false,
        "isStatusReply": false,
        "connectedPhone": "556493228859",
        "participantLid": null,
        "participantPhone": null,
        "participant": null,
        "waitingMessage": false,
        "text": {
          "message": "Mensagem individual de teste"
        }
      };

      const result = await processIncomingZapiMessage(payload, null) as any;

      return res.json({
        success: true,
        allowed: !result.ignored,
        ignored: !!result.ignored,
        origin: result.origin,
        reason: result.reason,
        result
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
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
