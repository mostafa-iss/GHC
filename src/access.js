export function deviceInfo(ua = navigator.userAgent) {
  return {
    userAgent: ua,
    browser: /Edg\//.test(ua)
      ? "Edge"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "غير معروف",
    os: /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad/.test(ua)
        ? "iOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "غير معروف",
    kind: /Mobile|Android|iPhone|iPad/.test(ua)
      ? "هاتف / جهاز لوحي"
      : "كمبيوتر",
  };
}
export async function accessRpc(client, name, args = {}) {
  let request = client.rpc(name, args);
  if (typeof AbortSignal.timeout === "function")
    request = request.abortSignal(AbortSignal.timeout(15000));
  const { data, error } = await request;
  if (error) throw Error(error.message);
  return data;
}
