/** PIN rules shared by the browser forms and the server. */
export const PIN_LENGTH = 6;

const COMMON = new Set(["123123", "121212", "112233", "123321", "696969", "111222", "101010", "007007", "131313", "159753"]);

/** Explains why a new PIN isn't allowed, or returns null if it's fine. Shared rules for the form and server. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return `Your PIN must be ${PIN_LENGTH} digits.`;
  if (/^(\d)\1+$/.test(pin)) return "Avoid repeating one digit — choose something harder to guess.";
  const steps = [...pin].slice(1).map((d, i) => Number(d) - Number(pin[i]));
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return "Avoid a run like 123456 — choose something harder to guess.";
  if (COMMON.has(pin)) return "That PIN is too common — choose something harder to guess.";
  return null;
}
