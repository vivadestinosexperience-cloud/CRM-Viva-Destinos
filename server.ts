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


  // Z-API Endpoints
  app.get("/api/zapi/config-status", (req, res) => {
    const missing = [];
    if (!process.env.ZAPI_BASE_URL) missing.push("ZAPI_BASE_URL");
    if (!process.env.ZAPI_INSTANCE_ID) missing.push("ZAPI_INSTANCE_ID");
    if (!process.env.ZAPI_INSTANCE_TOKEN) missing.push("ZAPI_INSTANCE_TOKEN");
    if (!process.env.ZAPI_CLIENT_TOKEN) missing.push("ZAPI_CLIENT_TOKEN");

    res.json({
      configured: missing.length === 0,
      missing,
      provider: "Z-API"
    });
  });

  app.get("/api/zapi/qrcode", async (req, res) => {
    const { ZAPI_BASE_URL, ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_BASE_URL || !ZAPI_INSTANCE_ID || !ZAPI_INSTANCE_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(400).json({ error: "Z-API não configurada no servidor." });
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

  app.get("/api/zapi/status", async (req, res) => {
    const { ZAPI_BASE_URL, ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
    if (!ZAPI_BASE_URL || !ZAPI_INSTANCE_ID || !ZAPI_INSTANCE_TOKEN || !ZAPI_CLIENT_TOKEN) {
      return res.status(400).json({ error: "Z-API não configurada no servidor." });
    }
    try {
      const url = `${ZAPI_BASE_URL}/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_INSTANCE_TOKEN}/status`;
      const response = await fetch(url, {
        headers: { "Client-Token": ZAPI_CLIENT_TOKEN! }
      });
      const data = await response.json();
      
      let status = "DISCONNECTED";
      if (data.connected) status = "CONNECTED";
      else if (data.status === "CONNECTED") status = "CONNECTED";
      else if (data.status === "GET_QR_CODE") status = "WAITING_QR";

      res.json({ 
        status, 
        phone: data.connected_phone || "",
        raw: data 
      });
    } catch (e) {
      res.status(500).json({ status: "ERROR", message: "Erro ao consultar status Z-API" });
    }
  });

  app.post("/api/zapi/send-text", async (req, res) => {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: "Telefone e mensagem são obrigatórios." });
    }

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

  app.post("/api/webhooks/zapi", (req, res) => {
    const payload = req.body;
    console.log("Z-API Webhook Payload:", JSON.stringify(payload, null, 2));

    if (payload.type === 'ReceivedMessage') {
      const from = payload.phone;
      const text = payload.text || payload.message;
      console.log(`Mensagem recebida de ${from}: ${text}`);
      // Supabase integration logic would go here
    }

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


  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Viva Experience CRM running on http://localhost:${PORT}`);
  });
}

startServer();
