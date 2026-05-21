import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import os from "os";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

dotenv.config();

let globalSupabaseAdmin: any = null;

// Database or JSON filesystem helpers for Channels Settings
async function loadChannelsDBOrFile() {
  // 1. Tenta buscar do Supabase
  try {
    if (globalSupabaseAdmin) {
      const { data, error } = await globalSupabaseAdmin
        .from("crm_channels")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        return data;
      }
    }
  } catch (err) {
    // Ignora erro de tabela inexistente
  }

  // 2. Fallback: Lê do arquivo JSON
  try {
    const jsonPath = path.join(process.cwd(), "backend_channels.json");
    if (fs.existsSync(jsonPath)) {
      return JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }
  } catch (err) {
    // Ignora
  }

  return [];
}

async function saveChannelToDBOrFile(channel: any) {
  if (!channel.id) {
    channel.id = crypto.randomUUID();
  }
  channel.updated_at = new Date().toISOString();
  if (!channel.created_at) {
    channel.created_at = new Date().toISOString();
  }

  // 1. Tenta salvar no Supabase
  try {
    if (globalSupabaseAdmin) {
      if (channel.is_active) {
        // Desativa os outros no banco
        await globalSupabaseAdmin
          .from("crm_channels")
          .update({ is_active: false })
          .neq("id", channel.id);
      }

      await globalSupabaseAdmin
        .from("crm_channels")
        .upsert({
          id: channel.id,
          name: channel.name,
          type: channel.type || "whatsapp_zapi",
          instance_id: channel.instance_id,
          instance_token: channel.instance_token,
          client_token: channel.client_token || "",
          connected_phone: channel.connected_phone || null,
          status: channel.status || "DISCONNECTED",
          is_active: channel.is_active !== undefined ? channel.is_active : true,
          created_at: channel.created_at,
          updated_at: channel.updated_at
        });
    }
  } catch (err) {
    // Ignora erro de tabela inexistente
  }

  // 2. Salva no arquivo JSON (sempre, as a reliable fallback/cache!)
  try {
    const jsonPath = path.join(process.cwd(), "backend_channels.json");
    let currentList: any[] = [];
    if (fs.existsSync(jsonPath)) {
      try {
        currentList = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      } catch {
        currentList = [];
      }
    }

    if (channel.is_active) {
      currentList = currentList.map((c: any) => ({ ...c, is_active: false }));
    }

    const index = currentList.findIndex((c: any) => c.id === channel.id);
    if (index >= 0) {
      currentList[index] = { ...currentList[index], ...channel };
    } else {
      currentList.push(channel);
    }

    fs.writeFileSync(jsonPath, JSON.stringify(currentList, null, 2), "utf-8");
  } catch (fsErr) {
    console.error("[SAVE CHANNEL TO FILE ERROR]", fsErr);
  }
}

async function deleteChannelDBOrFile(id: string) {
  try {
    if (globalSupabaseAdmin) {
      await globalSupabaseAdmin.from("crm_channels").delete().eq("id", id);
    }
  } catch (err) {
    // Ignora
  }

  try {
    const jsonPath = path.join(process.cwd(), "backend_channels.json");
    if (fs.existsSync(jsonPath)) {
      let list = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      list = list.filter((c: any) => c.id !== id);
      fs.writeFileSync(jsonPath, JSON.stringify(list, null, 2), "utf-8");
    }
  } catch (err) {
    // Ignora
  }
}

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

async function convertAudioBufferToMp3(inputBuffer: Buffer, inputMimeType: string) {
  const tempDir = os.tmpdir();

  const inputExt =
    inputMimeType.includes("ogg") ? "ogg" :
    inputMimeType.includes("mp4") ? "m4a" :
    inputMimeType.includes("mpeg") ? "mp3" :
    inputMimeType.includes("wav") ? "wav" :
    "webm";

  const inputPath = path.join(tempDir, `input-${Date.now()}-${Math.random().toString(16).slice(2)}.${inputExt}`);
  const outputPath = path.join(tempDir, `output-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`);

  await writeFile(inputPath, inputBuffer);

  try {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("64k")
        .audioChannels(1)
        .audioFrequency(44100)
        .format("mp3")
        .on("error", (err) => reject(err))
        .on("end", () => resolve())
        .save(outputPath);
    });

    const outputBuffer = await readFile(outputPath);

    if (!outputBuffer || outputBuffer.length < 1000) {
      throw new Error("Falha na conversão: MP3 gerado vazio.");
    }

    return {
      buffer: outputBuffer,
      mimeType: "audio/mpeg",
      fileName: `audio-${Date.now()}.mp3`
    };
  } finally {
    try { await unlink(inputPath); } catch {}
    try { await unlink(outputPath); } catch {}
  }
}

function clean(value?: any) {
  return String(value || "").trim();
}

/**
 * Obtém a configuração da Z-API de forma segura, checando as credenciais do canal ativo.
 */
async function getActiveWhatsappChannel() {
  if (!globalSupabaseAdmin) {
    return {
      id: "env-zapi",
      name: "WhatsApp Z-API ENV",
      type: "whatsapp_zapi",
      instance_id: process.env.ZAPI_INSTANCE_ID || null,
      instance_token: process.env.ZAPI_INSTANCE_TOKEN || null,
      client_token: process.env.ZAPI_CLIENT_TOKEN || null,
      base_url: process.env.ZAPI_BASE_URL || "https://api.z-api.io",
      source: "env"
    };
  }

  const { data: channel } = await globalSupabaseAdmin
    .from("crm_channels")
    .select("*")
    .eq("type", "whatsapp_zapi")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const envChannel = {
    id: "env-zapi",
    name: "WhatsApp Z-API ENV",
    type: "whatsapp_zapi",
    instance_id: process.env.ZAPI_INSTANCE_ID || null,
    instance_token: process.env.ZAPI_INSTANCE_TOKEN || null,
    client_token: process.env.ZAPI_CLIENT_TOKEN || null,
    base_url: process.env.ZAPI_BASE_URL || "https://api.z-api.io",
    source: "env"
  };

  if (channel?.instance_id && channel?.instance_token) {
    return {
      ...channel,
      base_url: process.env.ZAPI_BASE_URL || "https://api.z-api.io",
      source: "database"
    };
  }

  if (envChannel.instance_id && envChannel.instance_token) {
    return envChannel;
  }

  return null;
}

async function getZapiConfig() {
  const channel = await getActiveWhatsappChannel();
  return {
    baseUrl: channel?.base_url || process.env.ZAPI_BASE_URL || "https://api.z-api.io",
    instanceId: channel?.instance_id || "",
    instanceToken: channel?.instance_token || "",
    clientToken: channel?.client_token || ""
  };
}

function getPublicAppUrl() {
  return (
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://crm-viva-destinos-experience.onrender.com"
  ).replace(/\/$/, "");
}

async function callZapi(path: string, body?: any, meta: any = {}) {
  const channel = await getActiveWhatsappChannel();

  if (!channel) {
    throw new Error("Canal WhatsApp não configurado. Verifique a instância Z-API.");
  }

  const baseUrl = channel.base_url || process.env.ZAPI_BASE_URL || "https://api.z-api.io";
  const instanceId = channel.instance_id;
  const instanceToken = channel.instance_token;
  const clientToken = channel.client_token || process.env.ZAPI_CLIENT_TOKEN;

  if (!instanceId || !instanceToken) {
    throw new Error("Canal WhatsApp sem Instance ID ou Token configurado.");
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const endpoint = `${baseUrl}/instances/${instanceId}/token/${instanceToken}${cleanPath}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (clientToken && String(clientToken).trim() && clientToken !== "undefined" && clientToken !== "null") {
    headers["Client-Token"] = String(clientToken).trim();
  }

  let logId = null;

  if (globalSupabaseAdmin) {
    try {
      const { data: logData } = await globalSupabaseAdmin
        .from("zapi_send_logs")
        .insert({
          source: meta.source || null,
          source_id: meta.source_id ? String(meta.source_id) : null,
          phone: body?.phone || null,
          endpoint: cleanPath,
          request_body: body,
          success: false
        })
        .select("id")
        .single();

      logId = logData?.id || null;
    } catch (logError) {
      console.error("[ZAPI SEND LOG INSERT ERROR]", logError);
    }
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const responseText = await response.text();

  let responseBody: any = null;

  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    responseBody = { raw: responseText };
  }

  if (logId && globalSupabaseAdmin) {
    try {
      await globalSupabaseAdmin
        .from("zapi_send_logs")
        .update({
          response_status: response.status,
          response_body: responseBody,
          success: response.ok,
          error: response.ok ? null : (
            responseBody?.message ||
            responseBody?.error ||
            responseText ||
            `HTTP ${response.status}`
          )
        })
        .eq("id", logId);
    } catch (logUpdateError) {
      console.error("[ZAPI SEND LOG UPDATE ERROR]", logUpdateError);
    }
  }

  if (!response.ok) {
    const error: any = new Error(
      responseBody?.message ||
      responseBody?.error ||
      responseText ||
      `Erro na Z-API. HTTP ${response.status}`
    );

    error.status = response.status;
    error.zapiResponse = responseBody;

    throw error;
  }

  return responseBody;
}

async function callZapiQrRaw(path: string) {
  const { baseUrl, instanceId, instanceToken, clientToken } = await getZapiConfig();

  if (!instanceId || !instanceToken) {
    throw new Error("Z-API não configurada: cadastre um canal ativo ou verifique ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN no servidor.");
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}/instances/${instanceId}/token/${instanceToken}${cleanPath}`;

  const headers: Record<string, string> = {
    Accept: "application/json,text/plain,image/png,*/*"
  };

  if (clientToken && String(clientToken).trim()) {
    headers["Client-Token"] = String(clientToken).trim();
  }

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    contentType,
    text,
    json
  };
}

