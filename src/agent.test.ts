import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, requireStructured, redact } from "./diagnostics.js";
import { validateConfig } from "./protocol.js";
import { prepareWorkspace } from "./workspace.js";
test("diagnosis prioritises native error results over generic process-exit text", () => {
  const d = diagnose({
    result: { status: "error_max_turns", errors: ["Native turn report"] },
    exception: { message: "process exited with code 1" },
  });
  assert.equal(d.category, "error-result");
  assert.equal(d.summary, "Native turn report");
});
test("startup exceptions, bare exits and incomplete streams remain distinct", () => {
  assert.equal(
    diagnose({ exception: { message: "executable not found" } }).category,
    "startup",
  );
  assert.equal(
    diagnose({
      exception: { message: "Claude Code process exited with code 7" },
    }).category,
    "process-exit",
  );
  assert.equal(diagnose({}).category, "incomplete");
});
test("structured presence is required and valid false/zero values are not missing", () => {
  assert.throws(() => requireStructured({ status: "success" }));
  assert.equal(
    requireStructured({ status: "success", structuredOutput: false }),
    false,
  );
  assert.equal(
    requireStructured({ status: "success", structuredOutput: 0 }),
    0,
  );
  assert.throws(() =>
    requireStructured({ status: "error_max_turns", structuredOutput: {} }),
  );
});
test("sanitization removes the current API key and authorization values", () => {
  const old = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "private-classroom-secret";
  try {
    assert.ok(
      !redact(
        "private-classroom-secret authorization: Bearer test-token",
      ).includes("private-classroom-secret"),
    );
    assert.ok(
      !redact("authorization: Bearer test-token").includes("test-token"),
    );
  } finally {
    if (old === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = old;
  }
});
test("browser inputs cannot supply arbitrary executables or prompts", () => {
  assert.throws(() => validateConfig({ mode: "exit", path: "cmd.exe" }));
  assert.throws(() => validateConfig({ mode: "unknown" }));
});
test("the temporary transport fixture and classroom note are real and scoped", async () => {
  const w = await prepareWorkspace();
  try {
    const a = await w.snapshot();
    assert.match(a.text, /TRACE-50/);
    assert.equal((await w.snapshot()).hash, a.hash);
    assert.notEqual((await w.attempt(1)).config, (await w.attempt(2)).config);
  } finally {
    await w.cleanup();
  }
});

test("a provider error exception takes priority even when the raw result says success", () => {
  const result = { status: "success", text: "Model unavailable" };
  const d = diagnose({
    result,
    init: [{}],
    exception: {
      message: "Error: Claude Code returned an error result: Model unavailable",
    },
  });
  assert.equal(d.category, "error-result");
  assert.equal(d.summary, "Model unavailable");
  assert.equal(result.status, "success");
});
