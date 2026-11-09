import test from "node:test";
import assert from "node:assert/strict";
import { authStorage, REMEMBER_KEY } from "../src/authStorage.js";
function memory() {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
test("remember-me controls persistence and sign-out clears both stores", () => {
  globalThis.localStorage = memory();
  globalThis.sessionStorage = memory();
  localStorage.setItem(REMEMBER_KEY, "false");
  authStorage.setItem("test-session", "temporary");
  assert.equal(localStorage.getItem("test-session"), null);
  assert.equal(sessionStorage.getItem("test-session"), "temporary");
  localStorage.setItem(REMEMBER_KEY, "true");
  authStorage.setItem("test-session", "remembered");
  assert.equal(sessionStorage.getItem("test-session"), null);
  assert.equal(authStorage.getItem("test-session"), "remembered");
  authStorage.removeItem("test-session");
  assert.equal(authStorage.getItem("test-session"), null);
});
