import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";
test("production exposes the deployed revision and prevents cached HTML from hiding a new release", async () => {
  const env = {
    ASSETS: {
      fetch: async (r) =>
        new URL(r.url).pathname === "/build-info.json"
          ? Response.json({ revision: "test-revision", workflow: 2 })
          : new Response("<html>new app</html>", {
              headers: {
                "Content-Type": "text/html",
                "Cache-Control": "max-age=3600",
              },
            }),
    },
  };
  const info = await worker.fetch(
    new Request("https://example.workers.dev/__version"),
    env,
  );
  assert.equal((await info.json()).revision, "test-revision");
  assert.equal(info.headers.get("Cache-Control"), "no-store");
  const page = await worker.fetch(
    new Request("https://example.workers.dev/"),
    env,
  );
  assert.equal(page.headers.get("X-Ghaith-Workflow"), "2");
  assert.equal(page.headers.get("Cache-Control"), "no-store");
});
