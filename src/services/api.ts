import { supabase } from '../integrations/supabase/client';

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;

  if (envUrl && String(envUrl).trim()) {
    return String(envUrl).replace(/\/$/, "");
  }

  return "";
}

export async function safeReadJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!text) return null;

  if (!contentType.includes("application/json")) {
    console.error("[NON JSON RESPONSE]", {
      status: response.status,
      contentType,
      text: text.slice(0, 500)
    });

    throw new Error("A API retornou uma resposta inválida. Verifique a URL da API.");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[JSON PARSE ERROR]", text.slice(0, 500));
    throw new Error("Resposta inválida da API.");
  }
}

export async function authorizedFetch(url: string, options: RequestInit = {}) {
  let token = null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token;
  } catch (e) {
    console.warn("[authorizedFetch] Supabase session check failed:", e);
  }

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Ensure Content-Type is set if body is present and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Handle absolute/relative URLs
  let finalUrl = url;
  if (!url.startsWith('http') && !url.startsWith('/')) {
    const baseUrl = getApiBaseUrl();
    finalUrl = `${baseUrl}/${url}`;
  } else if (url.startsWith('/api')) {
    const baseUrl = getApiBaseUrl();
    finalUrl = `${baseUrl}${url}`;
  }

  if (import.meta.env.DEV) {
    console.log(`[authorizedFetch] ${options.method || 'GET'} ${finalUrl}`);
  }

  const response = await fetch(finalUrl, {
    ...options,
    headers
  });

  return response;
}
