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

function normalizeIncomingDirectMessage(payload: any, phone: string) {
  const text =
    payload?.text?.message ||
    payload?.text ||
    payload?.message?.text ||
    payload?.message?.body ||
    payload?.body ||
    payload?.content ||
    "";

  let messageType = "text";
  let content = typeof text === "string" && text.trim()
    ? text
    : "Mensagem recebida";

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
  }

  if (payload?.audio?.audioUrl) {
    messageType = "audio";
    mediaUrl = payload.audio.audioUrl;
    content = "Áudio recebido";
    mimeType = payload.audio.mimeType || "audio/ogg";
  }

  if (payload?.video?.videoUrl) {
    messageType = "video";
    mediaUrl = payload.video.videoUrl;
    caption = payload.video.caption || "";
    content = caption || "Vídeo recebido";
    mimeType = payload.video.mimeType || "video/mp4";
  }

  if (payload?.document?.documentUrl) {
    messageType = "document";
    mediaUrl = payload.document.documentUrl;
    fileName = payload.document.fileName || payload.document.title || "documento";
    content = fileName;
    mimeType = payload.document.mimeType || "application/octet-stream";
  }

  return {
    phone,
    name:
      payload?.senderName ||
      payload?.pushName ||
      payload?.contactName ||
      payload?.chatName ||
      "Cliente",
    messageId:
      payload?.messageId ||
      payload?.id ||
      payload?.key?.id ||
      `zapi-${Date.now()}`,
    messageType,
    content,
    caption,
    mediaUrl,
    mimeType,
    fileName,
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

  async function getAuthenticatedUser(req: express.Request) {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      throw new Error("Token ausente.");
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      throw new Error("Usuário não autenticado.");
    }

    const authUser = data.user;

    const { data: crmUser, error: crmError } = await supabaseAdmin
      .from(TABLES.users)
      .select("*")
      .eq("auth_user_id", authUser.id)
      .single();

    if (crmError || !crmUser) {
      // Tentar buscar por email se não achar por auth_user_id (migração suave)
      const { data: crmUserByEmail } = await supabaseAdmin
        .from(TABLES.users)
        .select("*")
        .eq("email", authUser.email)
        .maybeSingle();

      if (crmUserByEmail) {
        // Atualizar auth_user_id se necessário
        if (!crmUserByEmail.auth_user_id) {
          await supabaseAdmin.from(TABLES.users).update({ auth_user_id: authUser.id }).eq('id', crmUserByEmail.id);
        }
        return crmUserByEmail;
      }
      
      throw new Error("Perfil do usuário não encontrado.");
    }

    if (crmUser.is_active === false) {
      throw new Error("Usuário inativo.");
    }

    return crmUser;
  }

  function formatAgentMessageForWhatsApp(message: string, senderName: string) {
    const cleanMessage = String(message || "").trim();
    const cleanSenderName = String(senderName || "Atendente").trim();

    if (!cleanMessage) return "";

    const prefix = `*${cleanSenderName}:*`;

    // Evitar duplicação se já vier com o prefixo
    if (cleanMessage.startsWith(prefix)) {
      return cleanMessage;
    }

    return `${prefix}\n${cleanMessage}`;
  }

const TABLES = {
  customers: 'crm_customers',
  conversations: 'crm_conversations',
  messages: 'crm_messages',
  logs: 'zapi_webhook_logs',
  whatsapp_accounts: 'whatsapp_accounts',
  teams: 'crm_teams',
  team_members: 'crm_team_members',
  users: 'crm_users',
  presence: 'crm_user_presence',
  tags: 'crm_tags',
  conversation_tags: 'crm_conversation_tags',
  campaigns: 'crm_campaigns',
  campaign_recipients: 'crm_campaign_recipients',
  campaign_events: 'crm_campaign_events'
};

