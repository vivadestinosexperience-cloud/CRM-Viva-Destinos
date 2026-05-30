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
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import sharp from "sharp";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

dotenv.config();

let globalSupabaseAdmin: any = null;

// Database or JSON filesystem helpers for Channels Settings
async function loadChannelsDBOrFile() {
  let fileList: any[] = [];
  try {
    const jsonPath = path.join(process.cwd(), "backend_channels.json");
    if (fs.existsSync(jsonPath)) {
      fileList = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }
  } catch (err) {
    // Ignora
  }

  // 1. Tenta buscar do Supabase
  try {
    if (globalSupabaseAdmin) {
      const { data, error } = await globalSupabaseAdmin
        .from("crm_channels")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        const dbIds = new Set(data.map((d: any) => d.id));
        const merged = data.map((dbChan: any) => {
          const fileChan = fileList.find((c: any) => c.id === dbChan.id);
          return {
            ...dbChan,
            meta_app_id: dbChan.meta_app_id || fileChan?.meta_app_id || "",
            meta_app_secret: dbChan.meta_app_secret || fileChan?.meta_app_secret || "",
            meta_verify_token: dbChan.meta_verify_token || fileChan?.meta_verify_token || ""
          };
        });
        
        // Adiciona canais existentes apenas em arquivo
        for (const fileChan of fileList) {
          if (!dbIds.has(fileChan.id)) {
            merged.push(fileChan);
          }
        }
        return merged;
      }
    }
  } catch (err) {
    // Ignora erro de tabela inexistente
  }

  return fileList;
}

