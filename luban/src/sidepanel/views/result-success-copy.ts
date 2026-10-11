export function resolveSuccessMainCopy(explanation: string, intent: string): string {
  const trimmed = explanation.trim();
  if (trimmed) return trimmed;
  return intent.trim();
}
