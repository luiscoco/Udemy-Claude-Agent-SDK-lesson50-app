# Claude Agent SDK · Lesson 50 · Troubleshooting and debugging

Five student pages, a real SDK diagnostic and recovery dashboard and thirteen source-linked UML code steps.

## What you will learn

- Locate the failure stage: Compare missing executable paths, failed startup, real process exits, native error results and application validation. Preserve each kind of evidence instead of treating every failure as an API outage.
- Read the native stream: Record message type and subtype, then inspect initialization model, tools, MCP servers, skills and plugin errors. Compare a raw result with any subsequent SDK exception.
- Capture useful diagnostics: Use the stderr callback, a temporary debugFile and actual getContextUsage summary. Redact credentials and leave raw API body logging disabled.
- Validate structured output: Native success alone does not guarantee the structured_output field. Check presence, configure a small compatible schema and permit the native StructuredOutput tool.
- Reproduce and fix: Six fault experiments reproduce a real SDK failure or application guard, then rerun the corrected configuration. A controlled Node CLI fixture demonstrates an actual process exit and stderr without faking a model failure.
- Route symptoms to the right topic: Use the symptom map for skills, MCP authentication, plugins, subagents, checkpoints, hooks and hosting. Keep Python-only startup distinctions separate from this TypeScript application.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson50-app.git
cd .\Udemy-Claude-Agent-SDK-lesson50-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations: `cd .\agent-sdk\lesson50-troubleshooting`. Open http://127.0.0.1:3150. Node 24+, API credit and Windows Git Bash if needed.

## Create your .env file

Copy the template once and enter your own model key privately. Restart after edits. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3150
# Windows only, if required:
# CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe
```

No GitHub token, Docker or Managed Agents IDs are needed. On Windows, configure the optional Git Bash path only if required.

## Run the experiments

### Reproduce startup and process failures

Missing and invalid executable overrides fail before a model call. The exit experiment uses a clearly labelled real Node transport fixture that prints stderr and exits with code seven. Every fault then runs the real model with corrected options.

```powershell
npm run sample:env -- healthy
npm run sample:env -- badpath
npm run sample:env -- badstart
npm run sample:env -- exit
```

### Inspect results and required JSON

Invalid model preserves the raw result and the SDK error report after the colon. Missing JSON intentionally omits outputFormat, then fixes it; Structured requests a small real JSON schema.

```powershell
npm run sample:env -- invalidmodel
npm run sample:env -- missing
npm run sample:env -- structured
```

### Inspect limits and the toolkit

Turn limit records the native error_max_turns before recovery. Debug captures a temporary CLI debug file and actual context usage. Download sanitized evidence, distinguish diagnostics from API responses, and run the offline checks.

```powershell
npm run sample:env -- turnlimit
npm run sample:env -- debug
npm test
```

## How the app was built

### 1. Validate the classroom experiment

Only a fixed mode is accepted. Browser requests cannot inject arbitrary prompts, executable paths or tool definitions.

Source: `src/protocol.ts`, selected lines 16–22. Surrounding code omitted.

```typescript
if (
    !input ||
    Object.keys(input).some((k) => k !== "mode") ||
    !MODES.includes(input.mode)
  )
    throw new Error("Choose a listed diagnostic experiment.");
  return { mode: input.mode };
```

### 2. Prepare separate attempt state

Each attempt gets its own SDK home, config and debug file beneath a unique temporary workspace. A fictional note is the only permitted file.

Source: `src/workspace.ts`, selected lines 25–33. Surrounding code omitted.

```typescript
async attempt(index: number) {
      const home = join(root, "attempt-" + index, "home"),
        config = join(root, "attempt-" + index, "config"),
        debugFile = join(root, "attempt-" + index, "cli-debug.log");
      await mkdir(home, { recursive: true });
      await mkdir(config, { recursive: true });
      return { home, config, debugFile };
    },
    async snapshot() {
```

### 3. Select the model and limits

Start from a known-good model and Read-only task. Fault modes deliberately change the model or turn allowance. JSON runs allow sufficient turns for Read and StructuredOutput.

Source: `src/agent.ts`, selected lines 65–76. Surrounding code omitted.

```typescript
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
```

### 4. Capture actual stderr

The SDK stderr callback stores a bounded redacted tail and emits separate observations. Stderr is not an assistant answer and must not overwrite native messages.

Source: `src/agent.ts`, selected lines 134–139. Surrounding code omitted.

```typescript
stderr: (data) => {
          const text = redact(data);
          record.stderr = (record.stderr + text).slice(-64000);
          observe("stderr", { attempt: index, text });
        },
      };
```

### 5. Choose the labelled startup fault

A missing path, directory override or controlled Node exit fixture exercises the actual SDK startup and transport. The corrected attempt removes these overrides.

Source: `src/agent.ts`, selected lines 140–148. Surrounding code omitted.

```typescript
if (fault && c.mode === "badpath")
        options.pathToClaudeCodeExecutable = w.missingBinary;
      if (fault && c.mode === "badstart")
        options.pathToClaudeCodeExecutable = w.fixtures;
      if (fault && c.mode === "exit") {
        options.pathToClaudeCodeExecutable = w.exitScript;
        options.executable = "node";
      }
      if (wantsJson && !(fault && c.mode === "missing"))
