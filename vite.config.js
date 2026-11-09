import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";
function revision() {
  if (process.env.WORKERS_CI_COMMIT_SHA)
    return process.env.WORKERS_CI_COMMIT_SHA;
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "local";
  }
}
const build = {
  revision: revision(),
  workflow: 2,
  builtAt: new Date().toISOString(),
};
export default defineConfig({
  plugins: [
    {
      name: "ghaith-build-identity",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: { name: "ghaith-build", content: build.revision },
            injectTo: "head",
          },
        ];
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "build-info.json",
          source: JSON.stringify(build),
        });
      },
    },
  ],
});
