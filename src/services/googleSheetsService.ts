import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";
import { Conversation } from "../types";

// Initialize Firebase App if not already done
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Required Google API scopes for Sheets and Drive File creation
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/drive.file");

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: "text" | "number" | "boolean" | "select";
  options?: string[]; // for select type
}

export interface CustomFieldValues {
  [fieldId: string]: any;
}

// Memory caching for OAuth token
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Get Default Spreadsheet ID from user's URL
export const DEFAULT_SPREADSHEET_ID = "1Q2HObL0s5X9tlXBUldAOBcoZ-tXPVvFhxDOSCIQbOaY";

export const getStoredSpreadsheetId = (): string => {
  return localStorage.getItem("crm_google_spreadsheet_id") || DEFAULT_SPREADSHEET_ID;
};

export const setStoredSpreadsheetId = (id: string) => {
  localStorage.setItem("crm_google_spreadsheet_id", id);
};

// Initialize Google OAuth State Listener
export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  // If we already have a cached token, invoke success right away
  if (cachedAccessToken && auth.currentUser) {
    if (onAuthSuccess) onAuthSuccess(auth.currentUser, cachedAccessToken);
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // If we don't have cached token but user is signed in, we might need to re-login
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Trigger Sign In Flow
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Não foi possível obter o token de acesso do Google.");
    }
    cachedAccessToken = credential.accessToken;
    // Persist to session storage for smooth page reloads
    sessionStorage.setItem("crm_google_oauth_token", cachedAccessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    console.error("Erro no Google Sign-In:", err);
    throw err;
  } finally {
    isSigningIn = false;
  }
};

// Retrieve Token (check cache first, then session storage)
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const stored = sessionStorage.getItem("crm_google_oauth_token");
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

// Log Out Google Session
export const googleSignOut = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  sessionStorage.removeItem("crm_google_oauth_token");
};

// --- Custom Fields Metadata & Value Storage ---

export const getCustomFieldDefs = (): CustomFieldDefinition[] => {
  const stored = localStorage.getItem("crm_custom_fields_definitions");
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }
  // Default fields pre-populated
  const defaults: CustomFieldDefinition[] = [
    { id: "reserva_confirmada", name: "Reserva Confirmada", type: "boolean" },
    { id: "valor_pago", name: "Valor Pago", type: "number" },
    { id: "data_viagem", name: "Data da Viagem", type: "text" },
    { id: "observacoes", name: "Observações", type: "text" }
  ];
  localStorage.setItem("crm_custom_fields_definitions", JSON.stringify(defaults));
  return defaults;
};

export const saveCustomFieldDefs = (defs: CustomFieldDefinition[]) => {
  localStorage.setItem("crm_custom_fields_definitions", JSON.stringify(defs));
};