function normalizeQrImage(value: any) {
  if (!value) return null;

  let raw = String(value).trim();

  if (!raw) return null;

  raw = raw.replace(/^"+|"+$/g, "");

  if (raw.startsWith("data:image/")) {
    return raw;
  }

  if (raw.startsWith("iVBOR") || raw.startsWith("/9j/") || raw.startsWith("UklGR")) {
    return `data:image/png;base64,${raw}`;
  }

  const clean = raw.replace(/\s/g, "");

  const looksLikeBase64 =
    clean.length > 100 &&
    /^[A-Za-z0-9+/=]+$/.test(clean);

  if (looksLikeBase64) {
    return `data:image/png;base64,${clean}`;
  }

  return null;
}

function extractQrFromAnyResponse(response: any) {
  const candidates: any[] = [];

  function add(value: any) {
    if (value !== undefined && value !== null) {
      candidates.push(value);
    }
  }

  const json = response?.json;
  const text = response?.text;

  add(text);

  if (json) {
    add(json.value);
    add(json.qrcode);
    add(json.qrCode);
    add(json.qr_code);
    add(json.qr);
    add(json.base64);
    add(json.image);
    add(json.imageBase64);
    add(json.data);
    add(json.result);

    add(json?.data?.value);
    add(json?.data?.qrcode);
    add(json?.data?.qrCode);
    add(json?.data?.qr);
    add(json?.data?.base64);
    add(json?.data?.image);

    add(json?.result?.value);
    add(json?.result?.qrcode);
    add(json?.result?.qrCode);
    add(json?.result?.qr);
    add(json?.result?.base64);
    add(json?.result?.image);
  }

  for (const candidate of [...candidates]) {
    if (candidate && typeof candidate === "object") {
      add(candidate.value);
      add(candidate.qrcode);
      add(candidate.qrCode);
      add(candidate.qr_code);
      add(candidate.qr);
      add(candidate.base64);
      add(candidate.image);
      add(candidate.imageBase64);
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizeQrImage(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

async function getZapiStatusRaw() {
  const { baseUrl, instanceId, instanceToken, clientToken } = await getZapiConfig();

  if (!instanceId || !instanceToken) {
    throw new Error("Z-API não configurada: cadastre um canal ativo ou verifique ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN.");
  }

  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (clientToken && String(clientToken).trim()) {
    headers["Client-Token"] = String(clientToken).trim();
  }

  const url = `${baseUrl}/instances/${instanceId}/token/${instanceToken}/status`;

  const response = await fetch(url, {
    method: "GET",
    headers
  });

  const text = await response.text();

  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(json?.message || json?.error || text || `Erro Z-API status HTTP ${response.status}`);
  }

  return json;
}

function normalizeZapiStatus(raw: any) {
  const connected =
    raw?.connected === true ||
    raw?.connected === "true" ||
    raw?.status === "connected" ||
    raw?.error === "You are already connected";

  const smartphoneConnected =
    raw?.smartphoneConnected === true ||
    raw?.smartphoneConnected === "true";

  return {
    connected,
    smartphoneConnected,
    error: raw?.error || raw?.message || null,
    phone:
      raw?.phone ||
      raw?.connectedPhone ||
      raw?.number ||
      raw?.whatsapp ||
      null,
    raw
  };
}

async function callZapiActionRaw(path: string, method: "GET" | "POST" = "POST") {
  const { baseUrl, instanceId, instanceToken, clientToken } = await getZapiConfig();

  if (!instanceId || !instanceToken) {
    throw new Error("Z-API não configurada: cadastre um canal ativo ou verifique ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN.");
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${baseUrl}/instances/${instanceId}/token/${instanceToken}${cleanPath}`;

  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (clientToken && String(clientToken).trim()) {
    headers["Client-Token"] = String(clientToken).trim();
  }

  const response = await fetch(url, {
    method,
    headers
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { ok: response.ok, status: response.status, json, text };
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

function normalizeBrazilPhone(input: any) {
  const raw = String(input || "").trim().toLowerCase();

  if (!raw) return "";
  if (raw.includes("@g.us")) return "";
  if (raw.includes("-group")) return "";
  if (raw.includes("@newsletter")) return "";
  if (raw.includes("@broadcast")) return "";
  if (raw.includes("status@broadcast")) return "";

  let digits = raw.replace(/\D/g, "");

  if (!digits) return "";
  if (digits.startsWith("120363")) return "";

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  if (!digits.startsWith("55")) return "";
  if (digits.length < 12 || digits.length > 13) return "";

  return digits;
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

  const phoneNormalized = normalizeBrazilPhone(rawPhone);

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

  const normalized = normalizeBrazilPhone(payload?.phone);

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
  const PORT = 3000;
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
  globalSupabaseAdmin = supabaseAdmin;

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

    // Garantir identidade do admin reservas@vivadestinosexperience.com
    if (authUser.email === "reservas@vivadestinosexperience.com") {
      const { data: existingAdmin } = await supabaseAdmin
        .from(TABLES.users)
        .select("*")
        .eq("email", authUser.email)
        .maybeSingle();

      if (!existingAdmin) {
        const { data: newAdmin } = await supabaseAdmin
          .from(TABLES.users)
          .insert({
            auth_user_id: authUser.id,
            email: authUser.email,
            name: "Josiel Fonseca",
            role: "admin",
            team_id: "comercial",
            team_name: "Comercial",
            is_active: true
          })
          .select()
          .single();
        return newAdmin;
      } else {
        if (
          existingAdmin.name !== "Josiel Fonseca" ||
          existingAdmin.role !== "admin" ||
          existingAdmin.team_id !== "comercial" ||
          existingAdmin.is_active !== true ||
          existingAdmin.auth_user_id !== authUser.id
        ) {
          const { data: updatedAdmin } = await supabaseAdmin
            .from(TABLES.users)
            .update({
              auth_user_id: authUser.id,
              name: "Josiel Fonseca",
              role: "admin",
              team_id: "comercial",
              team_name: "Comercial",
              is_active: true
            })
            .eq("id", existingAdmin.id)
            .select()
            .single();
          return updatedAdmin;
        }
        return existingAdmin;
      }
    }

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

  function formatAgentMessageForWhatsApp(message: string, userName: string) {
    const cleanMessage = String(message || "").trim();
    const cleanUserName = String(userName || "Atendente").trim();

    if (!cleanMessage) return "";

    const displayName = `Guia de Férias - ${cleanUserName}`;
    const prefix = `*${displayName}:*`;

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
  function renderCampaignMessage(template: string, recipient: any) {
    let result = String(template || "")
      .replaceAll("{{nome}}", recipient.name || "cliente")
      .replaceAll("{name}", recipient.name || "cliente")
      .replaceAll("{{telefone}}", recipient.phone_normalized || recipient.phone || "");

    // Substituir campos extras do metadata
    if (recipient.metadata && typeof recipient.metadata === 'object') {
      Object.entries(recipient.metadata).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        result = result.replaceAll(placeholder, String(value || ""));
      });
    }

    return result;
  }

  async function refreshCampaignStats(campaignId: string) {
    const { data: recipients } = await supabaseAdmin
      .from(TABLES.campaign_recipients)
      .select("status")
      .eq("campaign_id", campaignId);

    const counts = {
      recipients_count: recipients?.length || 0,
      pending_count: recipients?.filter(r => r.status === "PENDING").length || 0,
      sending_count: recipients?.filter(r => r.status === "SENDING").length || 0,
      sent_count: recipients?.filter(r => r.status === "SENT").length || 0,
      failed_count: recipients?.filter(r => r.status === "FAILED").length || 0,
      skipped_count: recipients?.filter(r => r.status === "SKIPPED").length || 0
    };

    await supabaseAdmin
      .from(TABLES.campaigns)
      .update({
        ...counts,
        updated_at: new Date().toISOString()
      })
      .eq("id", campaignId);

    return counts;
  }

  const campaignProcessingLocks = new Set<string>();

  async function processCampaignBatch(campaignId: string) {
    if (campaignProcessingLocks.has(campaignId)) return { processed: 0, reason: "Lock ativo." };
    campaignProcessingLocks.add(campaignId);

    try {
      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from(TABLES.campaigns)
        .select("*")
        .eq("id", campaignId)
        .single();

      if (campaignError || !campaign) {
        throw new Error("Campanha não encontrada.");
      }

      if (campaign.status !== "RUNNING") {
        return { processed: 0, reason: `Campanha status=${campaign.status}` };
      }

      const { instanceId, instanceToken } = await getZapiConfig();
      if (!instanceId || !instanceToken) {
        await supabaseAdmin
          .from(TABLES.campaigns)
          .update({
            last_error: "Z-API não configurada.",
            updated_at: new Date().toISOString()
          })
          .eq("id", campaignId);

        throw new Error("Z-API não configurada.");
      }

      const batchSize = campaign.batch_size || 5;

      const { data: recipients, error: recipientsError } = await supabaseAdmin
        .from(TABLES.campaign_recipients)
        .select("*")
        .eq("campaign_id", campaignId)
        .eq("status", "PENDING")
        .order("created_at", { ascending: true })
        .limit(batchSize);

      if (recipientsError) throw recipientsError;

      if (!recipients || recipients.length === 0) {
        const stats = await refreshCampaignStats(campaignId);

        if (stats.pending_count === 0 && stats.sending_count === 0) {
          await supabaseAdmin
            .from(TABLES.campaigns)
            .update({
              status: "COMPLETED",
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", campaignId);

          await supabaseAdmin.from(TABLES.campaign_events).insert({
            campaign_id: campaignId,
            event_type: "campaign.completed",
            message: "Campanha concluída."
          });
          
          broadcastEvent("campaign.updated", { id: campaignId, status: "COMPLETED" });
        }

        return { processed: 0, completed: true };
      }

      let processedCount = 0;

      for (const recipient of recipients) {
        const now = new Date().toISOString();

        const { data: locked, error: lockError } = await supabaseAdmin
          .from(TABLES.campaign_recipients)
          .update({
            status: "SENDING",
            attempts: (recipient.attempts || 0) + 1,
            last_attempt_at: now,
            updated_at: now
          })
          .eq("id", recipient.id)
          .eq("status", "PENDING")
          .select("*")
          .single();

        if (lockError || !locked) {
          continue;
        }

        try {
          const renderedMessage = renderCampaignMessage(campaign.content || campaign.message_text, recipient);

          if (!renderedMessage.trim()) {
            throw new Error("Mensagem da campanha vazia.");
          }

          let zapiResponse;
          const phone = recipient.phone_normalized;

          if ((campaign.message_type || "text") === "text") {
            zapiResponse = await callZapi("/send-text", {
              phone: phone,
              message: renderedMessage
            }, {
              source: "campaign",
              source_id: campaignId
            });
          } else if (campaign.message_type === "image") {
            if (!campaign.media_url) throw new Error("Imagem da campanha não configurada.");

            zapiResponse = await callZapi("/send-image", {
              phone: phone,
              image: campaign.media_url,
              caption: renderedMessage
            }, {
              source: "campaign",
              source_id: campaignId
            });
          } else if (campaign.message_type === "video") {
            if (!campaign.media_url) throw new Error("Vídeo da campanha não configurado.");

            zapiResponse = await callZapi("/send-video", {
              phone: phone,
              video: campaign.media_url,
              caption: renderedMessage
            }, {
              source: "campaign",
              source_id: campaignId
            });
          } else if (campaign.message_type === "audio") {
             if (!campaign.media_url) throw new Error("Áudio da campanha não configurado.");
             zapiResponse = await callZapi("/send-audio", {
                phone: phone,
                audio: campaign.media_url
             }, {
               source: "campaign",
               source_id: campaignId
             });
          } else if (campaign.message_type === "document") {
             if (!campaign.media_url) throw new Error("Documento da campanha não configurado.");
             const ext = getExtensionFromMimeOrFileName(campaign.media_mime_type || "", campaign.media_file_name || "arquivo");
             zapiResponse = await callZapi(`/send-document/${ext}`, {
                phone: phone,
                document: campaign.media_url,
                fileName: campaign.media_file_name || "arquivo"
             }, {
               source: "campaign",
               source_id: campaignId
             });
          } else {
            throw new Error(`Tipo de campanha não suportado: ${campaign.message_type}`);
          }

          await supabaseAdmin
            .from(TABLES.campaign_recipients)
            .update({
              status: "SENT",
              sent_at: new Date().toISOString(),
              zapi_message_id: zapiResponse?.messageId || zapiResponse?.id || null,
              raw_response: zapiResponse,
              error_message: null,
              updated_at: new Date().toISOString()
            })
            .eq("id", recipient.id);

          await supabaseAdmin.from(TABLES.campaign_events).insert({
            campaign_id: campaignId,
            recipient_id: recipient.id,
            event_type: "recipient.sent",
            message: `Mensagem enviada para ${recipient.phone_normalized}`,
            payload: zapiResponse
          });

          processedCount++;

          const delaySeconds = campaign.delay_seconds || campaign.min_interval || 8;
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        } catch (error: any) {
          const attempts = (recipient.attempts || 0) + 1;
          const maxAttempts = campaign.max_attempts || 2;
          const shouldRetry = attempts < maxAttempts;

          await supabaseAdmin
            .from(TABLES.campaign_recipients)
            .update({
              status: shouldRetry ? "PENDING" : "FAILED",
              failed_at: shouldRetry ? null : new Date().toISOString(),
              error_message: error instanceof Error ? error.message : String(error),
              raw_response: error?.zapiResponse || null,
              updated_at: new Date().toISOString()
            })
            .eq("id", recipient.id);

          await supabaseAdmin.from(TABLES.campaign_events).insert({
            campaign_id: campaignId,
            recipient_id: recipient.id,
            event_type: "recipient.failed",
            message: error instanceof Error ? error.message : String(error),
            payload: error?.zapiResponse || null
          });
        }
      }

      await supabaseAdmin
        .from(TABLES.campaigns)
        .update({
          last_processed_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", campaignId);

      const stats = await refreshCampaignStats(campaignId);
      broadcastEvent("campaign.updated", { id: campaignId, stats });

      return { processed: processedCount, stats };
    } catch (error: any) {
       console.error(`[CAMPAIGN ERR ${campaignId}]`, error);
       return { processed: 0, error: error.message };
    } finally {
      campaignProcessingLocks.delete(campaignId);
    }
  }

  async function processRunningCampaigns() {
    const { data: runningCampaigns } = await supabaseAdmin
      .from(TABLES.campaigns)
      .select('id')
      .eq('status', 'RUNNING');

    if (!runningCampaigns) return;

    for (const camp of runningCampaigns) {
      // We don't await here to process campaigns in parallel
      processCampaignBatch(camp.id).catch(err => console.error(`Error in processor for ${camp.id}:`, err));
    }
  }

  let campaignWorkerStarted = false;
  function startCampaignWorker() {
    if (campaignWorkerStarted) return;
    campaignWorkerStarted = true;
    console.log("[CAMPAIGN WORKER] Started");

    setInterval(async () => {
      try {
        await processRunningCampaigns();
      } catch (error) {
        console.error("[CAMPAIGN WORKER LOOP ERROR]", error);
      }
    }, 10000); // Check every 10 seconds
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
  app.get("/api/debug/zapi-config", async (req, res) => {
    const { baseUrl, instanceId, instanceToken, clientToken } = await getZapiConfig();
    return res.json({
      success: true,
      zapi: {
        hasInstanceId: !!instanceId,
        hasInstanceToken: !!instanceToken,
        hasClientToken: !!clientToken,
        baseUrl: baseUrl
      },
      supabase: {
        hasUrl: !!process.env.VITE_SUPABASE_URL,
        hasServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
  });

  app.get("/api/debug/whatsapp-channel", async (req, res) => {
    try {
      const channel = await getActiveWhatsappChannel();
      if (!channel) {
        return res.json({
          success: true,
          channel: {
            foundInDatabase: false,
            usingEnvFallback: false,
            hasInstanceId: false,
            hasInstanceToken: false,
            hasClientToken: false,
            source: null,
            name: null,
            status: "not_configured"
          }
        });
      }

      const isEnv = channel.source === "env";
      return res.json({
        success: true,
        channel: {
          foundInDatabase: !isEnv,
          usingEnvFallback: isEnv,
          hasInstanceId: !!channel.instance_id,
          hasInstanceToken: !!channel.instance_token,
          hasClientToken: !!channel.client_token,
          source: channel.source,
          name: channel.name || "Canal Ativo",
          status: "configured"
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/debug/system", async (req, res) => {
    try {
      const hasSupabaseUrl = !!process.env.VITE_SUPABASE_URL;
      const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { instanceId, instanceToken, clientToken } = await getZapiConfig();
      const hasZapiInstanceId = !!instanceId;
      const hasZapiInstanceToken = !!instanceToken;
      const hasZapiClientToken = !!clientToken;

      const getCount = async (table: string) => {
        try {
          const { count, error } = await supabaseAdmin.from(table).select("*", { count: "exact", head: true });
          if (error) return 0;
          return count || 0;
        } catch {
          return 0;
        }
      };

      const [
        users,
        teams,
        teamMembers,
        conversations,
        messages,
        campaigns,
        campaignRecipients,
        zapiSendLogs
      ] = await Promise.all([
        getCount(TABLES.users),
        getCount(TABLES.teams),
        getCount(TABLES.team_members),
        getCount(TABLES.conversations),
        getCount(TABLES.messages),
        getCount(TABLES.campaigns),
        getCount(TABLES.campaign_recipients),
        getCount("zapi_send_logs")
      ]);

      const { data: adminUser } = await supabaseAdmin
        .from(TABLES.users)
        .select("*")
        .eq("email", "reservas@vivadestinosexperience.com")
        .maybeSingle();

      return res.json({
        success: true,
        env: {
          hasSupabaseUrl,
          hasServiceRole,
          hasZapiInstanceId,
          hasZapiInstanceToken,
          hasZapiClientToken
        },
        counts: {
          users,
          teams,
          teamMembers,
          conversations,
          messages,
          campaigns,
          campaignRecipients,
          zapiSendLogs
        },
        admin: adminUser ? {
          exists: true,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          is_active: adminUser.is_active
        } : {
          exists: false
        }
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/debug/audio", async (req, res) => {
    try {
      const ffmpegExists = typeof ffmpegInstaller.path === "string" && fs.existsSync(ffmpegInstaller.path);
      return res.json({
        success: true,
        ffmpegAvailable: ffmpegExists,
        maxUploadMb: 25,
        acceptedInputs: [
          "audio/webm",
          "audio/ogg",
          "audio/mpeg",
          "audio/mp3",
          "audio/mp4",
          "audio/wav",
          "audio/x-m4a",
          "application/octet-stream"
        ],
        outputFormat: "audio/mpeg"
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/debug/zapi/test-send", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);

      if (!["admin", "supervisor"].includes(currentUser.role)) {
        return res.status(403).json({
          success: false,
          error: "Sem permissão para testar Z-API."
        });
      }

      const phone = normalizeBrazilPhone(req.body?.phone);
      const message = String(req.body?.message || "Teste Viva CRM").trim();

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: "Telefone inválido."
        });
      }

      const zapiResponse = await callZapi(
        "/send-text",
        { phone, message },
        { source: "debug", source_id: "test-send" }
      );

      return res.json({
        success: true,
        zapiResponse
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao testar envio.",
        zapiResponse: error?.zapiResponse || null
      });
    }
  });

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
      const { instanceId, instanceToken } = await getZapiConfig();
      const zapiStatus = await callZapi("/status");
      
      const configured = !!instanceId && !!instanceToken;
      const missing = [];
      if (!instanceId) missing.push("ZAPI_INSTANCE_ID");
      if (!instanceToken) missing.push("ZAPI_INSTANCE_TOKEN");

      const { count: custsCount } = await supabaseAdmin.from(TABLES.customers).select('*', { count: 'exact', head: true });
      const { count: convsCount } = await supabaseAdmin.from(TABLES.conversations).select('*', { count: 'exact', head: true });
      const { count: msgsCount } = await supabaseAdmin.from(TABLES.messages).select('*', { count: 'exact', head: true });
      const { count: logsCount } = await supabaseAdmin.from("crm_webhook_logs").select('*', { count: 'exact', head: true });
      
      const { data: logs } = await supabaseAdmin.from("crm_webhook_logs").select('*').order('created_at', { ascending: false }).limit(5);
      const { data: convs } = await supabaseAdmin.from(TABLES.conversations).select('*').order('last_message_at', { ascending: false }).limit(5);
      
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
      const { team_id, tag_id, tag_ids } = req.query;
      
      // 1. Iniciar query
      let query = supabase.from(TABLES.conversations).select(`
        *,
        customer:customer_id(*)
      `);

      // 2. Aplicar filtro de equipe se informado e não for 'all'
      if (team_id && team_id !== 'all') {
        query = query.eq('team_id', team_id);
      }

      // 3. Aplicar filtro de tag se informado
      const tagsToFilter = (tag_ids as string || tag_id as string);
      if (tagsToFilter && tagsToFilter !== 'all') {
        const tagList = tagsToFilter.split(',').filter(id => id.trim());
        if (tagList.length > 0) {
          const { data: tagLinks } = await supabaseAdmin
            .from(TABLES.conversation_tags)
            .select('conversation_id')
            .in('tag_id', tagList);
          
          const convIds = (tagLinks || []).map(tl => tl.conversation_id);
          if (convIds.length > 0) {
            query = query.in('id', convIds);
          } else {
            // No conversations with these tags
            return res.json({ success: true, conversations: [] });
          }
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

  app.post("/api/crm/customers", async (req, res) => {
    try {
      const { name, phone: rawPhone, source } = req.body;

      if (!rawPhone) {
        return res.status(400).json({ success: false, error: "O número de telefone é obrigatório." });
      }

      const normalized = normalizeBrazilPhone(rawPhone);
      if (!normalized) {
        return res.status(400).json({ success: false, error: "Número de telefone inválido para o padrão brasileiro." });
      }

      // Find or create customer
      const customer = await findOrCreateCustomerByPhone(normalized, name || "Cliente");

      return res.json({
        success: true,
        customer
      });
    } catch (err: any) {
      console.error("[POST /api/crm/customers error]", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "Erro interno ao cadastrar/buscar cliente"
      });
    }
  });

  app.post("/api/omnichannel/conversations", async (req, res) => {
    try {
      const data = req.body;
      let customerPhone = "";

      if (data.customer_id) {
        const { data: customer } = await supabaseAdmin
          .from(TABLES.customers)
          .select("*")
          .eq("id", data.customer_id)
          .single();
        if (customer) {
          customerPhone = customer.phone_normalized || customer.phone || "";
        }
      }

      const phone = normalizeBrazilPhone(customerPhone);

      const { data: newConv, error } = await supabaseAdmin.from(TABLES.conversations)
        .insert({
          ...data,
          customer_phone_normalized: phone || undefined,
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

  app.post("/api/omnichannel/start-chat", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const { name, phone, message, customerId, customer_id, newName, newPhone, accountId, t_id } = req.body;

      let finalPhone = phone || newPhone;
      let finalName = name || newName;

      const cid = customerId || customer_id;
      if (cid) {
        const { data: cust } = await supabaseAdmin
          .from(TABLES.customers)
          .select("*")
          .eq("id", cid)
          .single();
        if (cust) {
          finalPhone = cust.phone_normalized || cust.phone;
          finalName = cust.name;
        }
      }

      if (!finalPhone) {
        return res.status(400).json({ success: false, error: "O número de telefone é obrigatório." });
      }

      const normalized = normalizeBrazilPhone(finalPhone);
      if (!normalized) {
        return res.status(400).json({ success: false, error: "Telefone inválido ou formato não suportado." });
      }

      const rawMessage = message || "Olá! Te chamei pelo CRM Viva Experience.";
      const finalMessage = formatAgentMessageForWhatsApp(rawMessage, currentUser.name);

      // Find or create customer
      const customer = await findOrCreateCustomerByPhone(normalized, finalName || "Cliente Novo");

      // Find or create conversation
      let { data: conversation } = await supabaseAdmin
        .from(TABLES.conversations)
        .select("*")
        .eq("customer_phone_normalized", normalized)
        .maybeSingle();

      const now = new Date().toISOString();

      const activeAccountId = accountId || req.body.whatsapp_account_id || null;

      if (conversation) {
        // Reutilizar conversa antiga e atualizar para OPEN e atribuir
        const { data: updatedConv, error: updateErr } = await supabaseAdmin
          .from(TABLES.conversations)
          .update({
            status: "OPEN",
            whatsapp_account_id: activeAccountId || conversation.whatsapp_account_id,
            assigned_user_id: currentUser.id,
            assigned_user_name: currentUser.name,
            team_id: currentUser.team_id || "comercial",
            team_name: currentUser.team_name || "Comercial",
            queue_id: currentUser.team_id || "comercial",
            queue_name: currentUser.team_name || "Comercial",
            last_message: finalMessage,
            last_message_at: now,
            updated_at: now
          })
          .eq("id", conversation.id)
          .select()
          .single();

        if (updateErr) throw updateErr;
        conversation = updatedConv;
      } else {
        // Criar nova conversa
        let resolvedAccountId = activeAccountId;
        if (!resolvedAccountId) {
          const { data: channels } = await supabaseAdmin.from("crm_channels").select("*").eq("is_active", true).limit(1);
          resolvedAccountId = channels && channels[0] ? channels[0].id : null;
        }

        const { data: newConv, error: insertErr } = await supabaseAdmin
          .from(TABLES.conversations)
          .insert({
            customer_id: customer.id,
            whatsapp_account_id: resolvedAccountId,
            customer_phone_normalized: normalized,
            assigned_user_id: currentUser.id,
            assigned_user_name: currentUser.name,
            status: "OPEN",
            team_id: currentUser.team_id || "comercial",
            team_name: currentUser.team_name || "Comercial",
            queue_id: currentUser.team_id || "comercial",
            queue_name: currentUser.team_name || "Comercial",
            source: "WhatsApp Z-API",
            last_message: finalMessage,
            last_message_at: now,
            created_at: now,
            updated_at: now
          })
          .select()
          .single();

        if (insertErr) throw insertErr;
        conversation = newConv;
      }

      // Enviar pela Z-API via callZapi
      const zapiResponse = await callZapi(
        "/send-text",
        {
          phone: normalized,
          message: finalMessage
        },
        {
          source: "start-chat",
          source_id: conversation.id
        }
      );

      // Salvar em crm_messages
      const { data: savedMessage, error: messageError } = await supabaseAdmin
        .from(TABLES.messages)
        .insert({
          conversation_id: conversation.id,
          customer_phone_normalized: normalized,
          external_message_id: zapiResponse?.messageId || zapiResponse?.id || `sent-${Date.now()}`,
          sender_type: "agent",
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          from_phone: "",
          to_phone: normalized,
          message_type: "text",
          content: finalMessage,
          status: "sent",
          is_internal: false,
          raw_payload: zapiResponse,
          created_at: now
        })
        .select()
        .single();

      if (messageError) throw messageError;

      broadcastEvent("conversation.updated", conversation);
      broadcastEvent("message.received", {
        conversation,
        message: {
          ...savedMessage,
          normalized_message_type: "text",
          display_content: savedMessage.content
        }
      });

      return res.json({
        success: true,
        conversation,
        message: savedMessage
      });
    } catch (err: any) {
      console.error("[START CHAT ERR]", err);
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
    try {
      const currentUser = await getAuthenticatedUser(req);
  
      const conversationId = req.params.id;
      const message = String(req.body?.message || "").trim();
  
      if (!message) {
        return res.status(400).json({
          success: false,
          error: "Mensagem vazia."
        });
      }
  
      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("crm_conversations")
        .select("*")
        .eq("id", conversationId)
        .single();
  
      if (conversationError || !conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversa não encontrada."
        });
      }
  
      const phone = normalizeBrazilPhone(conversation.customer_phone_normalized);
  
      if (!phone) {
        return res.status(400).json({
          success: false,
          error: "Telefone do cliente inválido."
        });
      }
  
      const finalMessage = formatAgentMessageForWhatsApp(message, currentUser.name);
  
      const zapiResponse = await callZapi(
        "/send-text",
        {
          phone,
          message: finalMessage
        },
        {
          source: "conversation",
          source_id: conversationId
        }
      );
  
      const now = new Date().toISOString();
  
      const { data: savedMessage, error: messageError } = await supabaseAdmin
        .from("crm_messages")
        .insert({
          conversation_id: conversationId,
          customer_phone_normalized: phone,
          external_message_id: zapiResponse?.messageId || zapiResponse?.id || `sent-${Date.now()}`,
          sender_type: "agent",
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          from_phone: "",
          to_phone: phone,
          message_type: "text",
          content: finalMessage,
          status: "sent",
          is_internal: false,
          raw_payload: zapiResponse,
          created_at: now
        })
        .select("*")
        .single();
  
      if (messageError) throw messageError;
  
      const { data: updatedConv } = await supabaseAdmin
        .from("crm_conversations")
        .update({
          assigned_user_id: conversation.assigned_user_id || currentUser.id,
          assigned_user_name: conversation.assigned_user_name || currentUser.name,
          status: "OPEN",
          last_message: finalMessage,
          last_message_at: now,
          updated_at: now
        })
        .eq("id", conversationId)
        .select()
        .single();
  
      broadcastEvent("message.received", {
        conversation: updatedConv || conversation,
        message: {
          ...savedMessage,
          normalized_message_type: 'text',
          display_content: savedMessage.content
        }
      });

      broadcastEvent("conversation.updated", { conversation: updatedConv || conversation });

      return res.json({
        success: true,
        message: savedMessage,
        zapiResponse
      });
    } catch (error: any) {
      console.error("[SEND MESSAGE ERROR]", error);
  
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao enviar mensagem.",
        zapiResponse: error?.zapiResponse || null
      });
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

        const { instanceId, instanceToken } = await getZapiConfig();
        if (!instanceId || !instanceToken) {
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
             phone, 
             message: introMsg
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
  
        const zapiResult = await callZapi(zapiPath, zapiBody);

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

  app.post("/api/omnichannel/conversations/:id/send-audio", upload.single("file"), async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const conversationId = req.params.id;

      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("crm_conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (conversationError || !conversation) {
        return res.status(404).json({
          success: false,
          error: "Conversa não encontrada."
        });
      }

      const phone = normalizeBrazilPhone(conversation.customer_phone_normalized);

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: "Telefone do cliente inválido."
        });
      }

      if (!req.file || !req.file.buffer || req.file.size < 1000) {
        return res.status(400).json({
          success: false,
          error: "Áudio não recebido ou arquivo vazio."
        });
      }

      const originalMimeType = req.file.mimetype || req.body?.originalMimeType || "audio/webm";

      const allowedInputMimes = [
        "audio/webm",
        "audio/ogg",
        "audio/mpeg",
        "audio/mp3",
        "audio/mp4",
        "audio/wav",
        "audio/x-m4a",
        "application/octet-stream"
      ];

      const isAllowed = allowedInputMimes.some((mime) => originalMimeType.toLowerCase().startsWith(mime.toLowerCase()));

      if (!isAllowed) {
        return res.status(400).json({
          success: false,
          error: `Formato de áudio não permitido: ${originalMimeType}`
        });
      }

      // Convert audio buffer to MP3
      const converted = await convertAudioBufferToMp3(req.file.buffer, originalMimeType);

      const audioBase64 = converted.buffer.toString("base64");
      const audioDataUri = `data:${converted.mimeType};base64,${audioBase64}`;

      const introMessage = formatAgentMessageForWhatsApp(
        "Estou enviando um áudio.",
        currentUser.name
      );

      await callZapi(
        "/send-text",
        {
          phone,
          message: introMessage
        },
        {
          source: "conversation-audio-intro",
          source_id: conversationId
        }
      );

      // Upload converted MP3 to Supabase Storage
      let publicUrl = "";
      try {
        const safeName = sanitizeFileName(converted.fileName);
        const datePath = new Date().toISOString().slice(0, 10);
        const storagePath = `sent/${datePath}/${Date.now()}-${safeName}`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from("chat-media")
          .upload(storagePath, converted.buffer, {
            contentType: converted.mimeType,
            upsert: true
          });

        if (!uploadErr) {
          const { data: storageData } = supabaseAdmin.storage.from("chat-media").getPublicUrl(storagePath);
          publicUrl = storageData?.publicUrl || "";
        } else {
          console.error("[STORAGE UPLOAD WARNING]", uploadErr);
        }
      } catch (storageErr) {
        console.error("[STORAGE ERROR]", storageErr);
      }

      // Send as base64 data URI to Z-API
      const zapiResponse = await callZapi(
        "/send-audio",
        {
          phone,
          audio: audioDataUri
        },
        {
          source: "conversation-audio",
          source_id: conversationId
        }
      );

      const now = new Date().toISOString();

      const { data: savedMessage, error: messageError } = await supabaseAdmin
        .from("crm_messages")
        .insert({
          conversation_id: conversationId,
          customer_phone_normalized: phone,
          external_message_id: zapiResponse?.messageId || zapiResponse?.id || `audio-${Date.now()}`,
          sender_type: "agent",
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          from_phone: "",
          to_phone: phone,
          message_type: "audio",
          content: "Áudio enviado",
          media_mime_type: converted.mimeType,
          media_file_name: converted.fileName,
          media_size: converted.buffer.length,
          media_url: publicUrl || audioDataUri,
          media_storage_url: publicUrl || audioDataUri,
          status: "sent",
          is_internal: false,
          raw_payload: {
            zapiResponse,
            originalMimeType,
            originalSize: req.file.size,
            convertedMimeType: converted.mimeType,
            convertedSize: converted.buffer.length
          },
          created_at: now
        })
        .select("*")
        .single();

      if (messageError) {
        throw messageError;
      }

      const { data: updatedConv } = await supabaseAdmin
        .from("crm_conversations")
        .update({
          assigned_user_id: conversation.assigned_user_id || currentUser.id,
          assigned_user_name: conversation.assigned_user_name || currentUser.name,
          status: "OPEN",
          last_message: "Áudio enviado",
          last_message_at: now,
          updated_at: now
        })
        .eq("id", conversationId)
        .select()
        .single();

      broadcastEvent("message.received", {
        conversation: updatedConv || conversation,
        message: {
          ...savedMessage,
          normalized_message_type: "audio",
          display_content: savedMessage.content,
          display_media_url: publicUrl || audioDataUri
        }
      });

      broadcastEvent("conversation.updated", { conversation: updatedConv || conversation });

      return res.json({
        success: true,
        message: savedMessage,
        zapiResponse,
        audio: {
          originalMimeType,
          originalSize: req.file.size,
          convertedMimeType: converted.mimeType,
          convertedSize: converted.buffer.length
        }
      });
    } catch (error: any) {
      console.error("[SEND AUDIO ERROR]", error);

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao enviar áudio.",
        zapiResponse: error?.zapiResponse || null
      });
    }
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

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanName = String(name).trim();

      if (password !== confirmPassword) throw new Error("A senha e a confirmação não conferem.");
      if (password.length < 8) throw new Error("A senha deve ter no mínimo 8 caracteres.");

      // 1. Check if user already exists in CRM DB
      const { data: existingCrmUser } = await supabaseAdmin.from(TABLES.users).select('id').eq('email', cleanEmail).maybeSingle();
      
      let authUserId = null;

      // 2. Try to create in Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: { name: cleanName, role, team_id: team_id || DEFAULT_TEAM.id, team_name: team_name || DEFAULT_TEAM.name }
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
          
          const existingAuthUser = (listData.users as any[]).find(u => u.email === cleanEmail);
          if (!existingAuthUser) throw new Error("Usuário já registrado no Auth, mas erro ao recuperar ID.");
          
          authUserId = existingAuthUser.id;
        } else {
          throw authError;
        }
      } else {
        authUserId = authData.user.id;
      }

      if (!authUserId) {
        throw new Error("Não foi possível gerar ou recuperar o ID de autenticação do usuário.");
      }

      // Segurança crítica: nunca usar ID do administrador atual
      if (authUserId === currentUser.auth_user_id || authUserId === currentUser.id) {
        throw new Error("Erro de integridade de segurança: Tentativa ilegal de associar ID do administrador atual.");
      }

      // 3. Create or update in crm_users (Profile)
      const { data: newUser, error: dbError } = await supabaseAdmin.from(TABLES.users).upsert({
        auth_user_id: authUserId,
        name: cleanName,
        email: cleanEmail,
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
      const { data, error } = await supabaseAdmin
        .from(TABLES.campaigns)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.json({ success: true, campaigns: data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/optimize", async (req, res) => {
    try {
      const { raw_contacts } = req.body;
      if (!raw_contacts || typeof raw_contacts !== 'string') {
        return res.status(400).json({ success: false, error: "Texto de contatos inválido" });
      }

      const lines = raw_contacts.split('\n').filter(l => l.trim());
      const valid: any[] = [];
      const invalid: any[] = [];
      const duplicates: any[] = [];
      const seen = new Set();

      for (const line of lines) {
        let name = "";
        let phone = "";

        if (line.includes(';')) {
          const parts = line.split(';');
          name = parts[0]?.trim();
          phone = parts[1]?.trim();
        } else if (line.includes(',')) {
          const parts = line.split(',');
          name = parts[0]?.trim();
          phone = parts[1]?.trim();
        } else {
          phone = line.trim();
        }

        const normalized = normalizeBrazilPhone(phone);
        if (!normalized) {
          invalid.push({ line, reason: "Telefone inválido ou formato não suportado." });
          continue;
        }

        if (seen.has(normalized)) {
          duplicates.push({ line, phone_normalized: normalized });
          continue;
        }

        seen.add(normalized);
        valid.push({
          name: name || "Cliente",
          phone: phone,
          phone_normalized: normalized
        });
      }

      return res.json({ 
        success: true, 
        total_input: lines.length,
        total_valid: valid.length,
        total_invalid: invalid.length,
        total_duplicates: duplicates.length,
        valid,
        invalid,
        duplicates
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const user = await getAuthenticatedUser(req);
      const { name, whatsapp_account_id, content, message_type, media_url, media_file_name, media_mime_type, contacts, batch_size, min_interval, max_interval } = req.body;

      if (!name || !whatsapp_account_id || !content || !contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ success: false, error: "Dados incompletos para criação da campanha" });
      }

      const { data: campaign, error: cErr } = await supabaseAdmin.from(TABLES.campaigns).insert({
        name,
        whatsapp_account_id,
        content,
        message_type: message_type || 'text',
        media_url,
        media_file_name,
        media_mime_type,
        status: 'READY',
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

      const chunkSize = 500;
      for (let i = 0; i < recipients.length; i += chunkSize) {
        const chunk = recipients.slice(i, i + chunkSize);
        await supabaseAdmin.from(TABLES.campaign_recipients).insert(chunk);
      }

      await supabaseAdmin.from(TABLES.campaign_events).insert({
        campaign_id: campaign.id,
        event_type: 'campaign.created',
        data: { message: `Campanha criada por ${user.name}` }
      });

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
      const { id } = req.params;
      
      const { data: campaign, error } = await supabaseAdmin
        .from(TABLES.campaigns)
        .select("*")
        .eq("id", id)
        .single();
      
      if (error || !campaign) throw new Error("Campanha não encontrada.");

      // Validar Z-API
      const { instanceId, instanceToken } = await getZapiConfig();
      if (!instanceId || !instanceToken) throw new Error("Z-API não configurada.");

      // Validar se tem contatos PENDING
      const { count } = await supabaseAdmin
        .from(TABLES.campaign_recipients)
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "PENDING");
      
      if (!count || count === 0) throw new Error("Não há destinatários pendentes nesta campanha.");

      const { data: updatedCampaign } = await supabaseAdmin
        .from(TABLES.campaigns)
        .update({
          status: "RUNNING",
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      await supabaseAdmin.from(TABLES.campaign_events).insert({
        campaign_id: id,
        event_type: "campaign.started",
        message: "Campanha iniciada."
      });

      // Processar primeiro lote imediatamente
      const batchResult = await processCampaignBatch(id);

      return res.json({
        success: true,
        campaign: updatedCampaign,
        batchResult
      });
    } catch (error: any) {
      console.error("[CAMPAIGN START ERR]", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/pause", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: campaign } = await supabaseAdmin
        .from(TABLES.campaigns)
        .update({
          status: "PAUSED",
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      await supabaseAdmin.from(TABLES.campaign_events).insert({
        campaign_id: id,
        event_type: "campaign.paused",
        message: "Campanha pausada manualmente."
      });

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/resume", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: campaign } = await supabaseAdmin
        .from(TABLES.campaigns)
        .update({
          status: "RUNNING",
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      await supabaseAdmin.from(TABLES.campaign_events).insert({
        campaign_id: id,
        event_type: "campaign.resumed",
        message: "Campanha retomada."
      });

      // Processar imediatamente
      processCampaignBatch(id);

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/cancel", async (req, res) => {
    try {
      const { id } = req.params;
      
      const { data: campaign } = await supabaseAdmin
        .from(TABLES.campaigns)
        .update({
          status: "CANCELED",
          updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .select()
        .single();

      // Marcar destinatários pendentes como SKIPPED
      await supabaseAdmin
        .from(TABLES.campaign_recipients)
        .update({
          status: "SKIPPED",
          updated_at: new Date().toISOString()
        })
        .eq("campaign_id", id)
        .in("status", ["PENDING", "SENDING"]);

      await supabaseAdmin.from(TABLES.campaign_events).insert({
        campaign_id: id,
        event_type: "campaign.canceled",
        message: "Campanha cancelada manualmente."
      });

      return res.json({ success: true, campaign });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/process", async (req, res) => {
    try {
      const { id } = req.params;
      const { data: campaign } = await supabaseAdmin
        .from(TABLES.campaigns)
        .select("status")
        .eq("id", id)
        .single();
      
      if (campaign?.status === "READY" || campaign?.status === "PAUSED") {
        await supabaseAdmin.from(TABLES.campaigns).update({ status: "RUNNING" }).eq("id", id);
      }
      
      const batchResult = await processCampaignBatch(id);
      
      return res.json({ success: true, ...batchResult });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/campaigns/:id/retry-failed", async (req, res) => {
    try {
      const { id } = req.params;
      
      // Marcar destinatários FAILED como PENDING
      const { error } = await supabaseAdmin
        .from(TABLES.campaign_recipients)
        .update({
          status: "PENDING",
          error_message: null,
          attempts: 0,
          updated_at: new Date().toISOString()
        })
        .eq("campaign_id", id)
        .eq("status", "FAILED");

      if (error) throw error;

      // Se a campanha não estiver rodando, coloca pra rodar
      const { data: campaign } = await supabaseAdmin
        .from(TABLES.campaigns)
        .select("status")
        .eq("id", id)
        .single();

      if (campaign?.status !== "RUNNING") {
        await supabaseAdmin.from(TABLES.campaigns).update({
          status: "RUNNING",
          updated_at: new Date().toISOString()
        }).eq("id", id);
      }

      await supabaseAdmin.from(TABLES.campaign_events).insert({
        campaign_id: id,
        event_type: "campaign.retry_failed",
        message: "Retentativa de falhas iniciada."
      });

      // Processar imediatamente
      processCampaignBatch(id);

      return res.json({ success: true, message: "Falhas marcadas para reenvio." });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/debug/campaigns", async (req, res) => {
    try {
      const { instanceId, instanceToken, clientToken } = await getZapiConfig();
      
      const { data: campaigns } = await supabaseAdmin.from(TABLES.campaigns).select("*");
      const { data: recipients } = await supabaseAdmin.from(TABLES.campaign_recipients).select("status");

      const stats = {
        total: campaigns?.length || 0,
        draft: campaigns?.filter(c => c.status === "DRAFT").length || 0,
        ready: campaigns?.filter(c => c.status === "READY").length || 0,
        running: campaigns?.filter(c => c.status === "RUNNING").length || 0,
        paused: campaigns?.filter(c => c.status === "PAUSED").length || 0,
        completed: campaigns?.filter(c => c.status === "COMPLETED").length || 0,
        failed: campaigns?.filter(c => c.status === "FAILED").length || 0,
        canceled: campaigns?.filter(c => c.status === "CANCELED").length || 0
      };

      const recipStats = {
        pending: recipients?.filter(r => r.status === "PENDING").length || 0,
        sending: recipients?.filter(r => r.status === "SENDING").length || 0,
        sent: recipients?.filter(r => r.status === "SENT").length || 0,
        failed: recipients?.filter(r => r.status === "FAILED").length || 0,
        skipped: recipients?.filter(r => r.status === "SKIPPED").length || 0
      };

      return res.json({
        success: true,
        config: {
          hasZapiInstanceId: !!instanceId,
          hasZapiInstanceToken: !!instanceToken,
          hasZapiClientToken: !!clientToken,
          campaignWorkerStarted,
          defaultBatchSize: 5,
          defaultDelaySeconds: 8
        },
        totals: stats,
        recipients: recipStats,
        runningCampaigns: campaigns?.filter(c => c.status === "RUNNING").map(c => ({
           id: c.id,
           name: c.name,
           last_processed_at: c.last_processed_at,
           locked: campaignProcessingLocks.has(c.id)
        })) || []
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.get("/api/campaigns/:id/debug", async (req, res) => {
    const { id } = req.params;
    try {
      const { data: campaign } = await supabaseAdmin.from(TABLES.campaigns).select("*").eq("id", id).single();
      const stats = await refreshCampaignStats(id);

      const { data: nextRecipients } = await supabaseAdmin
        .from(TABLES.campaign_recipients)
        .select("*")
        .eq("campaign_id", id)
        .eq("status", "PENDING")
        .order("created_at", { ascending: true })
        .limit(5);

      const { data: lastFailed } = await supabaseAdmin
        .from(TABLES.campaign_recipients)
        .select("*")
        .eq("campaign_id", id)
        .eq("status", "FAILED")
        .order("updated_at", { ascending: false })
        .limit(5);

      const { data: events } = await supabaseAdmin
        .from(TABLES.campaign_events)
        .select("*")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(10);

      const reasons = [];
      const { instanceId, instanceToken } = await getZapiConfig();
      if (campaign?.status !== "RUNNING") reasons.push(`Status é ${campaign?.status}, não RUNNING`);
      if (stats.pending_count === 0) reasons.push("Sem destinatários PENDING");
      if (!instanceId || !instanceToken) reasons.push("Z-API não configurada");
      if (!campaign?.content && !campaign?.message_text) reasons.push("Mensagem vazia");
      if (campaign?.message_type !== "text" && !campaign?.media_url) reasons.push(`Mídia ausente para tipo ${campaign?.message_type}`);

      return res.json({
        success: true,
        campaign,
        stats,
        nextPendingRecipients: nextRecipients || [],
        lastFailedRecipients: lastFailed || [],
        lastEvents: events || [],
        canProcess: reasons.length === 0,
        reasonsIfCannotProcess: reasons
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/debug/zapi/test-send", async (req, res) => {
    try {
      const { phone, message } = req.body;
      const normalized = normalizeBrazilPhone(phone);
      if (!normalized) throw new Error("Telefone inválido.");

      const zapiResponse = await callZapi("/send-text", {
         phone: normalized, 
         message 
      });

      return res.json({ success: true, zapiResponse });
    } catch (err: any) {
      return res.status(500).json({ 
        success: false, 
        error: getErrorMessage(err),
        zapiRawResponse: err.zapiResponse || null
      });
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

      // 4. Get tags with metadata
      const { data: tagLinks } = await supabaseAdmin
        .from(TABLES.conversation_tags)
        .select(`
          created_at,
          created_by,
          created_by_name,
          tags:tag_id (*)
        `)
        .eq('conversation_id', id);

      const details = {
        ...conversation,
        customer: conversation.customers,
        first_interaction_at: firstMsg?.created_at || null,
        last_interaction_at: lastMsg?.created_at || conversation.last_message_at || conversation.updated_at,
        total_messages: totalMessages || 0,
        tags: tagLinks?.map((tl: any) => ({
          ...tl.tags,
          linked_at: tl.created_at,
          linked_by: tl.created_by,
          linked_by_name: tl.created_by_name
        })) || []
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
    const config = await getZapiConfig();
    const appUrl = getPublicAppUrl();
    
    const missing = [];
    if (!config.instanceId) missing.push("ZAPI_INSTANCE_ID");
    if (!config.instanceToken) missing.push("ZAPI_INSTANCE_TOKEN");

    const checks = {
      appUrl: !!appUrl && !appUrl.includes("localhost"),
      instanceId: !!config.instanceId,
      instanceToken: !!config.instanceToken,
      healthRoute: true,
      receivedWebhookRoute: true
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
        value: webhookUrl
      });
      
      return res.status(200).json({
        success: true,
        webhookUrl,
        zapiResponse: result
      });
    } catch (err: any) {
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
        const response = await callZapi(webhook.path, {
           value: webhook.url
        });
        results.push({
          name: webhook.name,
          url: webhook.url,
          success: true,
          response
        });
      } catch (err: any) {
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
    try {
      const result = await callZapi("/send-text", req.body);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.message, data: err.zapiResponse });
    }
  });

  app.post("/api/zapi/send-image", async (req, res) => {
    try {
      const result = await callZapi("/send-image", req.body);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.message, data: err.zapiResponse });
    }
  });

  app.post("/api/zapi/send-video", async (req, res) => {
    try {
      const result = await callZapi("/send-video", req.body);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.message, data: err.zapiResponse });
    }
  });

  app.post("/api/zapi/send-audio", async (req, res) => {
    try {
      const result = await callZapi("/send-audio", req.body);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.message, data: err.zapiResponse });
    }
  });

  app.post("/api/zapi/send-document", async (req, res) => {
    try {
      const result = await callZapi(`/send-document/${req.body.extension}`, req.body);
      return res.json({ success: true, data: result });
    } catch (err: any) {
      return res.status(err.status || 500).json({ success: false, error: err.message, data: err.zapiResponse });
    }
  });

  app.get("/api/channels", async (req, res) => {
    try {
      const list = await loadChannelsDBOrFile();
      return res.json({ success: true, channels: list });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/channels/active", async (req, res) => {
    try {
      const list = await loadChannelsDBOrFile();
      const active = list.find((c: any) => c.is_active);
      if (active) {
        return res.json({ success: true, channel: active });
      } else {
        // Fallback das env
        const envConfig = {
          id: "env-fallback",
          name: "Canal Padrão (Ambiente)",
          type: "whatsapp_zapi",
          instance_id: process.env.ZAPI_INSTANCE_ID || "",
          instance_token: process.env.ZAPI_INSTANCE_TOKEN || "",
          client_token: process.env.ZAPI_CLIENT_TOKEN || "",
          is_active: true,
          status: "DISCONNECTED"
        };
        return res.json({ success: true, channel: envConfig });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/channels", async (req, res) => {
    try {
      const { name, type, instance_id, instance_token, client_token, is_active } = req.body;
      if (!instance_id || !instance_token) {
        return res.status(400).json({ success: false, error: "id da instância e token são obrigatórios." });
      }
      const channel = {
        name: name || "WhatsApp " + instance_id,
        type: type || "whatsapp_zapi",
        instance_id,
        instance_token,
        client_token: client_token || "",
        status: "DISCONNECTED",
        is_active: is_active !== undefined ? is_active : true
      };
      await saveChannelToDBOrFile(channel);
      return res.json({ success: true, channel });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.patch("/api/channels/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const list = await loadChannelsDBOrFile();
      const existing = list.find((c: any) => c.id === id);
      if (!existing) {
        return res.status(404).json({ success: false, error: "Canal não encontrado." });
      }
      const updated = {
        ...existing,
        ...req.body,
        id
      };
      await saveChannelToDBOrFile(updated);
      return res.json({ success: true, channel: updated });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.delete("/api/channels/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await deleteChannelDBOrFile(id);
      return res.json({ success: true, message: "Canal removido com sucesso." });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/zapi/status", async (req, res) => {
    try {
      const raw = await getZapiStatusRaw();
      const normalized = normalizeZapiStatus(raw);

      // Sincroniza status do canal ativo
      try {
        const list = await loadChannelsDBOrFile();
        const active = list.find((c: any) => c.is_active);
        if (active) {
          active.status = normalized.connected ? "CONNECTED" : "DISCONNECTED";
          if (normalized.phone) {
            active.connected_phone = normalized.phone;
          }
          await saveChannelToDBOrFile(active);
        }
      } catch (updateErr) {
        console.error("[AUTO UPDATE CHANNEL STATUS ERROR]", updateErr);
      }

      return res.json({
        success: true,
        ...normalized
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        connected: false,
        smartphoneConnected: false,
        error: error instanceof Error ? error.message : "Erro ao verificar status da Z-API."
      });
    }
  });

  const restartHandler = async (req: any, res: any) => {
    try {
      let result = await callZapiActionRaw("/restart", "POST");
      if (!result.ok) {
        result = await callZapiActionRaw("/restart", "GET");
      }
      return res.json({ success: result.ok, status: result.status, data: result.json || result.text });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao reiniciar Z-API."
      });
    }
  };

  app.get("/api/zapi/restart", restartHandler);
  app.post("/api/zapi/restart", restartHandler);

  const disconnectHandler = async (req: any, res: any) => {
    try {
      let result = await callZapiActionRaw("/disconnect", "POST");
      if (!result.ok) {
        result = await callZapiActionRaw("/disconnect", "GET");
      }
      // Se desconectou com sucesso, limpa status do canal ativo
      try {
        const list = await loadChannelsDBOrFile();
        const active = list.find((c: any) => c.is_active);
        if (active) {
          active.status = "DISCONNECTED";
          active.connected_phone = null;
          await saveChannelToDBOrFile(active);
        }
      } catch (updateErr) {
        console.error("[AUTO DISCONNECT CHANNEL STATUS ERROR]", updateErr);
      }
      return res.json({ success: result.ok, status: result.status, data: result.json || result.text });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao desconectar Z-API."
      });
    }
  };

  app.get("/api/zapi/disconnect", disconnectHandler);
  app.post("/api/zapi/disconnect", disconnectHandler);

  app.get("/api/zapi/qrcode", async (req, res) => {
    const attempts = [];

    try {
      const rawStatus = await getZapiStatusRaw();
      const status = normalizeZapiStatus(rawStatus);

      if (status.connected) {
        return res.json({
          success: true,
          connected: true,
          qrCodeImage: null,
          message: "Instância já conectada.",
          status
        });
      }

      const endpoints = ["/qr-code", "/qr-code/image"];

      for (const endpoint of endpoints) {
        try {
          const response = await callZapiQrRaw(endpoint);
          const qrCodeImage = extractQrFromAnyResponse(response);

          attempts.push({
            endpoint,
            status: response.status,
            contentType: response.contentType,
            ok: response.ok,
            hasJson: Boolean(response.json),
            jsonKeys: response.json ? Object.keys(response.json) : [],
            extracted: Boolean(qrCodeImage),
            extractedLength: qrCodeImage ? qrCodeImage.length : 0
          });

          if (qrCodeImage) {
            return res.json({
              success: true,
              connected: false,
              qrCodeImage,
              qrCode: qrCodeImage,
              value: qrCodeImage, // compatible with older frontend expectations
              expiresInSeconds: 20,
              refreshInSeconds: 15,
              endpointUsed: endpoint,
              attempts
            });
          }
        } catch (error) {
          attempts.push({
            endpoint,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return res.status(422).json({
        success: false,
        connected: false,
        error: "A Z-API não retornou um QR Code válido.",
        attempts,
        status
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        connected: false,
        error: error instanceof Error ? error.message : "Erro ao gerar QR Code.",
        attempts
      });
    }
  });

  app.get("/api/debug/zapi/qrcode-raw", async (req, res) => {
    const endpoints = ["/qr-code", "/qr-code/image"];
    const attempts = [];

    const config = {
      hasInstanceId: Boolean(process.env.ZAPI_INSTANCE_ID),
      hasInstanceToken: Boolean(process.env.ZAPI_INSTANCE_TOKEN),
      hasClientToken: Boolean(process.env.ZAPI_CLIENT_TOKEN),
      baseUrl: process.env.ZAPI_BASE_URL || "https://api.z-api.io"
    };

    for (const endpoint of endpoints) {
      try {
        const response = await callZapiQrRaw(endpoint);
        const extracted = extractQrFromAnyResponse(response);

        attempts.push({
          endpoint,
          status: response.status,
          contentType: response.contentType,
          ok: response.ok,
          hasJson: Boolean(response.json),
          jsonKeys: response.json ? Object.keys(response.json) : [],
          valuePreview: response.json?.value ? String(response.json.value).slice(0, 300) : null,
          textPreview: response.text ? String(response.text).slice(0, 300) : null,
          extracted: Boolean(extracted),
          extractedLength: extracted ? extracted.length : 0
        });
      } catch (error) {
        attempts.push({
          endpoint,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return res.json({
      success: true,
      config,
      attempts
    });
  });

  app.get("/api/debug/send-message-config", async (req, res) => {
    try {
      const { instanceId, instanceToken, clientToken } = await getZapiConfig();
      return res.json({
        success: true,
        hasZapiInstanceId: Boolean(instanceId),
        hasZapiInstanceToken: Boolean(instanceToken),
        hasZapiClientToken: Boolean(clientToken),
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
        hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Catch-all for API routes to always return JSON
  app.use("/api", (req, res) => {
    console.error(`[404 NOT FOUND] Rota de API não encontrada: ${req.method} ${req.originalUrl}`);
    return res.status(404).json({
      success: false,
      error: `Rota de API não encontrada: ${req.method} ${req.originalUrl}`,
      path: req.originalUrl,
      method: req.method
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

  startCampaignWorker();

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
