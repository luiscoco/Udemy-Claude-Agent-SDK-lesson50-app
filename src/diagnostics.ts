export function redact(value: string) {
  for (const secret of [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
  ].filter(Boolean) as string[])
    value = value.split(secret).join("[REDACTED]");
  return value
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(
      /(authorization["'\s:=]+)(?:Bearer|Basic)\s+[^\s"']+/gi,
      "$1[REDACTED]",
    );
}
export function requireStructured(result: any) {
  if (result?.status !== "success")
    throw new Error("Native result did not succeed.");
  if (result.structuredOutput === undefined)
    throw new Error(
      "No structured output: native success alone does not satisfy this application's JSON requirement.",
    );
  return result.structuredOutput;
}
export function diagnose(attempt: any) {
  if (attempt.validationError)
    return {
      category: "structured-output",
      summary:
        "Native success, but the application's required structured_output is missing.",
      fix: "Pass a compatible outputFormat schema, then check success and field presence.",
    };
  const message = attempt.exception?.message || "";
  if (/Claude Code returned an error result:/i.test(message))
    return {
      category: "error-result",
      summary: message
        .split(/Claude Code returned an error result:/i)[1]
        .trim(),
      fix: "Read the report after the colon. Verify the selected model exists and is accessible; preserve both the raw result and exception.",
    };
  if (attempt.result?.status && attempt.result.status !== "success")
    return {
      category: "error-result",
      summary:
        attempt.result.errors?.join("\n") || attempt.result.text || message,
      fix:
        attempt.result.status === "error_max_turns"
          ? "Allow enough turns for the Read and final response."
          : "Read the native report first; verify model access, authentication or provider limits for the observed error.",
    };
  if (/exited with code|terminated by signal/i.test(message))
    return {
      category: "process-exit",
      summary: message,
      fix: "Capture stderr and inspect the actual exit. This experiment uses a labelled controlled CLI fixture.",
    };
  if (attempt.exception)
    return {
      category: attempt.init?.length ? "runtime-exception" : "startup",
      summary: message,
      fix: "Verify the configured executable path. Remove a wrong override to restore bundled native CLI discovery.",
    };
  if (!attempt.result)
    return {
      category: "incomplete",
      summary: "The stream ended without a native final result.",
      fix: "Inspect message types and stderr; do not infer success.",
    };
  return {
    category: "success",
    summary:
      "The native result succeeded and the requested application validation passed.",
    fix: "Keep these known-good options as a baseline.",
  };
}
export const SIMPLE_SCHEMA = {
  type: "object",
  properties: { code: { type: "string" }, summary: { type: "string" } },
  required: ["code", "summary"],
  additionalProperties: false,
};
export const SYMPTOMS = [
  {
    symptom: "Skills unavailable",
    lesson: 17,
    url: "https://code.claude.com/docs/en/agent-sdk/skills",
  },
  {
    symptom: "MCP connection or authentication",
    lesson: 25,
    url: "https://code.claude.com/docs/en/agent-sdk/mcp",
  },
  {
    symptom: "Plugin loading",
    lesson: 20,
    url: "https://code.claude.com/docs/en/agent-sdk/plugins",
  },
  {
    symptom: "Subagent invocation",
    lesson: 44,
    url: "https://code.claude.com/docs/en/agent-sdk/subagents",
  },
  {
    symptom: "File checkpointing",
    lesson: 42,
    url: "https://code.claude.com/docs/en/agent-sdk/file-checkpointing",
  },
  {
    symptom: "Hook matching or modification",
    lesson: 34,
    url: "https://code.claude.com/docs/en/agent-sdk/hooks",
  },
  {
    symptom: "Container deployment",
    lesson: 48,
    url: "https://code.claude.com/docs/en/agent-sdk/hosting",
  },
  {
    symptom: "Startup, process exit or missing JSON",
    lesson: 50,
    url: "https://code.claude.com/docs/en/agent-sdk/troubleshooting",
  },
];
