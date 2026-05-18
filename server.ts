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
 * ZAPI_CLIENT_TOKEN é Opcional.
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

/**
 * Gera os headers para chamadas Z-API.
 * O Client-Token é enviado apenas se configurado.
 */
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

/**
 * Gera a URL completa para chamadas Z-API.
 * Não usa /v1 nem clusters automáticos. Usa apenas a gateway informada.
 */
function zapiUrl(pathname: string) {
  const { config } = getZapiConfig();
  const base = config.baseUrl.replace(/\/$/, "");
  // Padronizado para: {base}/instances/{id}/token/{token}/{path}
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}/instances/${config.instanceId}/token/${config.instanceToken}${cleanPath}`;
}

/**
 * Realiza as chamadas para a Z-API de forma segura e centralizada.
 * O Client-Token é OPCIONAL.
 */
async function callZapi(pathname: string, options: RequestInit = {}) {
  const { config, missing } = getZapiConfig();

  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      data: {
        error: "Z-API não configurada no servidor.",
        missing,
        message: "Configure as variáveis obrigatórias da Z-API (ID e Token) no servidor."
      },
    };
  }

  const url = zapiUrl(pathname);

  try {
    const headers = {
      ...getZapiHeaders(),
      ...(options.headers as Record<string, string> || {}),
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    const text = await response.text();

    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: {
          error: "Falha na chamada da Z-API.",
          zapiStatus: response.status,
          message: response.status === 400 || response.status === 404 
            ? "Instância não encontrada na Z-API. Confira se o ID da instância e o Token da instância são exatamente os mesmos do painel da Z-API." 
            : "Erro na Z-API.",
          details: data,
        },
      };
    }

    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch (error: any) {
    console.error(`[Z-API Fetch Failed] ${url}:`, error.message);
    return {
      ok: false,
      status: 500,
      data: {
        error: "Falha de conexão com a Z-API.",
        message: "O servidor não conseguiu se comunicar com a Z-API.",
        details: error?.message || String(error),
      },
    };
  }
}

function normalizePhone(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

function normalizeZapiStatus(raw: any) {
  // Conforme documentação oficial e pedido do usuário
  if (raw?.connected === true) return "CONNECTED";
  
  if (raw?.connected === false) {
    // Se não estiver conectado, pode estar aguardando QR ou desconectado
    // Z-API geralmente retorna connected: false quando precisa de QR
    return "WAITING_QR";
  }

  // Fallbacks para variações de resposta
  if (raw?.isConnected === true || raw?.status === "CONNECTED") return "CONNECTED";

  return "DISCONNECTED";
}

function getErrorMessage(error: any): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  if (error.error) return String(error.error);
  return "Erro inesperado no servidor.";
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: "10mb" }));

  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  // --- Supabase Admin/Service Setup ---
  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // --- Health ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // --- Z-API Routes ---

  app.get("/api/zapi/config-status", (req, res) => {
    const { config, missing } = getZapiConfig();
    
    if (missing.length > 0) {
      const isMissingClientToken = missing.includes("ZAPI_CLIENT_TOKEN");
      return res.json({
        configured: false,
        missing,
        provider: "Z-API",
        message: isMissingClientToken 
          ? "Client Token da Z-API não configurado. A Z-API exige esse token no header Client-Token para gerar QR Code."
          : "Configure as variáveis obrigatórias da Z-API no servidor."
      });
    }

    res.json({
      configured: true,
      missing: [],
      provider: "Z-API",
      clientTokenConfigured: !!config.clientToken,
      message: "Z-API configurada com ID, Token e Client Token."
    });
  });

  app.get("/api/zapi/debug-config", (req, res) => {
    const { config } = getZapiConfig();
    
    const getStart = (val: string) => val ? val.substring(0, 6) : null;
    const getEnd = (val: string) => val ? val.substring(val.length - 4) : null;

    res.json({
      baseUrl: "https://api.z-api.io",
      hasInstanceId: !!config.instanceId,
      instanceIdStart: getStart(config.instanceId),
      instanceIdEnd: getEnd(config.instanceId),
      hasInstanceToken: !!config.instanceToken,
      instanceTokenStart: getStart(config.instanceToken),
      instanceTokenEnd: getEnd(config.instanceToken),
      hasClientToken: !!config.clientToken
    });
  });

  app.get("/api/zapi/qrcode", async (req, res) => {
    const { config, missing } = getZapiConfig();
    
    if (missing.length > 0) {
       return res.status(400).json({ 
         error: "Instância Z-API não configurada corretamente.",
         message: missing.includes("ZAPI_CLIENT_TOKEN") 
           ? "Client Token da Z-API não configurado. Acesse o painel da Z-API > Segurança > Client Token."
           : "ID ou Token da instância ausentes.",
         missing
       });
    }

    const result = await callZapi("/qr-code", { method: "GET" });
    
    if (process.env.NODE_ENV === "development") {
      console.log("Z-API /qr-code raw response:", JSON.stringify(result.data, null, 2));
    }

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        error: "Falha ao buscar QR Code na Z-API.",
        message: "A Z-API retornou erro ao buscar o QR Code.",
        details: result.data
      });
    }
    
    const qrValue = result.data?.value || result.data?.qrcode || result.data?.qrCode || result.data?.base64;
    
    if (!qrValue) {
      return res.status(500).json({
        success: false,
        error: "QR Code não encontrado na resposta da Z-API.",
        details: result.data
      });
    }

    return res.json({ 
      success: true,
      value: qrValue, 
      raw: process.env.NODE_ENV === "development" ? result.data : undefined 
    });
  });

  app.get("/api/zapi/status", async (req, res) => {
    const result = await callZapi("/status", { method: "GET" });
    if (!result.ok) {
      return res.status(result.status).json({
        status: "ERROR",
        raw: result.data,
      });
    }
    return res.json({
      status: normalizeZapiStatus(result.data),
      phone: result.data?.phone || result.data?.number || result.data?.connected_phone || "",
      raw: result.data,
    });
  });

  app.post("/api/zapi/send-text", async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const message = String(req.body?.message || "").trim();

    if (!phone) return res.status(400).json({ error: "Telefone obrigatório." });
    if (!message) return res.status(400).json({ error: "Mensagem obrigatória." });

    const result = await callZapi("/send-text", {
      method: "POST",
      body: JSON.stringify({ phone, message }),
    });

    return res.status(result.status).json(result.data);
  });

  app.post("/api/zapi/send-image", async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const image = req.body?.image; // URL or base64
    const caption = String(req.body?.caption || "").trim();

    if (!phone) return res.status(400).json({ error: "Telefone obrigatório." });
    if (!image) return res.status(400).json({ error: "Imagem obrigatória." });

    const result = await callZapi("/send-image", {
      method: "POST",
      body: JSON.stringify({ phone, image, caption }),
    });

    return res.status(result.status).json(result.data);
  });

  app.post("/api/zapi/send-video", async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const video = req.body?.video; // URL or base64
    const caption = String(req.body?.caption || "").trim();

    if (!phone) return res.status(400).json({ error: "Telefone obrigatório." });
    if (!video) return res.status(400).json({ error: "Vídeo obrigatório." });

    const result = await callZapi("/send-video", {
      method: "POST",
      body: JSON.stringify({ phone, video, caption }),
    });

    return res.status(result.status).json(result.data);
  });

  app.post("/api/zapi/send-document", async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const document = req.body?.document; // URL or base64
    const extension = String(req.body?.extension || "").trim();
    const fileName = String(req.body?.fileName || "documento").trim();

    if (!phone) return res.status(400).json({ error: "Telefone obrigatório." });
    if (!document) return res.status(400).json({ error: "Documento obrigatório." });

    const result = await callZapi(`/send-document/${extension}`, {
      method: "POST",
      body: JSON.stringify({ phone, document, fileName }),
    });

    return res.status(result.status).json(result.data);
  });

  app.post("/api/zapi/send-audio", async (req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const audio = req.body?.audio; // URL or base64

    if (!phone) return res.status(400).json({ error: "Telefone obrigatório." });
    if (!audio) return res.status(400).json({ error: "Áudio obrigatório." });

    const result = await callZapi("/send-audio", {
      method: "POST",
      body: JSON.stringify({ phone, audio }),
    });

    return res.status(result.status).json(result.data);
  });

  app.post("/api/webhooks/zapi/received", async (req, res) => {
    const payload = req.body;
    
    // Respond quickly to Z-API to avoid retries
    res.status(200).json({ ok: true });

    try {
      const msg = normalizeZapiIncomingMessage(payload);
      
      console.log(`[ZAPI WEBHOOK] Received: ${msg.phone} - ${msg.type} - ID: ${msg.messageId}`);

      // Ignore our own messages sent from the phone (unless for tests)
      if (msg.fromMe && !payload.isTest) return;
      if (!msg.phone) return;

      // 1. Check for Duplicate Message
      const { data: existingMsg } = await supabase
        .from('messages')
        .select('id')
        .eq('external_message_id', msg.messageId)
        .maybeSingle();

      if (existingMsg) {
        console.log(`[ZAPI WEBHOOK] Message ${msg.messageId} already exists. Skipping.`);
        return;
      }

      // 2. Find or Create Customer
      let { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', msg.phone)
        .maybeSingle();

      if (!customer) {
        const { data: newCustomer, error: createError } = await supabase
          .from('customers')
          .insert({
            name: msg.name,
            phone: msg.phone,
            origin: 'WhatsApp Z-API'
          })
          .select()
          .single();
        
        if (createError) throw createError;
        customer = newCustomer;
      }

      // 3. Find or Create Open Conversation
      // We look for NEW, OPEN or IN_PROGRESS
      let { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('customer_id', customer.id)
        .in('status', ['NEW', 'OPEN', 'IN_PROGRESS'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const messageContent = msg.text || `[Mensagem tipo ${msg.type}]`;

      if (!conversation) {
        // Create new conversation
        const { data: newConv, error: createConvError } = await supabase
          .from('conversations')
          .insert({
            customer_id: customer.id,
            status: 'NEW',
            unread_count: 1,
            last_message: messageContent,
            last_message_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (createConvError) throw createConvError;
        conversation = newConv;
      } else {
        // Update existing conversation
        const { error: updateConvError } = await supabase
          .from('conversations')
          .update({
            last_message: messageContent,
            last_message_at: new Date().toISOString(),
            unread_count: (conversation.unread_count || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', conversation.id);
        
        if (updateConvError) throw updateConvError;
      }

      // 4. Insert Message
      const { error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          sender_type: 'customer',
          content: messageContent,
          message_type: msg.type,
          external_message_id: msg.messageId,
          media_url: msg.mediaUrl,
          created_at: new Date().toISOString()
        });

      if (msgError) throw msgError;

      console.log(`[Webhook Success] Ticket processed for ${msg.phone}. Conversation ID: ${conversation.id}`);
    } catch (err) {
      console.error("[Webhook Error]:", err);
    }
  });

  app.post("/api/zapi/register-webhook-received", async (req, res) => {
    const appUrl = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "https://crm-viva-destinos-experience.onrender.com";

    if (!appUrl || appUrl.includes("localhost")) {
      return res.status(400).json({ 
        error: "APP_URL não configurada corretamente. Cadastre a URL pública (Render) nas variáveis de ambiente." 
      });
    }

    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/zapi/received`;
    
    console.log(`[ZAPI] Registering webhook: ${webhookUrl}`);

    const result = await callZapi("/update-webhook-received", {
      method: "PUT",
      body: JSON.stringify({ value: webhookUrl })
    });

    if (!result.ok) {
      return res.status(result.status).json(result.data);
    }

    return res.json({ 
      success: true, 
      message: "Webhook registrado com sucesso.",
      url: webhookUrl,
      zapiResponse: result.data
    });
  });

  app.post("/api/zapi/test-received-webhook", async (req, res) => {
    const testPayload = {
      phone: "5564999999999",
      senderName: "Cliente Teste Viva",
      text: {
        message: "Mensagem de teste recebida pelo webhook " + new Date().toLocaleTimeString()
      },
      messageId: "test-zapi-" + Date.now(),
      type: "text",
      isTest: true,
      fromMe: false
    };

    try {
      // Simulate calling the webhook route internally
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const resWebhook = await fetch(`${appUrl}/api/webhooks/zapi/received`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload)
      });

      if (resWebhook.ok) {
        return res.json({ success: true, message: "Teste disparado com sucesso. Verifique Atendimentos > Novos." });
      } else {
        throw new Error("Falha ao disparar webhook interno");
      }
    } catch (err) {
      return res.status(500).json({ error: getErrorMessage(err) });
    }
  });

  // --- Helpers for Normalization ---
  function normalizeZapiIncomingMessage(payload: any) {
    const rawPhone =
      payload?.phone ||
      payload?.from ||
      payload?.senderPhone ||
      payload?.participantPhone ||
      payload?.chatId ||
      payload?.message?.phone ||
      payload?.key?.remoteJid ||
      "";

    const phone = normalizePhone(rawPhone);

    const name =
      payload?.senderName ||
      payload?.pushName ||
      payload?.contactName ||
      payload?.name ||
      "Cliente";

    const messageId =
      payload?.messageId ||
      payload?.id ||
      payload?.message?.id ||
      `zapi-${Date.now()}`;

    const text =
      payload?.text?.message ||
      payload?.text ||
      payload?.message?.text ||
      payload?.message ||
      payload?.body ||
      payload?.content ||
      "";

    const type =
      payload?.type ||
      payload?.messageType ||
      payload?.mediaType ||
      "text";

    const mediaUrl =
      payload?.image?.imageUrl ||
      payload?.video?.videoUrl ||
      payload?.audio?.audioUrl ||
      payload?.document?.documentUrl ||
      payload?.mediaUrl ||
      "";

    return {
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

  // --- AI Routes ---
  app.post("/api/ai/summarize", async (req, res) => {
    const { messages } = req.body;
    if (!ai) return res.status(503).json({ error: "Gemini API key not configured." });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: `Resuma o seguinte diálogo de atendimento de uma agência de viagens de forma executiva, destacando o destino de interesse, perfil do viajante, orçamento e temperatura do lead. Diálogo:\n\n${messages}` }] }],
      });
      res.json({ summary: response.text });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "Falha ao processar resumo com IA." });
    }
  });

  // --- Vite / Frontend Serving ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Viva Experience CRM running on http://localhost:${PORT}`);
  });
}

startServer();