export const getCustomFieldValues = (conversationId: string): CustomFieldValues => {
  const stored = localStorage.getItem(`crm_custom_values_${conversationId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return {};
    }
  }
  return {};
};

export const saveCustomFieldValues = (conversationId: string, values: CustomFieldValues) => {
  localStorage.setItem(`crm_custom_values_${conversationId}`, JSON.stringify(values));
};

// --- Google Sheets Integration Logic ---

const BASE_SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";

// Get standard headers and dynamic custom ones
const buildHeaderRow = (customDefs: CustomFieldDefinition[]): string[] => {
  return [
    "ID da Conversa",
    "Data de Criação",
    "Nome do Cliente",
    "Telefone",
    "Última Mensagem",
    "Status de Andamento",
    ...customDefs.map((d) => d.name),
  ];
};

// Normalize conversation status into Portuguese CRM status
export const getCleanStatusLabel = (conv: Conversation): string => {
  const isClosed =
    conv.status === "RESOLVED" ||
    conv.status === "CLOSED" ||
    conv.status === "CONCLUIDO" ||
    conv.status === "CONCLUÍDO";
  
  if (isClosed) {
    return "Concluído";
  }
  if (conv.assigned_user_id) {
    return "Meus";
  }
  return "Novos";
};

// Convert conversation & custom field values into spreadsheet row array
const buildConversationRow = (
  conv: Conversation,
  customDefs: CustomFieldDefinition[]
): string[] => {
  const customValues = getCustomFieldValues(conv.id);
  const createdDate = conv.created_at ? new Date(conv.created_at).toLocaleString("pt-BR") : "";
  const clientName = conv.customer?.name || "Cliente";
  const clientPhone = conv.customer?.phone || conv.customer_phone_normalized || "";
  const lastMessage = conv.last_message || "";
  const cleanStatus = getCleanStatusLabel(conv);

  const row = [
    conv.id,
    createdDate,
    clientName,
    clientPhone,
    lastMessage,
    cleanStatus,
  ];

  // Custom field values
  customDefs.forEach((def) => {
    const val = customValues[def.id];
    if (val === undefined || val === null) {
      row.push("");
    } else if (typeof val === "boolean") {
      row.push(val ? "SIM" : "NÃO");
    } else {
      row.push(String(val));
    }
  });

  return row;
};

// Prepare headers and make sure they exist on row 1
export const ensureHeadersAndFetchRows = async (
  accessToken: string,
  spreadsheetId: string,
  customDefs: CustomFieldDefinition[]
): Promise<any[][] | null> => {
  try {
    const headers = buildHeaderRow(customDefs);
    
    // Fetch current rows from Sheet
    const response = await fetch(
      `${BASE_SHEETS_URL}/${spreadsheetId}/values/A1:Z5000`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("Failed to fetch sheet values:", errorText);
      return null;
    }

    const data = await response.json();
    const currentRows: any[][] = data.values || [];

    // If sheet is totally empty or does not have headers, initialize it!
    if (currentRows.length === 0) {
      await fetch(
        `${BASE_SHEETS_URL}/${spreadsheetId}/values/A1:update?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            range: "A1",
            majorDimension: "ROWS",
            values: [headers],
          }),
        }
      );
      return [headers];
    } else {
      // Check if sheet headers match current custom definitions.
      // If there are definitions not in sheet headers, we can rewrite row 1 to add them!
      const existingHeaders = currentRows[0];
      const missingHeaders = headers.filter((h) => !existingHeaders.includes(h));

      if (missingHeaders.length > 0) {
        // Extend existing headers
        const updatedHeaders = [...existingHeaders];
        missingHeaders.forEach((mh) => {
          updatedHeaders.push(mh);
        });

        await fetch(
          `${BASE_SHEETS_URL}/${spreadsheetId}/values/A1:update?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              range: `A1:${String.fromCharCode(65 + updatedHeaders.length - 1)}1`,
              majorDimension: "ROWS",
              values: [updatedHeaders],
            }),
          }
        );
        currentRows[0] = updatedHeaders;
      }
    }

    return currentRows;
  } catch (err) {
    console.error("Error ensuring headers on Google Sheets:", err);
    return null;
  }
};

// Synchronize a single conversation (updates if exists, appends if new)
export const syncConversationToSheet = async (
  accessToken: string,
  spreadsheetId: string,
  conv: Conversation,
  customDefs: CustomFieldDefinition[] = getCustomFieldDefs()
): Promise<boolean> => {
  try {
    const currentRows = await ensureHeadersAndFetchRows(accessToken, spreadsheetId, customDefs);
    if (!currentRows) return false;

    // Find if conversation already exists by ID (Column A)
    const headers = currentRows[0];
    const idColIndex = headers.indexOf("ID da Conversa");
    if (idColIndex === -1) return false;

    let existingRowIndex = -1;
    for (let i = 1; i < currentRows.length; i++) {
      if (currentRows[i][idColIndex] === conv.id) {
        existingRowIndex = i + 1; // 1-indexed for sheets
        break;
      }
    }

    const rowData = buildConversationRow(conv, customDefs);

    if (existingRowIndex !== -1) {
      // Row exists -> Update cells up to the row length
      const range = `A${existingRowIndex}:${String.fromCharCode(64 + rowData.length)}${existingRowIndex}`;
      const response = await fetch(
        `${BASE_SHEETS_URL}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            range,
            majorDimension: "ROWS",
            values: [rowData],
          }),
        }
      );
      return response.ok;
    } else {
      // Row does not exist -> Append row
      const range = "A1";
      const response = await fetch(
        `${BASE_SHEETS_URL}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            range,
            majorDimension: "ROWS",
            values: [rowData],
          }),
        }
      );
      return response.ok;
    }
  } catch (err) {
    console.error("Error syncing conversation to Google Sheets:", err);
    return false;
  }
};

// Batch upload all conversations to the spreadsheet (Backfill)
export const syncAllConversationsToSheet = async (
  accessToken: string,
  spreadsheetId: string,
  conversations: Conversation[],
  customDefs: CustomFieldDefinition[] = getCustomFieldDefs()
): Promise<{ success: boolean; count: number }> => {
  try {
    const currentRows = await ensureHeadersAndFetchRows(accessToken, spreadsheetId, customDefs);
    if (!currentRows) return { success: false, count: 0 };

    const headers = currentRows[0];
    const idColIndex = headers.indexOf("ID da Conversa");
    if (idColIndex === -1) return { success: false, count: 0 };

    // Build database of existing IDs to prevent duplicates
    const existingIdsMap = new Map<string, number>();
    for (let i = 1; i < currentRows.length; i++) {
      const idVal = currentRows[i][idColIndex];
      if (idVal) {
        existingIdsMap.set(idVal, i + 1); // Row Number (1-indexed)
      }
    }

    let updatedCount = 0;
    let appendedCount = 0;

    const rowsToAppend: any[][] = [];

    for (const conv of conversations) {
      const rowData = buildConversationRow(conv, customDefs);
      const existingRowIndex = existingIdsMap.get(conv.id);

      if (existingRowIndex) {
        // Update existing row
        const range = `A${existingRowIndex}:${String.fromCharCode(64 + rowData.length)}${existingRowIndex}`;
        await fetch(
          `${BASE_SHEETS_URL}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              range,
              majorDimension: "ROWS",
              values: [rowData],
            }),
          }
        );
        updatedCount++;
      } else {
        // Append row
        rowsToAppend.push(rowData);
        appendedCount++;
      }
    }

    if (rowsToAppend.length > 0) {
      await fetch(
        `${BASE_SHEETS_URL}/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            range: "A1",
            majorDimension: "ROWS",
            values: rowsToAppend,
          }),
        }
      );
    }

    return { success: true, count: updatedCount + appendedCount };
  } catch (err) {
    console.error("Error syncAllConversationsToSheet:", err);
    return { success: false, count: 0 };
  }
};
