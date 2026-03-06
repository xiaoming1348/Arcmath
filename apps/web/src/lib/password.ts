export function withPepper(password: string): string {
  const pepper = process.env.PASSWORD_PEPPER ?? "";
  return `${password}${pepper}`;
}
