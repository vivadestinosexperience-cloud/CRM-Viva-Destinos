/**
 * Utility to extract a readable error message from various error formats.
 * Prevents [object Object] from being displayed in UI.
 */
export function getErrorMessage(error: any): string {
  if (error === null || error === undefined) return "Erro não especificado.";
  
  if (typeof error === "string") {
    if (error === "[object Object]") return "Erro de sistema (objeto).";
    return error;
  }
  
  if (error instanceof Error) return error.message;

  // common patterns in Z-API or Supabase
  if (error.message && typeof error.message === 'string') return error.message;
  if (error.error && typeof error.error === 'string') return error.error;
  if (error.reason && typeof error.reason === 'string') return error.reason;
  
  if (error.details) {
    if (typeof error.details === "string") return error.details;
    if (error.details.message && typeof error.details.message === 'string') return error.details.message;
    if (error.details.error && typeof error.details.error === 'string') return error.details.error;
  }

  // Fallback for objects that don't match known patterns
  try {
    const stringified = JSON.stringify(error);
    if (stringified === "{}" || stringified === "[]") return "Erro desconhecido.";
    // Limit length if it's too big
    return stringified.length > 100 ? stringified.substring(0, 100) + "..." : stringified;
  } catch {
    return "Falha na operação (erro não serializável).";
  }
}
