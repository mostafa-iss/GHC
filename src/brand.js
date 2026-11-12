export const BRAND_NAME = "GHC Academy";
export const LOGO_URL = new URL("./assets/ghc-logo.png", import.meta.url).href;
let logoPromise;
export function logoBytes() {
  return (logoPromise ??= (async () => {
    const r = await fetch(LOGO_URL);
    if (!r.ok) throw Error("تعذر تحميل شعار GHC Academy للتصدير");
    return new Uint8Array(await r.arrayBuffer());
  })());
}
