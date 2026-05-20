import { supabase } from '../integrations/supabase/client';

export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.replace(/\/$/, "");
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

    throw new Error(
      `A API retornou uma resposta inválida (${response.status}). Verifique se a rota está correta.`
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("[JSON PARSE ERROR]", text.slice(0, 500));
    throw new Error("Resposta inválida da API.");
  }
}

export async function authorizedFetch(url: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

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

  const response = await fetch(finalUrl, {
    ...options,
    headers
  });

  return response;
}
