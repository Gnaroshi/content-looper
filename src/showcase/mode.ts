export function isShowcaseMode(environment: Record<string, string | boolean | undefined>): boolean {
  return environment.VITE_GNAROSHI_SHOWCASE === "1";
}
