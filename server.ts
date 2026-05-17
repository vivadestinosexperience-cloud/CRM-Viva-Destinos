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
    
    if (!ai) {
      return res.status(503).json({ error: "Gemini API key not configured on server." });
    }

    try {
      const response = await ai.models.generateContent({ 
        model: "gemini-3-flash-preview",
        contents: `Resuma o seguinte diálogo de atendimento de uma agência de viagens de forma executiva, destacando o destino de interesse, perfil do viajante (adultos/crianças), orçamento e temperatura do lead (Frio, Morno, Quente). Diálogo:\n\n${messages}`
      });
      
      const text = response.text;
      
      res.json({ summary: text });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "Falha ao processar resumo com IA." });
    }
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
