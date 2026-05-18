export function normalizeBrazilPhone(input: string) {
  // Remove non-numeric characters
  const cleaned = input.replace(/\D/g, '');
  
  if (cleaned.length < 10 || cleaned.length > 13) {
    return { valid: false, phone: cleaned, reason: 'Tamanho inválido' };
  }
  
  let phone = cleaned;
  
  // If it has 10 or 11 digits, assume Brazil (add 55)
  if (cleaned.length === 10 || cleaned.length === 11) {
    phone = `55${cleaned}`;
  }
  
  // Basic validation for Brazil 55 + area code + number
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) {
    return { valid: true, phone, reason: '' };
  }
  
  return { valid: false, phone, reason: 'Formato não reconhecido' };
}
