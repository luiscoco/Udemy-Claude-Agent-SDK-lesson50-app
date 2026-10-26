import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, createHash } from "node:crypto";
export const NOTE =
  "Fictional classroom policy: inspect initialization, native results and stderr before changing configuration. Classroom code TRACE-50.\n";
export async function prepareWorkspace() {
  const parent = resolve(realpathSync.native(tmpdir()), "claude-sdk50"),
    root = join(parent, randomUUID()),
    cwd = join(root, "project"),
    fixtures = join(root, "transport-fixtures");
  for (const p of [cwd, fixtures]) await mkdir(p, { recursive: true });
  await writeFile(join(cwd, "note.txt"), NOTE);
  const exitScript = join(fixtures, "exit-cli.js");
  await writeFile(
    exitScript,
    'process.stderr.write("CLASSROOM-50: controlled CLI fixture exits before init\\n"); process.exit(7);\n',
  );
  return {
    cwd,
    fixtures,
    exitScript,
    missingBinary: join(fixtures, "no-such-claude.exe"),
    async attempt(index: number) {
      const home = join(root, "attempt-" + index, "home"),
        config = join(root, "attempt-" + index, "config"),
        debugFile = join(root, "attempt-" + index, "cli-debug.log");
      await mkdir(home, { recursive: true });
      await mkdir(config, { recursive: true });
      return { home, config, debugFile };
    },
    async snapshot() {
      const text = await readFile(join(cwd, "note.txt"), "utf8");
      return { text, hash: createHash("sha256").update(text).digest("hex") };
    },
    async cleanup() {
      const p = relative(parent, root);
      if (!p || p.startsWith("..") || isAbsolute(p))
        throw new Error("Invalid classroom cleanup path.");
      await rm(root, { recursive: true, force: true });
    },
  };
}