const DEFAULT_TEAM = {
  id: "comercial",
  name: "Comercial"
};

  async function findOrCreateCustomerByPhone(phone: string, name: string) {
    let { data: customer, error: fetchErr } = await supabaseAdmin.from(TABLES.customers).select('*').eq('phone_normalized', phone).maybeSingle();
    if (fetchErr) throw fetchErr;

    if (!customer) {
      const { data: newCust, error: custErr } = await supabaseAdmin.from(TABLES.customers).insert({
        name: name || 'Cliente',
        phone: phone,
        phone_normalized: phone,
        origin: 'WhatsApp Z-API'
      }).select().single();
      if (custErr) throw custErr;
      customer = newCust;
    } else if ((customer.name === 'Cliente' || !customer.name) && name && name !== 'Cliente') {
      await supabaseAdmin.from(TABLES.customers).update({ name }).eq('id', customer.id);
      customer.name = name;
    }

    return customer;
  }

  async function findOrCreateConversationByPhone(phone: string, customer: any, options: any = {}) {
    let { data: conversation, error: convFetchErr } = await supabaseAdmin.from(TABLES.conversations).select('*').eq('customer_phone_normalized', phone).maybeSingle();
    if (convFetchErr) throw convFetchErr;

    if (!conversation) {
      const { data: newConv, error: convErr } = await supabaseAdmin.from(TABLES.conversations).insert({
        customer_id: customer.id,
        customer_phone_normalized: phone,
        status: options.status || 'NEW',
        assigned_user_id: null,
        assigned_user_name: null,
        unread_count: 1,
        last_message: 'Mensagem recebida',
        last_message_at: new Date().toISOString(),
        source: 'WhatsApp Z-API',
        origin: options.origin || 'direct',
        team_id: DEFAULT_TEAM.id,
        team_name: DEFAULT_TEAM.name,
        queue_id: DEFAULT_TEAM.id,
        queue_name: DEFAULT_TEAM.name
      }).select().single();
      if (convErr) throw convErr;
      return newConv;
    }

    // Se a conversa já existe mas o payload é individual direto (options.forceDirect),
    // garantimos que se estiver IGNORED ela reabre.
    if (options.forceDirect) {
      const currentStatus = String(conversation.status || "").toUpperCase();
      const isClosedOrIgnored = ["RESOLVED", "CLOSED", "CONCLUIDO", "CONCLUÍDO", "IGNORED", "IGNORADO"].includes(currentStatus);

      if (!conversation.assigned_user_id || isClosedOrIgnored) {
        const { data: updatedConv, error: updateErr } = await supabaseAdmin.from(TABLES.conversations).update({
          status: options.status || 'NEW',
          assigned_user_id: null,
          assigned_user_name: null,
          closed_at: null,
          origin: options.origin || 'direct',
          team_id: DEFAULT_TEAM.id,
          team_name: DEFAULT_TEAM.name,
          queue_id: DEFAULT_TEAM.id,
          queue_name: DEFAULT_TEAM.name,
          updated_at: new Date().toISOString()
        }).eq('id', conversation.id).select().single();
        if (updateErr) throw updateErr;
        return updatedConv;
      }
    }

    return conversation;
  }

  async function createIncomingDirectMessage(conversation: any, customer: any, normalized: any) {
    // Safety check final: recusar se o payload original tiver sinais de grupo (double-check)
    const diagnosis = diagnoseZapiPayloadOrigin(normalized.raw || {});
    if (!diagnosis.allowed) {
      throw new Error("Bloqueado: tentativa de inserir mensagem de grupo/canal como atendimento direto.");
    }

    // Persist media if present
    let storageUrl = "";
    let storagePath = "";
    if (normalized.mediaUrl) {
      const stored = await persistRemoteMediaToStorage(supabaseAdmin, {
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

    // Verificar duplicidade
    const { data: existingMsg } = await supabaseAdmin.from(TABLES.messages).select('id').eq('external_message_id', normalized.messageId).maybeSingle();
    if (existingMsg) {
      const { data: fullMsg } = await supabaseAdmin.from(TABLES.messages).select('*').eq('id', existingMsg.id).single();
      return fullMsg;
    }

    const { data: message, error } = await supabaseAdmin.from(TABLES.messages).insert({
      conversation_id: conversation.id,
      customer_phone_normalized: normalized.phone,
      external_message_id: normalized.messageId,
      sender_type: 'customer',
      sender_name: normalized.name,
      from_phone: normalized.phone,
      message_type: normalized.messageType,
      content: normalized.content,
      caption: normalized.caption,
      media_url: normalized.mediaUrl,
      media_storage_url: storageUrl,
      storage_path: storagePath,
      media_mime_type: normalized.mimeType,
      media_file_name: normalized.fileName,
      status: 'received',
      raw_payload: normalized.raw,
      ignored: false,
      origin: 'direct',
      created_at: new Date().toISOString()
    }).select().single();

    if (error) throw error;
    return message;
  }

  async function updateConversationAfterIncomingDirectMessage(conversation: any, normalized: any, message: any) {
    await supabaseAdmin.from(TABLES.conversations).update({
      last_message: normalized.content,
      last_message_at: message.created_at || new Date().toISOString(),
      unread_count: (conversation.unread_count || 0) + 1,
      updated_at: new Date().toISOString()
    }).eq('id', conversation.id);
  }

  async function processIncomingDirectZapiMessage(payload: any, logId: string | null, diagnosis: any) {
    if (!diagnosis?.allowed || !diagnosis?.phoneNormalized) {
      throw new Error("Tentativa de processar payload não individual como mensagem direta.");
    }

    const phone = diagnosis.phoneNormalized;
    const normalized = normalizeIncomingDirectMessage(payload, phone);

    const customer = await findOrCreateCustomerByPhone(phone, normalized.name);
    const conversation = await findOrCreateConversationByPhone(phone, customer, {
      forceDirect: true,
      status: "NEW",
      origin: "direct"
    });

    const message = await createIncomingDirectMessage(conversation, customer, normalized);
    await updateConversationAfterIncomingDirectMessage(conversation, normalized, message);

    if (logId) {
      await supabaseAdmin.from("zapi_webhook_logs").update({
        processed: true,
        ignored: false,
        origin: "direct",
        raw_phone: payload?.phone || null,
        phone_normalized: phone,
        customer_id: customer.id,
        conversation_id: conversation.id,
        message_db_id: message.id,
        error: null,
        diagnostic: diagnosis
      }).eq("id", logId);
    }

    broadcastEvent("message.received", { customer, conversation, message });

    return {
      phone_normalized: phone,
      customer_id: customer.id,
      conversation_id: conversation.id,
      message_db_id: message.id
    };
  }

  // --- Campaign Helpers ---
  function normalizeBrazilianPhone(rawPhone: string): string {
    const digits = rawPhone.replace(/\D/g, "");
    if (!digits) return "";
    
    let normalized = digits;
    
    // Se tem 10 ou 11 dígitos e não começa com 55, adiciona 55
    if ((normalized.length === 10 || normalized.length === 11) && !normalized.startsWith("55")) {
      normalized = "55" + normalized;
    }
    
    // Se tem 12 dígitos, começa com 55 e o DDD (pos 2,3) é <= 27, pode faltar o 9.
    // Mas a Z-API costuma lidar bem se enviarmos o número que o WhatsApp espera.
    // Regra geral: Garantir 55 + DDD + [9] + Número.
    
    return normalized;
  }

  const campaignProcessingLocks = new Set<string>();

  async function processCampaignBatch(campaignId: string) {
    if (campaignProcessingLocks.has(campaignId)) return;
    campaignProcessingLocks.add(campaignId);

    try {
      // 1. Buscar campanha
      const { data: campaign, error: cErr } = await supabaseAdmin.from(TABLES.campaigns).select('*').eq('id', campaignId).single();
      if (cErr || !campaign || campaign.status !== 'RUNNING') {
        campaignProcessingLocks.delete(campaignId);
        return;
      }

      // 2. Buscar destinatários pendentes
      const { data: recipients, error: rErr } = await supabaseAdmin.from(TABLES.campaign_recipients)
        .select('*')
        .eq('campaign_id', campaignId)
        .eq('status', 'PENDING')
        .limit(campaign.batch_size || 5);

      if (rErr || !recipients || recipients.length === 0) {
        // Se não tem mais nenhum PENDING, marca como COMPLETED
        const { count } = await supabaseAdmin.from(TABLES.campaign_recipients)
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .eq('status', 'PENDING');
          
        if (count === 0) {
          await supabaseAdmin.from(TABLES.campaigns).update({ 
            status: 'COMPLETED',
            completed_at: new Date().toISOString()
          }).eq('id', campaignId);
          broadcastEvent("campaign.updated", { id: campaignId, status: 'COMPLETED' });
        }
        
        campaignProcessingLocks.delete(campaignId);
        return;
      }

      // 3. Buscar instância Z-API
      const { data: whatsappAccount } = await supabaseAdmin.from(TABLES.whatsapp_accounts)
        .select('*')
        .eq('id', campaign.whatsapp_account_id)
        .single();

      if (!whatsappAccount || !whatsappAccount.zapi_instance_id || !whatsappAccount.zapi_token) {
        await supabaseAdmin.from(TABLES.campaigns).update({ 
          status: 'FAILED',
          error_log: 'Instância WhatsApp não configurada ou inválida.'
        }).eq('id', campaignId);
        campaignProcessingLocks.delete(campaignId);
        return;
      }

      const zapiId = whatsappAccount.zapi_instance_id;
      const zapiToken = whatsappAccount.zapi_token;
      const zapiSecurity = whatsappAccount.zapi_client_token;

      // 4. Disparar mensagens
      for (const recipient of recipients) {
        // Check if campaign was paused/cancelled mid-batch
        const { data: latestCampaign } = await supabaseAdmin.from(TABLES.campaigns).select('status').eq('id', campaignId).single();
        if (latestCampaign?.status !== 'RUNNING') break;

        try {
          await supabaseAdmin.from(TABLES.campaign_recipients).update({ status: 'SENDING' }).eq('id', recipient.id);
          
          let content = campaign.content;
          // Replace variables
          if (recipient.name) content = content.replace(/{{nome}}/g, recipient.name).replace(/{name}/g, recipient.name);
          content = content.replace(/{{telefone}}/g, recipient.phone);

          const payload: any = {
            phone: recipient.phone_normalized,
            message: content
          };

          // TODO: Check if it's an image/media campaign
          const endpoint = campaign.media_url ? "/send-image" : "/send-text";
          if (campaign.media_url) {
            payload.image = campaign.media_url;
            payload.caption = content;
          }

          const { config: zapiGlobalConfig } = getZapiConfig();
          const response = await fetch(`${zapiGlobalConfig.baseUrl}/instances/${zapiId}/token/${zapiToken}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(zapiSecurity ? { 'Client-Token': zapiSecurity } : {})
            },
            body: JSON.stringify(payload)
          });

          const result = await response.json();

          if (response.ok && (result.zaapId || result.messageId)) {
            await supabaseAdmin.from(TABLES.campaign_recipients).update({ 
              status: 'SENT',
              sent_at: new Date().toISOString(),
              error_message: null
            }).eq('id', recipient.id);
          } else {
            throw new Error(result.error || result.message || "Erro desconhecido na Z-API");
          }
        } catch (error: any) {
          console.error(`Error sending campaign message to ${recipient.phone}:`, error);
          await supabaseAdmin.from(TABLES.campaign_recipients).update({ 
            status: 'FAILED',
            error_message: error.message || 'Erro no envio'
          }).eq('id', recipient.id);
        }

        // Intervalo entre mensagens
        const interval = Math.floor(Math.random() * ((campaign.max_interval || 10) - (campaign.min_interval || 5) + 1)) + (campaign.min_interval || 5);
        await new Promise(resolve => setTimeout(resolve, interval * 1000));
      }

      // Update campaign stats after batch
      const { data: stats } = await supabaseAdmin.from(TABLES.campaign_recipients)
        .select('status')
        .eq('campaign_id', campaignId);

      const sentCount = stats?.filter(r => r.status === 'SENT').length || 0;
      const failedCount = stats?.filter(r => r.status === 'FAILED').length || 0;
      const pendingCount = stats?.filter(r => r.status === 'PENDING').length || 0;

      if (pendingCount === 0) {
        await supabaseAdmin.from(TABLES.campaigns).update({ 
          status: 'COMPLETED',
          completed_at: new Date().toISOString(),
          sent_count: sentCount,
          failed_count: failedCount,
          pending_count: 0
        }).eq('id', campaignId);
        broadcastEvent("campaign.updated", { id: campaignId, status: 'COMPLETED' });
      } else {
        await supabaseAdmin.from(TABLES.campaigns).update({ 
          sent_count: sentCount,
          failed_count: failedCount,
          pending_count: pendingCount
        }).eq('id', campaignId);
        
        // Schedule next batch if still running
        const { data: finalCheck } = await supabaseAdmin.from(TABLES.campaigns).select('status').eq('id', campaignId).single();
        if (finalCheck?.status === 'RUNNING') {
          setTimeout(() => processCampaignBatch(campaignId), 2000); // 2s gap between batches
        }
      }

    } catch (err) {
      console.error("Critical error in processCampaignBatch", err);
    } finally {
      campaignProcessingLocks.delete(campaignId);
    }
  }

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
      // 1. Criar log bruto (processed = false)
      const { data: logData, error: logError } = await supabaseAdmin
        .from("zapi_webhook_logs")
        .insert({
          event_type: "received",
          payload,
          raw_phone: payload?.phone || null,
          phone_normalized: null,
          processed: false,
          ignored: false,
          origin: null,
          error: null,
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (logError) {
        console.error("[ZAPI LOG INSERT ERROR]", logError);
      }

      logId = logData?.id || null;

      // 2. Trava absoluta de grupo ANTES de qualquer processamento
      const diagnosis = diagnoseZapiPayloadOrigin(payload);

      if (!diagnosis.allowed) {
        if (logId) {
          await supabaseAdmin
            .from("zapi_webhook_logs")
            .update({
              processed: false,
              ignored: true,
              origin: (diagnosis as any).suggestedOrigin || diagnosis.origin || "blocked",
              raw_phone: diagnosis.rawPhone || payload?.phone || null,
              phone_normalized: null,
              customer_id: null,
              conversation_id: null,
              message_db_id: null,
              error: (diagnosis as any).suggestedReason || diagnosis.reason || "Payload bloqueado: não é conversa individual.",
              diagnostic: diagnosis
            })
            .eq("id", logId);
        }

        return res.status(200).json({
          success: true,
          ignored: true,
          origin: (diagnosis as any).suggestedOrigin || diagnosis.origin,
          reason: (diagnosis as any).suggestedReason || diagnosis.reason,
          signals: diagnosis.signals || []
        });
      }

      // 3. Processar somente se permitido (Mensagem Direta Individual)
      const result = await processIncomingDirectZapiMessage(payload, logId, diagnosis);

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

  async function refreshOfflineUsers() {
    const threshold = new Date(Date.now() - 90 * 1000).toISOString();

    try {
      await supabaseAdmin
        .from(TABLES.presence)
        .update({ is_online: false, updated_at: new Date().toISOString() })
        .lt("last_seen_at", threshold);

      await supabaseAdmin
        .from(TABLES.team_members)
        .update({ is_online: false, updated_at: new Date().toISOString() })
        .lt("last_seen_at", threshold);
    } catch (err) {
      console.error("[REFRESH OFFLINE ERROR]", err);
    }
  }

  async function getNextTeamMemberForQueue(teamId: string) {
    try {
      await refreshOfflineUsers();

      // 1. Buscar membros ativos e disponíveis que participam da fila E ESTÃO ONLINE
      const { data: members, error } = await supabaseAdmin
        .from(TABLES.team_members)
        .select("*")
        .eq("team_id", teamId)
        .eq("is_active", true)
        .eq("receives_queue", true)
        .eq("is_available", true)
        .eq("is_online", true) // Regra obrigatória: só recebe se estiver online
        .order("last_assigned_at", { ascending: true, nullsFirst: true })
        .order("total_assigned", { ascending: true })
        .order("created_at", { ascending: true });

      if (error || !members || members.length === 0) {
        return null;
      }

      return members[0];
    } catch (err) {
      console.error("[GET NEXT MEMBER ERR]", err);
      return null;
    }
  }

  // --- Teams Routes ---
  app.get("/api/teams", async (req, res) => {
    try {
      const { data: teams, error } = await supabaseAdmin.from(TABLES.teams).select('*').order('name', { ascending: true });
      if (error) throw error;
      
      // Ensure Comercial exists in response even if not in DB (virtual fallback or seed)
      let teamsList = teams || [];
      if (!teamsList.find(t => t.id === DEFAULT_TEAM.id)) {
        teamsList.unshift({
          id: DEFAULT_TEAM.id,
          name: DEFAULT_TEAM.name,
          description: "Equipe principal comercial",
          is_active: true
        });
      }

      return res.json({ success: true, teams: teamsList });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: team, error } = await supabaseAdmin.from(TABLES.teams).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      
      const { data: members, error: memErr } = await supabaseAdmin.from(TABLES.team_members).select('*').eq('team_id', id).eq('is_active', true);
      if (memErr) throw memErr;

      return res.json({ success: true, team, members: members || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const { name, description, is_active } = req.body;
      const { data: team, error } = await supabaseAdmin.from(TABLES.teams).insert({
        id: name.toLowerCase().replace(/\s+/g, '-'),
        name,
        description,
        is_active: is_active ?? true
      }).select().single();
      
      if (error) throw error;
      return res.json({ success: true, team });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.patch("/api/teams/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const { name, description, is_active } = req.body;
      
      const { data: team, error } = await supabaseAdmin.from(TABLES.teams).update({
        name,
        description,
        is_active
      }).eq('id', id).select().single();
      
      if (error) throw error;
      return res.json({ success: true, team });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/teams/:id/members", async (req, res) => {
    const { id: team_id } = req.params;
    try {
      const { user_id, user_name, user_email, role_in_team, receives_queue, is_available } = req.body;
      
      // Upsert logic: if exists, re-activate
      const { data: existing } = await supabaseAdmin
        .from(TABLES.team_members)
        .select("*")
        .eq("team_id", team_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        const { data: member, error } = await supabaseAdmin.from(TABLES.team_members).update({
          user_name,
          user_email,
          role_in_team: role_in_team || existing.role_in_team,
          is_active: true,
          receives_queue: receives_queue ?? existing.receives_queue,
          is_available: is_available ?? existing.is_available,
          updated_at: new Date().toISOString()
        }).eq("id", existing.id).select().single();
        if (error) throw error;
        return res.json({ success: true, member });
      }

      const { data: member, error } = await supabaseAdmin.from(TABLES.team_members).insert({
        team_id,
        user_id,
        user_name,
        user_email,
        role_in_team: role_in_team || 'atendente',
        is_active: true,
        receives_queue: receives_queue ?? true,
        is_available: is_available ?? true
      }).select().single();
      
      if (error) throw error;
      return res.json({ success: true, member });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.patch("/api/teams/:id/members/:userId", async (req, res) => {
    const { id: team_id, userId: user_id } = req.params;
    try {
      const { role_in_team, is_active, receives_queue, is_available } = req.body;
      
      const { data: member, error } = await supabaseAdmin
        .from(TABLES.team_members)
        .update({
          role_in_team,
          is_active,
          receives_queue,
          is_available,
          updated_at: new Date().toISOString()
        })
        .match({ team_id, user_id })
        .select()
        .single();
      
      if (error) throw error;
      return res.json({ success: true, member });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/teams/:id/members", async (req, res) => {
    const { id: team_id } = req.params;
    try {
      const { data: members, error } = await supabaseAdmin.from(TABLES.team_members).select('*').eq('team_id', team_id);
      if (error) throw error;
      return res.json({ success: true, members: members || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.delete("/api/teams/:id/members/:userId", async (req, res) => {
    const { id: team_id, userId: user_id } = req.params;
    try {
      // Soft delete/deactivate member
      const { error } = await supabaseAdmin
        .from(TABLES.team_members)
        .update({ 
          is_active: false,
          receives_queue: false,
          is_available: false,
          updated_at: new Date().toISOString()
        })
        .match({ team_id, user_id });
        
      if (error) throw error;
      return res.json({ success: true, message: "Usuário removido da equipe com sucesso." });
    } catch (err: any) {
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
      const { team_id, tag_id } = req.query;
      
      // 1. Iniciar query
      let query = supabase.from(TABLES.conversations).select(`
        *,
        customer:customer_id(*)
      `);

      // 2. Aplicar filtro de equipe se informado e não for 'all'
      if (team_id && team_id !== 'all') {
        query = query.eq('team_id', team_id);
      }

      // 3. Aplicar filtro de tag se informado e não for 'all'
      if (tag_id && tag_id !== 'all') {
        const { data: tagLinks } = await supabaseAdmin
          .from(TABLES.conversation_tags)
          .select('conversation_id')
          .eq('tag_id', tag_id);
        
        const convIds = (tagLinks || []).map(tl => tl.conversation_id);
        if (convIds.length > 0) {
          query = query.in('id', convIds);
        } else {
          // No conversations with this tag
          return res.json({ success: true, conversations: [] });
        }
      }

      const { data: convs, error: fetchErr } = await query.order('last_message_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      // Filter out IGNORED conversations strictly
      const hiddenStatuses = ["IGNORED", "IGNORADO"];
      const filtered = (convs || []).filter(c => {
        const s = String(c.status || "").toUpperCase();
        return !hiddenStatuses.includes(s);
      });

      // 4. Load tags for all filtered conversations
      const allConvIds = filtered.map(c => c.id);
      let conversationsWithTags = filtered;

      if (allConvIds.length > 0) {
        const { data: tagsData } = await supabaseAdmin
          .from(TABLES.conversation_tags)
          .select(`
            conversation_id,
            tag:tag_id (*)
          `)
          .in('conversation_id', allConvIds);
        
        const tagsMap = (tagsData || []).reduce((acc: any, curr: any) => {
          if (!acc[curr.conversation_id]) acc[curr.conversation_id] = [];
          if (curr.tag) acc[curr.conversation_id].push(curr.tag);
          return acc;
        }, {});

        conversationsWithTags = filtered.map(c => ({
          ...c,
          tags: tagsMap[c.id] || []
        }));
      }

      const mapped = (conversationsWithTags || []).map(c => ({
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
      const currentUser = await getAuthenticatedUser(req);
      
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

      // Se o usuário está assumindo a conversa (assigned_user_id está sendo definido)
      // Garantimos que ele só pode assumir para SI MESMO, a menos que seja admin/supervisor
      if (updates.assigned_user_id && updates.assigned_user_id !== currentUser.id) {
        if (currentUser.role !== 'admin' && currentUser.role !== 'supervisor') {
          // Forçar assumir para si mesmo
          updates.assigned_user_id = currentUser.id;
          updates.assigned_user_name = currentUser.name;
        }
      }

      // Se está abrindo sem atribuição, mas quem chamou é um agente, atribui automaticamente?
      // Melhor seguir o que o frontend enviou, mas validar.

      if (updates.status === 'OPEN' && !updates.assigned_user_id) {
        // Se um agente abre, ele assume
        if (currentUser.role === 'agent') {
          updates.assigned_user_id = currentUser.id;
          updates.assigned_user_name = currentUser.name;
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
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.json({
        success: true,
        messages: []
      });
    }

    try {
      const { data: msgs, error } = await supabaseAdmin.from(TABLES.messages)
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter and Normalize
      const filteredAndNormalized = (msgs || []).filter((m: any) => {
        if (m.ignored) return false;
        if (m.origin === "group" || m.origin === "group_or_channel") return false;

        const payload = m.raw_payload || {};
        if (payload.isGroup === true) return false;
        const phone = String(payload.phone || "").toLowerCase();
        if (phone.includes("-group") || phone.includes("@g.us") || phone.startsWith("120363")) return false;
        if (payload.isNewsletter === true || payload.broadcast === true || payload.isStatusReply === true) return false;

        return true;
      }).map((message: any) => {
        let type = String(message.message_type || "text").toLowerCase();

        if (["receivedcallback", "receivedCallback", "ReceivedCallback"].includes(type)) {
          type = "text";
        }

        return {
          ...message,
          normalized_message_type: type,
          display_content: message.content || message.caption || "Mensagem recebida",
          display_media_url: message.media_storage_url || message.media_url || null
        };
      });

      return res.json({
        success: true,
        messages: filteredAndNormalized
      });
    } catch (err: any) {
      console.error("[OMNICHANNEL MSGS ERR]", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/omnichannel/conversations/:id/debug", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: conv } = await supabaseAdmin.from(TABLES.conversations).select('*').eq('id', id).single();
      const { data: messages } = await supabaseAdmin.from(TABLES.messages).select('*').eq('conversation_id', id).order('created_at', { ascending: true });
      
      return res.json({
        success: true,
        conversation: conv,
        totalMessages: messages?.length || 0,
        messages,
        queryUsed: `crm_messages where conversation_id = ${id}`
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/omnichannel/conversations/:id/send-message", async (req, res) => {
    const { id } = req.params;
    const { message } = req.body;

    try {
      // Autenticação Real
      const currentUser = await getAuthenticatedUser(req);

      // 0. Check Z-API config
      const { missing } = getZapiConfig();
      if (missing.includes("ZAPI_INSTANCE_ID") || missing.includes("ZAPI_INSTANCE_TOKEN")) {
        return res.status(400).json({ 
          success: false, 
          error: "Z-API não configurada no servidor. Verifique o arquivo .env" 
        });
      }

      // 1. Get conversation and customer
      const { data: conversation, error: convErr } = await supabaseAdmin.from(TABLES.conversations).select('*, customer:customer_id(*)').eq('id', id).single();
      if (convErr || !conversation) throw new Error("Conversa não encontrada.");

      const phone = conversation.customer_phone_normalized || (conversation.customer as any)?.phone_normalized || (conversation.customer as any)?.phone;
      if (!phone) throw new Error("Telefone do cliente não encontrado.");

      // 1.5 Format Message with Agent Name
      const finalMessage = formatAgentMessageForWhatsApp(message, currentUser.name);

      // 2. Send via Z-API
      const zapiResult = await callZapi("/send-text", {
        method: "POST",
        body: JSON.stringify({ phone, message: finalMessage })
      });

      if (!zapiResult.ok) {
        throw new Error(zapiResult.data?.error || "Erro ao enviar mensagem via Z-API");
      }

      // 3. Save to database
      const { data: newMsg, error: msgErr } = await supabaseAdmin.from(TABLES.messages).insert({
        conversation_id: id,
        customer_phone_normalized: phone,
        sender_type: 'agent',
        sender_user_id: currentUser.id,
        sender_name: currentUser.name,
        content: finalMessage,
        message_type: 'text',
        status: 'sent',
        external_message_id: zapiResult.data?.messageId || `msg-${Date.now()}`,
        created_at: new Date().toISOString()
      }).select().single();

      if (msgErr) throw msgErr;

      // 4. Update conversation & Auto-assign if needed
      const convUpdates: any = {
        last_message: finalMessage,
        last_message_at: new Date().toISOString(),
        status: 'OPEN',
        updated_at: new Date().toISOString()
      };

      if (!conversation.assigned_user_id) {
        convUpdates.assigned_user_id = currentUser.id;
        convUpdates.assigned_user_name = currentUser.name;
        if (!conversation.started_at) {
          convUpdates.started_at = new Date().toISOString();
        }
      }

      const { data: updatedConv, error: updateErr } = await supabaseAdmin.from(TABLES.conversations)
        .update(convUpdates)
        .eq('id', id)
        .select()
        .single();

      if (updateErr) console.error("Error auto-assigning/updating conv:", updateErr);

      broadcastEvent("message.received", {
        conversation: updatedConv || conversation,
        message: {
          ...newMsg,
          normalized_message_type: 'text',
          display_content: newMsg.content
        }
      });

      broadcastEvent("conversation.updated", { conversation: updatedConv || conversation });

      return res.json({ success: true, message: newMsg, conversation: updatedConv || conversation });
    } catch (err: any) {
      console.error("[SEND MESSAGE ERR]", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/omnichannel/conversations/:id/transfer", async (req, res) => {
    const { id } = req.params;
    const { transfer_type, team_id, team_name, user_id, user_name, reason } = req.body;

    if (!transfer_type || !team_id) {
      return res.status(400).json({ success: false, error: "Dados de transferência incompletos." });
    }

    try {
      const { data: conversation, error: convErr } = await supabaseAdmin.from(TABLES.conversations).select("*").eq("id", id).single();
      if (convErr || !conversation) {
        return res.status(404).json({ success: false, error: "Conversa não encontrada." });
      }

      let assigned_user_id = null;
      let assigned_user_name = null;
      let assigned_by_distribution = false;
      let status = "NEW";

      if (transfer_type === "user") {
        if (!user_id) return res.status(400).json({ success: false, error: "Usuário é obrigatório para transferência direta." });
        assigned_user_id = user_id;
        assigned_user_name = user_name || "Operador";
        assigned_by_distribution = false;
        status = "OPEN";
      } else if (transfer_type === "queue") {
        const nextMember = await getNextTeamMemberForQueue(team_id);
        if (nextMember) {
          assigned_user_id = nextMember.user_id;
          assigned_user_name = nextMember.user_name;
          assigned_by_distribution = true;
          status = "OPEN";

          // Update member stats
          await supabaseAdmin.from(TABLES.team_members).update({
            last_assigned_at: new Date().toISOString(),
            total_assigned: (nextMember.total_assigned || 0) + 1
          }).eq("id", nextMember.id);
        } else {
          assigned_user_id = null;
          assigned_user_name = null;
          assigned_by_distribution = false;
          status = "NEW";
        }
      }

      const { data: updatedConv, error: updateErr } = await supabaseAdmin.from(TABLES.conversations).update({
        team_id,
        team_name: team_name || team_id,
        queue_id: team_id,
        queue_name: team_name || team_id,
        assigned_user_id,
        assigned_user_name,
        assigned_by_distribution,
        status,
        updated_at: new Date().toISOString()
      }).eq("id", id).select().single();

      if (updateErr) throw updateErr;

      // Create internal log message
      const logContent = transfer_type === "user" 
        ? `Atendimento transferido para ${assigned_user_name} da equipe ${team_name}.`
        : `Atendimento transferido para a fila da equipe ${team_name}.`;

      await supabaseAdmin.from(TABLES.messages).insert({
        conversation_id: id,
        customer_phone_normalized: conversation.customer_phone_normalized || "",
        sender_type: "system",
        sender_name: "Sistema",
        message_type: "internal_note",
        content: logContent,
        is_internal: true,
        internal_note: true,
        status: "internal",
        created_at: new Date().toISOString()
      });

      broadcastEvent("conversation.updated", { conversation: updatedConv });

      return res.json({ success: true, conversation: updatedConv });
    } catch (err: any) {
      console.error("[TRANSFER ERR]", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/omnichannel/conversations/:id/internal-note", async (req, res) => {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || note.trim() === "") {
      return res.status(400).json({ success: false, error: "A nota não pode ser vazia." });
    }

    try {
      const currentUser = await getAuthenticatedUser(req);
      const { data: conversation, error: convErr } = await supabaseAdmin.from(TABLES.conversations).select("*").eq("id", id).single();
      if (convErr || !conversation) {
        return res.status(404).json({ success: false, error: "Conversa não encontrada." });
      }

      const { data: newMsg, error: msgErr } = await supabaseAdmin.from(TABLES.messages).insert({
        conversation_id: id,
        customer_phone_normalized: conversation.customer_phone_normalized || "",
        sender_type: "internal",
        sender_user_id: currentUser.id,
        sender_name: currentUser.name,
        message_type: "internal_note",
        content: note,
        is_internal: true,
        internal_note: true,
        status: "internal",
        created_at: new Date().toISOString()
      }).select().single();

      if (msgErr) throw msgErr;

      // Update updated_at of conversation, but NOT last_message
      await supabaseAdmin.from(TABLES.conversations)
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);

      broadcastEvent("message.received", {
        conversation_id: id,
        message: {
          ...newMsg,
          normalized_message_type: "internal_note",
          display_content: newMsg.content
        }
      });

      return res.json({ success: true, message: newMsg });
    } catch (err: any) {
      console.error("[INTERNAL NOTE ERR]", err);
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
      const { type, caption } = req.body;
      const file = req.file;

      try {
        const currentUser = await getAuthenticatedUser(req);
        if (!file) throw new Error("Arquivo não recebido.");

        const { missing } = getZapiConfig();
        if (missing.includes("ZAPI_INSTANCE_ID") || missing.includes("ZAPI_INSTANCE_TOKEN")) {
          return res.status(400).json({ 
            success: false, 
            error: "Z-API não configurada no servidor. Verifique o arquivo .env" 
          });
        }

        // 1. Get conversation and customer
        const { data: conversation, error: convErr } = await supabaseAdmin.from(TABLES.conversations).select('*, customer:customer_id(*)').eq('id', id).single();
        if (convErr || !conversation) throw new Error("Conversa não encontrada.");

        const phone = conversation.customer_phone_normalized || (conversation.customer as any)?.phone_normalized || (conversation.customer as any)?.phone;
        if (!phone) throw new Error("Telefone do cliente não encontrado.");

        // 2. Upload to Supabase Storage
        const extension = getExtensionFromMimeOrFileName(file.mimetype, file.originalname);
        const safeName = sanitizeFileName(file.originalname || `file-${Date.now()}.${extension}`);
        const datePath = new Date().toISOString().slice(0, 10);
        const storagePath = `sent/${datePath}/${Date.now()}-${safeName}`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from("chat-media")
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });

        if (uploadErr) throw uploadErr;

        const { data: storageData } = supabaseAdmin.storage.from("chat-media").getPublicUrl(storagePath);
        const publicUrl = storageData.publicUrl;

        // 2.5 Prep Agent Prefix Message for Audio/Document
        if (type === 'audio' || type === 'document') {
          const typeLabel = type === 'audio' ? 'um áudio' : 'um arquivo';
          const introMsg = formatAgentMessageForWhatsApp(`Estou enviando ${typeLabel}.`, currentUser.name);
          await callZapi("/send-text", {
            method: "POST",
            body: JSON.stringify({ phone, message: introMsg })
          });
        }

        // 3. Send via Z-API
        const finalCaption = (type === 'image' || type === 'video') 
          ? formatAgentMessageForWhatsApp(caption || '', currentUser.name)
          : null;

        let zapiPath = "";
        let zapiBody: any = { phone };

        if (type === 'image') {
          zapiPath = "/send-image";
          zapiBody.image = publicUrl;
          if (finalCaption) zapiBody.caption = finalCaption;
        } else if (type === 'audio') {
          zapiPath = "/send-audio";
          zapiBody.audio = publicUrl;
        } else if (type === 'video') {
          zapiPath = "/send-video";
          zapiBody.video = publicUrl;
          if (finalCaption) zapiBody.caption = finalCaption;
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
        const content = finalCaption || (type === 'audio' ? 'Áudio enviado' : `Arquivo: ${safeName}`);
        const { data: newMsg, error: msgErr } = await supabaseAdmin.from(TABLES.messages).insert({
          conversation_id: id,
          customer_phone_normalized: phone,
          sender_type: 'agent',
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          content,
          caption: finalCaption,
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

        if (!conversation.assigned_user_id) {
          convUpdates.assigned_user_id = currentUser.id;
          convUpdates.assigned_user_name = currentUser.name;
          convUpdates.started_at = new Date().toISOString();
        }

        const { data: updatedConv, error: updateErr } = await supabaseAdmin.from(TABLES.conversations)
          .update(convUpdates)
          .eq('id', id)
          .select()
          .single();

        broadcastEvent("message.received", {
          conversation: updatedConv || conversation,
          message: {
            ...newMsg,
            normalized_message_type: type,
            display_content: newMsg.content,
            display_media_url: publicUrl
          }
        });

        broadcastEvent("conversation.updated", { conversation: updatedConv || conversation });

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
      const { data: log, error: logFetchErr } = await supabaseAdmin.from(TABLES.logs).select('*').eq('id', id).single();
      if (logFetchErr) throw new Error(`Falha ao buscar log: ${logFetchErr.message}`);
      if (!log || !log.payload) throw new Error("Log sem payload.");

      const payload = log.payload;
      const diagnosis = diagnoseZapiPayloadOrigin(payload);

      if (!diagnosis.allowed) {
        await updateWebhookLog(id, {
          processed: false,
          ignored: true,
          origin: (diagnosis as any).suggestedOrigin || diagnosis.origin || "blocked",
          error: (diagnosis as any).suggestedReason || diagnosis.reason || "Webhook ignorado no reprocessamento."
        });
        return res.json({ success: true, message: "Webhook ignorado.", diagnosis });
      }

      const result = await processIncomingDirectZapiMessage(payload, id, diagnosis);

      return res.json({ success: true, message: "Webhook reprocessado com sucesso.", result });
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
    try {
      const currentUser = await getAuthenticatedUser(req);
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ success: false, error: "Apenas administradores podem criar usuários." });
      }

      const { name, email, password, confirmPassword, role, team_id, team_name, is_active } = req.body;
      if (!name || !email || !password) throw new Error("Campos obrigatórios: Nome, e-mail e senha.");
      if (password !== confirmPassword) throw new Error("A senha e a confirmação não conferem.");
      if (password.length < 8) throw new Error("A senha deve ter no mínimo 8 caracteres.");

      // 1. Check if user already exists in CRM DB
      const { data: existingCrmUser } = await supabaseAdmin.from(TABLES.users).select('id').eq('email', email).maybeSingle();
      
      let authUserId = null;

      // 2. Try to create in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, team_id: team_id || DEFAULT_TEAM.id, team_name: team_name || DEFAULT_TEAM.name }
      });

      if (authError) {
        // Se já existe no Auth
        if (authError.message.includes("already registered") || authError.status === 422) {
          // Se já existe no CRM
          if (existingCrmUser) {
            return res.status(400).json({ success: false, error: "Já existe um usuário cadastrado com este e-mail no CRM." });
          }
          
          // Se existe no Auth mas não no CRM, pegamos o ID
          const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          if (listError) throw listError;
          
          const existingAuthUser = (listData.users as any[]).find(u => u.email === email);
          if (!existingAuthUser) throw new Error("Usuário já registrado no Auth, mas erro ao recuperar ID.");
          
          authUserId = existingAuthUser.id;
        } else {
          throw authError;
        }
      } else {
        authUserId = authData.user.id;
      }

      // 3. Create or update in crm_users (Profile)
      const { data: newUser, error: dbError } = await supabaseAdmin.from(TABLES.users).upsert({
        auth_user_id: authUserId,
        name,
        email,
        role: role || 'agent',
        team_id: team_id || DEFAULT_TEAM.id,
        team_name: team_name || DEFAULT_TEAM.name,
        is_active: is_active !== undefined ? is_active : true,
        must_change_password: true
      }, { onConflict: 'email' }).select().single();

      if (dbError) throw dbError;

      // 4. Create or reactivate link in crm_team_members
      const { error: teamError } = await supabaseAdmin.from(TABLES.team_members).upsert({
        team_id: newUser.team_id || team_id || DEFAULT_TEAM.id,
        user_id: newUser.id,
        user_name: newUser.name,
        user_email: newUser.email,
        role_in_team: newUser.role,
        is_active: true,
        receives_queue: true,
        is_available: true
      }, { onConflict: 'team_id,user_id' });

      if (teamError) {
        console.error("[TEAM MEMBER ERR]", teamError);
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

  // --- Presence Routes ---
  app.post("/api/me/presence/heartbeat", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const { current_route } = req.body;
      const now = new Date().toISOString();

      // Update Presence Table
      await supabaseAdmin.from(TABLES.presence).upsert({
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_email: currentUser.email,
        is_online: true,
        last_seen_at: now,
        current_route,
        updated_at: now
      }, { onConflict: 'user_id' });

      // Update Team Members Table
      await supabaseAdmin.from(TABLES.team_members).update({
        is_online: true,
        last_seen_at: now,
        updated_at: now
      }).eq("user_id", currentUser.id);

      return res.json({ success: true, timestamp: now });
    } catch (err: any) {
      return res.status(401).json({ success: false, error: err.message });
    }
  });

  app.post("/api/me/presence/offline", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const now = new Date().toISOString();

      await supabaseAdmin.from(TABLES.presence).update({
        is_online: false,
        updated_at: now
      }).eq("user_id", currentUser.id);

      await supabaseAdmin.from(TABLES.team_members).update({
        is_online: false,
        updated_at: now
      }).eq("user_id", currentUser.id);

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(401).json({ success: false, error: err.message });
    }
  });

  app.get("/api/users/presence", async (req, res) => {
    try {
      await refreshOfflineUsers();
      const { data: presence, error } = await supabaseAdmin.from(TABLES.presence).select('*');
      if (error) throw error;
      return res.json({ success: true, presence: presence || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.patch("/api/teams/:id/distribution", async (req, res) => {
    const { id } = req.params;
    try {
      const { distribution_enabled, distribution_mode } = req.body;
      const { data: team, error } = await supabaseAdmin.from(TABLES.teams).update({
        distribution_enabled,
        distribution_mode: distribution_mode || 'round_robin'
      }).eq('id', id).select().single();
      
      if (error) throw error;
      return res.json({ success: true, team });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/omnichannel/conversations/:id/transfer", async (req, res) => {
    const { id: conversationId } = req.params;
    try {
      const { transfer_type, team_id, team_name, user_id, user_name, reason } = req.body;
      
      if (!conversationId || !team_id || !transfer_type) {
        return res.status(400).json({ success: false, error: "Dados incompletos para transferência." });
      }

      const now = new Date().toISOString();
      let assignedUserId = user_id || null;
      let assignedUserName = user_name || null;
      let status = assignedUserId ? "OPEN" : "NEW";
      let assignedByDistribution = false;
      let systemMessage = "";

      // 1. Get Team Info to check distribution
      const { data: team } = await supabaseAdmin.from(TABLES.teams).select("*").eq("id", team_id).single();
      
      if (transfer_type === 'queue') {
        if (team && team.distribution_enabled) {
          const nextMember = await getNextTeamMemberForQueue(team_id);
          if (nextMember) {
            assignedUserId = nextMember.user_id;
            assignedUserName = nextMember.user_name;
            status = "OPEN";
            assignedByDistribution = true;
            
            // Update member assignment stats
            await supabaseAdmin.from(TABLES.team_members).update({
              last_assigned_at: now,
              total_assigned: (nextMember.total_assigned || 0) + 1,
              updated_at: now
            }).eq("id", nextMember.id);

            systemMessage = `Sistema: Atendimento transferido para a equipe ${team_name} e atribuído automaticamente para ${assignedUserName}.`;
          } else {
            systemMessage = `Sistema: Atendimento transferido para a fila da equipe ${team_name}.`;
          }
        } else {
          systemMessage = `Sistema: Atendimento transferido para a fila da equipe ${team_name}.`;
        }
      } else if (transfer_type === 'user') {
        systemMessage = `Sistema: Atendimento transferido para ${assignedUserName} da equipe ${team_name}.`;
      }

      // 2. Update Conversation
      const { data: conversation, error: updateErr } = await supabaseAdmin.from(TABLES.conversations).update({
        team_id,
        team_name: team_name || (team ? team.name : team_id),
        queue_id: team_id,
        queue_name: team_name || (team ? team.name : team_id),
        assigned_user_id: assignedUserId,
        assigned_user_name: assignedUserName,
        status,
        transfer_reason: reason || null,
        updated_at: now
      }).eq("id", conversationId).select().single();

      if (updateErr) throw updateErr;

      // 3. Create Internal Message
      await supabaseAdmin.from(TABLES.messages).insert({
        conversation_id: conversationId,
        message_type: "internal_note",
        sender_type: "system",
        sender_name: "Sistema",
        content: systemMessage + (reason ? ` Motivo: ${reason}` : ""),
        is_internal: true,
        internal_note: true,
        status: "internal",
        created_at: now
      });

      broadcastEvent("conversation.updated", conversation);
      broadcastEvent("message.received", { conversation_id: conversationId });

      return res.json({ success: true, conversation });
    } catch (err: any) {
      console.error("[TRANSFER ERR]", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  // --- Tags Management ---
  // --- User Identity ---
  app.get("/api/me", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      return res.json({ success: true, user });
    } catch (err: any) {
      return res.status(401).json({ success: false, error: err.message });
    }
  });

  app.get("/api/admin/users/diagnostic", async (req, res) => {
    try {
      const { data: users, error } = await supabaseAdmin.from(TABLES.users).select('*');
      if (error) throw error;

      const authIds = users?.map(u => u.auth_user_id).filter(id => !!id) || [];
      const duplicates = authIds.filter((item, index) => authIds.indexOf(item) !== index);

      const diagnostic = {
        total: users?.length || 0,
        no_auth_id: users?.filter(u => !u.auth_user_id).map(u => u.email) || [],
        duplicate_auth_id: users?.filter(u => u.auth_user_id && duplicates.includes(u.auth_user_id)).map(u => u.email) || [],
        no_team: users?.filter(u => !u.team_id).map(u => u.email) || [],
        inactive: users?.filter(u => !u.is_active).map(u => u.email) || []
      };

      return res.json({ success: true, diagnostic });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // --- Campaign Routes ---
  app.get("/api/campaigns", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from(TABLES.campaigns).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ success: true, campaigns: data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/optimize", async (req, res) => {
    try {
      const { contacts } = req.body;
      if (!contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ success: false, error: "Lista de contatos inválida" });
      }

      const optimized = contacts.reduce((acc: any[], current: any) => {
        const phone = String(current.phone || "").replace(/\D/g, "");
        if (!phone || phone.length < 10) return acc;

        const normalized = normalizeBrazilianPhone(phone);
        const isDuplicate = acc.some(item => item.phone_normalized === normalized);

        if (!isDuplicate) {
          acc.push({
            name: current.name || "",
            phone: phone,
            phone_normalized: normalized,
            variables: current.variables || {}
          });
        }
        return acc;
      }, []);

      return res.json({ 
        success: true, 
        originalCount: contacts.length,
        optimizedCount: optimized.length,
        contacts: optimized 
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      const { name, whatsapp_account_id, content, media_url, contacts, batch_size, min_interval, max_interval } = req.body;

      if (!name || !whatsapp_account_id || !content || !contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ success: false, error: "Dados incompletos para criação da campanha" });
      }

      const { data: campaign, error: cErr } = await supabaseAdmin.from(TABLES.campaigns).insert({
        name,
        whatsapp_account_id,
        content,
        media_url,
        status: 'DRAFT',
        recipients_count: contacts.length,
        pending_count: contacts.length,
        batch_size: batch_size || 5,
        min_interval: min_interval || 5,
        max_interval: max_interval || 10,
        created_by: user.id
      }).select().single();

      if (cErr) throw cErr;

      const recipients = contacts.map(c => ({
        campaign_id: campaign.id,
        name: c.name,
        phone: c.phone,
        phone_normalized: c.phone_normalized,
        variables: c.variables || {},
        status: 'PENDING'
      }));

      // Inserir destinatários em lotes para evitar timeout do Supabase
      const chunkSize = 500;
      for (let i = 0; i < recipients.length; i += chunkSize) {
        const chunk = recipients.slice(i, i + chunkSize);
        await supabaseAdmin.from(TABLES.campaign_recipients).insert(chunk);
      }

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from(TABLES.campaigns).select('*').eq('id', req.params.id).single();
      if (error) throw error;
      return res.json({ success: true, campaign: data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/campaigns/:id/recipients", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from(TABLES.campaign_recipients).select('*').eq('campaign_id', req.params.id).order('created_at', { ascending: true });
      if (error) throw error;
      return res.json({ success: true, recipients: data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/start", async (req, res) => {
    try {
      const { data: campaign } = await supabaseAdmin.from(TABLES.campaigns).update({
        status: 'RUNNING',
        started_at: new Date().toISOString()
      }).eq('id', req.params.id).select().single();

      processCampaignBatch(req.params.id);

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/pause", async (req, res) => {
    try {
      const { data: campaign } = await supabaseAdmin.from(TABLES.campaigns).update({
        status: 'PAUSED'
      }).eq('id', req.params.id).select().single();

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/resume", async (req, res) => {
    try {
      const { data: campaign } = await supabaseAdmin.from(TABLES.campaigns).update({
        status: 'RUNNING'
      }).eq('id', req.params.id).select().single();

      processCampaignBatch(req.params.id);

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/cancel", async (req, res) => {
    try {
      const { data: campaign } = await supabaseAdmin.from(TABLES.campaigns).update({
        status: 'CANCELED'
      }).eq('id', req.params.id).select().single();

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      await supabaseAdmin.from(TABLES.campaigns).delete().eq('id', req.params.id);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/retry-failed", async (req, res) => {
    try {
      await supabaseAdmin.from(TABLES.campaign_recipients)
        .update({ status: 'PENDING' })
        .eq('campaign_id', req.params.id)
        .eq('status', 'FAILED');

      const { data: campaign } = await supabaseAdmin.from(TABLES.campaigns).update({
        status: 'RUNNING',
        failed_count: 0
      }).eq('id', req.params.id).select().single();

      processCampaignBatch(req.params.id);

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/tags", async (req, res) => {
    try {
      const { data: tags, error } = await supabaseAdmin
        .from(TABLES.tags)
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return res.json({ success: true, tags: tags || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/tags", async (req, res) => {
    try {
      const { name, color, description } = req.body;
      if (!name) return res.status(400).json({ success: false, error: "Nome da etiqueta é obrigatório." });

      const { data: tag, error } = await supabaseAdmin
        .from(TABLES.tags)
        .insert({ name, color: color || '#2563EB', description, is_active: true })
        .select()
        .single();
      
      if (error) throw error;
      return res.json({ success: true, tag });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.patch("/api/tags/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const updates = req.body;
      const { data: tag, error } = await supabaseAdmin
        .from(TABLES.tags)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return res.json({ success: true, tag });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.delete("/api/tags/:id", async (req, res) => {
    const { id } = req.params;
    try {
      // Soft delete
      const { error } = await supabaseAdmin
        .from(TABLES.tags)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);
      
      if (error) throw error;
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  // --- Conversation Tags ---
  app.get("/api/omnichannel/conversations/:id/tags", async (req, res) => {
    const { id } = req.params;
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLES.conversation_tags)
        .select(`
          tag_id,
          tags:tag_id (*)
        `)
        .eq('conversation_id', id);
      
      if (error) throw error;
      return res.json({ success: true, tags: data?.map((d: any) => d.tags) || [] });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/omnichannel/conversations/:id/tags", async (req, res) => {
    const { id: conversationId } = req.params;
    try {
      const { tag_id, created_by, created_by_name } = req.body;
      if (!tag_id) return res.status(400).json({ success: false, error: "tag_id is required" });

      const { data, error } = await supabaseAdmin
        .from(TABLES.conversation_tags)
        .upsert({
          conversation_id: conversationId,
          tag_id,
          created_by,
          created_by_name
        }, { onConflict: 'conversation_id,tag_id' })
        .select()
        .single();
      
      if (error) throw error;

      // Get tag info to update conversation state if needed
      const { data: tag } = await supabaseAdmin.from(TABLES.tags).select('*').eq('id', tag_id).single();
      
      broadcastEvent("conversation.updated", { id: conversationId });

      return res.json({ success: true, tag });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.delete("/api/omnichannel/conversations/:id/tags/:tagId", async (req, res) => {
    const { id: conversationId, tagId } = req.params;
    try {
      const { error } = await supabaseAdmin
        .from(TABLES.conversation_tags)
        .delete()
        .eq('conversation_id', conversationId)
        .eq('tag_id', tagId);
      
      if (error) throw error;
      
      broadcastEvent("conversation.updated", { id: conversationId });
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  // --- Lead Details ---
  app.get("/api/omnichannel/conversations/:id/details", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: conversation, error: convErr } = await supabaseAdmin
        .from(TABLES.conversations)
        .select(`
          *,
          customers:customer_id (*)
        `)
        .eq('id', id)
        .single();
      
      if (convErr) throw convErr;

      // 1. Get first interaction
      const { data: firstMsg } = await supabaseAdmin
        .from(TABLES.messages)
        .select('created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      // 2. Get last interaction
      const { data: lastMsg } = await supabaseAdmin
        .from(TABLES.messages)
        .select('created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // 3. Get total messages count
      const { count: totalMessages } = await supabaseAdmin
        .from(TABLES.messages)
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', id);

      // 4. Get tags
      const { data: tagLinks } = await supabaseAdmin
        .from(TABLES.conversation_tags)
        .select(`
          tags:tag_id (*)
        `)
        .eq('conversation_id', id);

      const details = {
        ...conversation,
        customer: conversation.customers,
        first_interaction_at: firstMsg?.created_at || null,
        last_interaction_at: lastMsg?.created_at || conversation.last_message_at || conversation.updated_at,
        total_messages: totalMessages || 0,
        tags: tagLinks?.map((tl: any) => tl.tags) || []
      };

      return res.json({ success: true, details });
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
      // 1. Detectar conversas que tenham qualquer sinal de grupo nas mensagens
      const { data: leaks, error: fetchErr } = await supabaseAdmin
        .from(TABLES.messages)
        .select('conversation_id, raw_payload')
        .or('raw_payload->>isGroup.eq.true,raw_payload->>phone.ilike.%-group%,raw_payload->>phone.ilike.%@g.us%,raw_payload->>phone.ilike.%@newsletter%,raw_payload->>phone.ilike.%@broadcast%,raw_payload->>phone.ilike.120363%,raw_payload::text.ilike.%participant%');

      if (fetchErr) throw fetchErr;

      const groupConvIds = new Set<string>();
      (leaks || []).forEach((m: any) => {
        const diag = diagnoseZapiPayloadOrigin(m.raw_payload || {});
        if (!diag.allowed) {
          groupConvIds.add(m.conversation_id);
        }
      });

      // 2. Marcar conversas cujo last_message indica ignorado (opcional, mas bom manter)
      const { data: keywordLeaks, error: kwErr } = await supabaseAdmin
          .from(TABLES.conversations)
          .select('id')
          .or('last_message.ilike.%conversa ignorada%,last_message.ilike.%origem de grupo%,last_message.ilike.%origem de canal%,last_message.ilike.%grupo/canal%');

      if (kwErr) throw kwErr;
      (keywordLeaks || []).forEach((k: any) => groupConvIds.add(k.id));

      const conversationIds = Array.from(groupConvIds).filter(id => id);

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
        "phone": "120363189375750721-group",
        "fromMe": false,
        "isGroup": true,
        "participantPhone": "556492937336",
        "senderName": "Polly",
        "chatName": "Divulga caldas novas",
        "text": {
          "message": "Mensagem de grupo de teste"
        },
        "messageId": "test-group-" + Date.now(),
        "status": "RECEIVED"
      };

      const diagnosis = diagnoseZapiPayloadOrigin(payload);
      if (!diagnosis.allowed) {
        return res.json({
          success: true,
          ignored: true,
          origin: diagnosis.origin,
          reason: diagnosis.reason,
          signals: diagnosis.signals
        });
      }

      const result = await processIncomingDirectZapiMessage(payload, null, diagnosis);
      return res.json({
        success: true,
        allowed: true,
        ignored: false,
        result
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/zapi/test-direct-block", async (req, res) => {
    try {
      const payload = {
        "type": "ReceivedCallback",
        "phone": "5511945302767",
        "fromMe": false,
        "isGroup": false,
        "participantPhone": null,
        "participant": null,
        "participantLid": null,
        "broadcast": false,
        "isNewsletter": false,
        "isStatusReply": false,
        "senderName": "Joseane",
        "chatName": "Josy Sp",
        "text": {
          "message": "Mensagem privada de teste"
        },
        "messageId": "test-direct-" + Date.now(),
        "status": "RECEIVED"
      };

      const diagnosis = diagnoseZapiPayloadOrigin(payload);
      const result = await processIncomingDirectZapiMessage(payload, null, diagnosis);

      return res.json({
        success: true,
        allowed: !diagnosis.allowed === false, // diagnosis.allowed should be true
        ignored: !diagnosis.allowed,
        origin: diagnosis.origin,
        reason: diagnosis.reason,
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
        messageId: "test-webhook-" + Date.now(),
        fromMe: false,
        isNewsletter: false,
        isGroup: false,
        broadcast: false,
        status: "RECEIVED",
        isTest: true
      };

      const diagnosis = diagnoseZapiPayloadOrigin(payload);
      if (!diagnosis.allowed) {
        throw new Error(`Teste bloqueado pelo diagnóstico: ${diagnosis.reason}`);
      }

      const result = await processIncomingDirectZapiMessage(payload, null, diagnosis);

      return res.json({ 
        success: true, 
        message: "Webhook manual processado com sucesso.", 
        phone_normalized: result.phone_normalized,
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

  app.get("/api/debug/send-message-config", async (req, res) => {
    try {
      const { config } = getZapiConfig();
      return res.json({
        success: true,
        hasZapiInstanceId: Boolean(config.instanceId),
        hasZapiInstanceToken: Boolean(config.instanceToken),
        hasZapiClientToken: Boolean(config.clientToken),
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  // Ensure /api routes always return JSON 404 instead of HTML
  app.use("/api", (req, res) => {
    return res.status(404).json({
      success: false,
      error: "Rota de API não encontrada.",
      path: req.originalUrl
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    
    // Resume running campaigns on start after a short delay
    setTimeout(async () => {
      try {
        const { data: runningCampaigns } = await supabaseAdmin.from(TABLES.campaigns).select('id').eq('status', 'RUNNING');
        if (runningCampaigns && runningCampaigns.length > 0) {
          console.log(`[CAMPAIGNS] Resuming ${runningCampaigns.length} campaigns...`);
          for (const camp of runningCampaigns) {
            processCampaignBatch(camp.id);
          }
        }
      } catch (err) {
        console.error("[CAMPAIGNS] Failed to resume campaigns on start", err);
      }
    }, 5000);
  });
}

startServer();