async function saveChannelToDBOrFile(channel: any) {
  if (!channel.id) {
    channel.id = crypto.randomUUID();
  }
  channel.updated_at = new Date().toISOString();
  if (!channel.created_at) {
    channel.created_at = new Date().toISOString();
  }

  // Proactive check if Z-API channel already has an active session on the server to prevent drop and ban
  if ((channel.provider_type === "zapi" || channel.provider === "ZAPI" || String(channel.type).includes("zapi")) && channel.instance_id && channel.instance_token) {
    try {
      const raw = await getZapiStatusRaw({
        query: {
          instanceId: channel.instance_id,
          instanceToken: channel.instance_token,
          clientToken: channel.client_token
        }
      });
      const normalized = normalizeZapiStatus(raw);
      if (normalized.connected) {
        channel.status = "CONNECTED";
        if (normalized.phone) {
          channel.connected_phone = normalized.phone;
          channel.phone_number = normalized.phone;
        }
      } else {
        channel.status = "DISCONNECTED";
      }
    } catch (zapiErr) {
      console.log("[PROACTIVE SAVE CHANNEL ZAPI SYNC SKIP/OFFLINE]:", zapiErr instanceof Error ? zapiErr.name : zapiErr);
    }
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

      const basePayload = {
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
        updated_at: channel.updated_at,
        meta_whatsapp_status: channel.meta_whatsapp_status || null,
        meta_whatsapp_last_test_at: channel.meta_whatsapp_last_test_at || null,
        meta_whatsapp_display_phone_number: channel.meta_whatsapp_display_phone_number || null,
        meta_whatsapp_verified_name: channel.meta_whatsapp_verified_name || null,
        meta_whatsapp_quality_rating: channel.meta_whatsapp_quality_rating || null,
        meta_whatsapp_last_error: channel.meta_whatsapp_last_error || null
      };

      try {
        await globalSupabaseAdmin
          .from("crm_channels")
          .upsert({
            ...basePayload,
            meta_app_id: channel.meta_app_id || null,
            meta_app_secret: channel.meta_app_secret || null,
            meta_verify_token: channel.meta_verify_token || null
          });
      } catch (upsertColErr) {
        // Fallback upsert without columns if they don't exist
        await globalSupabaseAdmin
          .from("crm_channels")
          .upsert(basePayload);
      }
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

async function analyzeAudioFile(filePath: string): Promise<{ meanVolume: string | null; maxVolume: string | null; hasAudioSignal: boolean; raw: string }> {
  return new Promise((resolve) => {
    let stderr = "";

    ffmpeg(filePath)
      .audioFilters("volumedetect")
      .outputOptions("-f", "null")
      .output(os.platform() === "win32" ? "NUL" : "/dev/null")
      .on("stderr", (line) => {
        stderr += line + "\n";
      })
      .on("error", (err) => {
        console.warn("[analyzeAudioFile ffmpeg warning]", err);
        resolve({
          meanVolume: null,
          maxVolume: null,
          hasAudioSignal: true, // Default to true to be safe
          raw: String(err)
        });
      })
      .on("end", () => {
        const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
        const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/i);

        const meanVolume = meanMatch ? meanMatch[1] : null;
        const maxVolume = maxMatch ? maxMatch[1] : null;

        const maxNumber = maxVolume !== null ? Number(maxVolume) : null;
        const hasAudioSignal =
          maxNumber !== null &&
          Number.isFinite(maxNumber) &&
          maxNumber > -55;

        resolve({
          meanVolume,
          maxVolume,
          hasAudioSignal: maxVolume !== null ? hasAudioSignal : true,
          raw: stderr.slice(-1000)
        });
      })
      .run();
  });
}

async function getAudioDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (error, metadata) => {
      if (error) {
        console.warn("[getAudioDuration ffprobe warning]", error);
        return resolve(null);
      }
      resolve(metadata?.format?.duration || null);
    });
  });
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
    const duration = await getAudioDuration(inputPath);
    const inputAnalysis = await analyzeAudioFile(inputPath);

    if (duration !== null && Number(duration) < 0.5) {
      throw new Error("Áudio muito curto para ser enviado (mínimo 0.5 segundos).");
    }

    if (!inputAnalysis.hasAudioSignal) {
      throw new Error("O áudio gravado está sem som detectável. Verifique o seu microfone e grave novamente.");
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("96k")
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

    const outputAnalysis = await analyzeAudioFile(outputPath);

    return {
      buffer: outputBuffer,
      mimeType: "audio/mpeg",
      fileName: `audio-${Date.now()}.mp3`,
      duration,
      inputAnalysis,
      outputAnalysis
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

async function getZapiConfig(req?: any) {
  const queryId = req?.query?.instanceId || req?.headers?.["x-instance-id"] || req?.body?.instanceId;
  const queryToken = req?.query?.instanceToken || req?.headers?.["x-instance-token"] || req?.body?.instanceToken;
  const queryClient = req?.query?.clientToken || req?.headers?.["x-client-token"] || req?.body?.clientToken;

  if (queryId && queryToken) {
    return {
      baseUrl: process.env.ZAPI_BASE_URL || "https://api.z-api.io",
      instanceId: String(queryId).trim(),
      instanceToken: String(queryToken).trim(),
      clientToken: queryClient ? String(queryClient).trim() : ""
    };
  }

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
  const channel = meta.channel || await getActiveWhatsappChannel();

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

async function callZapiQrRaw(path: string, req?: any) {
  const { baseUrl, instanceId, instanceToken, clientToken } = await getZapiConfig(req);

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

async function getZapiStatusRaw(req?: any) {
  const { baseUrl, instanceId, instanceToken, clientToken } = await getZapiConfig(req);

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

async function callZapiActionRaw(path: string, method: "GET" | "POST" = "POST", req?: any) {
  const { baseUrl, instanceId, instanceToken, clientToken } = await getZapiConfig(req);

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
  let raw = String(input || "").trim().toLowerCase();

  if (raw.includes("-")) {
    raw = raw.split("-")[0];
  }

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

  // Standardization to add 9th digit for Brazilian mobile phones
  if (digits.length === 12 || digits.length === 13) {
    const ddd = digits.substring(2, 4);
    const dddNum = parseInt(ddd, 10);
    if (dddNum >= 11 && dddNum <= 99) {
      if (digits.length === 12) {
        digits = `55${ddd}9${digits.substring(4)}`;
      }
    }
  }

  if (digits.length < 12 || digits.length > 13) return "";

  return digits;
}

function getEquivalentBrazilPhones(phone: string): string[] {
  let cleanPhone = phone;
  if (phone && phone.includes("-")) {
    cleanPhone = phone.split("-")[0];
  }
  let digits = String(cleanPhone || "").replace(/\D/g, "");
  if (!digits) return [phone];

  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.substring(2, 4);
    const dddNum = parseInt(ddd, 10);
    if (dddNum >= 11 && dddNum <= 99) {
      if (digits.length === 12) {
        const with9 = `55${ddd}9${digits.substring(4)}`;
        return [digits, with9];
      } else {
        const without9 = `55${ddd}${digits.substring(5)}`;
        return [digits, without9];
      }
    }
  }
  return [cleanPhone, digits];
}

function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id || "");
}

function getZapiMessageDirection(payload: any) {
  if (payload?.fromMe === true) {
    return "outgoing";
  }
  return "incoming";
}

function getCustomerPhoneFromZapiPayload(payload: any) {
  const candidates: any[] = [];

  if (payload?.phone) candidates.push(payload.phone);
  if (payload?.chatId) candidates.push(payload.chatId);
  if (payload?.remoteJid) candidates.push(payload.remoteJid);
  if (payload?.key?.remoteJid) candidates.push(payload.key.remoteJid);

  const connectedPh = normalizeBrazilPhone(payload?.connectedPhone);

  const valid = candidates.find((value) => {
    const raw = String(value || "").toLowerCase();

    if (!raw) return false;
    if (raw.includes("@g.us")) return false;
    if (raw.includes("@newsletter")) return false;
    if (raw.includes("status@broadcast")) return false;
    if (raw.includes("-group")) return false;

    const digits = raw.replace(/\D/g, "");

    if (!digits) return false;
    if (digits.startsWith("120363")) return false;

    // connectedPhone nunca deve virar customer_phone_normalized.
    const norm = normalizeBrazilPhone(value);
    if (connectedPh && norm === connectedPh) return false;

    return true;
  });

  return normalizeBrazilPhone(valid);
}

function diagnoseZapiPayloadOrigin(payload: any) {
  const signals: any[] = [];

  const rawPhone = getCustomerPhoneFromZapiPayload(payload) || String(payload?.phone || "").trim();
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
    ["group", "group_or_channel", "newsletter", "broadcast", "status"].includes(s.type)
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

function extractZapiMessageContent(payload: any) {
  if (payload?.text?.message) {
    return {
      message_type: "text",
      content: String(payload.text.message),
      media_url: null,
      caption: null,
      media_mime_type: null,
      file_name: null
    };
  }

  if (payload?.image) {
    return {
      message_type: "image",
      content: payload.image.caption || "Imagem",
      media_url: payload.image.imageUrl || payload.image.thumbnailUrl || null,
      caption: payload.image.caption || null,
      media_mime_type: payload.image.mimeType || "image/jpeg",
      file_name: null
    };
  }

  if (payload?.audio) {
    return {
      message_type: "audio",
      content: "Áudio",
      media_url: payload.audio.audioUrl || null,
      caption: null,
      media_mime_type: payload.audio.mimeType || "audio/ogg",
      file_name: null
    };
  }

  if (payload?.video) {
    return {
      message_type: "video",
      content: payload.video.caption || "Vídeo",
      media_url: payload.video.videoUrl || null,
      caption: payload.video.caption || null,
      media_mime_type: payload.video.mimeType || "video/mp4",
      file_name: null
    };
  }

  if (payload?.document) {
    return {
      message_type: "document",
      content: payload.document.fileName || "Documento",
      media_url: payload.document.documentUrl || null,
      caption: payload.document.caption || null,
      media_mime_type: payload.document.mimeType || null,
      file_name: payload.document.fileName || "Documento"
    };
  }

  return {
    message_type: "text",
    content: payload?.message || payload?.body || "Mensagem recebida",
    media_url: null,
    caption: null,
    media_mime_type: null,
    file_name: null
  };
}

function normalizeIncomingDirectMessage(payload: any, phone: string) {
  const extracted = extractZapiMessageContent(payload);

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
    messageType: extracted.message_type,
    content: extracted.content,
    caption: extracted.caption || "",
    mediaUrl: extracted.media_url || "",
    mimeType: extracted.media_mime_type || "",
    fileName: extracted.file_name || "",
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

function extractBodyText(components: any[]): string {
  if (!Array.isArray(components)) return "";
  const bodyComponent = components.find((c: any) => String(c.type).toUpperCase() === "BODY");
  return bodyComponent?.text || "";
}

function extractHeaderText(components: any[]): string {
  if (!Array.isArray(components)) return "";
  const headerComponent = components.find((c: any) => String(c.type).toUpperCase() === "HEADER");
  return headerComponent?.text || "";
}

function extractHeaderType(components: any[]): string {
  if (!Array.isArray(components)) return "TEXT";
  const headerComponent = components.find((c: any) => String(c.type).toUpperCase() === "HEADER");
  return headerComponent?.format || "TEXT";
}

function extractFooterText(components: any[]): string {
  if (!Array.isArray(components)) return "";
  const footerComponent = components.find((c: any) => String(c.type).toUpperCase() === "FOOTER");
  return footerComponent?.text || "";
}

function extractButtons(components: any[]): any[] {
  if (!Array.isArray(components)) return [];
  const buttonsComponent = components.find((c: any) => String(c.type).toUpperCase() === "BUTTONS");
  return buttonsComponent?.buttons || [];
}

function mapMetaErrorResponse(errData: any): string {
  const errorMsg = errData?.message || "";
  const code = errData?.code;
  const subcode = errData?.error_subcode;

  if (code === 131005) {
    return "Acesso Negado (Erro #131005): O token ou canal não possui permissão para enviar mensagens. Caso esteja usando uma conta de teste (Sandbox/Desenvolvedor/Temporária), você DEVE adicionar o seu telefone de teste no painel da Meta Developers como número de destinatário autorizado antes de enviar o template, ou garantir que o token permanente possua a permissão 'whatsapp_business_messaging'.";
  }
  if (errorMsg.includes("Unsupported post request") || errorMsg.includes("Object with ID") || subcode === 33) {
    return "Unsupported post request. Object with ID does not exist, cannot be loaded due to missing permissions, or does not support this operation. Por favor, confira se o ID informado é realmente o Phone Number ID e se o token tem permissões totais no WhatsApp.";
  }
  if (code === 190 && subcode === 463) {
    return "Sessão Expirada (Erro #190, Subcode #463): O seu token de acesso da Meta expirou. Isso geralmente ocorre ao usar um Token de Acesso Temporário (válido por apenas 24h). Você DEVE criar um Token de Acesso Permanente (Permanent System User Token) com validade ilimitada no painel da Meta Developers e Meta Business Suite.";
  }
  if (code === 190 || errorMsg.includes("expired") || errorMsg.includes("Session has expired") || errorMsg.includes("validating access token")) {
    return "Sessão Expirada ou Token Inválido (Erro #190): O token de acesso da Meta expirou ou é de sessão curta. Por favor, gere um Token de Acesso Permanente de Usuário do Sistema com validade ilimitada nas configurações do seu Business Manager da Meta.";
  }
  if (errData?.type === "OAuthException") {
    return "Erro de Autenticação (OAuthException): Token inválido, expirado ou com escopos insuficientes. Gere um token permanente com permissões completas (whatsapp_business_management, whatsapp_business_messaging) e sem data de expiração.";
  }
  if (code === 10 || code === 200) {
    return "Permissão insuficiente. Por favor, conceda acesso total da Conta do WhatsApp ao Usuário do Sistema da Meta.";
  }
  if (code === 100) {
    return "Parâmetro inválido. Verifique se o WABA ID, Phone Number ID e a versão da API estão corretos.";
  }
  return errorMsg || "Erro desconhecido retornado da API da Meta.";
}

async function loadTemplatesDBOrFile() {
  let fileTemplates: any[] = [];
  try {
    const jsonPath = path.join(process.cwd(), "backend_message_templates.json");
    if (fs.existsSync(jsonPath)) {
      fileTemplates = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }
  } catch (err) {
    // ignore
  }

  try {
    if (globalSupabaseAdmin) {
      const { data, error } = await globalSupabaseAdmin
        .from("whatsapp_message_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        return data;
      }
    }
  } catch (err) {
    // fallback
  }

  return fileTemplates;
}

async function saveTemplateToDBOrFile(template: any) {
  let saved = false;
  try {
    if (globalSupabaseAdmin) {
      const { error } = await globalSupabaseAdmin
        .from("whatsapp_message_templates")
        .upsert(template);
      if (!error) saved = true;
    }
  } catch (err) {
    // ignore
  }

  try {
    const jsonPath = path.join(process.cwd(), "backend_message_templates.json");
    let fileTemplates: any[] = [];
    if (fs.existsSync(jsonPath)) {
      fileTemplates = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }

    const idx = fileTemplates.findIndex((t: any) => t.name === template.name && t.language === template.language);
    if (idx !== -1) {
      fileTemplates[idx] = { ...fileTemplates[idx], ...template };
    } else {
      fileTemplates.push(template);
    }

    fs.writeFileSync(jsonPath, JSON.stringify(fileTemplates, null, 2), "utf-8");
  } catch (err) {
    console.error("[META] Erro ao sincronizar templates com arquivo:", err);
  }
}

async function loadNotificationsDBOrFile() {
  let fileList: any[] = [];
  try {
    const jsonPath = path.join(process.cwd(), "backend_notifications.json");
    if (fs.existsSync(jsonPath)) {
      fileList = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
    }
  } catch (err) {
    // ignore
  }

  try {
    if (globalSupabaseAdmin) {
      const { data, error } = await globalSupabaseAdmin
        .from("platform_notifications")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        return data;
      }
    }
  } catch (err) {
    // fallback
  }

  return fileList;
}

let broadcastEventGlobal: ((event: string, data: any) => void) | null = null;

async function createPlatformNotification(type: string, title: string, message: string, metadata: any = {}) {
  const id = crypto.randomUUID();
  const notification = {
    id,
    type,
    title,
    message,
    status: "unread",
    metadata,
    created_at: new Date().toISOString()
  };
  
  let saved = false;
  try {
    if (globalSupabaseAdmin) {
      const { error } = await globalSupabaseAdmin.from("platform_notifications").insert(notification);
      if (!error) saved = true;
    }
  } catch (err) {
    // fallback
  }
  
  if (!saved) {
    try {
      const jsonPath = path.join(process.cwd(), "backend_notifications.json");
      let list = [];
      if (fs.existsSync(jsonPath)) {
        list = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      }
      list.push(notification);
      fs.writeFileSync(jsonPath, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      console.error("[META] Erro ao salvar notificação para arquivo:", err);
    }
  }
  
  if (broadcastEventGlobal) {
    broadcastEventGlobal("notification.created", notification);
  }
}

async function checkOfficialChannelWindow(conversationId: string): Promise<boolean> {
  try {
    if (globalSupabaseAdmin) {
      const { data: lastCustMsg } = await globalSupabaseAdmin
        .from("crm_messages")
        .select("created_at")
        .eq("conversation_id", conversationId)
        .eq("sender_type", "customer")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCustMsg) {
        const lastTime = new Date(lastCustMsg.created_at).getTime();
        const diffMs = Date.now() - lastTime;
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours < 24;
      }
    }
  } catch (err) {
    console.error("Erro ao checar janela de atendimento:", err);
  }
  return false;
}

async function resolveMetaChannelConfig() {
  const list = await loadChannelsDBOrFile();
  const activeMeta = list.find((c: any) => c.type === "whatsapp_meta" && c.instance_token) || 
                     list.find((c: any) => c.type === "whatsapp_meta" && c.is_active) || 
                     list.find((c: any) => c.type === "whatsapp_meta");
  return {
    accessToken: activeMeta?.instance_token || process.env.META_ACCESS_TOKEN || "",
    wabaId: activeMeta?.client_token || process.env.META_WABA_ID || "1331425545749731",
    phoneNumberId: activeMeta?.instance_id || process.env.META_PHONE_NUMBER_ID || "1068963322976757",
    graphVersion: process.env.META_GRAPH_VERSION || "v25.0"
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: "10mb" }));

  // CORS Middleware for Handling Cross-Origin requests safely
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    next();
  });

  // Middleware de Log para Diagnóstico
  app.use((req, res, next) => {
    if (req.url.startsWith('/api')) {
      console.log(`[API REQ] ${req.method} ${req.url}`);
    }
    next();
  });

  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const supabase = createClient(supabaseUrl, supabaseKey);
  const supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
  globalSupabaseAdmin = supabaseAdmin;

  // SSE Clients
  let sseClients: any[] = [];

  // Heartbeat interval to keep SSE connections open over Cloud Run/NginX proxies
  setInterval(() => {
    sseClients.forEach(client => {
      try {
        client.res.write(": keep-alive\n\n");
      } catch (err) {
        // Client connection already closed or failed
      }
    });
  }, 15000);

  function broadcastEvent(event: string, data: any) {
    const payload = JSON.stringify({ event, data });
    sseClients.forEach(client => {
      try {
        client.res.write(`data: ${payload}\n\n`);
      } catch (err) {
        // Safe catch if client dropped but socket wasn't cleaned yet
      }
    });
  }
  broadcastEventGlobal = broadcastEvent;

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
    const phones = getEquivalentBrazilPhones(phone);
    let { data: customers, error: fetchErr } = await supabaseAdmin.from(TABLES.customers).select('*').in('phone_normalized', phones);
    if (fetchErr) throw fetchErr;

    let customer = customers && customers.length > 0 ? customers[0] : null;

    if (!customer) {
      const preferredPhone = phones.find(p => p.length === 13) || phone;
      const { data: newCust, error: custErr } = await supabaseAdmin.from(TABLES.customers).insert({
        name: name || 'Cliente',
        phone: preferredPhone,
        phone_normalized: preferredPhone,
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
    const channelId = options.channelId || null;
    let basePhone = phone;
    if (phone && phone.includes("-")) {
      basePhone = phone.split("-")[0];
    }
    const phones = getEquivalentBrazilPhones(basePhone);
    const dbPhoneKeys = channelId ? phones.map(p => `${p}-${channelId}`) : phones;

    let query = supabaseAdmin.from(TABLES.conversations).select('*').in('customer_phone_normalized', dbPhoneKeys);
    
    let { data: conversations, error: convFetchErr } = await query;
    if (convFetchErr) throw convFetchErr;

    // Favor active conversations (NEW or OPEN) on this channel
    let conversation = null;
    if (conversations && conversations.length > 0) {
      conversation = conversations.find(c => ["NEW", "OPEN"].includes(String(c.status || "").toUpperCase()));
      if (!conversation) {
        conversation = conversations[0];
      }
    }

    const unreadCount = options.unread_count !== undefined ? options.unread_count : 1;

    if (!conversation) {
      const preferredPhone = phones.find(p => p.length === 13) || basePhone;
      const finalPhoneKey = channelId ? `${preferredPhone}-${channelId}` : preferredPhone;
      const { data: newConv, error: convErr } = await supabaseAdmin.from(TABLES.conversations).insert({
        customer_id: customer.id,
        customer_phone_normalized: finalPhoneKey,
        status: options.status || 'NEW',
        assigned_user_id: null,
        assigned_user_name: null,
        unread_count: unreadCount,
        last_message: options.last_message || 'Mensagem recebida',
        last_message_at: new Date().toISOString(),
        source: 'WhatsApp Z-API',
        origin: options.origin || 'direct',
        team_id: DEFAULT_TEAM.id,
        team_name: DEFAULT_TEAM.name,
        queue_id: DEFAULT_TEAM.id,
        queue_name: DEFAULT_TEAM.name,
        channel_id: channelId,
        whatsapp_account_id: channelId
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
        let targetStatus = options.status || 'NEW';
        if (conversation.assigned_user_id) {
          targetStatus = 'OPEN';
        }

        const { data: updatedConv, error: updateErr } = await supabaseAdmin.from(TABLES.conversations).update({
          status: targetStatus,
          closed_at: null,
          origin: options.origin || conversation.origin || 'direct',
          team_id: conversation.team_id || DEFAULT_TEAM.id,
          team_name: conversation.team_name || DEFAULT_TEAM.name,
          queue_id: conversation.queue_id || DEFAULT_TEAM.id,
          queue_name: conversation.queue_name || DEFAULT_TEAM.name,
          channel_id: channelId || conversation.channel_id,
          whatsapp_account_id: channelId || conversation.whatsapp_account_id,
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

    const isOutgoing = normalized.raw?.fromMe === true;

    // Verificar duplicidade
    const { data: existingMsg } = await supabaseAdmin.from(TABLES.messages).select('*').eq('external_message_id', normalized.messageId).maybeSingle();
    if (existingMsg) {
      if (existingMsg.status !== 'sent' && isOutgoing) {
        await supabaseAdmin.from(TABLES.messages).update({ status: 'sent' }).eq('id', existingMsg.id);
        existingMsg.status = 'sent';
      }
      return existingMsg;
    }

    const { data: message, error } = await supabaseAdmin.from(TABLES.messages).insert({
      conversation_id: conversation.id,
      customer_phone_normalized: normalized.phone,
      external_message_id: normalized.messageId,
      sender_type: isOutgoing ? 'agent_external' : 'customer',
      sender_name: isOutgoing ? 'WhatsApp Business' : (normalized.name || customer.name || 'Cliente'),
      from_phone: isOutgoing ? (normalized.raw?.connectedPhone || "") : normalized.phone,
      to_phone: isOutgoing ? normalized.phone : (normalized.raw?.connectedPhone || ""),
      message_type: normalized.messageType,
      content: normalized.content,
      caption: normalized.caption,
      media_url: normalized.mediaUrl,
      media_storage_url: storageUrl,
      storage_path: storagePath,
      media_mime_type: normalized.mimeType,
      media_file_name: normalized.fileName,
      status: isOutgoing ? 'sent' : 'received',
      raw_payload: normalized.raw,
      ignored: false,
      origin: isOutgoing ? 'WHATSAPP_CELULAR' : 'direct',
      is_internal: false,
      created_at: normalized.raw?.timestamp ? new Date(normalized.raw.timestamp * 1000).toISOString() : new Date().toISOString()
    }).select().single();

    if (error) throw error;
    return message;
  }

  async function updateConversationAfterIncomingDirectMessage(conversation: any, normalized: any, message: any) {
    const isOutgoing = normalized.raw?.fromMe === true;
    const now = new Date().toISOString();

    const updates: any = {
      last_message: normalized.content,
      last_message_at: message.created_at || now,
      updated_at: now
    };

    if (!isOutgoing) {
      updates.unread_count = (conversation.unread_count || 0) + 1;
      const currentStatus = String(conversation.status || "").toUpperCase();
      if (!conversation.assigned_user_id || ["RESOLVED", "CLOSED", "CONCLUIDO", "CONCLUÍDO"].includes(currentStatus)) {
        updates.status = "NEW";
      }
    } else {
      const currentStatus = String(conversation.status || "").toUpperCase();
      if (["RESOLVED", "CLOSED", "CONCLUIDO", "CONCLUÍDO"].includes(currentStatus)) {
        if (conversation.assigned_user_id) {
          updates.status = "OPEN";
        } else {
          updates.status = "NEW";
        }
      }
    }

    await supabaseAdmin.from(TABLES.conversations).update(updates).eq('id', conversation.id);
  }

  async function processIncomingDirectZapiMessage(payload: any, logId: string | null, diagnosis: any) {
    if (!diagnosis?.allowed || !diagnosis?.phoneNormalized) {
      throw new Error("Tentativa de processar payload não individual como mensagem direta.");
    }

    const phone = diagnosis.phoneNormalized;
    const normalized = normalizeIncomingDirectMessage(payload, phone);
    const isOutgoing = payload?.fromMe === true;

    // Resolve channel_id belonging to this Z-API instanceId
    let channelId = null;
    const instanceIdFromPayload = payload?.instanceId;
    if (instanceIdFromPayload) {
      const { data: matchedChannel } = await supabaseAdmin
        .from("crm_channels")
        .select("id")
        .eq("instance_id", instanceIdFromPayload)
        .maybeSingle();
      if (matchedChannel) {
        channelId = matchedChannel.id;
      }
    }

    const customer = await findOrCreateCustomerByPhone(phone, normalized.name);
    const conversation = await findOrCreateConversationByPhone(phone, customer, {
      forceDirect: true,
      status: "NEW",
      origin: isOutgoing ? "WHATSAPP_CELULAR" : "WHATSAPP_RECEBIDO",
      unread_count: isOutgoing ? 0 : 1,
      channelId: channelId
    });

    const zapiReferral = payload?.referral || payload?.message?.referral || payload?.text?.referral;
    if (zapiReferral && !isOutgoing) {
      await applyPaidTrafficReferral(conversation.id, zapiReferral);
    } else if (!isOutgoing && normalized.content) {
      const extractedUtm = extractUtmsFromText(normalized.content);
      if (extractedUtm && extractedUtm.utm_source) {
        console.log("[ZAPI UTM EXTRACTION SUCCESS] Extracted UTMs from plain message text:", extractedUtm);
        await applyPaidTrafficReferral(conversation.id, {
          source_type: "text_utm",
          source_id: extractedUtm.utm_campaign || "utm_campaign",
          source_url: `https://facebook.com/?utm_source=${extractedUtm.utm_source}&utm_medium=${extractedUtm.utm_medium}&utm_campaign=${extractedUtm.utm_campaign}&utm_content=${extractedUtm.utm_content}&utm_term=${extractedUtm.utm_term}`,
          headline: extractedUtm.utm_term || "UTM Z-API Message Link",
          body: normalized.content
        });
      }
    }

    const message = await createIncomingDirectMessage(conversation, customer, normalized);
    await updateConversationAfterIncomingDirectMessage(conversation, normalized, message);

    if (logId) {
      await supabaseAdmin.from("zapi_webhook_logs").update({
        processed: true,
        ignored: false,
        origin: isOutgoing ? "WHATSAPP_CELULAR" : "direct",
        raw_phone: payload?.phone || null,
        phone_normalized: phone,
        customer_id: customer.id,
        conversation_id: conversation.id,
        message_db_id: message.id,
        direction: isOutgoing ? "outgoing" : "incoming",
        from_me: isOutgoing,
        customer_phone_normalized: phone,
        message_id: message.id,
        error: null,
        diagnostic: diagnosis
      }).eq("id", logId);
    }

    broadcastEvent("message.received", { customer, conversation, message, direction: isOutgoing ? "outgoing" : "incoming" });

    return {
      phone_normalized: phone,
      customer_id: customer.id,
      conversation_id: conversation.id,
      message_db_id: message.id
    };
  }

  async function sendMetaMessage(channel: any, phone: string, text: string) {
    const phoneNumberId = channel.instance_id;
    const accessToken = channel.instance_token;
    
    if (!phoneNumberId || !accessToken) {
      throw new Error("Canal Meta não configurado corretamente. Verifique as credenciais.");
    }

    const cleanPhone = phone.replace(/\D/g, "");
    const version = channel.meta_graph_version || process.env.META_GRAPH_VERSION || "v25.0";
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: {
          preview_url: false,
          body: text
        }
      })
    });

    const responseBody: any = await response.json();

    if (!response.ok) {
      console.error("[Meta Cloud API send-message error]", responseBody);
      const rawError = responseBody?.error?.message || "";
      let detailedError = rawError || "Erro desconhecido ao enviar mensagem pela Meta Cloud API.";
      
      if (rawError.includes("Unsupported post request") || rawError.includes("does not exist") || rawError.includes("missing permissions")) {
        detailedError = `Erro de Permissão Meta Cloud (ID Inválido ou Sem Atribuição): "${rawError}". \n\n🔒 Como resolver esse erro de credenciais no seu Facebook Business:\n1. O "Phone Number ID" (ID do Telefone) inserido (${phoneNumberId}) pode estar incorreto: certifique-se de usar o ID do Telefone e não o ID da Conta de WhatsApp Business ou ID do App.\n2. O Usuário do Sistema da Meta que gerou o Token precisa ter permissão de acesso ao ativo do telefone. Acesse o Gerenciador de Negócios (Business Settings) -> Usuários do Sistema (System Users) -> selecione o usuário correspondente -> clique em "Atribuir Ativos" (Assign Assets) -> escolha "Contas do WhatsApp" -> selecione sua conta e marque controle total. Salve e gere um novo token se necessário!`;
      } else if (rawError.includes("token") || rawError.includes("Authorization") || response.status === 401) {
        detailedError = `Token de Acesso Inválido ou Expirado: "${rawError}". \n\n🔑 Como resolver:\nVerifique se o Token permanente inserido nas configurações do canal está completo e correto, e se os escopos "whatsapp_business_messaging" e "whatsapp_business_management" foram marcados ao gerá-lo.`;
      }
      throw new Error(detailedError);
    }

    return responseBody;
  }

  function parseUtmParams(urlStr: string) {
    const result = {
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_content: "",
      utm_term: ""
    };
    if (!urlStr) return result;
    try {
      let safeUrl = urlStr;
      if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
        safeUrl = "https://facebook.com" + (urlStr.startsWith("/") ? "" : "/") + urlStr;
      }
      const parsed = new URL(safeUrl);
      result.utm_source = parsed.searchParams.get("utm_source") || "";
      result.utm_medium = parsed.searchParams.get("utm_medium") || "";
      result.utm_campaign = parsed.searchParams.get("utm_campaign") || "";
      result.utm_content = parsed.searchParams.get("utm_content") || "";
      result.utm_term = parsed.searchParams.get("utm_term") || "";
    } catch (err) {
      console.warn("[UTM PARSER WARNING] Failed to parse URL:", urlStr);
    }
    return result;
  }

  function extractUtmsFromText(text: string) {
    const result = {
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_content: "",
      utm_term: ""
    };
    if (!text) return null;

    // 1. Detect if there is a URL inside the text
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urls = text.match(urlRegex);
    if (urls && urls.length > 0) {
      const parsedUtms = parseUtmParams(urls[0]);
      if (parsedUtms.utm_source) {
        return parsedUtms;
      }
    }

    // 2. Direct key=value scanning from plain text body (e.g. pre-filled Click-to-WhatsApp text)
    const keywords = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
    let foundAny = false;
    keywords.forEach(kw => {
      const regex = new RegExp(`${kw}\\s*[=:]\\s*([^&\\s\\n?]+)`, 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        let val = match[1].trim();
        val = val.replace(/^[,"'.({\s]+|[,"'.)}\s]+$/g, '');
        (result as any)[kw] = val;
        foundAny = true;
      }
    });

    if (!foundAny) return null;
    return result;
  }

  async function applyPaidTrafficReferral(conversationId: string, referral: any) {
    if (!conversationId || !referral) return null;
    try {
      const sourceUrl = referral.source_url || referral.sourceUrl || "";
      const utms = parseUtmParams(sourceUrl);
      
      const trafficData = {
        traffic_source: utms.utm_source || referral.source_type || referral.sourceType || "Meta Ads",
        traffic_campaign: utms.utm_campaign || referral.source_id || referral.sourceId || "Campanha Meta Ads",
        traffic_headline: referral.headline || utms.utm_term || "Click-to-WhatsApp",
        traffic_medium: utms.utm_medium || "cpc",
        traffic_content: referral.body || utms.utm_content || "Anúncio",
        traffic_access_url: sourceUrl || null
      };

      console.log(`[TRAFFIC META DETECTED] Para conversação ID: ${conversationId}:`, trafficData);

      // 1. Update the conversation fields
      const { error: updateErr } = await supabaseAdmin
        .from("crm_conversations")
        .update({
          traffic_source: trafficData.traffic_source,
          traffic_campaign: trafficData.traffic_campaign,
          traffic_headline: trafficData.traffic_headline,
          traffic_medium: trafficData.traffic_medium,
          traffic_content: trafficData.traffic_content,
          traffic_access_url: trafficData.traffic_access_url
        })
        .eq("id", conversationId);

      if (updateErr) {
        console.error("[TRAFFIC CRM UPDATE DB ERROR]:", updateErr);
      }

      // 2. Resolve/Create "TRÁFEGO-PAGO" tag
      let tagId = null;
      try {
        const { data: existingTag } = await supabaseAdmin
          .from("crm_tags")
          .select("id")
          .eq("name", "TRÁFEGO-PAGO")
          .maybeSingle();

        if (existingTag) {
          tagId = existingTag.id;
        } else {
          const { data: newTag } = await supabaseAdmin
            .from("crm_tags")
            .insert({
              name: "TRÁFEGO-PAGO",
              color: "#E11D48", // Rose Red
              description: "Leads oriundos de tráfego pago (Meta Ads)"
            })
            .select("id")
            .single();
          if (newTag) tagId = newTag.id;
        }
      } catch (tagErr) {
        console.error("[TRAFFIC TAG RESOLVE ERROR]:", tagErr);
      }

      // 3. Link tag to conversation if got tagId
      if (tagId) {
        const { error: linkErr } = await supabaseAdmin
          .from("crm_conversation_tags")
          .upsert({
            conversation_id: conversationId,
            tag_id: tagId,
            created_by: "system",
            created_by_name: "Meta Ads Integration"
          }, { onConflict: "conversation_id,tag_id" });

        if (linkErr) {
          console.error("[TRAFFIC TAG LINKING DB ERROR]:", linkErr);
        } else {
          console.log(`[TRAFFIC TAG LINK SUCCESS] Tag 'TRÁFEGO-PAGO' associada à conversa ${conversationId}.`);
          broadcastEvent("conversation.updated", { id: conversationId });
        }
      }
      
      return trafficData;
    } catch (err) {
      console.error("[APPLY PAID TRAFFIC EXCEPTION]:", err);
      return null;
    }
  }

  async function processIncomingMetaMessage(phone: string, customerName: string, messageText: string, externalMsgId: string, channelId: string | null, referral?: any) {
    const cleanPhone = normalizeBrazilPhone(phone);
    const customer = await findOrCreateCustomerByPhone(cleanPhone, customerName || "Cliente WhatsApp");
    
    const conversation = await findOrCreateConversationByPhone(cleanPhone, customer, {
      forceDirect: true,
      status: "NEW",
      origin: "WHATSAPP_RECEBIDO",
      unread_count: 1,
      channelId: channelId
    });

    if (channelId && conversation.channel_id !== channelId) {
      await supabaseAdmin
        .from("crm_conversations")
        .update({ channel_id: channelId })
        .eq("id", conversation.id);
      conversation.channel_id = channelId;
    }

    if (referral) {
      await applyPaidTrafficReferral(conversation.id, referral);
    } else if (messageText) {
      const extractedUtm = extractUtmsFromText(messageText);
      if (extractedUtm && extractedUtm.utm_source) {
        console.log("[UTM EXTRACTION METADATA SUCCESS] Extracted UTMs from plain message text:", extractedUtm);
        await applyPaidTrafficReferral(conversation.id, {
          source_type: "text_utm",
          source_id: extractedUtm.utm_campaign || "utm_campaign",
          source_url: `https://facebook.com/?utm_source=${extractedUtm.utm_source}&utm_medium=${extractedUtm.utm_medium}&utm_campaign=${extractedUtm.utm_campaign}&utm_content=${extractedUtm.utm_content}&utm_term=${extractedUtm.utm_term}`,
          headline: extractedUtm.utm_term || "UTM Message Text Link",
          body: messageText
        });
      }
    }

    const { data: message, error: messageError } = await supabaseAdmin
      .from("crm_messages")
      .insert({
        conversation_id: conversation.id,
        customer_phone_normalized: cleanPhone,
        external_message_id: externalMsgId,
        sender_type: "customer",
        sender_name: customer.name,
        from_phone: cleanPhone,
        to_phone: "",
        message_type: "text",
        content: messageText,
        status: "received",
        is_internal: false,
        created_at: new Date().toISOString()
      })
      .select("*")
      .single();

    if (messageError) throw messageError;

    const now = new Date().toISOString();
    const { data: updatedConv } = await supabaseAdmin
      .from("crm_conversations")
      .update({
        last_message: messageText,
        last_message_at: now,
        unread_count: (conversation.unread_count || 0) + 1,
        status: conversation.status === "RESOLVED" ? "NEW" : (conversation.status || "NEW"),
        updated_at: now
      })
      .eq("id", conversation.id)
      .select("*")
      .single();

    const { data: finalConv } = await supabaseAdmin
      .from("crm_conversations")
      .select("*")
      .eq("id", conversation.id)
      .single();

    broadcastEvent("message.received", { 
      customer, 
      conversation: finalConv || updatedConv || conversation, 
      message: {
        ...message,
        normalized_message_type: 'text',
        display_content: message.content
      }, 
      direction: "incoming" 
    });

    return { customer, conversation: finalConv || updatedConv || conversation, message };
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

  function mapCampaignDbToApi(campaign: any) {
    if (!campaign) return null;
    return {
      ...campaign,
      content: campaign.message_text || campaign.content,
      recipients_count: campaign.total_recipients ?? campaign.recipients_count ?? 0,
      pending_count: campaign.total_pending ?? campaign.pending_count ?? 0,
      sending_count: campaign.total_sending ?? campaign.sending_count ?? 0,
      sent_count: campaign.total_sent ?? campaign.sent_count ?? 0,
      failed_count: campaign.total_failed ?? campaign.failed_count ?? 0,
      skipped_count: campaign.total_skipped ?? campaign.skipped_count ?? 0,
      min_interval: campaign.delay_seconds ?? campaign.min_interval ?? 8,
      max_interval: campaign.delay_seconds ?? campaign.max_interval ?? 8,
    };
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

    const dbCounts = {
      total_recipients: counts.recipients_count,
      total_pending: counts.pending_count,
      total_sending: counts.sending_count,
      total_sent: counts.sent_count,
      total_failed: counts.failed_count,
      total_skipped: counts.skipped_count,
    };

    await supabaseAdmin
      .from(TABLES.campaigns)
      .update({
        ...dbCounts,
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

      let whatsAppAccountId: string | null = null;
      let templateConfig: any = null;
      if (campaign.description) {
        if (campaign.description.includes("WhatsApp Account ID: ")) {
          const parts = campaign.description.split(" | ");
          const idPart = parts.find((p: string) => p.startsWith("WhatsApp Account ID: "));
          if (idPart) {
            whatsAppAccountId = idPart.replace("WhatsApp Account ID: ", "").trim();
          }
          const configPart = parts.find((p: string) => p.startsWith("Config: "));
          if (configPart) {
            try {
              templateConfig = JSON.parse(configPart.replace("Config: ", "").trim());
            } catch (e) {}
          }
        }
      }

      let conversationChannel: any = null;
      if (whatsAppAccountId) {
        const { data: matchedChannel } = await supabaseAdmin
          .from("crm_channels")
          .select("*")
          .eq("id", whatsAppAccountId)
          .maybeSingle();
        conversationChannel = matchedChannel;
      }

      if (!conversationChannel) {
        conversationChannel = await getActiveWhatsappChannel();
      }

      const isMetaChannel = conversationChannel?.type === "whatsapp_meta";

      if (!isMetaChannel) {
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
      } else {
        const phoneNumberId = conversationChannel.instance_id;
        const accessToken = conversationChannel.instance_token;
        if (!phoneNumberId || !accessToken) {
          await supabaseAdmin
            .from(TABLES.campaigns)
            .update({
              last_error: "Canal Meta não configurado corretamente. Faltando token ou ID do telefone.",
              updated_at: new Date().toISOString()
            })
            .eq("id", campaignId);

          throw new Error("Canal Meta não configurado corretamente.");
        }
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

          if (!isMetaChannel && !renderedMessage.trim()) {
            throw new Error("Mensagem da campanha vazia.");
          }

          let zapiResponse: any;
          const phone = recipient.phone_normalized;

          if (isMetaChannel) {
            const version = conversationChannel.meta_graph_version || process.env.META_GRAPH_VERSION || "v25.0";
            const metaUrl = `https://graph.facebook.com/${version}/${conversationChannel.instance_id}/messages`;
            
            // Build dynamic body variables based on template or render Campaign Message
            const bodyParams: any[] = [];
            
            // Try to match template structure count to send perfect indexed parameters
            let templateObj: any = null;
            if (templateConfig?.template_name) {
              const templates = await loadTemplatesDBOrFile();
              templateObj = templates.find((t: any) => t.name === templateConfig.template_name || t.id === templateConfig.template_id);
            }
            
            const bodyComp = templateObj?.components?.find((c: any) => c.type === 'BODY');
            const variableCount = (bodyComp?.text?.match(/\{\{\d+\}\}/g) || []).length;
            
            if (variableCount > 0) {
              for (let i = 1; i <= variableCount; i++) {
                let paramValue = "Viva Destinos";
                if (i === 1) {
                  paramValue = recipient.name || "Cliente";
                } else if (i === 2) {
                  paramValue = campaign.created_by_name || "Agente";
                }
                bodyParams.push({
                  type: "text",
                  text: paramValue
                });
              }
            }
            
            const componentsPayload: any[] = [];
            if (bodyParams.length > 0) {
              componentsPayload.push({
                type: "body",
                parameters: bodyParams
              });
            }
            
            // If it's a media template, determine media header parameters
            const mediaUrl = templateConfig?.media_url || campaign.media_url;
            if (mediaUrl) {
              const mediaType = campaign.message_type || "image";
              const headerParams: any[] = [];
              if (mediaType === "image") {
                headerParams.push({
                  type: "image",
                  image: {
                    link: mediaUrl
                  }
                });
              } else if (mediaType === "video") {
                headerParams.push({
                  type: "video",
                  video: {
                    link: mediaUrl
                  }
                });
              } else if (mediaType === "document") {
                headerParams.push({
                  type: "document",
                  document: {
                    link: mediaUrl,
                    filename: campaign.media_file_name || "documento.pdf"
                  }
                });
              }
              
              if (headerParams.length > 0) {
                componentsPayload.push({
                  type: "header",
                  parameters: headerParams
                });
              }
            }
            
            const reqBody = {
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to: phone,
              type: "template",
              template: {
                name: templateConfig?.template_name || campaign.content || "vendas_promo",
                language: {
                  code: templateConfig?.template_language || "pt_BR"
                },
                components: componentsPayload.length > 0 ? componentsPayload : undefined
              }
            };
            
            const reqResponse = await fetch(metaUrl, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${conversationChannel.instance_token}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify(reqBody)
            });
            
            const resData: any = await reqResponse.json();
            if (!reqResponse.ok) {
              const friendlyError = mapMetaErrorResponse(resData?.error);
              throw new Error(`Erro na API da Meta: ${friendlyError}`);
            }
            
            zapiResponse = { messageId: resData?.messages?.[0]?.id || `meta-${Date.now()}`, success: true };
          } else {
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
          }

          // Register sent message in CRM live chat conversations history
          try {
            const finalChatContent = renderedMessage || `Modelo Oficial Meta: ${templateConfig?.template_name || campaign.content}`;
            const customer = await findOrCreateCustomerByPhone(phone, recipient.name || "Cliente");
            const conversation = await findOrCreateConversationByPhone(phone, customer, {
              channelId: whatsAppAccountId,
              last_message: finalChatContent,
              status: "OPEN"
            });
            
            await supabaseAdmin.from(TABLES.messages).insert({
              conversation_id: conversation.id,
              customer_phone_normalized: phone,
              sender_type: "agent",
              sender_name: campaign.created_by_name || "Campanha",
              message_type: campaign.message_type || "text",
              content: finalChatContent,
              media_url: campaign.media_url || null,
              status: "sent",
              is_internal: false,
              created_at: new Date().toISOString()
            });

            await supabaseAdmin.from(TABLES.conversations).update({
              last_message: finalChatContent,
              last_message_at: new Date().toISOString(),
              unread_count: 0
            }).eq("id", conversation.id);
          } catch (chatHistoryErr) {
            console.error("[CAMPAIGN HIST] Failed to log campaign message in chat history:", chatHistoryErr);
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

          const minDelay = Number(campaign.min_interval || campaign.delay_seconds || 5);
          const maxDelay = Math.max(minDelay, Number(campaign.max_interval || campaign.delay_seconds || 10));
          const delaySeconds = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          console.log(`[CAMPAIGN] Sleeping for humanized ${delaySeconds}s (range: ${minDelay}s-${maxDelay}s) after sending message to ${recipient.phone_normalized}`);
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

  app.get("/api/debug/audio/logs", async (req, res) => {
    try {
      const { data: logs, error } = await supabaseAdmin
        .from("audio_debug_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        count: logs?.length || 0,
        logs
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/debug/audio/logs/:id", async (req, res) => {
    try {
      const { data: log, error } = await supabaseAdmin
        .from("audio_debug_logs")
        .select("*")
        .eq("id", req.params.id)
        .single();

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        log
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

  // Processador único de Webhooks Z-API
  async function processZapiMessageWebhook(req: any, res: any, webhookKind: string) {
    const payload = req.body || {};
    let logId: string | null = null;
    const direction = getZapiMessageDirection(payload);
    const fromMe = payload?.fromMe === true;
    const customerPhoneNormalized = getCustomerPhoneFromZapiPayload(payload);

    try {
      // 1. Criar log bruto (processed = false)
      const { data: logData, error: logError } = await supabaseAdmin
        .from("zapi_webhook_logs")
        .insert({
          event_type: webhookKind,
          payload,
          raw_phone: payload?.phone || null,
          phone_normalized: customerPhoneNormalized || null,
          processed: false,
          ignored: false,
          origin: null,
          error: null,
          direction,
          from_me: fromMe,
          customer_phone_normalized: customerPhoneNormalized || null,
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
              phone_normalized: customerPhoneNormalized || null,
              customer_phone_normalized: customerPhoneNormalized || null,
              customer_id: null,
              conversation_id: null,
              message_db_id: null,
              error: (diagnosis as any).suggestedReason || diagnosis.reason || "Payload bloqueado: não é conversa individual.",
              ignored_reason: (diagnosis as any).suggestedReason || diagnosis.reason || "Payload bloqueado: não é conversa individual.",
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
            error: errorMsg,
            ignored_reason: errorMsg
          })
          .eq("id", logId);
      }

      return res.status(200).json({
        success: false,
        error: errorMsg
      });
    }
  }

  // Recebimento Real (POST) - Chamado pela Z-API
  app.post("/api/webhooks/zapi/received", async (req, res) => {
    return processZapiMessageWebhook(req, res, "received");
  });

  // Envio Real (POST) - Chamado pela Z-API
  app.post("/api/webhooks/zapi/sent", async (req, res) => {
    return processZapiMessageWebhook(req, res, "sent");
  });

  // Helper for webhooks verification (GET)
  const handleMetaWebhookVerification = async (req: any, res: any) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    // 1. FAST PATH Check (No database block or delays)
    const envVerifyToken = process.env.META_VERIFY_TOKEN || "viva_destinos_webhook_2026";
    const isTokenValidFast = (
      token === envVerifyToken ||
      token === "viva_destinos_webhook_2026" ||
      token === "viva_meta_verify_token_2026"
    );

    if (mode === "subscribe" && isTokenValidFast) {
      console.log(`[META SUCCESS] Fast-path webhook verificado com sucesso usando token: ${token}`);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(challenge);
    }

    // 2. BACKUP DATABASE FALLBACK Check
    let configuredToken = envVerifyToken;
    try {
      const activeChannels = await loadChannelsDBOrFile();
      const activeMetaChannel = activeChannels.find((c: any) => c.type === "whatsapp_meta" && c.is_active);
      if (activeMetaChannel && activeMetaChannel.meta_verify_token) {
        configuredToken = activeMetaChannel.meta_verify_token;
      }
    } catch (err) {
      console.error("[META] Erro ao carregar token de verificação dinamicamente:", err);
    }

    if (mode === "subscribe" && token === configuredToken) {
      console.log(`[META SUCCESS] Webhook verificado com sucesso usando token dinâmico: ${token}`);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(challenge);
    }

    console.warn(`[META FORBIDDEN] Tentativa de verificação com token incorreto ou sem hub.mode adequado. Esperado: "${configuredToken}", Recebido: "${token}"`);
    return res.status(403).send("Forbidden");
  };

  // Helper for webhooks ingestion (POST)
  const handleMetaWebhookIngestion = async (req: any, res: any) => {
    try {
      const body = req.body || {};
      
      console.log("Webhook Meta recebido:", JSON.stringify(body));

      // Save raw payload to the secure internal database log
      try {
        await supabaseAdmin.from("crm_webhook_logs").insert({
          payload: body,
          created_at: new Date().toISOString()
        });
      } catch (logErr) {
        console.error("[META] Erro ao gravar payload bruto em crm_webhook_logs:", logErr);
      }

      // Check if it is a request on the specific /api/meta/webhook and if so we can flag to return exact response
      const isMetaSpecificRoute = req.originalUrl?.includes("/api/meta/webhook");

      if (body.object !== "whatsapp_business_account") {
        if (isMetaSpecificRoute) {
          res.setHeader("Content-Type", "text/plain");
          return res.status(200).send("EVENT_RECEIVED");
        }
        return res.status(200).json({ success: true, warning: "Not a WhatsApp account object" });
      }

      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      // Meta Template status updates check via Webhook
      if (value?.event && value?.message_template_id) {
        const event = value.event; // APPROVED, REJECTED, PAUSED
        const templateId = String(value.message_template_id);
        const templateName = value.message_template_name;
        const language = value.message_template_language || "pt_BR";
        const rejection_reason = value.rejection_reason || null;

        console.log(`[META WEBHOOK TEMPLATE STATUS] Model: ${templateName}, Event: ${event}`);

        const templates = await loadTemplatesDBOrFile();
        const localTemplate = templates.find((t: any) => t.meta_template_id === templateId || t.name === templateName);

        if (localTemplate) {
          const updatedRecord = {
            ...localTemplate,
            status: event,
            rejection_reason: rejection_reason || localTemplate.rejection_reason,
            last_webhook_payload: body,
            updated_at: new Date().toISOString()
          };

          if (event === "APPROVED") {
            updatedRecord.approved_at = new Date().toISOString();
          } else if (event === "REJECTED") {
            updatedRecord.rejected_at = new Date().toISOString();
          } else if (event === "PAUSED") {
            updatedRecord.paused_at = new Date().toISOString();
          }

          await saveTemplateToDBOrFile(updatedRecord);

          let notifTitle = "Modelo aprovado pela Meta";
          let notifMsg = `O modelo '${templateName}' foi aprovado pela Meta e já pode ser utilizado para envio.`;

          if (event === "REJECTED") {
            notifTitle = "Modelo rejeitado pela Meta";
            notifMsg = `O modelo '${templateName}' foi rejeitado pela Meta. Motivo: ${rejection_reason || 'N/A'}`;
          } else if (event === "PAUSED") {
            notifTitle = "Modelo pausado pela Meta";
            notifMsg = `O modelo '${templateName}' foi suspenso/pausado temporariamente pela Meta.`;
          }

          await createPlatformNotification(
            `template_${String(event).toLowerCase()}`,
            notifTitle,
            notifMsg,
            { template_name: templateName, meta_template_id: templateId, event, rejection_reason }
          );
        }

        if (isMetaSpecificRoute) {
          res.setHeader("Content-Type", "text/plain");
          return res.status(200).send("EVENT_RECEIVED");
        }
        return res.status(200).json({ success: true, type: "template_status_update" });
      }

      const metadata = value?.metadata;
      
      const incomingPhoneNumberId = metadata?.phone_number_id;

      // Check if phone number ID matches the configured one
      if (incomingPhoneNumberId) {
        const configuredPhoneId = process.env.META_PHONE_NUMBER_ID;
        const activeChannels = await loadChannelsDBOrFile();
        const activeMetaChannel = activeChannels.find((c: any) => c.type === "whatsapp_meta" && c.is_active);
        const targetPhoneId = configuredPhoneId || activeMetaChannel?.instance_id;

        if (targetPhoneId && String(incomingPhoneNumberId) !== String(targetPhoneId)) {
          console.warn(`[META WARNING] O webhook recebeu evento de um Phone Number ID diferente do configurado. Recebido: ${incomingPhoneNumberId}, Configurado: ${targetPhoneId}. Verifique se o número oficial correto está conectado ao app.`);
        }
      }

      // Check for status updates
      if (value?.statuses?.[0]) {
        const statusObj = value.statuses[0];
        const waMsgId = statusObj.id;
        const statusName = statusObj.status; // delivered, read, sent

        try {
          // Update local webhook table
          await supabaseAdmin
            .from("meta_webhook_messages")
            .update({ status: statusName })
            .eq("wa_message_id", waMsgId);

          // Update general messages
          await supabaseAdmin
            .from("crm_messages")
            .update({ status: statusName === "read" ? "read" : (statusName === "delivered" ? "delivered" : "sent") })
            .eq("external_message_id", waMsgId);
        } catch (dbErr) {
          console.error("[META WEBHOOK STATUS DB ERROR]:", dbErr);
        }

        if (isMetaSpecificRoute) {
          res.setHeader("Content-Type", "text/plain");
          return res.status(200).send("EVENT_RECEIVED");
        }
        return res.status(200).json({ success: true, type: "status_update", messageId: waMsgId, status: statusName });
      }

      const messageObj = value?.messages?.[0];
      const contactObj = value?.contacts?.[0];

      if (!messageObj) {
        if (isMetaSpecificRoute) {
          res.setHeader("Content-Type", "text/plain");
          return res.status(200).send("EVENT_RECEIVED");
        }
        return res.status(200).json({ success: true, ignored: true });
      }

      const senderPhone = messageObj.from;
      let messageText = messageObj.text?.body || "";
      
      if (!messageText && messageObj.type && messageObj.type !== 'text') {
        messageText = `[Mensagem de tipo ${messageObj.type}]`;
      }
      
      const messageId = messageObj.id;
      const customerName = contactObj?.profile?.name || "Cliente WhatsApp";

      if (!senderPhone || !messageText) {
        if (isMetaSpecificRoute) {
          res.setHeader("Content-Type", "text/plain");
          return res.status(200).send("EVENT_RECEIVED");
        }
        return res.status(200).json({ success: true, ignored: true });
      }

      // Save to meta_webhook_messages table
      try {
        await supabaseAdmin
          .from("meta_webhook_messages")
          .insert({
            wa_message_id: messageId,
            "from": senderPhone,
            phone_number_id: incomingPhoneNumberId || null,
            timestamp: messageObj.timestamp || String(Math.floor(Date.now() / 1000)),
            message_type: messageObj.type || "text",
            message_body: messageText,
            raw_payload: body,
            status: "received",
            created_at: new Date().toISOString()
          });
      } catch (dbErr) {
        console.error("[META WEBHOOK TABLE INSERT ERROR]:", dbErr);
      }

      // Find channel id
      let channelId = null;
      if (incomingPhoneNumberId) {
        const { data: matchedChannel } = await supabaseAdmin
          .from("crm_channels")
          .select("id")
          .eq("instance_id", incomingPhoneNumberId)
          .maybeSingle();
        channelId = matchedChannel?.id || null;
      }

      if (!channelId) {
        const { data: matchedChannel } = await supabaseAdmin
          .from("crm_channels")
          .select("id")
          .eq("type", "whatsapp_meta")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        channelId = matchedChannel?.id || null;
      }

      const referral = messageObj?.referral || null;
      const result = await processIncomingMetaMessage(senderPhone, customerName, messageText, messageId, channelId, referral);

      if (isMetaSpecificRoute) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send("EVENT_RECEIVED");
      }
      return res.status(200).json({
        success: true,
        result
      });
    } catch (err: any) {
      console.error("[META WEBHOOK EXCEPTION]", err);
      if (req.originalUrl?.includes("/api/meta/webhook")) {
        res.setHeader("Content-Type", "text/plain");
        return res.status(200).send("EVENT_RECEIVED");
      }
      return res.status(200).json({ success: false, error: err?.message });
    }
  };

  // Map both paths for maximum developer-friendly compliance
  app.get("/api/webhooks/meta", handleMetaWebhookVerification);
  app.get("/api/meta/webhook", handleMetaWebhookVerification);
  app.get("/webhook", handleMetaWebhookVerification);

  app.post("/api/webhooks/meta", handleMetaWebhookIngestion);
  app.post("/api/meta/webhook", handleMetaWebhookIngestion);
  app.post("/webhook", handleMetaWebhookIngestion);

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

  app.get("/api/debug/zapi/sync-sent", async (req, res) => {
    try {
      const appUrl = getPublicAppUrl();
      const now24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: logs, error: logsError } = await supabaseAdmin
        .from("zapi_webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (logsError) throw logsError;

      const fromMeTrueProcessed = logs?.filter(l => l.from_me === true && l.processed === true && l.ignored === false).length || 0;
      const fromMeFalseProcessed = logs?.filter(l => l.from_me === false && l.processed === true && l.ignored === false).length || 0;
      const ignoredGroups = logs?.filter(l => l.ignored === true).length || 0;
      const last24h = logs?.filter(l => l.created_at >= now24).length || 0;

      const lastOutgoingWebhooks = logs?.filter(l => l.from_me === true).slice(0, 10) || [];
      const lastIncomingWebhooks = logs?.filter(l => l.from_me === false && l.ignored === false).slice(0, 10) || [];
      const lastIgnored = logs?.filter(l => l.ignored === true).slice(0, 10) || [];

      return res.status(200).json({
        success: true,
        instruction: "Verifique na Z-API se o campo Ao enviar está configurado e se 'Notificar as enviadas por mim também' está ativo.",
        webhookUrls: {
          received: `${appUrl}/api/webhooks/zapi/received`,
          sent: `${appUrl}/api/webhooks/zapi/sent`
        },
        totals: {
          fromMeTrueProcessed,
          fromMeFalseProcessed,
          ignoredGroups,
          last24h
        },
        lastOutgoingWebhooks,
        lastIncomingWebhooks,
        lastIgnored
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: getErrorMessage(err)
      });
    }
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

      // Group/deduplicate conversations on-the-fly by equivalent Brazil phone + channel
      const uniqueConversationsMap = new Map<string, any>();

      for (const c of mapped) {
        let phoneKey = c.customer_phone_normalized || "";
        const basePhone = phoneKey.includes("-") ? phoneKey.split("-")[0] : phoneKey;
        const channelIdSuffix = c.channel_id || c.whatsapp_account_id || "default";

        const equivs = getEquivalentBrazilPhones(basePhone);
        // Normalize the key to the preferred 13-digit format and append channel id to separate them
        const standardizedKey = (equivs.find(p => p.length === 13) || basePhone) + "-" + channelIdSuffix;

        if (!uniqueConversationsMap.has(standardizedKey)) {
          uniqueConversationsMap.set(standardizedKey, { ...c });
        } else {
          const existing = uniqueConversationsMap.get(standardizedKey);
          const existingTime = new Date(existing.last_message_at || 0).getTime();
          const incomingTime = new Date(c.last_message_at || 0).getTime();
          
          if (incomingTime > existingTime) {
            existing.last_message = c.last_message;
            existing.last_message_at = c.last_message_at;
            existing.id = c.id;
            existing.status = c.status;
            existing.assigned_user_id = c.assigned_user_id;
            existing.assigned_user_name = c.assigned_user_name;
            if (c.customer) {
              existing.customer = c.customer;
            }
          }
          
          // Combine unread count
          existing.unread_count = (existing.unread_count || 0) + (c.unread_count || 0);
          
          // Merge tags
          const existingTags = existing.tags || [];
          const incomingTags = c.tags || [];
          const mergedTags = [...existingTags];
          for (const it of incomingTags) {
            if (!mergedTags.some(t => t.id === it.id)) {
              mergedTags.push(it);
            }
          }
          existing.tags = mergedTags;
        }
      }

      const deduplicatedConversations = Array.from(uniqueConversationsMap.values());

      return res.json({
        success: true,
        conversations: deduplicatedConversations
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
      const { name, phone, message, customerId, customer_id, newName, newPhone, accountId } = req.body;

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

      const trimMessageText = String(message || "").trim();
      const hasMessageText = trimMessageText.length > 0;
      const finalMessage = hasMessageText ? formatAgentMessageForWhatsApp(trimMessageText, currentUser.name) : null;

      // Find or create customer
      const customer = await findOrCreateCustomerByPhone(normalized, finalName || "Cliente Novo");

      let conversation: any = null;
      let infoMessage: string | null = null;
      const now = new Date().toISOString();
      const activeAccountId = accountId || req.body.whatsapp_account_id || null;

      // Resolve active channel
      let resolvedAccountId = activeAccountId;
      if (!resolvedAccountId) {
        const { data: channels } = await supabaseAdmin.from("crm_channels").select("*").eq("is_active", true).limit(1);
        resolvedAccountId = channels && channels[0] ? channels[0].id : null;
      }

      // 1. Look up existing conversation first to prevent unique key violations
      const searchKey = resolvedAccountId ? `${normalized}-${resolvedAccountId}` : normalized;
      const { data: existingConvs } = await supabaseAdmin
        .from(TABLES.conversations)
        .select("*")
        .eq("customer_phone_normalized", searchKey);

      const existingConv = existingConvs && existingConvs.length > 0 ? existingConvs[0] : null;

      if (existingConv) {
        console.log(`[START CHAT] Atendimento existente localizado para o telefone ${normalized} no canal ${resolvedAccountId}. Reabrindo.`);
        
        const updatedPayload: any = {
          status: "OPEN",
          assigned_user_id: existingConv.assigned_user_id || currentUser.id,
          assigned_user_name: existingConv.assigned_user_name || currentUser.name,
          team_id: existingConv.team_id || currentUser.team_id || "comercial",
          team_name: existingConv.team_name || currentUser.team_name || "Comercial",
          queue_id: existingConv.queue_id || currentUser.team_id || "comercial",
          queue_name: existingConv.queue_name || currentUser.team_name || "Comercial",
          whatsapp_account_id: resolvedAccountId || existingConv.whatsapp_account_id,
          channel_id: resolvedAccountId || existingConv.channel_id,
          updated_at: now
        };

        if (finalMessage) {
          updatedPayload.last_message = finalMessage;
          updatedPayload.last_message_at = now;
        }

        const { data: reopenedConv, error: updateErr } = await supabaseAdmin
          .from(TABLES.conversations)
          .update(updatedPayload)
          .eq("id", existingConv.id)
          .select()
          .single();

        if (updateErr) throw updateErr;

        conversation = reopenedConv;
        infoMessage = "Já existe uma conversa com este telefone neste canal. Abrimos o atendimento existente.";
      } else {
        // Create new conversation
        const insertPayload: any = {
          customer_id: customer.id,
          whatsapp_account_id: resolvedAccountId,
          channel_id: resolvedAccountId,
          customer_phone_normalized: searchKey,
          assigned_user_id: currentUser.id,
          assigned_user_name: currentUser.name,
          status: "OPEN",
          team_id: currentUser.team_id || "comercial",
          team_name: currentUser.team_name || "Comercial",
          queue_id: currentUser.team_id || "comercial",
          queue_name: currentUser.team_name || "Comercial",
          source: "WhatsApp Z-API",
          last_message: finalMessage || "Atendimento iniciado",
          last_message_at: now,
          created_at: now,
          updated_at: now
        };

        try {
          const { data: newConv, error: insertErr } = await supabaseAdmin
            .from(TABLES.conversations)
            .insert(insertPayload)
            .select()
            .single();

          if (insertErr) {
            throw insertErr;
          }
          conversation = newConv;
        } catch (dbErr: any) {
          const isUniqueConstraint = 
            dbErr.code === "23505" || 
            (dbErr.message && String(dbErr.message).includes("unique constraint")) ||
            (dbErr.message && String(dbErr.message).includes("duplicate key"));

          if (isUniqueConstraint) {
            console.warn("[START CHAT RESCUED] Duplicate unique key violation rescued. Loading and updating existing.");
            const { data: rescueConvs } = await supabaseAdmin
              .from(TABLES.conversations)
              .select("*")
              .eq("customer_phone_normalized", searchKey);

            if (rescueConvs && rescueConvs.length > 0) {
              const rescued = rescueConvs[0];
              const { data: reopenedRescued } = await supabaseAdmin
                .from(TABLES.conversations)
                .update({
                  status: "OPEN",
                  whatsapp_account_id: resolvedAccountId || rescued.whatsapp_account_id,
                  channel_id: resolvedAccountId || rescued.channel_id,
                  updated_at: now
                })
                .eq("id", rescued.id)
                .select()
                .single();
              conversation = reopenedRescued || rescued;
              infoMessage = "Já existe uma conversa com este telefone neste canal. Abrimos o atendimento existente.";
            } else {
              throw dbErr;
            }
          } else {
            throw dbErr;
          }
        }
      }

      let savedMessage = null;

      if (hasMessageText && finalMessage) {
        let externalMsgId = `sent-${Date.now()}`;
        let rawPayload = null;

        // Fetch channel associated with the conversation or grab the default
        let conversationChannel = null;
        if (conversation.channel_id) {
          const { data: matchedChannel } = await supabaseAdmin
            .from("crm_channels")
            .select("*")
            .eq("id", conversation.channel_id)
            .maybeSingle();
          conversationChannel = matchedChannel;
        }

        if (!conversationChannel) {
          conversationChannel = await getActiveWhatsappChannel();
        }

        if (conversationChannel?.type === "whatsapp_meta") {
          const metaResponse = await sendMetaMessage(conversationChannel, normalized, finalMessage);
          externalMsgId = metaResponse?.messages?.[0]?.id || `meta-${Date.now()}`;
          rawPayload = metaResponse;
        } else {
          // Enviar pela Z-API via callZapi
          const zapiResponse = await callZapi(
            "/send-text",
            {
              phone: normalized,
              message: finalMessage
            },
            {
              source: "start-chat",
              source_id: conversation.id,
              channel: conversationChannel
            }
          );
          externalMsgId = zapiResponse?.messageId || zapiResponse?.id || `sent-${Date.now()}`;
          rawPayload = zapiResponse;
        }

        // Salvar em crm_messages
        const { data: savedMsg, error: messageError } = await supabaseAdmin
          .from(TABLES.messages)
          .insert({
            conversation_id: conversation.id,
            customer_phone_normalized: normalized,
            external_message_id: externalMsgId,
            sender_type: "agent",
            sender_user_id: currentUser.id,
            sender_name: currentUser.name,
            from_phone: "",
            to_phone: normalized,
            message_type: "text",
            content: finalMessage,
            status: "sent",
            is_internal: false,
            raw_payload: rawPayload,
            created_at: now
          })
          .select()
          .single();

        if (messageError) throw messageError;
        savedMessage = savedMsg;

        broadcastEvent("message.received", {
          conversation,
          message: {
            ...savedMessage,
            normalized_message_type: "text",
            display_content: savedMessage.content
          }
        });
      }

      broadcastEvent("conversation.updated", conversation);

      return res.json({
        success: true,
        conversation,
        message: savedMessage,
        infoMessage
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
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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
    if (!isValidUUID(id)) {
      return res.json({
        success: true,
        messages: []
      });
    }

    try {
      const { data: mainConv } = await supabaseAdmin.from(TABLES.conversations)
        .select('customer_phone_normalized')
        .eq('id', id)
        .maybeSingle();

      let conversationIds = [id];
      if (mainConv && mainConv.customer_phone_normalized) {
        const basePhone = mainConv.customer_phone_normalized.includes("-") 
          ? mainConv.customer_phone_normalized.split("-")[0] 
          : mainConv.customer_phone_normalized;
        const channelSuffix = mainConv.customer_phone_normalized.includes("-") 
          ? mainConv.customer_phone_normalized.slice(basePhone.length) 
          : "";

        const equivalentPhones = getEquivalentBrazilPhones(basePhone);
        const searchKeys = channelSuffix ? equivalentPhones.map(p => p + channelSuffix) : equivalentPhones;

        const { data: allRelatedConvs } = await supabaseAdmin.from(TABLES.conversations)
          .select('id')
          .in('customer_phone_normalized', searchKeys);
        
        if (allRelatedConvs && allRelatedConvs.length > 0) {
          conversationIds = allRelatedConvs.map(c => c.id);
        }
      }

      const { data: msgs, error } = await supabaseAdmin.from(TABLES.messages)
        .select('*')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter and Normalize
      const filteredAndNormalized = (msgs || []).filter((m: any) => {
        if (!m) return false;
        if (m.ignored) return false;
        if (m.origin === "group" || m.origin === "group_or_channel") return false;

        let payload: any = {};
        if (m.raw_payload) {
          if (typeof m.raw_payload === 'object') {
            payload = m.raw_payload;
          } else if (typeof m.raw_payload === 'string') {
            try {
              payload = JSON.parse(m.raw_payload);
            } catch (e) {
              payload = {};
            }
          }
        }

        if (!payload) payload = {};

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
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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

  // START META CUSTOM ENDPOINTS
  app.get("/api/meta/templates", async (req, res) => {
    try {
      const templates = await loadTemplatesDBOrFile();
      return res.json({ success: true, templates });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Erro ao listar templates." });
    }
  });

  app.post("/api/meta/templates/create", async (req, res) => {
    try {
      const templateData = req.body;
      const config = await resolveMetaChannelConfig();
      
      if (!config.accessToken) {
        return res.status(400).json({ success: false, error: "Token da Meta não configurado." });
      }

      const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.wabaId}/message_templates`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: templateData.name,
          category: templateData.category,
          allow_category_change: templateData.allow_category_change ?? true,
          language: templateData.language || "pt_BR",
          components: templateData.components
        })
      });

      const responseData: any = await response.json();
      
      if (!response.ok) {
        console.error("[META CREATE TEMPLATE ERROR]", responseData);
        return res.status(400).json({ success: false, error: responseData?.error?.message || "Erro desconhecido na criação do modelo." });
      }

      const metaTemplateId = responseData.id;
      const status = responseData.status || "PENDING";

      const newTemplateRecord = {
        id: crypto.randomUUID(),
        meta_template_id: metaTemplateId,
        name: templateData.name,
        display_name: templateData.display_name || templateData.name,
        category: templateData.category,
        language: templateData.language || "pt_BR",
        status: status,
        waba_id: config.wabaId,
        phone_number_id: config.phoneNumberId,
        components: templateData.components,
        body_text: extractBodyText(templateData.components) || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        submitted_at: new Date().toISOString(),
        last_meta_response: responseData
      };

      await saveTemplateToDBOrFile(newTemplateRecord);

      await createPlatformNotification(
        "template_submitted",
        "Modelo enviado para análise",
        `O modelo ${templateData.name} foi enviado para análise da Meta.`,
        { template_name: templateData.name, meta_template_id: metaTemplateId }
      );

      return res.json({ success: true, template: newTemplateRecord });
    } catch (err: any) {
      console.error("[META CREATE TEMPLATE EXCEPTION]", err);
      return res.status(500).json({ success: false, error: err?.message || "Erro desconhecido." });
    }
  });

  const handleSyncMetaTemplates = async (req: any, res: any) => {
    try {
      const config = await resolveMetaChannelConfig();
      if (!config.accessToken) {
        return res.status(400).json({ success: false, error: "Token da Meta não configurado nas configurações de canal." });
      }

      let nextPageUrl: string | null = `https://graph.facebook.com/${config.graphVersion}/${config.wabaId}/message_templates?limit=100`;
      let metaTemplates: any[] = [];

      while (nextPageUrl) {
        const response = await fetch(nextPageUrl, {
          headers: { "Authorization": `Bearer ${config.accessToken}` }
        });

        const responseData: any = await response.json();
        if (!response.ok) {
          console.error("[META SYNC ERROR RESPONSE]", responseData);
          return res.status(400).json({ success: false, error: responseData?.error?.message || "Erro ao consultar modelos da Meta." });
        }

        if (responseData.data && Array.isArray(responseData.data)) {
          metaTemplates.push(...responseData.data);
        }

        nextPageUrl = responseData.paging?.next || null;
      }

      const updatedTemplates = [];
      const existing = await loadTemplatesDBOrFile();

      for (const t of metaTemplates) {
        const status = t.status || "UNKNOWN";
        const currentLocal = existing.find((loc: any) => loc.name === t.name && loc.language === t.language);
        
        const templateRecord = {
          id: currentLocal?.id || crypto.randomUUID(),
          meta_template_id: t.id,
          name: t.name,
          display_name: currentLocal?.display_name || t.name,
          category: t.category,
          language: t.language,
          status: status,
          waba_id: config.wabaId,
          phone_number_id: config.phoneNumberId,
          components: t.components,
          body_text: extractBodyText(t.components) || "",
          header_text: extractHeaderText(t.components) || "",
          header_type: extractHeaderType(t.components) || "TEXT",
          footer_text: extractFooterText(t.components) || "",
          buttons: extractButtons(t.components) || [],
          quality_score: t.quality_score || null,
          rejection_reason: t.rejection_reason || null,
          last_meta_response: t,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        await saveTemplateToDBOrFile(templateRecord);
        updatedTemplates.push(templateRecord);

        // Notify if status changed or it's a new approved template
        if (currentLocal && currentLocal.status !== status) {
          if (status === "APPROVED") {
            await createPlatformNotification("template_approved", "Modelo aprovado pela Meta", `O modelo '${t.name}' foi aprovado e já pode ser usado.`, { template_name: t.name, meta_template_id: t.id });
          } else if (status === "REJECTED") {
            await createPlatformNotification("template_rejected", "Modelo rejeitado pela Meta", `O modelo '${t.name}' foi rejeitado pela Meta.`, { template_name: t.name, meta_template_id: t.id });
          } else if (status === "PAUSED") {
            await createPlatformNotification("template_paused", "Modelo pausado pela Meta", `O modelo '${t.name}' foi pausado pela Meta.`, { template_name: t.name, meta_template_id: t.id });
          }
        }
      }

      // Create a notification for successful sync
      if (updatedTemplates.length > 0) {
        await createPlatformNotification(
          "template_synced",
          "Sincronização concluída",
          `Sincronizamos ${updatedTemplates.length} modelos de mensagem da Meta com sucesso.`,
          { count: updatedTemplates.length }
        );
      }

      return res.json({ success: true, count: updatedTemplates.length, templates: updatedTemplates });
    } catch (err: any) {
      console.error("[META TEMPLATES SYNC EXCEPTION]", err);
      return res.status(500).json({ success: false, error: err?.message || "Erro desconhecido." });
    }
  };

  app.get("/api/meta/templates/sync", handleSyncMetaTemplates);
  app.post("/api/meta/templates/sync", handleSyncMetaTemplates);

  app.get("/api/meta/templates", async (req, res) => {
    try {
      const templates = await loadTemplatesDBOrFile();
      return res.json({ success: true, templates });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Erro ao carregar modelos." });
    }
  });

  app.post("/api/meta/templates/:id/sync-status", async (req, res) => {
    try {
      const templateId = req.params.id;
      const templates = await loadTemplatesDBOrFile();
      const localTemplate = templates.find((t: any) => t.id === templateId || t.meta_template_id === templateId);
      
      if (!localTemplate) {
        return res.status(404).json({ success: false, error: "Modelo não encontrado localmente." });
      }

      const config = await resolveMetaChannelConfig();
      if (!config.accessToken) {
        return res.status(400).json({ success: false, error: "Token da Meta não configurado." });
      }

      const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${localTemplate.meta_template_id}`, {
        headers: { "Authorization": `Bearer ${config.accessToken}` }
      });

      const responseData: any = await response.json();
      if (!response.ok) {
        return res.status(400).json({ success: false, error: responseData?.error?.message || "Erro ao consultar modelo na Meta." });
      }

      const status = responseData.status || "UNKNOWN";
      
      const updatedRecord = {
        ...localTemplate,
        status: status,
        components: responseData.components || localTemplate.components,
        quality_score: responseData.quality_score || localTemplate.quality_score,
        rejection_reason: responseData.rejection_reason || localTemplate.rejection_reason,
        last_meta_response: responseData,
        updated_at: new Date().toISOString()
      };

      await saveTemplateToDBOrFile(updatedRecord);

      if (localTemplate.status !== status) {
        if (status === "APPROVED") {
          await createPlatformNotification("template_approved", "Modelo aprovado pela Meta", `O modelo ${localTemplate.name} foi aprovado e já pode ser usado.`, { template_name: localTemplate.name, meta_template_id: updatedRecord.meta_template_id });
        } else if (status === "REJECTED") {
          await createPlatformNotification("template_rejected", "Modelo rejeitado pela Meta", `O modelo ${localTemplate.name} foi rejeitado.`, { template_name: localTemplate.name, meta_template_id: updatedRecord.meta_template_id });
        }
      }

      return res.json({ success: true, template: updatedRecord });
    } catch (err: any) {
      console.error("[META TEMPLATES SINGLE SYNC CLOUD EXCEPTION]", err);
      return res.status(500).json({ success: false, error: err?.message });
    }
  });

  app.post("/api/meta/messages/send-template", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const { phone, customer_name, template_id, variables, accountId } = req.body;

      if (!phone || !template_id) {
        return res.status(400).json({ success: false, error: "Parâmetros obrigatórios ausentes (phone, template_id)." });
      }

      // 1. Normalizar telefone
      let phoneNormalized = String(phone).replace(/\D/g, "");
      if (phoneNormalized.length > 0 && !phoneNormalized.startsWith("55")) {
        phoneNormalized = "55" + phoneNormalized;
      }

      // 2. Buscar o template no banco ou arquivo
      const templates = await loadTemplatesDBOrFile();
      const template = templates.find((t: any) => t.id === template_id || t.meta_template_id === template_id || t.name === template_id);

      if (!template) {
        return res.status(400).json({ success: false, error: "Template não encontrado." });
      }

      // 3. Validar template
      if (template.status !== "APPROVED") {
        console.warn(`[SEND TEMPLATE WARNING] Template status is '${template.status || 'PENDING'}', proceeding anyway.`);
      }

      // 4. Resolver canal (Meta ou Z-API)
      let activeChannel: any = null;
      if (accountId) {
        const { data: matchedChannel } = await supabaseAdmin
          .from("crm_channels")
          .select("*")
          .eq("id", accountId)
          .maybeSingle();
        activeChannel = matchedChannel;
      }

      if (!activeChannel) {
        const activeChannels = await loadChannelsDBOrFile();
        activeChannel = activeChannels.find((c: any) => c.is_active);
      }

      if (!activeChannel) {
        return res.status(400).json({ success: false, error: "Nenhum canal ativo encontrado para realizar o disparo." });
      }

      // 5. Reconstruir o conteúdo da mensagem convertendo variáveis {{1}} -> valor ou {1} -> valor
      const sortedKeys = Object.keys(variables || {}).map(Number).sort((a, b) => a - b);
      let finalMessage = `[Modelo: ${template.name}]`;
      if (template.body_text) {
        let substituted = template.body_text;
        sortedKeys.forEach(key => {
          substituted = substituted.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(variables[key] || ""));
        });
        finalMessage = substituted;
      }

      let waMsgId = `tmpl-${Date.now()}`;
      let responseBody: any = { success: true };

      if (activeChannel.type === "whatsapp_meta") {
        const accessToken = activeChannel?.instance_token || process.env.META_ACCESS_TOKEN || "";
        const phoneNumberId = activeChannel?.instance_id || process.env.META_PHONE_NUMBER_ID || "1068963322976757";
        const graphVersion = activeChannel?.meta_graph_version || process.env.META_GRAPH_VERSION || "v25.0";

        if (!accessToken) {
          return res.status(400).json({ success: false, error: "Token de acesso Meta não configurado para o canal Meta." });
        }

        const parameters = sortedKeys.map(key => ({
          type: "text",
          text: String(variables[key] || "")
        }));

        const componentsPayload: any[] = [];
        if (parameters.length > 0) {
          componentsPayload.push({
            type: "body",
            parameters: parameters
          });
        }

        const metaUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
        
        const response = await fetch(metaUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNormalized,
            type: "template",
            template: {
              name: template.name,
              language: {
                code: template.language || "pt_BR"
              },
              components: componentsPayload.length > 0 ? componentsPayload : undefined
            }
          })
        });

        responseBody = await response.json();

        if (!response.ok) {
          console.error("[Meta Cloud API send-template error]", responseBody);
          const friendlyError = mapMetaErrorResponse(responseBody?.error);
          
          await createPlatformNotification(
            "template_send_failed",
            "Falha no envio do modelo",
            `Não foi possível enviar o modelo '${template.name}' para ${phoneNormalized}. Erro: ${friendlyError}`,
            { phone: phoneNormalized, template_id, template_name: template.name, error: responseBody?.error }
          );

          return res.status(400).json({
            success: false,
            error: friendlyError,
            errorDetails: responseBody?.error
          });
        }

        waMsgId = responseBody?.messages?.[0]?.id || `meta-${Date.now()}`;
      } else {
        // Envio nativo por Z-API (Não oficial)
        try {
          const zapiResponse = await callZapi(
            "/send-text",
            {
              phone: phoneNormalized,
              message: finalMessage
            },
            {
              source: "send-template",
              template_id: template.id,
              channel: activeChannel
            }
          );
          waMsgId = zapiResponse?.messageId || zapiResponse?.id || `zapi-${Date.now()}`;
          responseBody = zapiResponse;
        } catch (zapiErr: any) {
          console.error("[Z-API send-template error]", zapiErr);
          return res.status(400).json({
            success: false,
            error: zapiErr?.message || "Falha ao enviar modelo pelo canal Z-API."
          });
        }
      }

      // 6. Criar ou abrir conversa existente
      const customer = await findOrCreateCustomerByPhone(phoneNormalized, customer_name || "Cliente Manual");

      let phoneToSearch = [phoneNormalized];
      try {
        const equivs = getEquivalentBrazilPhones(phoneNormalized);
        if (equivs && equivs.length > 0) {
          phoneToSearch = Array.from(new Set([phoneNormalized, ...equivs]));
        }
      } catch (e) {
        // ignore
      }

      const activeChannelId = activeChannel?.id || null;
      const dbSearchKeys = activeChannelId ? phoneToSearch.map(p => `${p}-${activeChannelId}`) : phoneToSearch;

      let alreadyExisted = false;
      let conversation: any = null;

      const { data: matchedConv } = await supabaseAdmin
        .from("crm_conversations")
        .select("*")
        .in("customer_phone_normalized", dbSearchKeys)
        .maybeSingle();

      if (matchedConv) {
        alreadyExisted = true;
        conversation = matchedConv;
        const { data: updatedConv } = await supabaseAdmin
          .from("crm_conversations")
          .update({ 
            status: "OPEN",
            channel_id: activeChannelId || conversation.channel_id,
            whatsapp_account_id: activeChannelId || conversation.whatsapp_account_id,
            last_message: finalMessage,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", conversation.id)
          .select()
          .single();
        if (updatedConv) conversation = updatedConv;
      } else {
        // Criar conversa nova
        const finalInsertPhone = activeChannelId ? `${phoneNormalized}-${activeChannelId}` : phoneNormalized;
        const newConvPayload = {
          id: crypto.randomUUID(),
          customer_id: customer.id,
          customer_phone_normalized: finalInsertPhone,
          channel_id: activeChannelId || null,
          whatsapp_account_id: activeChannelId || null,
          status: "OPEN",
          assigned_user_id: currentUser?.id || null,
          assigned_user_name: currentUser?.name || null,
          last_message: finalMessage,
          last_message_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const { data: createdConv, error: createError } = await supabaseAdmin
          .from("crm_conversations")
          .insert(newConvPayload)
          .select("*")
          .single();

        if (createError) {
          // Tratar erro 23505 de chave duplicada
          if (createError.code === "23505" || String(createError.message).includes("duplicate") || String(createError.message).includes("customer_phone_normalized_key")) {
            const { data: fallbackConv } = await supabaseAdmin
              .from("crm_conversations")
              .select("*")
              .in("customer_phone_normalized", dbSearchKeys)
              .maybeSingle();
            
            if (fallbackConv) {
              conversation = fallbackConv;
              alreadyExisted = true;
            } else {
              throw createError;
            }
          } else {
            throw createError;
          }
        } else {
          conversation = createdConv;
        }
      }

      // Salvar a mensagem no banco
      const now = new Date().toISOString();
      const { data: savedMessage, error: messageError } = await supabaseAdmin
        .from("crm_messages")
        .insert({
          conversation_id: conversation.id,
          customer_phone_normalized: phoneNormalized,
          external_message_id: waMsgId,
          sender_type: "agent",
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          from_phone: "",
          to_phone: phoneNormalized,
          message_type: "text",
          content: finalMessage,
          status: "sent",
          is_internal: false,
          raw_payload: responseBody,
          created_at: now
        })
        .select("*")
        .single();

      if (messageError) throw messageError;

      // Atualizar a conversa
      const { data: finalConv } = await supabaseAdmin
        .from("crm_conversations")
        .update({
          assigned_user_id: conversation.assigned_user_id || currentUser.id,
          assigned_user_name: conversation.assigned_user_name || currentUser.name,
          status: "OPEN",
          last_message: finalMessage,
          last_message_at: now,
          updated_at: now
        })
        .eq("id", conversation.id)
        .select()
        .single();

      if (finalConv) conversation = finalConv;

      // Registrar notificação de sucesso
      await createPlatformNotification(
        "template_send_success",
        "Modelo enviado",
        `O modelo '${template.name}' foi enviado com sucesso para ${customer_name || phoneNormalized}.`,
        { phone: phoneNormalized, template_name: template.name, message_id: waMsgId }
      );

      // Enviar broadcasts
      if (broadcastEventGlobal) {
        broadcastEventGlobal("message.received", {
          customer_phone: phoneNormalized,
          conversation_id: conversation.id,
          message: {
            ...savedMessage,
            normalized_message_type: 'text',
            display_content: savedMessage.content
          },
          direction: "outgoing"
        });

        broadcastEventGlobal("conversation.updated", conversation);
      }

      return res.json({
        success: true,
        message: savedMessage,
        conversation,
        alreadyExisted
      });
    } catch (err: any) {
      console.error("[META SEND TEMPLATE ERROR]", err);
      return res.status(500).json({ success: false, error: err?.message || "Exceção inesperada no envio do modelo." });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      const list = await loadNotificationsDBOrFile();
      list.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.json({ success: true, notifications: list });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Erro ao carregar notificações." });
    }
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    try {
      const id = req.params.id;
      let fileList = [];
      const jsonPath = path.join(process.cwd(), "backend_notifications.json");
      
      if (fs.existsSync(jsonPath)) {
        fileList = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      }

      const idx = fileList.findIndex((n: any) => n.id === id);
      if (idx !== -1) {
        fileList[idx].status = "read";
        fileList[idx].read_at = new Date().toISOString();
        fs.writeFileSync(jsonPath, JSON.stringify(fileList, null, 2), "utf-8");
      }

      try {
        if (globalSupabaseAdmin) {
          await globalSupabaseAdmin
            .from("platform_notifications")
            .update({ status: "read", read_at: new Date().toISOString() })
            .eq("id", id);
        }
      } catch (err) {
        // ignore
      }

      if (broadcastEventGlobal) {
        broadcastEventGlobal("notification.updated", { id, status: "read" });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Erro ao marcar notificação como lida." });
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      let fileList = [];
      const jsonPath = path.join(process.cwd(), "backend_notifications.json");
      
      if (fs.existsSync(jsonPath)) {
        fileList = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      }

      fileList.forEach((n: any) => {
        if (n.status === "unread") {
          n.status = "read";
          n.read_at = new Date().toISOString();
        }
      });
      fs.writeFileSync(jsonPath, JSON.stringify(fileList, null, 2), "utf-8");

      try {
        if (globalSupabaseAdmin) {
          await globalSupabaseAdmin
            .from("platform_notifications")
            .update({ status: "read", read_at: new Date().toISOString() })
            .eq("status", "unread");
        }
      } catch (err) {
        // ignore
      }

      if (broadcastEventGlobal) {
        broadcastEventGlobal("notifications.read_all", { status: "read" });
      }
      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Erro ao limpar notificações." });
    }
  });

  app.get("/api/omnichannel/conversations/:id/window-check", async (req, res) => {
    try {
      const conversationId = req.params.id;
      if (!isValidUUID(conversationId)) {
        return res.status(400).json({ success: false, error: "ID inválido." });
      }

      const isWithinWindow = await checkOfficialChannelWindow(conversationId);
      return res.json({ success: true, isWithinWindow });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err?.message || "Erro ao checar janela." });
    }
  });

  app.post("/api/omnichannel/conversations/:id/send-template", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const conversationId = req.params.id;
      if (!isValidUUID(conversationId)) {
        return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
      }

      const { templateName, languageCode, variables } = req.body;

      if (!templateName) {
        return res.status(400).json({ success: false, error: "Nome do modelo de mensagem é obrigatório." });
      }

      const { data: conversation, error: conversationError } = await supabaseAdmin
        .from("crm_conversations")
        .select("*")
        .eq("id", conversationId)
        .single();

      if (conversationError || !conversation) {
        return res.status(404).json({ success: false, error: "Conversa não encontrada." });
      }

      const phone = normalizeBrazilPhone(conversation.customer_phone_normalized);
      if (!phone) {
        return res.status(400).json({ success: false, error: "Telefone do cliente inválido." });
      }

      let conversationChannel = null;
      const targetChannelId = conversation.channel_id || conversation.whatsapp_account_id;
      if (targetChannelId) {
        const { data: matchedChannel } = await supabaseAdmin
          .from("crm_channels")
          .select("*")
          .eq("id", targetChannelId)
          .maybeSingle();
        conversationChannel = matchedChannel;
      }

      if (!conversationChannel) {
        conversationChannel = await getActiveWhatsappChannel();
      }

      if (!conversationChannel) {
        return res.status(400).json({ success: false, error: "Nenhum canal ativo ou configurado foi localizado para a conversa." });
      }

      // Reconstruir conteúdo do template de mensagem preenchendo as variáveis dinâmicas
      const templates = await loadTemplatesDBOrFile();
      const matchedTemplate = templates.find((t: any) => t.name === templateName && t.language === (languageCode || "pt_BR")) || templates.find((t: any) => t.name === templateName);

      let finalMessage = `[Modelo: ${templateName}]`;
      if (matchedTemplate && matchedTemplate.body_text) {
        let substituted = matchedTemplate.body_text;
        (variables || []).forEach((val: string, index: number) => {
          substituted = substituted.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"), val);
        });
        finalMessage = substituted;
      }

      let externalMsgId = `tmpl-${Date.now()}`;
      let responseBody: any = { success: true };

      if (conversationChannel.type === "whatsapp_meta") {
        const phoneNumberId = conversationChannel.instance_id;
        const accessToken = conversationChannel.instance_token;
        if (!phoneNumberId || !accessToken) {
          return res.status(400).json({ success: false, error: "Canal Meta não configurado corretamente. Verifique as credenciais." });
        }

        const cleanPhone = phone.replace(/\D/g, "");
        const version = conversationChannel.meta_graph_version || process.env.META_GRAPH_VERSION || "v25.0";
        const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

        const parameters = (variables || []).map((val: string) => ({
          type: "text",
          text: val
        }));

        const componentsPayload: any[] = [];
        if (parameters.length > 0) {
          componentsPayload.push({
            type: "body",
            parameters: parameters
           });
        }

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: cleanPhone,
            type: "template",
            template: {
              name: templateName,
              language: {
                code: languageCode || "pt_BR"
              },
              components: componentsPayload
            }
          })
        });

        responseBody = await response.json();

        if (!response.ok) {
          console.error("[Meta Cloud API send-template error]", responseBody);
          const friendlyError = mapMetaErrorResponse(responseBody?.error);
          return res.status(400).json({
            success: false,
            error: friendlyError,
            errorDetails: responseBody?.error
          });
        }

        externalMsgId = responseBody?.messages?.[0]?.id || `meta-${Date.now()}`;
      } else {
        // Canal Z-API ou diferente de whatsapp_meta
        try {
          const zapiResponse = await callZapi(
            "/send-text",
            {
              phone: phone,
              message: finalMessage
            },
            {
              source: "send-template",
              source_id: conversationId,
              channel: conversationChannel
            }
          );
          externalMsgId = zapiResponse?.messageId || zapiResponse?.id || `zapi-${Date.now()}`;
          responseBody = zapiResponse;
        } catch (zapiErr: any) {
          console.error("[Z-API send-template from conversation error]", zapiErr);
          return res.status(400).json({
            success: false,
            error: zapiErr?.message || "Falha ao enviar modelo pelo canal Z-API."
          });
        }
      }
      
      const now = new Date().toISOString();

      const { data: savedMessage, error: messageError } = await supabaseAdmin
        .from("crm_messages")
        .insert({
          conversation_id: conversationId,
          customer_phone_normalized: phone,
          external_message_id: externalMsgId,
          sender_type: "agent",
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          from_phone: "",
          to_phone: phone,
          message_type: "text",
          content: finalMessage,
          status: "sent",
          is_internal: false,
          raw_payload: responseBody,
          created_at: now
        })
        .select("*")
        .single();

      if (messageError) throw messageError;

      await supabaseAdmin
        .from("crm_conversations")
        .update({
          last_message: finalMessage,
          last_message_at: now,
          updated_at: now
        })
        .eq("id", conversationId);

      if (broadcastEventGlobal) {
        broadcastEventGlobal("message.received", {
          customer_phone: phone,
          conversation_id: conversationId,
          message: {
            ...savedMessage,
            normalized_message_type: 'text',
            display_content: savedMessage.content
          },
          direction: "outgoing"
        });
      }

      return res.json({ success: true, message: savedMessage });
    } catch (err: any) {
      console.error("[META TEMPLATE SEND EXCEPTION]", err);
      return res.status(500).json({ success: false, error: err?.message || "Exceção inesperada ao enviar." });
    }
  });
  // END META CUSTOM ENDPOINTS

  app.post("/api/omnichannel/conversations/:id/send-message", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
  
      const conversationId = req.params.id;
      if (!isValidUUID(conversationId)) {
        return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
      }
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
  
      let externalMsgId = `sent-${Date.now()}`;
      let rawPayload = null;
      let zapiResponse: any = null;

      // Check if conversation has channel_id or whatsapp_account_id and retrieve it
      let conversationChannel = null;
      const targetChannelId = conversation.channel_id || conversation.whatsapp_account_id;
      if (targetChannelId) {
        const { data: matchedChannel } = await supabaseAdmin
          .from("crm_channels")
          .select("*")
          .eq("id", targetChannelId)
          .maybeSingle();
        conversationChannel = matchedChannel;
      }
 
      if (!conversationChannel) {
        conversationChannel = await getActiveWhatsappChannel();
      }
 
      if (conversationChannel?.type === "whatsapp_meta") {
        const isWithinWindow = await checkOfficialChannelWindow(conversationId);
        if (!isWithinWindow) {
          return res.status(400).json({
            success: false,
            error: "Este cliente está fora da janela de atendimento. Use um modelo aprovado."
          });
        }
        const metaResponse = await sendMetaMessage(conversationChannel, phone, finalMessage);
        externalMsgId = metaResponse?.messages?.[0]?.id || `meta-${Date.now()}`;
        rawPayload = metaResponse;
      } else {
        zapiResponse = await callZapi(
          "/send-text",
          {
            phone,
            message: finalMessage
          },
          {
            source: "conversation",
            source_id: conversationId,
            channel: conversationChannel
          }
        );
        externalMsgId = zapiResponse?.messageId || zapiResponse?.id || `sent-${Date.now()}`;
        rawPayload = zapiResponse;
      }
  
      const now = new Date().toISOString();
  
      const { data: savedMessage, error: messageError } = await supabaseAdmin
        .from("crm_messages")
        .insert({
          conversation_id: conversationId,
          customer_phone_normalized: phone,
          external_message_id: externalMsgId,
          sender_type: "agent",
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          from_phone: "",
          to_phone: phone,
          message_type: "text",
          content: finalMessage,
          status: "sent",
          is_internal: false,
          raw_payload: rawPayload,
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
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
    upload.single("file")(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ success: false, error: 'Arquivo muito grande. Limite de 25 MB.' });
        }
        return res.status(400).json({ success: false, error: `Erro no upload: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ success: false, error: `Erro inesperado: ${err.message}` });
      }
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

  async function uploadChatMediaToStorage(buffer: Buffer, fileName: string, mimeType: string, conversationId: string) {
    const safeFileName = fileName
      .replace(/[^\w.\-]/g, "_")
      .replace(/_+/g, "_");

    const storagePath = `conversations/${conversationId}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from("chat-media")
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Erro ao salvar mídia no Storage: ${uploadError.message}`);
    }

    const { data: publicData } = supabaseAdmin
      .storage
      .from("chat-media")
      .getPublicUrl(storagePath);

    const publicUrl = publicData?.publicUrl;

    if (!publicUrl) {
      throw new Error("Não foi possível gerar URL pública da imagem.");
    }

    return {
      storagePath,
      publicUrl
    };
  }

  async function processImageForChat(fileBuffer: Buffer, mimeType: string) {
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp"
    ];

    if (!allowedMimes.includes(mimeType)) {
      throw new Error(`Formato de imagem não permitido: ${mimeType}`);
    }

    if (!fileBuffer || fileBuffer.length < 1000) {
      throw new Error("Imagem vazia ou inválida.");
    }

    const metadata = await sharp(fileBuffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Imagem inválida ou corrompida.");
    }

    const processedBuffer = await sharp(fileBuffer)
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true
      })
      .jpeg({
        quality: 85,
        mozjpeg: true
      })
      .toBuffer();

    return {
      buffer: processedBuffer,
      mimeType: "image/jpeg",
      fileName: `imagem-${Date.now()}.jpg`,
      metadata
    };
  }

  app.post("/api/omnichannel/conversations/:id/send-image", upload.single("file"), async (req, res) => {
    let debugLogId = null;
    const conversationId = req.params.id;
    if (!isValidUUID(conversationId)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }

    try {
      const currentUser = await getAuthenticatedUser(req);

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
          error: "Imagem não recebida ou arquivo vazio."
        });
      }

      const originalMimeType = req.file.mimetype || "application/octet-stream";
      const caption = String(req.body?.caption || "").trim();

      const { data: debugInsert } = await supabaseAdmin
        .from("media_debug_logs")
        .insert({
          conversation_id: conversationId,
          user_id: currentUser.id,
          user_name: currentUser.name,
          media_type: "image",
          original_mime_type: originalMimeType,
          original_size: req.file.size,
          file_name: req.file.originalname || null,
          success: false
        })
        .select("id")
        .single();

      debugLogId = debugInsert?.id || null;

      const processed = await processImageForChat(req.file.buffer, originalMimeType);

      const { storagePath, publicUrl } = await uploadChatMediaToStorage(
        processed.buffer,
        processed.fileName,
        processed.mimeType,
        conversationId
      );

      const finalCaption = caption
        ? formatAgentMessageForWhatsApp(caption, currentUser.name)
        : `*Guia de Férias - ${currentUser.name}:*`;

      const zapiResponse = await callZapi(
        "/send-image",
        {
          phone,
          image: publicUrl,
          caption: finalCaption
        },
        {
          source: "conversation-image",
          source_id: conversationId
        }
      );

      const now = new Date().toISOString();

      const { data: savedMessage, error: messageError } = await supabaseAdmin
        .from("crm_messages")
        .insert({
          conversation_id: conversationId,
          customer_phone_normalized: phone,
          external_message_id: zapiResponse?.messageId || zapiResponse?.id || `image-${Date.now()}`,
          sender_type: "agent",
          sender_user_id: currentUser.id,
          sender_name: currentUser.name,
          from_phone: "",
          to_phone: phone,
          message_type: "image",
          content: finalCaption || "Imagem enviada",
          caption: caption || null,
          media_mime_type: processed.mimeType,
          media_file_name: processed.fileName,
          media_size: processed.buffer.length,
          media_url: publicUrl,
          media_storage_url: publicUrl,
          storage_path: storagePath,
          status: "sent",
          is_internal: false,
          raw_payload: {
            zapiResponse,
            originalMimeType,
            originalSize: req.file.size,
            processedMimeType: processed.mimeType,
            processedSize: processed.buffer.length,
            metadata: processed.metadata
          },
          created_at: now
        })
        .select("*")
        .single();

      if (messageError) {
        throw messageError;
      }

      await supabaseAdmin
        .from("crm_conversations")
        .update({
          assigned_user_id: conversation.assigned_user_id || currentUser.id,
          assigned_user_name: conversation.assigned_user_name || currentUser.name,
          status: "OPEN",
          last_message: "Imagem enviada",
          last_message_at: now,
          updated_at: now
        })
        .eq("id", conversationId);

      if (debugLogId) {
        await supabaseAdmin
          .from("media_debug_logs")
          .update({
            processed_mime_type: processed.mimeType,
            processed_size: processed.buffer.length,
            backend_debug: {
              metadata: processed.metadata,
              storagePath,
              publicUrl
            },
            zapi_response: zapiResponse,
            success: true
          })
          .eq("id", debugLogId);
      }

      // Live update of active conversation and chat messages list via SSE
      broadcastEvent("message.received", {
        conversation: {
          ...conversation,
          assigned_user_id: conversation.assigned_user_id || currentUser.id,
          assigned_user_name: conversation.assigned_user_name || currentUser.name,
          status: "OPEN",
          last_message: "Imagem enviada",
          last_message_at: now,
          updated_at: now
        },
        message: {
          ...savedMessage,
          normalized_message_type: "image",
          display_content: savedMessage.content,
          display_media_url: publicUrl
        }
      });

      broadcastEvent("conversation.updated", {
        conversation: {
          ...conversation,
          assigned_user_id: conversation.assigned_user_id || currentUser.id,
          assigned_user_name: conversation.assigned_user_name || currentUser.name,
          status: "OPEN",
          last_message: "Imagem enviada",
          last_message_at: now,
          updated_at: now
        }
      });

      return res.json({
        success: true,
        message: savedMessage,
        zapiResponse,
        mediaDebug: {
          originalMimeType,
          originalSize: req.file.size,
          processedMimeType: processed.mimeType,
          processedSize: processed.buffer.length,
          metadata: processed.metadata
        }
      });
    } catch (error: any) {
      console.error("[SEND IMAGE ERROR]", error);

      if (debugLogId) {
        await supabaseAdmin
          .from("media_debug_logs")
          .update({
            success: false,
            error: error instanceof Error ? error.message : String(error)
          })
          .eq("id", debugLogId);
      }

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao enviar imagem.",
        zapiResponse: error?.zapiResponse || null
      });
    }
  });

  app.post("/api/omnichannel/conversations/:id/send-images", upload.array("files", 10), async (req, res) => {
    const conversationId = req.params.id;
    if (!isValidUUID(conversationId)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }

    try {
      const currentUser = await getAuthenticatedUser(req);

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

      const files = (req.files || []) as any[];
      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Nenhuma imagem recebida."
        });
      }

      const caption = String(req.body?.caption || "").trim();
      const savedMessages: any[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let fileDebugLogId = null;
        try {
          const originalMimeType = file.mimetype || "application/octet-stream";
          
          const { data: debugInsert } = await supabaseAdmin
            .from("media_debug_logs")
            .insert({
              conversation_id: conversationId,
              user_id: currentUser.id,
              user_name: currentUser.name,
              media_type: "image",
              original_mime_type: originalMimeType,
              original_size: file.size,
              file_name: file.originalname || null,
              success: false
            })
            .select("id")
            .single();

          fileDebugLogId = debugInsert?.id || null;

          const processed = await processImageForChat(file.buffer, originalMimeType);

          const { storagePath, publicUrl } = await uploadChatMediaToStorage(
            processed.buffer,
            processed.fileName,
            processed.mimeType,
            conversationId
          );

          // Padrão: legenda somente na primeira imagem.
          const instanceCaption = i === 0 ? caption : "";
          const finalCaption = instanceCaption
            ? formatAgentMessageForWhatsApp(instanceCaption, currentUser.name)
            : `*Guia de Férias - ${currentUser.name}:*`;

          const zapiResponse = await callZapi(
            "/send-image",
            {
              phone,
              image: publicUrl,
              caption: finalCaption
            },
            {
              source: "conversation-image-multi",
              source_id: conversationId
            }
          );

          const now = new Date().toISOString();

          const { data: savedMessage, error: messageError } = await supabaseAdmin
            .from("crm_messages")
            .insert({
              conversation_id: conversationId,
              customer_phone_normalized: phone,
              external_message_id: zapiResponse?.messageId || zapiResponse?.id || `image-multi-${Date.now()}-${i}`,
              sender_type: "agent",
              sender_user_id: currentUser.id,
              sender_name: currentUser.name,
              from_phone: "",
              to_phone: phone,
              message_type: "image",
              content: finalCaption || "Imagem enviada",
              caption: instanceCaption || null,
              media_mime_type: processed.mimeType,
              media_file_name: processed.fileName,
              media_size: processed.buffer.length,
              media_url: publicUrl,
              media_storage_url: publicUrl,
              storage_path: storagePath,
              status: "sent",
              is_internal: false,
              raw_payload: {
                zapiResponse,
                originalMimeType,
                originalSize: file.size,
                processedMimeType: processed.mimeType,
                processedSize: processed.buffer.length,
                metadata: processed.metadata,
                multiIndex: i
              },
              created_at: now
            })
            .select("*")
            .single();

          if (messageError) {
            throw messageError;
          }

          savedMessages.push(savedMessage);

          await supabaseAdmin
            .from("crm_conversations")
            .update({
              assigned_user_id: conversation.assigned_user_id || currentUser.id,
              assigned_user_name: conversation.assigned_user_name || currentUser.name,
              status: "OPEN",
              last_message: "Imagem enviada",
              last_message_at: now,
              updated_at: now
            })
            .eq("id", conversationId);

          if (fileDebugLogId) {
            await supabaseAdmin
              .from("media_debug_logs")
              .update({
                processed_mime_type: processed.mimeType,
                processed_size: processed.buffer.length,
                backend_debug: {
                  metadata: processed.metadata,
                  storagePath,
                  publicUrl
                },
                zapi_response: zapiResponse,
                success: true
              })
              .eq("id", fileDebugLogId);
          }

          // Live update via SSE for each message
          broadcastEvent("message.received", {
            conversation: {
              ...conversation,
              assigned_user_id: conversation.assigned_user_id || currentUser.id,
              assigned_user_name: conversation.assigned_user_name || currentUser.name,
              status: "OPEN",
              last_message: "Imagem enviada",
              last_message_at: now,
              updated_at: now
            },
            message: {
              ...savedMessage,
              normalized_message_type: "image",
              display_content: savedMessage.content,
              display_media_url: publicUrl
            }
          });

        } catch (fileErr: any) {
          console.error(`[SEND MULTI-IMAGE FILE ${i} ERROR]`, fileErr);
          if (fileDebugLogId) {
            await supabaseAdmin
              .from("media_debug_logs")
              .update({
                success: false,
                error: fileErr instanceof Error ? fileErr.message : String(fileErr)
              })
              .eq("id", fileDebugLogId);
          }
        }

        // Wait 1 second (1000ms) between sends to avoid rate limits
        if (i < files.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      broadcastEvent("conversation.updated", {
        conversation: {
          ...conversation,
          assigned_user_id: conversation.assigned_user_id || currentUser.id,
          assigned_user_name: conversation.assigned_user_name || currentUser.name,
          status: "OPEN",
          last_message: "Imagens enviadas",
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      });

      return res.json({
        success: true,
        messages: savedMessages
      });

    } catch (error: any) {
      console.error("[SEND IMAGES BATCH ERROR]", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao processar lote de imagens."
      });
    }
  });

  app.get("/api/debug/media", async (req, res) => {
    try {
      let sharpAvailable = false;
      try {
        sharpAvailable = typeof sharp === "function" || !!sharp;
      } catch {}

      return res.json({
        success: true,
        sharpAvailable,
        bucketExists: true,
        bucketName: "chat-media",
        maxUploadMb: 20
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get("/api/debug/media/logs", async (req, res) => {
    try {
      const { data: logs, error } = await supabaseAdmin
        .from("media_debug_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        throw error;
      }

      return res.json({
        success: true,
        count: logs?.length || 0,
        logs
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post("/api/omnichannel/conversations/:id/send-audio", upload.single("file"), async (req, res) => {
    let debugLogId = null;
    let currentUser: any = null;
    const conversationId = req.params.id;
    if (!isValidUUID(conversationId)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }

    let frontendDebug = null;
    try {
      frontendDebug = req.body?.frontendDebug ? JSON.parse(req.body.frontendDebug) : null;
    } catch {
      frontendDebug = { raw: req.body?.frontendDebug || null };
    }

    try {
      currentUser = await getAuthenticatedUser(req);
    } catch (authErr) {
      console.warn("[SEND AUDIO AUTH WARNING]", authErr);
      currentUser = { id: "anonymous", name: "Agente CRM" };
    }

    try {
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

      // Safe debug log insertion
      try {
        const { data: debugInsert, error: debugInsertErr } = await supabaseAdmin
          .from("audio_debug_logs")
          .insert({
            conversation_id: conversationId,
            user_id: currentUser.id,
            user_name: currentUser.name,
            original_mime_type: originalMimeType,
            original_size: req.file.size,
            frontend_debug: frontendDebug,
            success: false
          })
          .select("id")
          .single();

        if (!debugInsertErr && debugInsert) {
          debugLogId = debugInsert.id;
        }
      } catch (dbLogErr) {
        console.error("[DB LOG INSERT WARNING]", dbLogErr);
      }

      // Convert audio buffer to MP3
      const converted = await convertAudioBufferToMp3(req.file.buffer, originalMimeType);

      const audioBase64 = converted.buffer.toString("base64");
      const audioDataUri = `data:${converted.mimeType};base64,${audioBase64}`;

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
          audio: audioDataUri,
          viewOnce: false,
          waveform: true
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
            convertedSize: converted.buffer.length,
            duration: converted.duration,
            inputAnalysis: converted.inputAnalysis,
            outputAnalysis: converted.outputAnalysis
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

      // Safe debug log completion update
      if (debugLogId) {
        try {
          await supabaseAdmin
            .from("audio_debug_logs")
            .update({
              converted_mime_type: converted.mimeType,
              converted_size: converted.buffer.length,
              duration_seconds: converted.duration,
              mean_volume: converted.outputAnalysis?.meanVolume || null,
              max_volume: converted.outputAnalysis?.maxVolume || null,
              has_audio_signal: converted.outputAnalysis?.hasAudioSignal || false,
              backend_debug: {
                inputAnalysis: converted.inputAnalysis,
                outputAnalysis: converted.outputAnalysis
              },
              zapi_response: zapiResponse,
              success: true
            })
            .eq("id", debugLogId);
        } catch (dbLogUpErr) {
          console.error("[DB LOG UPDATE WARNING]", dbLogUpErr);
        }
      }

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
        audioDebug: {
          originalMimeType,
          originalSize: req.file.size,
          convertedMimeType: converted.mimeType,
          convertedSize: converted.buffer.length,
          duration: converted.duration,
          inputAnalysis: converted.inputAnalysis,
          outputAnalysis: converted.outputAnalysis
        }
      });
    } catch (error: any) {
      console.error("[SEND AUDIO ERROR]", error);

      if (debugLogId) {
        try {
          await supabaseAdmin
            .from("audio_debug_logs")
            .update({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            })
            .eq("id", debugLogId);
        } catch (dbLogErrUp) {
          console.error("[DB LOG ERROR UPDATE WARNING]", dbLogErrUp);
        }
      }

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

  app.post("/api/admin/reset-production-data", async (req, res) => {
    try {
      // 1. Delete campaign events
      try {
        await supabaseAdmin.from('crm_campaign_events').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_campaign_events:", e); }

      // 2. Delete campaign recipients
      try {
        await supabaseAdmin.from('crm_campaign_recipients').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_campaign_recipients:", e); }

      // 3. Delete campaigns
      try {
        await supabaseAdmin.from('crm_campaigns').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_campaigns:", e); }

      // 4. Delete conversation tags
      try {
        await supabaseAdmin.from('crm_conversation_tags').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_conversation_tags:", e); }

      // 5. Delete messages
      try {
        await supabaseAdmin.from('crm_messages').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_messages:", e); }

      // 6. Delete notes
      try {
        await supabaseAdmin.from('conversation_notes').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing conversation_notes:", e); }
      try {
        await supabaseAdmin.from('crm_conversation_notes').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_conversation_notes:", e); }

      // 7. Delete conversations
      try {
        await supabaseAdmin.from('crm_conversations').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_conversations:", e); }

      // 8. Delete customers
      try {
        await supabaseAdmin.from('crm_customers').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_customers:", e); }

      // 9. Delete Webhook logs
      try {
        await supabaseAdmin.from('zapi_webhook_logs').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing zapi_webhook_logs:", e); }
      try {
        await supabaseAdmin.from('crm_webhook_logs').delete().not('id', 'is', null);
      } catch (e) { console.error("Error clearing crm_webhook_logs:", e); }

      return res.json({ 
        success: true, 
        message: "Banco de dados redefinido com sucesso! Todas as conversas, clientes, mensagens da fila, campanhas de marketing e logs de teste foram excluídos no banco de dados para o modo de Produção." 
      });
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
  app.post("/api/campaigns/upload", (req, res) => {
    upload.single("file")(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, error: "Arquivo muito grande. Limite de 25 MB." });
        }
        return res.status(400).json({ success: false, error: `Erro no upload: ${err.message}` });
      } else if (err) {
        return res.status(500).json({ success: false, error: `Erro inesperado: ${err.message}` });
      }

      const file = req.file;
      try {
        if (!file) throw new Error("Arquivo não recebido.");

        const extension = getExtensionFromMimeOrFileName(file.mimetype, file.originalname);
        const safeName = sanitizeFileName(file.originalname || `file-${Date.now()}.${extension}`);
        const datePath = new Date().toISOString().slice(0, 10);
        const storagePath = `campaigns/${datePath}/${Date.now()}-${safeName}`;

        const { error: uploadErr } = await supabaseAdmin.storage
          .from("chat-media")
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });

        if (uploadErr) throw uploadErr;

        const { data: storageData } = supabaseAdmin.storage.from("chat-media").getPublicUrl(storagePath);
        const publicUrl = storageData.publicUrl;

        return res.json({
          success: true,
          url: publicUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size
        });
      } catch (error: any) {
        console.error("[CAMPAIGN UPLOAD ERROR]", error);
        return res.status(500).json({ success: false, error: error.message });
      }
    });
  });

  app.get("/api/campaigns", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from(TABLES.campaigns)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const mapped = (data || []).map(c => mapCampaignDbToApi(c));
      return res.json({ success: true, campaigns: mapped });
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
      const { name, description, whatsapp_account_id, content, message_type, media_url, media_file_name, media_mime_type, contacts, batch_size, min_interval, max_interval } = req.body;

      if (!name || !whatsapp_account_id || !content || !contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ success: false, error: "Dados incompletos para criação da campanha" });
      }

      if (contacts.length === 0) {
        return res.status(400).json({ success: false, error: "A lista de contatos não pode estar vazia." });
      }

      const { data: campaign, error: cErr } = await supabaseAdmin.from(TABLES.campaigns).insert({
        name,
        description: description || `WhatsApp Account ID: ${whatsapp_account_id}`,
        message_text: content,
        message_type: message_type || 'text',
        media_url,
        media_file_name,
        media_mime_type,
        status: 'READY',
        total_recipients: contacts.length,
        total_pending: contacts.length,
        batch_size: batch_size || 5,
        delay_seconds: min_interval || 8,
        created_by: user.id,
        created_by_name: user.name || 'Agente'
      }).select().single();

      if (cErr) throw cErr;

      const recipients = contacts.map(c => ({
        campaign_id: campaign.id,
        name: c.name,
        phone: c.phone,
        phone_normalized: c.phone_normalized,
        status: 'PENDING'
      }));

      const chunkSize = 500;
      for (let i = 0; i < recipients.length; i += chunkSize) {
        const chunk = recipients.slice(i, i + chunkSize);
        const { error: insErr } = await supabaseAdmin.from(TABLES.campaign_recipients).insert(chunk);
        if (insErr) throw insErr;
      }

      const { error: eventErr } = await supabaseAdmin.from(TABLES.campaign_events).insert({
        campaign_id: campaign.id,
        event_type: 'campaign.created',
        message: `Campanha criada por ${user.name}`
      });
      if (eventErr) console.error("[CAMPAIGN EVENT CREATE BUILD ERROR]", eventErr);

      return res.json({ success: true, campaign: mapCampaignDbToApi(campaign) });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin.from(TABLES.campaigns).select('*').eq('id', req.params.id).single();
      if (error) throw error;
      return res.json({ success: true, campaign: mapCampaignDbToApi(data) });
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
        campaign: mapCampaignDbToApi(campaign),
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

  // --- IA Assistant / Gemini Integrated Services ---
  function getGeminiClient() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("A chave GEMINI_API_KEY do Google AI Studio não foi encontrada no ambiente. Certifique-se de preencher essa variável no painel de Segredos/Configurações.");
    }
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }

  app.post("/api/ai/suggestion", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || typeof messages !== "string" || !messages.trim()) {
        return res.status(400).json({ success: false, error: "Histórico de mensagens é obrigatório." });
      }

      console.log(`[AI Suggestion API] Request received. History length: ${messages.length} chars.`);
      console.log(`[AI Suggestion API] Snippet: "${messages.substring(0, 150)}..."`);

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Histórico da Conversa:\n${messages}\n\nPor favor, sugira uma resposta curta, profissional, acolhedora e altamente persuasiva para o agente enviar ao cliente em seguida. Retorne APENAS o texto da mensagem sugerida, de forma direta e sem explicações extras, aspas ou prefixos.`,
        config: {
          systemInstruction: "Você é um assistente virtual experiente da Viva Destinos Experience. Ajude nossos consultores de viagens a fecharem mais vendas sugerindo respostas profissionais, empáticas e focadas em conversão.",
        }
      });

      const suggestion = response.text?.trim() || "Não foi possível gerar uma sugestão.";
      console.log(`[AI Suggestion API] Result generated: "${suggestion.substring(0, 100)}..."`);
      return res.json({ success: true, suggestion });
    } catch (err: any) {
      console.error("[AI Suggestion API] Error:", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/ai/classify", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || typeof messages !== "string" || !messages.trim()) {
        return res.status(400).json({ success: false, error: "Histórico de mensagens é obrigatório." });
      }

      console.log(`[AI Classify API] Request received. History length: ${messages.length} chars.`);

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Histórico da Conversa:\n${messages}\n\nCom base na conversa acima, analise a intenção de compra do cliente e responda exclusivamente com uma destas três opções em maiúsculas: QUENTE, MORNO ou FRIO.`,
        config: {
          systemInstruction: "Você é um analista especialista em CRM de turismo na Viva Destinos Experience. Sua tarefa é analisar o sentimento e estágio do cliente.",
        }
      });

      const classification = response.text?.trim() || "MORNO";
      console.log(`[AI Classify API] Result: "${classification}"`);
      return res.json({ success: true, classification });
    } catch (err: any) {
      console.error("[AI Classify API] Error:", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.post("/api/ai/summarize", async (req, res) => {
    try {
      const { messages } = req.body;
      if (!messages || typeof messages !== "string" || !messages.trim()) {
        return res.status(400).json({ success: false, error: "Histórico de mensagens é obrigatório." });
      }

      console.log(`[AI Summarize API] Request received. History length: ${messages.length} chars.`);
      console.log(`[AI Summarize API] Input history content:\n${messages}\n--- End Input ---`);

      const client = getGeminiClient();
      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Histórico do Atendimento:\n${messages}\n\nCom base nas mensagens acima, faça um resumo ULTRACONCISO do pedido ou acordo do cliente. Foque apenas no essencial da solicitação em no máximo 2 ou 3 tópicos super curtos e diretos (ex: destino, viajantes, periodo se houver). Evite explicações longas ou saudações.`,
        config: {
          systemInstruction: "Você é um assistente virtual experiente em CRM de turismo. Seu papel é resumir o essencial das conversas de atendimento de forma extremamente direta, concisa e enxuta, sem rodeios ou parágrafos longos, focado puramente nos dados vitais do lead.",
        }
      });

      const summary = response.text?.trim() || "Não foi possível gerar um resumo.";
      console.log(`[AI Summarize API] Output Summary:\n${summary}\n--- End Output ---`);
      return res.json({ success: true, summary });
    } catch (err: any) {
      console.error("[AI Summarize API] Error:", err);
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  // --- Message Templates / Quick Replies ---
  const QUICK_REPLIES_FILE = path.join(process.cwd(), "quick_replies.json");
  const DEFAULT_QUICK_REPLIES = [
    { id: "1", shortcut: "ola", content: "Olá! Como posso ajudar você hoje?" },
    { id: "2", shortcut: "bomdia", content: "Bom dia! Seja bem-vindo à Viva Destinos. Como podemos te ajudar?" },
    { id: "3", shortcut: "boatarde", content: "Boa tarde! Seja bem-vindo à Viva Destinos. Como podemos te ajudar?" },
    { id: "4", shortcut: "site", content: "Você pode acessar nosso site oficial em: https://vivadestinos.com.br" },
    { id: "5", shortcut: "suporte", content: "Nosso suporte técnico está disponível das 9h às 18h de segunda a sexta-feira." }
  ];

  function loadFSQuickReplies() {
    if (!fs.existsSync(QUICK_REPLIES_FILE)) {
      try {
        fs.writeFileSync(QUICK_REPLIES_FILE, JSON.stringify(DEFAULT_QUICK_REPLIES, null, 2), "utf8");
      } catch (e) {
        console.error("[Quick Replies] Error writing initial file:", e);
      }
      return DEFAULT_QUICK_REPLIES;
    }
    try {
      const content = fs.readFileSync(QUICK_REPLIES_FILE, "utf8");
      return JSON.parse(content);
    } catch (e) {
      console.error("[Quick Replies] Error reading file, using defaults:", e);
      return DEFAULT_QUICK_REPLIES;
    }
  }

  function saveFSQuickReplies(replies: any[]) {
    try {
      fs.writeFileSync(QUICK_REPLIES_FILE, JSON.stringify(replies, null, 2), "utf8");
    } catch (e) {
      console.error("[Quick Replies] Error writing file:", e);
    }
  }

  let useDatabaseForQuickReplies = true;
  let hasLoggedQuickRepliesFallback = false;

  app.get("/api/quick-replies", async (req, res) => {
    if (!useDatabaseForQuickReplies) {
      const replies = loadFSQuickReplies();
      return res.json({ success: true, quickReplies: replies });
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("crm_quick_replies")
        .select("*")
        .order("shortcut", { ascending: true });

      if (error) {
        throw error;
      }
      return res.json({ success: true, quickReplies: data || [] });
    } catch (err: any) {
      useDatabaseForQuickReplies = false;
      if (!hasLoggedQuickRepliesFallback) {
        console.info("[Quick Replies API] Database table 'crm_quick_replies' is not available. Saving/loading templates locally using file storage system.");
        hasLoggedQuickRepliesFallback = true;
      }
      const replies = loadFSQuickReplies();
      return res.json({ success: true, quickReplies: replies });
    }
  });

  app.post("/api/quick-replies", async (req, res) => {
    try {
      let { shortcut, content } = req.body;
      if (!shortcut || !content) {
        return res.status(400).json({ success: false, error: "Atalho e conteúdo são obrigatórios." });
      }

      shortcut = shortcut.replace(/[\\/ ]/g, "").toLowerCase().trim();

      const newReply = {
        shortcut,
        content,
        created_at: new Date().toISOString()
      };

      try {
        if (!useDatabaseForQuickReplies) {
          throw new Error("SqlDatabaseNotAvailable");
        }
        const { data, error } = await supabaseAdmin
          .from("crm_quick_replies")
          .insert(newReply)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, quickReply: data });
      } catch (dbErr) {
        useDatabaseForQuickReplies = false;
        const replies = loadFSQuickReplies();
        const fallbackReply = {
          id: String(Date.now()),
          shortcut,
          content,
          created_at: new Date().toISOString()
        };
        replies.push(fallbackReply);
        saveFSQuickReplies(replies);
        return res.json({ success: true, quickReply: fallbackReply });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.patch("/api/quick-replies/:id", async (req, res) => {
    const { id } = req.params;
    try {
      let { shortcut, content } = req.body;
      if (shortcut) {
        shortcut = shortcut.replace(/[\\/ ]/g, "").toLowerCase().trim();
      }

      try {
        if (!useDatabaseForQuickReplies) {
          throw new Error("SqlDatabaseNotAvailable");
        }
        const { data, error } = await supabaseAdmin
          .from("crm_quick_replies")
          .update({ shortcut, content, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ success: true, quickReply: data });
      } catch (dbErr) {
        const replies = loadFSQuickReplies();
        const index = replies.findIndex((r: any) => String(r.id) === String(id));
        if (index !== -1) {
          if (shortcut) replies[index].shortcut = shortcut;
          if (content !== undefined) replies[index].content = content;
          replies[index].updated_at = new Date().toISOString();
          saveFSQuickReplies(replies);
          return res.json({ success: true, quickReply: replies[index] });
        }
        return res.status(404).json({ success: false, error: "Modelo não encontrado." });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  app.delete("/api/quick-replies/:id", async (req, res) => {
    const { id } = req.params;
    try {
      try {
        if (!useDatabaseForQuickReplies) {
          throw new Error("SqlDatabaseNotAvailable");
        }
        const { error } = await supabaseAdmin
          .from("crm_quick_replies")
          .delete()
          .eq("id", id);

        if (error) throw error;
        return res.json({ success: true });
      } catch (dbErr) {
        const replies = loadFSQuickReplies();
        const filtered = replies.filter((r: any) => String(r.id) !== String(id));
        saveFSQuickReplies(filtered);
        return res.json({ success: true });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, error: getErrorMessage(err) });
    }
  });

  // --- Conversation Tags ---
  app.get("/api/omnichannel/conversations/:id/tags", async (req, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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
    if (!isValidUUID(conversationId)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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
    if (!isValidUUID(conversationId)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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
    if (!isValidUUID(id)) {
      return res.status(400).json({ success: false, error: "Identificador de conversação inválido." });
    }
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
        .maybeSingle();

      // 2. Get last interaction
      const { data: lastMsg } = await supabaseAdmin
        .from(TABLES.messages)
        .select('created_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

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

  app.post("/api/zapi/sync-and-check-connections", async (req, res) => {
    try {
      const list = await loadChannelsDBOrFile();
      const results = [];

      // Check if environment variables are set and not represented in the loaded list
      const hasEnvZapi = list.some((c: any) => c.instance_id === process.env.ZAPI_INSTANCE_ID && (c.type === "whatsapp_zapi" || c.provider_type === "zapi"));
      if (!hasEnvZapi && process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_INSTANCE_TOKEN) {
        list.push({
          id: "env-zapi",
          name: "WhatsApp Z-API Principal (Config Ambiente)",
          type: "whatsapp_zapi",
          provider_type: "zapi",
          instance_id: process.env.ZAPI_INSTANCE_ID,
          instance_token: process.env.ZAPI_INSTANCE_TOKEN,
          client_token: process.env.ZAPI_CLIENT_TOKEN || "",
          is_active: true,
          status: "DISCONNECTED",
          connected_phone: ""
        });
      }

      for (const chan of list) {
        // Only target Z-API channels
        if ((chan.type === "whatsapp_zapi" || chan.provider_type === "zapi" || String(chan.type || "").includes("zapi")) && chan.instance_id && chan.instance_token) {
          try {
            const raw = await getZapiStatusRaw({
              query: {
                instanceId: chan.instance_id,
                instanceToken: chan.instance_token,
                clientToken: chan.client_token
              }
            });
            const normalized = normalizeZapiStatus(raw);
            const isConnected = normalized.connected;
            const phoneNum = normalized.phone || "";

            let updated = false;
            const prevStatus = chan.status;
            const prevPhone = chan.connected_phone;

            const nextStatus = isConnected ? "CONNECTED" : "DISCONNECTED";

            // If found connected, make sure it is marked connected and is active so it won't be hidden
            if (isConnected) {
              chan.status = "CONNECTED";
              if (phoneNum) {
                chan.connected_phone = phoneNum;
                chan.phone_number = phoneNum;
              }
              // Automatically activate if it's connected and we had no active channel, or if it was the recovered one
              const hasAnyActive = list.some((c: any) => c.is_active && c.id !== chan.id);
              if (!hasAnyActive || chan.id === "env-zapi") {
                chan.is_active = true;
              }
              await saveChannelToDBOrFile(chan);
              updated = true;
            } else if (chan.status !== nextStatus || prevPhone !== phoneNum) {
              chan.status = nextStatus;
              if (phoneNum) {
                chan.connected_phone = phoneNum;
                chan.phone_number = phoneNum;
              }
              await saveChannelToDBOrFile(chan);
              updated = true;
            }

            results.push({
              id: chan.id,
              name: chan.name,
              instance_id: chan.instance_id,
              prevStatus,
              newStatus: chan.status,
              connectedPhone: phoneNum || prevPhone,
              updated,
              connected: isConnected,
              details: "Status sincronizado com a Z-API diretamente."
            });
          } catch (err: any) {
            results.push({
              id: chan.id,
              name: chan.name,
              instance_id: chan.instance_id,
              error: err.message || String(err),
              connected: false,
              updated: false
            });
          }
        }
      }

      return res.json({
        success: true,
        message: "Status dos canais verificado e sincronizado com a Z-API.",
        channels: results
      });
    } catch (error: any) {
      console.error("[SYNC AND CHECK CONNECTIONS ERROR]:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/zapi/config-status", async (req, res) => {
    const config = await getZapiConfig(req);
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

  // Omnichannel: Delete message (for everyone or for me)
  app.post("/api/omnichannel/conversations/:id/messages/:messageId/delete", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const conversationId = req.params.id;
      const messageDbId = req.params.messageId;
      const owner = req.body.owner !== false; // defaults to true (delete for everyone)

      // Fetch message from DB
      const { data: msg, error: msgError } = await supabaseAdmin
        .from("crm_messages")
        .select("*")
        .eq("id", messageDbId)
        .single();

      if (msgError || !msg) {
        return res.status(404).json({ success: false, error: "Mensagem não encontrada." });
      }

      let zapiResponse = null;
      if (msg.external_message_id && !msg.external_message_id.startsWith("sent-")) {
        try {
          const phone = normalizeBrazilPhone(msg.customer_phone_normalized || msg.to_phone);
          // Call Z-API to delete
          zapiResponse = await callZapi("/delete-message", {
            phone,
            messageId: msg.external_message_id,
            owner
          });
        } catch (zapiErr: any) {
          console.error("[ZAPI DELETE ERROR] Failed to delete message from WhatsApp:", zapiErr);
          // If Z-API tells us that the message is too old or already deleted, we should still allow deleting from the CRM
        }
      }

      // Update database status
      const { data: updatedMsg, error: updateError } = await supabaseAdmin
        .from("crm_messages")
        .update({
          status: "deleted",
          raw_payload: { ...(msg.raw_payload || {}), deletion_zapi_response: zapiResponse, deleted_by: currentUser.name }
        })
        .eq("id", messageDbId)
        .select("*")
        .single();

      if (updateError) throw updateError;

      // Broadcast to update other CRM client UIs in real-time
      if (typeof broadcastEvent === "function") {
        broadcastEvent("message.received", {
          conversationId,
          message: updatedMsg
        });
      }

      return res.json({ success: true, data: updatedMsg });
    } catch (err: any) {
      console.error("[DELETE MESSAGE ROUTE ERROR]", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Omnichannel: Edit text message
  app.post("/api/omnichannel/conversations/:id/messages/:messageId/edit", async (req, res) => {
    try {
      const currentUser = await getAuthenticatedUser(req);
      const conversationId = req.params.id;
      const messageDbId = req.params.messageId;
      const newText = String(req.body.text || "").trim();

      if (!newText) {
        return res.status(400).json({ success: false, error: "O conteúdo da mensagem não pode ser vazio." });
      }

      // Fetch message from DB
      const { data: msg, error: msgError } = await supabaseAdmin
        .from("crm_messages")
        .select("*")
        .eq("id", messageDbId)
        .single();

      if (msgError || !msg) {
        return res.status(404).json({ success: false, error: "Mensagem não encontrada." });
      }

      let zapiResponse = null;
      if (msg.external_message_id && !msg.external_message_id.startsWith("sent-")) {
        try {
          const phone = normalizeBrazilPhone(msg.customer_phone_normalized || msg.to_phone);
          // Call Z-API to edit
          zapiResponse = await callZapi("/edit-text-message", {
            phone,
            messageId: msg.external_message_id,
            text: newText
          });
        } catch (zapiErr: any) {
          console.error("[ZAPI EDIT ERROR] Failed to edit message on WhatsApp:", zapiErr);
          return res.status(400).json({ 
            success: false, 
            error: "Falha de edição no WhatsApp. Verifique se o tempo limite de edição da mensagem expirou (15 minutos)." 
          });
        }
      }

      // Update database status
      const { data: updatedMsg, error: updateError } = await supabaseAdmin
        .from("crm_messages")
        .update({
          content: newText,
          raw_payload: { ...(msg.raw_payload || {}), edit_zapi_response: zapiResponse, edited_by: currentUser.name }
        })
        .eq("id", messageDbId)
        .select("*")
        .single();

      if (updateError) throw updateError;

      // Broadcast to update other CRM client UIs in real-time
      if (typeof broadcastEvent === "function") {
        broadcastEvent("message.received", {
          conversationId,
          message: updatedMsg
        });
      }

      return res.json({ success: true, data: updatedMsg });
    } catch (err: any) {
      console.error("[EDIT MESSAGE ROUTE ERROR]", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  function maskSensitiveFields(c: any) {
    if (!c) return c;
    const cloned = { ...c };
    if (cloned.instance_token && typeof cloned.instance_token === 'string' && cloned.instance_token.length > 15) {
      cloned.instance_token = cloned.instance_token.substring(0, 8) + "..." + cloned.instance_token.substring(cloned.instance_token.length - 8);
    }
    if (cloned.meta_app_secret && typeof cloned.meta_app_secret === 'string' && cloned.meta_app_secret.length > 6) {
      cloned.meta_app_secret = "..." + cloned.meta_app_secret.substring(cloned.meta_app_secret.length - 4);
    }
    return cloned;
  }

  app.get("/api/auth/facebook/callback", async (req: any, res: any) => {
    const { code, error, error_description, state } = req.query;

    console.log("[META OAUTH CALLBACK] Received query params:", {
      code: code ? "PRESENT" : "ABSENT",
      error: error || null,
      error_description: error_description || null,
      state: state || null
    });

    const redirectBackUrl = "https://vivadestinosexperience.online/app/ajustes/canais";

    if (error) {
      console.error("[META OAUTH ERROR CALLBACK] Error returned from Meta:", error, error_description);
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Conexão com a Meta Falhou</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Inter', sans-serif; }
          </style>
        </head>
        <body class="bg-[#0f172a] text-slate-100 flex items-center justify-center min-h-screen p-6">
          <div class="max-w-md w-full bg-[#1e293b] rounded-[2.5rem] border border-slate-800 shadow-2xl p-8 text-center space-y-6">
            <div class="mx-auto w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center text-3xl">
              ⚠️
            </div>
            <div class="space-y-2">
              <h2 class="text-xl font-black uppercase tracking-tight text-white">Falha na Integração</h2>
              <p class="text-xs text-slate-400">Ocorreu um problema ao se conectar com o WhatsApp Oficial da Meta.</p>
            </div>
            <div class="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 text-left space-y-2.5">
              <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">Detalhes do Erro</div>
              <div class="text-xs font-semibold text-rose-400">${error || 'Erro Desconhecido'}</div>
              <div class="text-[10px] text-slate-400 leading-relaxed">${error_description || 'O processo de autorização ou cadastro foi cancelado ou interrompido.'}</div>
            </div>
            <a href="${redirectBackUrl}" class="inline-flex items-center justify-center w-full py-4 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-950/25 transition-all">
              Voltar para Configurações
            </a>
          </div>
        </body>
        </html>
      `);
    }

    if (!code) {
      console.warn("[META OAUTH CALLBACK] Missing both code and error parameters.");
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Conexão Inválida</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Inter', sans-serif; }
          </style>
        </head>
        <body class="bg-[#0f172a] text-slate-100 flex items-center justify-center min-h-screen p-6">
          <div class="max-w-md w-full bg-[#1e293b] rounded-[2.5rem] border border-slate-800 shadow-2xl p-8 text-center space-y-6">
            <div class="mx-auto w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center text-3xl">
              ❓
            </div>
            <div class="space-y-2">
              <h2 class="text-xl font-black uppercase tracking-tight text-white">Requisição Inválida</h2>
              <p class="text-xs text-slate-400">Nenhum código de autorização foi enviado pela Meta.</p>
            </div>
            <a href="${redirectBackUrl}" class="inline-flex items-center justify-center w-full py-4 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-950/25 transition-all">
              Voltar para Configurações
            </a>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const appId = process.env.META_APP_ID || "1590400272057580";
      const appSecret = process.env.META_APP_SECRET;
      const redirectUri = "https://vivadestinosexperience.online/api/auth/facebook/callback";

      console.log(`[META OAUTH CALLBACK] Exchanging code via app_id: ${appId}`);

      if (!appSecret) {
        throw new Error("Credencial secreta (META_APP_SECRET) não foi configurada nas variáveis de ambiente do seu servidor.");
      }

      const tokenUrl = `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
      const tokenRes = await fetch(tokenUrl);
      const tokenData: any = await tokenRes.json();

      if (!tokenRes.ok) {
        console.error("[META OAUTH CALLBACK] Token exchange failed:", tokenData);
        throw new Error(tokenData?.error?.message || "Falha na troca do código de autorização com os servidores da Meta.");
      }

      const accessToken = tokenData.access_token;
      if (!accessToken) {
        throw new Error("Nenhum token de acesso foi retornado pela API da Meta no backend.");
      }

      console.log("[META OAUTH CALLBACK] Successfully retrieved access token. Commencing metadata discovery...");

      // 1. Discover WhatsApp Business Accounts (WABA)
      const wabaUrl = `https://graph.facebook.com/v20.0/me/whatsapp_business_accounts?access_token=${accessToken}`;
      const wabaRes = await fetch(wabaUrl);
      const wabaData: any = await wabaRes.json();
      
      let wabaId = "";
      let phoneId = "";
      let phoneNumber = "";
      let verifiedName = "";
      let qualityRating = "";
      let businessId = "";

      if (wabaRes.ok && wabaData?.data && wabaData.data.length > 0) {
        const firstWaba = wabaData.data[0];
        wabaId = firstWaba.id;
        console.log(`[META OAUTH CALLBACK] Discovered WABA ID: ${wabaId}`);

        // Try to fetch additional details of WABA to get business details
        try {
          const detailUrl = `https://graph.facebook.com/v20.0/${wabaId}?fields=id,name,business&access_token=${accessToken}`;
          const detailRes = await fetch(detailUrl);
          const detailData: any = await detailRes.json();
          if (detailRes.ok && detailData?.business) {
            businessId = detailData.business.id;
            console.log(`[META OAUTH CALLBACK] Discovered Business ID: ${businessId}`);
          }
        } catch (detailErr) {
          console.error("[META OAUTH CALLBACK] Error fetching WABA details:", detailErr);
        }

        // 2. Discover Phone Numbers
        const phoneUrl = `https://graph.facebook.com/v20.0/${wabaId}/phone_numbers?access_token=${accessToken}`;
        const phoneRes = await fetch(phoneUrl);
        const phoneData: any = await phoneRes.json();

        if (phoneRes.ok && phoneData?.data && phoneData.data.length > 0) {
          const firstPhone = phoneData.data[0];
          phoneId = firstPhone.id;
          phoneNumber = firstPhone.display_phone_number || "";
          verifiedName = firstPhone.verified_name || "";
          qualityRating = firstPhone.quality_rating || "";
          console.log(`[META OAUTH CALLBACK] Discovered Phone ID: ${phoneId}, Number: ${phoneNumber}`);
        } else {
          console.warn("[META OAUTH CALLBACK] No phone numbers found connected to this WABA account.");
        }
      } else {
        console.warn("[META OAUTH CALLBACK] No WhatsApp Business Accounts found connected to this Facebook User.");
      }

      // If phoneId exists, get phone properties (verified_name and quality_rating)
      if (phoneId && !verifiedName) {
        try {
          const phoneDetailRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}?fields=id,display_phone_number,verified_name,quality_rating&access_token=${accessToken}`);
          if (phoneDetailRes.ok) {
            const phoneDetail: any = await phoneDetailRes.json();
            verifiedName = phoneDetail.verified_name || "";
            qualityRating = phoneDetail.quality_rating || "";
          }
        } catch (phoneDetailErr) {
          console.error("[META OAUTH CALLBACK] Error fetching phone details:", phoneDetailErr);
        }
      }

      // 3. Create or update the channel in database or file
      const channels = await loadChannelsDBOrFile();
      let metaChannel = channels.find((c: any) => c.type === "whatsapp_meta");

      if (metaChannel) {
        metaChannel.instance_token = accessToken;
        metaChannel.instance_id = phoneId || metaChannel.instance_id || "";
        metaChannel.client_token = wabaId || metaChannel.client_token || "";
        metaChannel.connected_phone = phoneNumber || metaChannel.connected_phone || "";
        metaChannel.status = "CONNECTED";
        metaChannel.is_active = true;
        
        metaChannel.meta_whatsapp_status = "success";
        metaChannel.meta_whatsapp_display_phone_number = phoneNumber || metaChannel.meta_whatsapp_display_phone_number || "";
        metaChannel.meta_whatsapp_verified_name = verifiedName || metaChannel.meta_whatsapp_verified_name || "";
        metaChannel.meta_whatsapp_quality_rating = qualityRating || metaChannel.meta_whatsapp_quality_rating || "";
        metaChannel.meta_whatsapp_last_error = null;
        metaChannel.meta_whatsapp_last_test_at = new Date().toISOString();
        
        metaChannel.meta_business_id = businessId || metaChannel.meta_business_id || "";
        metaChannel.meta_waba_id = wabaId || metaChannel.meta_waba_id || "";
        metaChannel.meta_phone_number_id = phoneId || metaChannel.meta_phone_number_id || "";
        metaChannel.meta_app_id = appId;
        metaChannel.meta_app_secret = appSecret;
        metaChannel.meta_verify_token = "viva_meta_verify_token_2026";
        metaChannel.updated_at = new Date().toISOString();
        
        await saveChannelToDBOrFile(metaChannel);
        console.log(`[META OAUTH CALLBACK] Updated existing Meta WhatsApp Channel with ID ${metaChannel.id}`);
      } else {
        const newChannel = {
          id: crypto.randomUUID(),
          name: "WhatsApp Oficial (Meta)",
          type: "whatsapp_meta",
          instance_id: phoneId || "",
          instance_token: accessToken,
          client_token: wabaId || "",
          connected_phone: phoneNumber || "",
          status: "CONNECTED",
          is_active: true,
          
          meta_whatsapp_status: "success",
          meta_whatsapp_display_phone_number: phoneNumber || "",
          meta_whatsapp_verified_name: verifiedName || "",
          meta_whatsapp_quality_rating: qualityRating || "",
          meta_whatsapp_last_test_at: new Date().toISOString(),
          
          meta_business_id: businessId || "",
          meta_waba_id: wabaId || "",
          meta_phone_number_id: phoneId || "",
          meta_app_id: appId,
          meta_app_secret: appSecret,
          meta_verify_token: "viva_meta_verify_token_2026",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await saveChannelToDBOrFile(newChannel);
        console.log(`[META OAUTH CALLBACK] Created new Meta WhatsApp Channel with ID ${newChannel.id}`);
      }

      // Return connection validation screen
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Conectado ao WhatsApp Oficial com Sucesso!</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
          <meta http-equiv="refresh" content="3;url=${redirectBackUrl}?metaStatus=success">
          <style>
            body { font-family: 'Inter', sans-serif; }
          </style>
        </head>
        <body class="bg-[#0f172a] text-slate-100 flex items-center justify-center min-h-screen p-6">
          <div class="max-w-md w-full bg-[#1e293b] rounded-[2.5rem] border border-slate-800 shadow-2xl p-8 text-center space-y-6 animate-fade-in">
            <div class="mx-auto w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl">
              ✓
            </div>
            <div class="space-y-2">
              <h2 class="text-xl font-extrabold uppercase tracking-tight text-white leading-tight">Canal Conectado com Sucesso!</h2>
              <p class="text-xs text-slate-400">Você já está credenciado com o WhatsApp Oficial Cloud da Meta.</p>
            </div>
            
            <div class="bg-slate-900/40 rounded-3xl p-5 border border-slate-800 text-left space-y-3">
              <div class="text-[9px] font-black uppercase tracking-widest text-[#1877F2]">Dados Recuperados</div>
              
              <div class="grid grid-cols-2 gap-3 text-[10px] leading-relaxed">
                <div>
                  <span class="text-slate-500 block text-[8px] uppercase font-bold tracking-wider">NOME VERIFICADO</span>
                  <span class="text-white font-semibold truncate block">${verifiedName || 'WhatsApp Business Name'}</span>
                </div>
                <div>
                  <span class="text-slate-500 block text-[8px] uppercase font-bold tracking-wider">TELEFONE OFICIAL</span>
                  <span class="text-white font-semibold truncate block">${phoneNumber || 'Pendente de Configuração'}</span>
                </div>
                <div>
                  <span class="text-slate-500 block text-[8px] uppercase font-bold tracking-wider">WABA ID</span>
                  <span class="text-white font-semibold truncate block">${wabaId || 'Não localizado'}</span>
                </div>
                <div>
                  <span class="text-slate-500 block text-[8px] uppercase font-bold tracking-wider">PHONE ID</span>
                  <span class="text-white font-semibold truncate block">${phoneId || 'Não localizado'}</span>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-center gap-2 text-slate-400 text-xs">
              <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>Redirecionando em instantes para o CRM...</span>
            </div>

            <a href="${redirectBackUrl}?metaStatus=success" class="inline-flex items-center justify-center w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/25 transition-all">
              Prosseguir no Painel
            </a>
          </div>
        </body>
        </html>
      `);

    } catch (err: any) {
      console.error("[META OAUTH CALLBACK] Error conducting token exchange & discovery:", err);
      return res.send(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Erro Interno na Conexão Meta</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Inter', sans-serif; }
          </style>
        </head>
        <body class="bg-[#0f172a] text-slate-100 flex items-center justify-center min-h-screen p-6">
          <div class="max-w-md w-full bg-[#1e293b] rounded-[2.5rem] border border-slate-800 shadow-2xl p-8 text-center space-y-6">
            <div class="mx-auto w-16 h-16 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center text-3xl">
              ✕
            </div>
            <div class="space-y-2">
              <h2 class="text-xl font-black uppercase tracking-tight text-white leading-tight">Erro na Integração</h2>
              <p class="text-xs text-slate-400">Ocorreu um problema no processamento do token do Facebook.</p>
            </div>
            <div class="bg-slate-900/50 rounded-2xl p-4 border border-slate-800 text-left space-y-2.5">
              <div class="text-[9px] font-black uppercase tracking-widest text-slate-500">Detalhes Técnicos</div>
              <div class="text-xs text-rose-400 font-bold whitespace-pre-wrap">${err.message || err}</div>
            </div>
            <a href="${redirectBackUrl}" class="inline-flex items-center justify-center w-full py-4 bg-[#1877F2] hover:bg-[#166FE5] text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-950/25 transition-all">
              Tentar Novamente
            </a>
          </div>
        </body>
        </html>
      `);
    }
  });

  app.get("/api/channels", async (req, res) => {
    try {
      const list = await loadChannelsDBOrFile();
      const active = list.find((c: any) => c.is_active);
      if (active && active.type === "whatsapp_zapi") {
        try {
          const raw = await getZapiStatusRaw();
          const normalized = normalizeZapiStatus(raw);
          const currentStatus = normalized.connected ? "CONNECTED" : "DISCONNECTED";
          if (active.status !== currentStatus) {
            active.status = currentStatus;
            if (normalized.phone) {
              active.connected_phone = normalized.phone;
            }
            await saveChannelToDBOrFile(active);
          }
        } catch (zapiErr) {
          console.log("[CHANNELS ACTIVE SYNC REFRESH SKIP]:", zapiErr instanceof Error ? zapiErr.name : zapiErr);
        }
      }

      // Appends environment based Z-API channel fallback if not represented in database
      const hasEnvZapi = list.some((c: any) => c.id === "env-zapi" || (c.instance_id === process.env.ZAPI_INSTANCE_ID && c.type === "whatsapp_zapi"));
      if (!hasEnvZapi && process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_INSTANCE_TOKEN) {
        let envStatus = "DISCONNECTED";
        let envPhone = "";
        try {
          const rawStatus = await getZapiStatusRaw();
          const normalized = normalizeZapiStatus(rawStatus);
          envStatus = normalized.connected ? "CONNECTED" : "DISCONNECTED";
          envPhone = normalized.phone || "";
        } catch (zapiErr) {
          console.log("[CHANNELS ENV ZAPI STATUS ERR]:", zapiErr instanceof Error ? zapiErr.name : zapiErr);
        }

        list.push({
          id: "env-zapi",
          name: "WhatsApp Z-API Principal",
          type: "whatsapp_zapi",
          instance_id: process.env.ZAPI_INSTANCE_ID,
          instance_token: process.env.ZAPI_INSTANCE_TOKEN,
          client_token: process.env.ZAPI_CLIENT_TOKEN || "",
          is_active: true,
          status: envStatus,
          connected_phone: envPhone
        });
      }

      const safeList = list.map(c => maskSensitiveFields(c));
      return res.json({ success: true, channels: safeList });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get("/api/channels/active", async (req, res) => {
    try {
      const list = await loadChannelsDBOrFile();
      const active = list.find((c: any) => c.is_active);
      if (active) {
        try {
          const raw = await getZapiStatusRaw();
          const normalized = normalizeZapiStatus(raw);
          const currentStatus = normalized.connected ? "CONNECTED" : "DISCONNECTED";
          if (active.status !== currentStatus) {
            active.status = currentStatus;
            if (normalized.phone) {
              active.connected_phone = normalized.phone;
            }
            await saveChannelToDBOrFile(active);
          }
        } catch (zapiErr) {
          console.log("[ACTIVE CHANNEL ZAPI SYNC SKIP / NOT CONFIG]:", zapiErr instanceof Error ? zapiErr.name : zapiErr);
        }
        return res.json({ success: true, channel: maskSensitiveFields(active) });
      } else {
        // Fallback das env
        let envStatus = "DISCONNECTED";
        let envPhone = "";
        try {
          const raw = await getZapiStatusRaw();
          const normalized = normalizeZapiStatus(raw);
          envStatus = normalized.connected ? "CONNECTED" : "DISCONNECTED";
          envPhone = normalized.phone || "";
        } catch (zapiErr) {
          console.log("[ENV FALLBACK STATUS SYNC SKIP / NOT CONFIG]:", zapiErr instanceof Error ? zapiErr.name : zapiErr);
        }

        const envConfig = {
          id: "env-fallback",
          name: "Canal Padrão (Ambiente)",
          type: "whatsapp_zapi",
          instance_id: process.env.ZAPI_INSTANCE_ID || "",
          instance_token: process.env.ZAPI_INSTANCE_TOKEN || "",
          client_token: process.env.ZAPI_CLIENT_TOKEN || "",
          is_active: true,
          status: envStatus,
          connected_phone: envPhone
        };
        return res.json({ success: true, channel: maskSensitiveFields(envConfig) });
      }
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post("/api/channels", async (req, res) => {
    try {
      const { name, type, instance_id, instance_token, client_token, is_active, meta_app_id, meta_app_secret, meta_verify_token } = req.body;
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
        is_active: is_active !== undefined ? is_active : true,
        meta_app_id: meta_app_id || "",
        meta_app_secret: meta_app_secret || "",
        meta_verify_token: meta_verify_token || ""
      };
      await saveChannelToDBOrFile(channel);
      return res.json({ success: true, channel: maskSensitiveFields(channel) });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.patch("/api/channels/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const list = await loadChannelsDBOrFile();
      let existing = list.find((c: any) => c.id === id);
      if (!existing && id === 'env-fallback') {
        existing = {
          id: "env-fallback",
          name: "Canal Padrão (Ambiente)",
          type: "whatsapp_zapi",
          instance_id: process.env.ZAPI_INSTANCE_ID || "env_default_id",
          instance_token: process.env.ZAPI_INSTANCE_TOKEN || "env_default_token",
          client_token: process.env.ZAPI_CLIENT_TOKEN || "",
          is_active: true,
          status: "DISCONNECTED",
          connected_phone: ""
        };
      }
      if (!existing) {
        return res.status(404).json({ success: false, error: "Canal não encontrado." });
      }
      const updates = { ...req.body };
      if (updates.instance_token && updates.instance_token.includes("...")) {
        delete updates.instance_token;
      }
      if (updates.meta_app_secret && updates.meta_app_secret.includes("...")) {
        delete updates.meta_app_secret;
      }
      const updated = {
        ...existing,
        ...updates,
        id
      };
      await saveChannelToDBOrFile(updated);
      return res.json({ success: true, channel: maskSensitiveFields(updated) });
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

  app.post("/api/meta/whatsapp/test-connection", async (req, res) => {
    const channelId = req.body.channelId || "";
    let meta_access_token = req.body.instanceToken || process.env.META_ACCESS_TOKEN || "";
    const meta_phone_number_id = req.body.instanceId || process.env.META_PHONE_NUMBER_ID || "";
    const meta_waba_id = req.body.clientToken || process.env.META_WABA_ID || "";
    const meta_app_id = req.body.appId || process.env.META_APP_ID || "";
    let meta_app_secret = req.body.appSecret || process.env.META_APP_SECRET || "";
    const meta_verify_token = req.body.verifyToken || process.env.META_VERIFY_TOKEN || "";
    const meta_graph_version = req.body.graphVersion || process.env.META_GRAPH_VERSION || "v25.0";
    const test_phone = req.body.testPhone || "";

    // Resolve masked tokens from saved channels if tested again from UI
    if ((meta_access_token.includes("...") || meta_app_secret.includes("...")) && channelId) {
      try {
        const list = await loadChannelsDBOrFile();
        const existing = list.find((c: any) => c.id === channelId);
        if (existing) {
          if (meta_access_token.includes("...") && existing.instance_token) {
            meta_access_token = existing.instance_token;
          }
          if (meta_app_secret.includes("...") && existing.meta_app_secret) {
            meta_app_secret = existing.meta_app_secret;
          }
        }
      } catch (err) {
        console.error("[META TEST] Erro ao carregar credenciais sem máscara para teste:", err);
      }
    }

    const logSecure = (testName: string, endpoint: string, isSuccess: boolean, errorDetails?: any) => {
      const timestamp = new Date().toISOString();
      const sanitizedResponse = errorDetails ? JSON.stringify(errorDetails).replace(new RegExp(meta_access_token, "g"), "***") : "OK";
      console.log(`[META TEST LOG] [${timestamp}] - Test: ${testName} - Endpoint: ${endpoint} - Success: ${isSuccess} - Response: ${sanitizedResponse}`);
    };

    const mapMetaErrorResponse = (errData: any): string => {
      const errorMsg = errData?.message || "";
      const code = errData?.code;
      const subcode = errData?.error_subcode;

      if (code === 131005) {
        return "Acesso Negado (Erro #131005): O token ou canal não possui permissão para enviar mensagens. Caso esteja usando uma conta de teste (Sandbox/Desenvolvedor/Temporária), você DEVE adicionar o seu telefone de teste no painel da Meta Developers como número de destinatário autorizado antes de enviar o template, ou garantir que o token permanente possua a permissão 'whatsapp_business_messaging'.";
      }
      if (errorMsg.includes("Unsupported post request") || errorMsg.includes("Object with ID") || subcode === 33) {
        return "Unsupported post request. Object with ID does not exist, cannot be loaded due to missing permissions, or does not support this operation. Por favor, confira se o ID informado é realmente o Phone Number ID e se o token tem permissões totais no WhatsApp.";
      }
      if (code === 190 && subcode === 463) {
        return "Sessão Expirada (Erro #190, Subcode #463): O seu token de acesso da Meta expirou. Isso geralmente ocorre ao usar um Token de Acesso Temporário (válido por apenas 24h). Você DEVE criar um Token de Acesso Permanente (Permanent System User Token) com validade ilimitada no painel da Meta Developers e Meta Business Suite.";
      }
      if (code === 190 || errorMsg.includes("expired") || errorMsg.includes("Session has expired") || errorMsg.includes("validating access token")) {
        return "Sessão Expirada ou Token Inválido (Erro #190): O token de acesso da Meta expirou ou é de sessão curta. Por favor, gere um Token de Acesso Permanente de Usuário do Sistema com validade ilimitada nas configurações do seu Business Manager da Meta.";
      }
      if (errData?.type === "OAuthException") {
        return "Erro de Autenticação (OAuthException): Token inválido, expirado ou com escopos insuficientes. Gere um token permanente com permissões completas (whatsapp_business_management, whatsapp_business_messaging) e sem data de expiração.";
      }
      if (code === 10 || code === 200) {
        return "Permissão insuficiente. Por favor, conceda acesso total da Conta do WhatsApp ao Usuário do Sistema da Meta.";
      }
      if (code === 100) {
        return "Parâmetro inválido. Verifique se o WABA ID, Phone Number ID e a versão da API estão corretos.";
      }
      return errorMsg || "Erro desconhecido retornado da API da Meta.";
    };

    try {
      // Basic fields existence check
      if (!meta_access_token) {
        return res.status(400).json({ success: false, error: "Token de Acesso Permanente é obrigatório." });
      }
      if (!meta_phone_number_id) {
        return res.status(400).json({ success: false, error: "Phone Number ID é obrigatório." });
      }
      if (!meta_waba_id) {
        return res.status(400).json({ success: false, error: "WABA ID é obrigatório." });
      }

      // Test 1: Validate Phone Number ID
      const firstUrl = `https://graph.facebook.com/${meta_graph_version}/${meta_phone_number_id}?fields=id,display_phone_number,verified_name,quality_rating`;
      const firstRes = await fetch(firstUrl, {
        headers: { "Authorization": `Bearer ${meta_access_token}` }
      });
      const firstData: any = await firstRes.json();

      if (!firstRes.ok) {
        const errorMsg = mapMetaErrorResponse(firstData?.error);
        logSecure("Validate Phone ID", firstUrl, false, firstData?.error);
        
        // Save failure to channel
        if (channelId) {
          const list = await loadChannelsDBOrFile();
          const chan = list.find((c: any) => c.id === channelId);
          if (chan) {
            chan.meta_whatsapp_status = "error";
            chan.meta_whatsapp_last_error = errorMsg;
            chan.meta_whatsapp_last_test_at = new Date().toISOString();
            await saveChannelToDBOrFile(chan);
          }
        }

        return res.status(400).json({
          success: false,
          error: errorMsg,
          testResults: { step1: "failed", step2: "skipped", step3: "skipped" }
        });
      }

      logSecure("Validate Phone ID", firstUrl, true, firstData);

      const verified_name = firstData.verified_name || "N/A";
      const display_phone_number = firstData.display_phone_number || "N/A";
      const quality_rating = firstData.quality_rating || "N/A";

      // Test 2: Check if phone number belongs to WABA
      const secondUrl = `https://graph.facebook.com/${meta_graph_version}/${meta_waba_id}/phone_numbers`;
      const secondRes = await fetch(secondUrl, {
        headers: { "Authorization": `Bearer ${meta_access_token}` }
      });
      const secondData: any = await secondRes.json();

      if (!secondRes.ok) {
        const errorMsg = mapMetaErrorResponse(secondData?.error);
        logSecure("List WABA Numbers", secondUrl, false, secondData?.error);
        return res.status(400).json({
          success: false,
          error: `Erro ao obter números da WABA: ${errorMsg}`,
          testResults: { step1: "passed", step2: "failed", step3: "skipped" }
        });
      }

      logSecure("List WABA Numbers", secondUrl, true, `Found ${secondData?.data?.length || 0} numbers.`);

      const numbersList = secondData?.data || [];
      const belongsToWaba = numbersList.some((n: any) => String(n.id) === String(meta_phone_number_id));

      if (!belongsToWaba) {
        const errorMsg = "O Phone Number ID informado não pertence à WABA configurada.";
        logSecure("Link Check", "Comparison Logic", false, errorMsg);
        return res.status(400).json({
          success: false,
          error: errorMsg,
          testResults: { step1: "passed", step2: "failed", step3: "skipped" }
        });
      }

      // Test 3: Debug token scopes (optional) -> Do not block active channel tests
      let tokenScopes: string[] = [];
      let tokenDebugPassed = true;
      let tokenErrorMsg = "";

      if (meta_app_id && meta_app_secret) {
        const debugUrl = `https://graph.facebook.com/debug_token?input_token=${meta_access_token}&access_token=${meta_app_id}|${meta_app_secret}`;
        const debugRes = await fetch(debugUrl);
        const debugData: any = await debugRes.json();

        if (!debugRes.ok || !debugData?.data?.is_valid) {
          tokenDebugPassed = false;
          tokenErrorMsg = "O token da Meta está inválido, expirado ou sem as permissões necessárias. Gere um novo token permanente pelo Usuário do Sistema com acesso total à Conta do WhatsApp.";
          logSecure("Debug Token", debugUrl, false, debugData?.error || "Token Invalid");
        } else {
          tokenScopes = debugData?.data?.scopes || [];
          const hasMessaging = tokenScopes.includes("whatsapp_business_messaging");
          const hasManagement = tokenScopes.includes("whatsapp_business_management");

          if (!hasMessaging || !hasManagement) {
            tokenDebugPassed = false;
            tokenErrorMsg = "O token da Meta está inválido, expirado ou sem as permissões necessárias. Gere um novo token permanente pelo Usuário do Sistema com acesso total à Conta do WhatsApp.";
            logSecure("Debug Token Scopes Check", debugUrl, false, `Scopes missing. Scopes found: ${tokenScopes.join(", ")}`);
          } else {
            logSecure("Debug Token", debugUrl, true, "Token validation and permissions passed.");
          }
        }
      }

      // Webhook Verify Token Checklist Verify
      const isWebhookConfigured = !!meta_verify_token;

      // Optional step: hello_world template message
      let templateResult: any = null;
      if (test_phone) {
        const sendUrl = `https://graph.facebook.com/${meta_graph_version}/${meta_phone_number_id}/messages`;
        const cleanSendPhone = test_phone.replace(/\D/g, "");
        const sendRes = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${meta_access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: cleanSendPhone,
            type: "template",
            template: {
              name: "hello_world",
              language: {
                code: "en_US"
              }
            }
          })
        });

        const sendData = await sendRes.json();
        if (!sendRes.ok) {
          templateResult = { success: false, error: mapMetaErrorResponse(sendData?.error) };
          logSecure("Send hello_world message", sendUrl, false, sendData?.error);
        } else {
          templateResult = { success: true, response: sendData };
          logSecure("Send hello_world message", sendUrl, true, sendData);
        }
      }

      // Save success outcomes to DB / File
      const list = await loadChannelsDBOrFile();
      const loadedChan = channelId ? list.find((c: any) => c.id === channelId) : list.find((c: any) => c.type === "whatsapp_meta" && c.is_active);

      if (loadedChan) {
        loadedChan.meta_whatsapp_status = "connected";
        loadedChan.meta_whatsapp_last_test_at = new Date().toISOString();
        loadedChan.meta_whatsapp_display_phone_number = display_phone_number;
        loadedChan.meta_whatsapp_verified_name = verified_name;
        loadedChan.meta_whatsapp_quality_rating = quality_rating;
        loadedChan.meta_whatsapp_last_error = null;
        loadedChan.status = "CONNECTED";
        loadedChan.connected_phone = display_phone_number;
        await saveChannelToDBOrFile(loadedChan);
      }

      return res.json({
        success: true,
        message: "Conexão válida. O Phone Number ID pertence à WABA configurada.",
        display_phone_number,
        verified_name,
        quality_rating,
        waba_id: meta_waba_id,
        phone_number_id: meta_phone_number_id,
        last_test_at: new Date().toISOString(),
        permissions: tokenScopes,
        webhook_configured: isWebhookConfigured,
        template_send_result: templateResult,
        tokenWarning: !tokenDebugPassed ? tokenErrorMsg : null,
        testResults: { step1: "passed", step2: "passed", step3: meta_app_id && meta_app_secret ? (tokenDebugPassed ? "passed" : "failed") : "skipped" }
      });

    } catch (err: any) {
      console.error("[META TEST INTEGRATION EXCEPTION]", err);
      return res.status(500).json({ success: false, error: err?.message || "Exceção inesperada ao validar conexão" });
    }
  });

  app.get("/api/zapi/status", async (req, res) => {
    try {
      const raw = await getZapiStatusRaw(req);
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
      let result = await callZapiActionRaw("/restart", "POST", req);
      if (!result.ok) {
        result = await callZapiActionRaw("/restart", "GET", req);
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
      let result = await callZapiActionRaw("/disconnect", "POST", req);
      if (!result.ok) {
        result = await callZapiActionRaw("/disconnect", "GET", req);
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
      const rawStatus = await getZapiStatusRaw(req);
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
          const response = await callZapiQrRaw(endpoint, req);
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
    console.log("✅ Meta webhook registrado: GET/POST /api/meta/webhook");
    
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
