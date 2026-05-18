export function renderSafeText(value: any, fallback = ""): string {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "string") return value;

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    if (typeof value.content === "string") return value.content;
    if (typeof value.message === "string") return value.message;
    if (typeof value.text === "string") return value.text;
    if (value.text?.message && typeof value.text.message === "string") return value.text.message;
    if (typeof value.caption === "string") return value.caption;

    // Try stringify if it's small or has meaningful keys, but usually fallback is safer
    return fallback || "Mensagem recebida";
  }

  return fallback;
}

export function getErrorMessage(error: any): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  if (error.error) return String(error.error);

  if (error.details) {
    if (typeof error.details === "string") return error.details;
    if (error.details.error) return String(error.details.error);
    if (error.details.message) return String(error.details.message);
    try {
      return JSON.stringify(error.details, null, 2);
    } catch {
      return "Erro detalhado indisponível.";
    }
  }

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "Erro desconhecido.";
  }
}
