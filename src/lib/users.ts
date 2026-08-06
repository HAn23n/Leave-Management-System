/** What to show for a user across the app — nickname when set, email otherwise. */
export function displayName(user: { nickname: string | null; email: string } | null | undefined): string {
  if (!user) return "-";
  return user.nickname || user.email;
}
