export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/__version") {
      const response = await env.ASSETS.fetch(
        new Request(new URL("/build-info.json", url), { method: "GET" }),
      );
      return new Response(response.body, {
        status: response.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Ghaith-Workflow": "2",
        },
      });
    }
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Ghaith-Workflow", "2");
    if (headers.get("Content-Type")?.includes("text/html"))
      headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
