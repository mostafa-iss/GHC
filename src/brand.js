export const BRAND_NAME = "مركز غيث";
export const LOGO_URL = new URL("./assets/ghaith-logo.png", import.meta.url)
  .href;
let logoPromise;
export function logoBytes() {
  return (logoPromise ??= (async () => {
    const r = await fetch(LOGO_URL);
    if (!r.ok) throw Error("تعذر تحميل شعار غيث للتصدير");
    return new Uint8Array(await r.arrayBuffer());
  })());
}
