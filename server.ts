import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini API Initialization
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ 
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/ai/summarize", async (req, res) => {
    const { messages } = req.body;
    if (!ai) return res.status(503).json({ error: "Gemini API key not configured." });

    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Resuma o diálogo de atendimento de uma agência de viagens: ${messages}`
      });
      res.json({ summary: result.text });
    } catch (error) {
      res.status(500).json({ error: "Erro na IA" });
    }
  });

  app.post("/api/ai/suggestion", async (req, res) => {
    const { messages } = req.body;
    if (!ai) return res.status(503).json({ error: "Gemini API key not configured." });

    try {
      const prompt = `Com base no histórico: ${messages}. Contexto da agência: Viva Destinos Experience. Sugira uma resposta curta e cordial em português.`;
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      res.json({ suggestion: result.text });
    } catch (error) {
      res.status(500).json({ error: "Erro na IA" });
    }
  });

  app.post("/api/ai/classify", async (req, res) => {
    const { messages } = req.body;
    if (!ai) return res.status(503).json({ error: "Gemini API key not configured." });

    try {
      const prompt = `Classifique a temperatura do lead (HOT, WARM, COLD) com base na conversa: ${messages}. Responda apenas a tag.`;
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      res.json({ classification: result.text?.trim() });
    } catch (error) {
      res.status(500).json({ error: "Erro na IA" });
    }
  });

  // WhatsApp Webhooks
  app.get("/api/webhooks/whatsapp", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.META_WHATSAPP_VERIFY_TOKEN) {
      console.log("Webhook WhatsApp verificado!");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/api/webhooks/whatsapp", (req, res) => {
    const body = req.body;
    console.log("Webhook WhatsApp recebido:", JSON.stringify(body, null, 2));
    res.status(200).send("EVENT_RECEIVED");
  });

  // Z-API Proxy Endpoints
  app.get("/api/channels/zapi/qrcode", async (req, res) => {
    const { ZAPI_BASE_URL, ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_BASE_URL || !ZAPI_INSTANCE_ID || !ZAPI_INSTANCE_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(503).json({ error: "Z-API não configurada no servidor." });
    }
    try {
      const url = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/qr-code`;
      const response = await fetch(url, {
        headers: { "Client-Token": ZAPI_CLIENT_TOKEN! }
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar QR Code Z-API" });
    }
  });

  app.get("/api/channels/zapi/status", async (req, res) => {
    const { ZAPI_BASE_URL, ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_BASE_URL || !ZAPI_INSTANCE_ID || !ZAPI_INSTANCE_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(503).json({ error: "Z-API não configurada no servidor." });
    }
    try {
      const url = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/status`;
      const response = await fetch(url, {
        headers: { "Client-Token": ZAPI_CLIENT_TOKEN! }
      });
      const data = await response.json();
      
      // Map Z-API status to our format
      let status = 'DISCONNECTED';
      if (data.connected) status = 'ESTÁVEL';
      else if (data.status === 'CONNECTED') status = 'ESTÁVEL';
      else if (data.status === 'INITIALIZING') status = 'CONECTANDO';
      else if (data.status === 'GET_QR_CODE') status = 'WAITING_QR';

      res.json({ ...data, mapped_status: status });
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar status Z-API" });
    }
  });

  app.post("/api/channels/zapi/send-text", async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "Telefone (phone) e mensagem (message) são obrigatórios." });
    }

    // Normalizar phone: remover máscara, espaços, +, parênteses e traços
    const phoneNormalizado = phone.replace(/\D/g, "");

    const { ZAPI_BASE_URL, ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_BASE_URL || !ZAPI_INSTANCE_ID || !ZAPI_INSTANCE_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(503).json({ error: "Z-API não configurada no servidor." });
    }

    try {
      const response = await fetch(`${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/send-text`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Client-Token': ZAPI_CLIENT_TOKEN!
        },
        body: JSON.stringify({ phone: phoneNormalizado, message })
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Erro ao enviar mensagem Z-API" });
    }
  });

  app.post("/api/channels/zapi/disconnect", async (req, res) => {
    const { ZAPI_BASE_URL, ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_BASE_URL || !ZAPI_INSTANCE_ID || !ZAPI_INSTANCE_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(503).json({ error: "Z-API não configurada no servidor." });
    }
    try {
      const response = await fetch(`${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/disconnect`, {
        method: 'POST',
        headers: { 'Client-Token': ZAPI_CLIENT_TOKEN! }
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Erro ao desconectar Z-API" });
    }
  });

  // Evolution API Proxy Endpoints
  app.get("/api/channels/evolution/qrcode", async (req, res) => {
    const { EVOLUTION_BASE_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME } = process.env;
    if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return res.status(503).json({ error: "Evolution API não configurada no servidor." });
    }
    try {
      const response = await fetch(`${EVOLUTION_BASE_URL}/instance/connect/${EVOLUTION_INSTANCE_NAME}`, {
        headers: { 'apikey': EVOLUTION_API_KEY! }
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar QR Code Evolution" });
    }
  });

  app.get("/api/channels/evolution/status", async (req, res) => {
    const { EVOLUTION_BASE_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME } = process.env;
    if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return res.status(503).json({ error: "Evolution API não configurada no servidor." });
    }
    try {
      const response = await fetch(`${EVOLUTION_BASE_URL}/instance/connectionState/${EVOLUTION_INSTANCE_NAME}`, {
        headers: { 'apikey': EVOLUTION_API_KEY! }
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Erro ao buscar status Evolution" });
    }
  });

  app.post("/api/channels/evolution/send-text", async (req, res) => {
    const { EVOLUTION_BASE_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE_NAME } = process.env;
    if (!EVOLUTION_BASE_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE_NAME) {
      return res.status(503).json({ error: "Evolution API não configurada no servidor." });
    }
    try {
      const response = await fetch(`${EVOLUTION_BASE_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY!
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: "Erro ao enviar mensagem Evolution" });
    }
  });

  app.post("/api/webhooks/zapi", (req, res) => {
    const payload = req.body;
    console.log("Z-API Webhook Payload:", JSON.stringify(payload, null, 2));

    // Handle message received
    if (payload.type === 'ReceivedMessage') {
      const from = payload.phone;
      const text = payload.text || payload.message;
      console.log(`Mensagem recebida de ${from}: ${text}`);
      
      // TODO: Implement Supabase integration
      // 1. Find or create customer by phone
      // 2. Find or create active conversation
      // 3. Insert message into history
    }

    res.status(200).send("OK");
  });

  app.post("/api/webhooks/evolution", (req, res) => {
    console.log("Evolution Webhook:", req.body);
    res.status(200).send("OK");
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.get("/api/channels/config-check", (req, res) => {
    res.json({
      meta: !!process.env.META_WHATSAPP_ACCESS_TOKEN,
      zapi: !!(process.env.ZAPI_BASE_URL && process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_INSTANCE_TOKEN && process.env.ZAPI_CLIENT_TOKEN),
      evolution: !!(process.env.EVOLUTION_BASE_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE_NAME)
    });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Viva Experience CRM running on http://localhost:${PORT}`);
  });
}

startServer();
