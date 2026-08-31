/** True for this app's local disk storage URLs (plain Postgres mode). */
export function isAppStorageUrl(src: string): boolean {
  if (!src) return false;
  return (
    src.includes('/storage/v1/object/public/') ||
    src.includes('/storage/v1/object/sign/')
  );
}