```

### 6. Request the JSON schema when needed

Missing mode deliberately leaves outputFormat unset in its first attempt. Recovery supplies the small schema. This demonstrates an application guard, not an SDK defect.

Source: `src/agent.ts`, selected lines 148–154. Surrounding code omitted.

```typescript
if (wantsJson && !(fault && c.mode === "missing"))
        options.outputFormat = { type: "json_schema", schema: SIMPLE_SCHEMA };
      if (c.mode === "debug") {
        options.debug = true;
        options.debugFile = dirs.debugFile;
      }
      observe("query-options", {
```

### 7. Start one real query per attempt

query starts the real SDK with the selected options. Consume the async stream and retain every observed type and subtype rather than guessing from visible text.

Source: `src/agent.ts`, selected lines 169–180. Surrounding code omitted.

```typescript
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
```

### 8. Inspect initialization metadata

Read initialization model, tools, MCP servers, skills and plugin errors. An init message confirms startup, not successful task completion.

Source: `src/agent.ts`, selected lines 184–194. Surrounding code omitted.

```typescript
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
```

### 9. Preserve native result fields

Keep the native subtype, session, stop reason, denials, estimate and structured-output presence. A raw success result can still be followed by an SDK error exception.

Source: `src/agent.ts`, selected lines 228–237. Surrounding code omitted.

```typescript
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
```

### 10. Retain SDK exceptions separately

TypeScript may throw an ordinary Error. Preserve its name and full redacted report separately from the raw result; the diagnostic classifier reads both.

Source: `src/agent.ts`, selected lines 253–258. Surrounding code omitted.

```typescript
record.exception = {
          name: error instanceof Error ? error.name : "unknown",
          message: redact(String(error)),
        };
        observe("exception", { attempt: index, ...record.exception });
      }
```

### 11. Require structured field presence

A successful result without the requested field fails application validation. Presence is checked against undefined so valid false or zero values are not mistaken for absence.

Source: `src/diagnostics.ts`, selected lines 17–21. Surrounding code omitted.

```typescript
if (result.structuredOutput === undefined)
    throw new Error(
      "No structured output: native success alone does not satisfy this application's JSON requirement.",
    );
  return result.structuredOutput;
```

### 12. Read the native error report first

The exception report after the colon takes priority even if a raw result says success. Keep process exit, startup and native error reports distinct; do not rewrite provider fields.

Source: `src/diagnostics.ts`, selected lines 32–41. Surrounding code omitted.

```typescript
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
```

### 13. Rerun the corrected configuration

After a reproduced fault, make a fresh corrected attempt, verify the note is unchanged and publish independent recovery evidence. Finally remove only the unique temporary workspace.

Source: `src/agent.ts`, selected lines 306–314. Surrounding code omitted.

```typescript
if (fault && !controller.signal.aborted)
      await attempt("Apply the fix and rerun", false, c.mode === "missing");
    const after = await w.snapshot();
    const evidence = {
      mode: c.mode,
      attempts,
      results: attempts.flatMap((a) => (a.result ? [a.result] : [])),
      observations,
      fixtureUnchanged: before.hash === after.hash,
```

## Reference topics and limits

- Symptom map: Skills: Lesson 17; MCP authentication: 25; plugins: 20; subagents: 44; checkpoints: 42; hooks: 34; hosting: 48. This dashboard links those topics; it does not claim to reproduce every integration failure.
- Failure stages: Bad path and bad start use actual invalid executable overrides. Exit is a real Node child process fixture, not a real model process crash. Invalid model, turn limit and every corrected attempt use the actual bundled CLI and model service.
- Plain Error and native reports: TypeScript startup failures may be plain Error objects. Read the CLI report after Claude Code returned an error result:, preserve stderr and retain any raw result independently. The classifier never replaces the native status to make the UI look consistent.
- Python distinctions: The attached lesson also discusses Python native executable requirements on Windows and ClaudeSDKClient.connect(). This app is TypeScript; it does not claim to reproduce Python batch-file refusal or a missing Python client connection.
- Structured output: Success and field presence are independent checks. Missing mode deliberately omits outputFormat, then supplies a simple schema and permits StructuredOutput. A compatible small schema helps isolate a failure without promising every model or schema will succeed.
- Turn and spend limits: Read plus final output needs more than one turn. JSON can add a StructuredOutput call. SDK cost thresholds are estimates, not a hard prepaid spending cap. Authentication, model availability and provider credit can still prevent recovery.
- Debug privacy: Actual stderr, debug-file excerpts and context summaries can contain task text, paths or identifiers. This lab uses fictional notes, bounds its logs, redacts credentials and disables raw API body logging. Treat downloaded diagnostics as private; redaction is not comprehensive production DLP.
- Context and telemetry: Debug makes an actual getContextUsage summary call after the first assistant message. See Lesson 06 for context and compaction and Lesson 47 for OpenTelemetry. This lesson does not enable telemetry or raw HTTP bodies.
- Primary reference: https://code.claude.com/docs/en/agent-sdk/troubleshooting

## Validation

Run `npm test` and `npm run build:client`. Regenerate pages with `python scripts/build-pages.py`. Secrets, dependencies, recordings and teaching media are excluded from Git.
