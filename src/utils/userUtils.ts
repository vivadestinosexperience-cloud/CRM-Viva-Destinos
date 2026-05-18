/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function getAgentDisplayName(user: any) {
  if (!user) return "Atendimento Viva Destinos";

  const fullName = user.name?.trim();

  if (fullName && fullName.split(" ").length >= 2) {
    return fullName;
  }

  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (fullName) {
    return fullName;
  }

  return "Atendimento Viva Destinos";
}

export function formatOutgoingWhatsAppMessage(message: string, agentName: string) {
  const cleanMessage = String(message || "").trim();
  const cleanAgentName = String(agentName || "Atendimento Viva Destinos").trim();

  if (!cleanMessage) return "";

  const prefix = `*${cleanAgentName}:*`;

  if (cleanMessage.startsWith(prefix)) {
    return cleanMessage;
  }

  return `${prefix}\n${cleanMessage}`;
}
