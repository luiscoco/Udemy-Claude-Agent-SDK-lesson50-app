import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareWorkspace } from "./workspace.js";
import {
  diagnose,
  redact,
  requireStructured,
  SIMPLE_SCHEMA,
  SYMPTOMS,
} from "./diagnostics.js";
import {
  MODES,
  validateConfig,
  type RunConfig,
  type LabEvent,
} from "./protocol.js";
export { MODES, validateConfig };
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = { mode: "healthy" };
export const PROMPTS = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    "Read note.txt once and report its classroom code and policy in one short sentence.",
  ]),
);
export async function runAgent(
  value: RunConfig,
  emit: (event: LabEvent) => void,
  controller = new AbortController(),
) {
  const c = validateConfig(value),
    w = await prepareWorkspace(),
    before = await w.snapshot(),
    attempts: any[] = [],
    observations: any[] = [];
  const observe = (kind: string, detail: any) => {
    const row = { kind, detail: JSON.parse(redact(JSON.stringify(detail))) };
    observations.push(row);
    emit({ type: "observation", observation: row });
  };
  try {
    async function attempt(label: string, fault: boolean, wantsJson = false) {
      const index = attempts.length + 1,
        dirs = await w.attempt(index);
      const record: any = {
        index,
        label,
        source:
          fault && c.mode === "exit"
            ? "Actual SDK transport against a controlled Node CLI fixture"
            : "Real Agent SDK with bundled Claude CLI",
        messages: [],
        init: [],
        result: null,
        stderr: "",
        exception: null,
        validationError: null,
        debugLog: "",
        contextSnapshots: [],
      };
      attempts.push(record);
      const options: Options = {
        cwd: w.cwd,
        model:
          fault && c.mode === "invalidmodel"
            ? "classroom-model-does-not-exist-50"
            : MODEL,
        tools: ["Read"],
        allowedTools:
          wantsJson && !(fault && c.mode === "missing")
            ? ["Read", "StructuredOutput"]
            : ["Read"],
        permissionMode: "dontAsk",
        settingSources: [],
        plugins: [],
        mcpServers: {},
        maxTurns: fault && c.mode === "turnlimit" ? 1 : wantsJson ? 8 : 4,
        maxBudgetUsd: 0.3,
        effort: "low",
        thinking: { type: "disabled" },
        abortController: controller,
        env: {
          ...process.env,
          ANTHROPIC_AUTH_TOKEN: undefined,
          HOME: dirs.home,
          USERPROFILE: dirs.home,
          CLAUDE_CONFIG_DIR: dirs.config,
          CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
          CLAUDE_CODE_ENABLE_TELEMETRY: "0",
          OTEL_LOG_RAW_API_BODIES: "0",
          OTEL_TRACES_EXPORTER: "none",
          OTEL_LOGS_EXPORTER: "none",
          OTEL_METRICS_EXPORTER: "none",
        },
        hooks: {
          PreToolUse: [
            {
              hooks: [
                async (input) => {
                  const permitted =
                    input.hook_event_name === "PreToolUse" &&
                    ((input.tool_name === "StructuredOutput" &&
                      wantsJson &&
                      !(fault && c.mode === "missing")) ||
                      (input.tool_name === "Read" &&
                        resolve(
                          w.cwd,
                          (input.tool_input as any).file_path || "",
                        ) === resolve(w.cwd, "note.txt")));
                  observe("tool-guard", {
                    attempt: index,
                    tool:
                      input.hook_event_name === "PreToolUse"
                        ? input.tool_name
                        : "unknown",
                    permitted,
                  });
                  return permitted
                    ? {}
                    : {
                        hookSpecificOutput: {
                          hookEventName: "PreToolUse",
                          permissionDecision: "deny",
                          permissionDecisionReason:
                            "Only the disposable classroom note Read and configured StructuredOutput are permitted.",
                        },
                      };
                },
              ],
            },
          ],
        },
        stderr: (data) => {
          const text = redact(data);
          record.stderr = (record.stderr + text).slice(-64000);
          observe("stderr", { attempt: index, text });
        },
      };
      if (fault && c.mode === "badpath")
        options.pathToClaudeCodeExecutable = w.missingBinary;
      if (fault && c.mode === "badstart")
        options.pathToClaudeCodeExecutable = w.fixtures;
      if (fault && c.mode === "exit") {
        options.pathToClaudeCodeExecutable = w.exitScript;
        options.executable = "node";
      }
      if (wantsJson && !(fault && c.mode === "missing"))
        options.outputFormat = { type: "json_schema", schema: SIMPLE_SCHEMA };
      if (c.mode === "debug") {
        options.debug = true;
        options.debugFile = dirs.debugFile;
      }
      observe("query-options", {
        attempt: index,
        label,
        source: record.source,
        model: options.model,
        maxTurns: options.maxTurns,
        tools: options.tools,
        pathOverride:
          options.pathToClaudeCodeExecutable || "bundled native CLI",
        outputFormat: options.outputFormat || null,
        wantsJson,
        debug: !!options.debug,
        credentialsInDisplayedOptions: false,
      });
      try {
        const run = query({
          prompt: options.outputFormat
            ? "Read note.txt once, then use StructuredOutput with the classroom code and a short summary."
            : PROMPTS[c.mode],
          options,
        });
        for await (const message of run) {
          const kind = {
            type: message.type,
            subtype: "subtype" in message ? message.subtype : null,
          };
          record.messages.push(kind);
          observe("message", { attempt: index, ...kind });
          if (message.type === "system" && message.subtype === "init") {
            const init = message as any;
            const summary = {
              sessionId: init.session_id,
              model: init.model,
              tools: init.tools,
              mcpServers: init.mcp_servers,
              skills: init.skills || [],
              plugins: init.plugins || [],
              pluginErrors: init.plugin_errors || [],
              cliVersion: init.claude_code_version,
            };
            record.init.push(summary);
            observe("init", { attempt: index, ...summary });
          }
          if (message.type === "assistant") {
            for (const block of message.message.content) {
              if (block.type === "text")
                emit({
                  type: "text",
                  text: redact(block.text),
                  attempt: index,
                });
              if (block.type === "tool_use")
                observe("native-tool", {
                  attempt: index,
                  name: block.name,
                  id: block.id,
                });
            }
            if (c.mode === "debug" && !record.contextSnapshots.length) {
              try {
                const context = await run.getContextUsage({
                  detail: "summary",
                });
                record.contextSnapshots.push(context);
                observe("context-usage", { attempt: index, context });
              } catch (error) {
                observe("context-unavailable", {
                  attempt: index,
                  message: redact(String(error)),
                });
              }
            }
          }
          if (message.type === "result") {
            record.result = {
              attempt: index,
              sessionId: message.session_id,
              status: message.subtype,
              costUsd: message.total_cost_usd,
              stopReason: message.stop_reason,
              permissionDenials: message.permission_denials,
              structuredOutputPresent:
                message.subtype === "success" &&
                message.structured_output !== undefined,
              structuredOutput:
                message.subtype === "success"
                  ? message.structured_output
                  : undefined,
              text:
                message.subtype === "success"
                  ? message.result
                  : message.errors.join("\n"),
              errors: message.subtype === "success" ? [] : message.errors,
            };
            observe("native-result", record.result);
            emit({ type: "result", result: record.result });
          }
        }
      } catch (error) {
        record.exception = {
          name: error instanceof Error ? error.name : "unknown",
          message: redact(String(error)),
        };
        observe("exception", { attempt: index, ...record.exception });
      }
      if (wantsJson && record.result?.status === "success") {
        try {
          requireStructured(record.result);
          observe("structured-validation", { attempt: index, passed: true });
        } catch (error) {
          record.validationError = redact(String(error));
          observe("structured-validation", {
            attempt: index,
            passed: false,
            message: record.validationError,
          });
        }
      }
      if (c.mode === "debug") {
        try {
          record.debugLog = redact(
            (await readFile(dirs.debugFile, "utf8")).slice(-100000),
          );
          observe("debug-file", {
            attempt: index,
            text: record.debugLog,
            scope: "Redacted tail; raw API body logging disabled",
          });
        } catch {
          observe("debug-file-unavailable", { attempt: index });
        }
      }
      record.diagnosis = diagnose(record);
      emit({
        type: "diagnosis",
        attempt: JSON.parse(redact(JSON.stringify(record))),
      });
      return record;
    }
    const fault = [
      "badpath",
      "badstart",
      "exit",
      "invalidmodel",
      "missing",
      "turnlimit",
    ].includes(c.mode);
    await attempt(
      fault ? "Reproduce the fault" : "Known-good run",
      fault,
      ["missing", "structured"].includes(c.mode),
    );
    if (fault && !controller.signal.aborted)
      await attempt("Apply the fix and rerun", false, c.mode === "missing");
    const after = await w.snapshot();
    const evidence = {
      mode: c.mode,
      attempts,
      results: attempts.flatMap((a) => (a.result ? [a.result] : [])),
      observations,
      fixtureUnchanged: before.hash === after.hash,
      fixture: after.text,
      symptomMap: SYMPTOMS,
      recoveryPassed: !fault || attempts[1]?.diagnosis.category === "success",
      scope:
        "Bad path/start and controlled process fixtures intentionally fail. Missing mode deliberately omits outputFormat; this is an application guard demonstration, not a claim of an SDK defect. Other native requests use the real model service.",
      debugPrivacy:
        "Private SDK state is temporary. Credentials are redacted. Raw API body logging remains disabled.",
    };
    emit({
      type: "evidence",
      evidence: JSON.parse(redact(JSON.stringify(evidence))),
    });
    emit({ type: "done" });
    return evidence;
  } finally {
    await w.cleanup();
  }
}
