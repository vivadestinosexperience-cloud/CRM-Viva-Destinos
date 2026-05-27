export function normalizeBrazilPhone(input: string) {
  let baseInput = input || "";
  if (baseInput.includes("-")) {
    baseInput = baseInput.split("-")[0];
  }
  // Remove non-numeric characters
  let cleaned = baseInput.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // If it has 10 or 11 digits, assume Brazil (add 55)
  if ((cleaned.length === 10 || cleaned.length === 11) && !cleaned.startsWith('55')) {
    cleaned = `55${cleaned}`;
  }
  
  let phone = cleaned;

  // Standardization to add 9th digit
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    const ddd = phone.substring(2, 4);
    const dddNum = parseInt(ddd, 10);
    if (dddNum >= 11 && dddNum <= 99) {
      if (phone.length === 12) {
        phone = `55${ddd}9${phone.substring(4)}`;
      }
    }
    return { valid: true, phone, reason: '' };
  }
  
  if (phone.length >= 10) {
    return { valid: true, phone, reason: '' };
  }
  
  return { valid: false, phone, reason: 'Tamanho inválido' };
}
