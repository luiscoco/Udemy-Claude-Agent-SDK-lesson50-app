import { runAgent, validateConfig } from "./agent.js";
await runAgent(
  validateConfig({ mode: process.argv[2] || "healthy" }),
  (event) => {
    if (["diagnosis", "evidence"].includes(event.type))
      console.log(JSON.stringify(event));
  },
);
