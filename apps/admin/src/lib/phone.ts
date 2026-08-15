/** Keep only digits and cap at 10 for Indian mobile numbers. */
export function digitsPhone(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function isValidPhone(value: string) {
  return /^\d{10}$/.test(value);
}
