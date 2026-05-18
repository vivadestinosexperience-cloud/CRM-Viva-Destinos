/**
 * Utility to extract a readable error message from various error formats.
 * Prevents [object Object] from being displayed in UI.
 */
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
    const stringified = JSON.stringify(error, null, 2);
    if (stringified === "{}") return "Erro desconhecido.";
    return stringified;
  } catch {
    return "Erro desconhecido.";
  }
}
