import { renderMarkdown } from "./markdown.js";
const $ = (id) => document.getElementById(id);
let rows = [], data = { traces: [], metrics: [], logs: [], requests: [] };
function json(id, value) {
    $(id).textContent = JSON.stringify(value, null, 2);
    window.Prism?.highlightElement($(id));
}
function table(id, records) {
    $(id).replaceChildren(...records.map((values) => {
        const tr = document.createElement("tr");
        for (const value of values) {
            const td = document.createElement("td");
            td.textContent = String(value ?? "—");
            tr.append(td);
        }
        return tr;
    }));
}
function draw() {
    const attempts = data.attempts || [], obs = data.observations || [], results = data.results || [];
    $("span-count").textContent = String(attempts.length);
    $("metric-count").textContent = String(results.length);
    $("log-count").textContent = String(attempts.filter((a) => a.diagnosis.category !== "success").length);
    table("trace-history", attempts.map((a) => [
        a.index,
        a.label,
        a.source,
        a.init.length,
        a.result?.status || "No native result",
        a.diagnosis.category,
    ]));
    table("metric-history", results.map((r) => [
        r.attempt,
        r.sessionId,
        r.status,
        r.stopReason ?? "—",
        r.structuredOutputPresent,
        r.costUsd,
    ]));
    const filter = $("user-filter").value.trim();
    table("log-history", attempts
        .filter((a) => !filter || a.diagnosis.category === filter)
        .map((a) => [
        a.index,
        a.diagnosis.category,
        a.diagnosis.summary,
        a.diagnosis.fix,
    ]));
    json("telemetry", obs);
    json("requests", attempts.map((a) => ({
        attempt: a.index,
        init: a.init,
        messages: a.messages,
    })));
}
$("user-filter").addEventListener("input", draw);
$("run").onclick = async () => {
    const button = $("run");
    button.disabled = true;
    rows = [];
    data = {};
    draw();
    $("conversation").replaceChildren();
    $("status").textContent = "Running actual SDK diagnostics and recovery…";
    json("evidence", {});
    json("storage", {});
    json("diagnostics", []);
    json("options", {});
    try {
        const response = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: $("mode").value }),
        });
        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "";
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            let boundary;
            while ((boundary = buffer.indexOf("\n\n")) >= 0) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                if (!frame.startsWith("data: "))
                    continue;
                const event = JSON.parse(frame.slice(6));
                rows.push(event);
                if (event.type === "telemetry") {
                    data = event.data;
                    draw();
                }
                if (event.type === "text") {
                    const article = document.createElement("article");
                    renderMarkdown(article, event.text);
                    $("conversation").append(article);
                }
                if (event.type === "observation" &&
                    event.observation.kind === "query-options")
                    json("options", event.observation.detail);
                if (event.type === "observation") {
                    data.observations ??= [];
                    data.observations.push(event.observation);
                }
                if (event.type === "diagnosis") {
                    data.attempts ??= [];
                    data.attempts.push(event.attempt);
                    draw();
                    const article = document.createElement("article");
                    renderMarkdown(article, "### Attempt " +
                        event.attempt.index +
                        " · " +
                        event.attempt.diagnosis.category +
                        "\n\n" +
                        event.attempt.diagnosis.summary +
                        "\n\n**Next step:** " +
                        event.attempt.diagnosis.fix);
                    $("conversation").append(article);
                }
                if (event.type === "result") {
                    json("native-result", event.result);
                    data.results ??= [];
                    data.results.push(event.result);
                    draw();
                }
                if (event.type === "evidence") {
                    data = event.evidence;
                    draw();
                    json("evidence", event.evidence);
                    json("storage", {
                        recoveryPassed: event.evidence.recoveryPassed,
                        scope: event.evidence.scope,
                        symptomMap: event.evidence.symptomMap,
                    });
                    json("diagnostics", event.evidence.attempts.map((a) => ({
                        attempt: a.index,
                        stderr: a.stderr,
                        exception: a.exception,
                        validationError: a.validationError,
                        debugLog: a.debugLog,
                        contextSnapshots: a.contextSnapshots,
                    })));
                    $("status").textContent =
                        "Complete · diagnostic and recovery evidence ready";
                }
                if (event.type === "error")
                    throw new Error(event.message || event.text || "Run failed.");
            }
        }
    }
    catch (error) {
        $("status").textContent = String(error);
    }
    finally {
        button.disabled = false;
    }
};
$("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson50-native-observations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
fetch("/api/config")
    .then((r) => r.json())
    .then((c) => {
    $("configuration").textContent = c.ready
        ? `Ready · ${c.model} · SDK debugging lab · private API key configured`
        : "Configure your private API key. See How to run.";
    $("run").disabled = !c.ready;
})
    .catch(() => {
    $("configuration").textContent = "Server unavailable. See How to run.";
});
