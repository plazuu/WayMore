// Usage (from server/): npm run dev:all
// Starts backend/ (narration, port 3001) and server/ (the app's single base
// URL, port 3000) in watch mode in one terminal. Ctrl+C stops both.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const serverDir = path.resolve(__dirname, "../..");
const backendDir = path.resolve(serverDir, "../backend");

for (const dir of [serverDir, backendDir]) {
  if (!existsSync(path.join(dir, "node_modules"))) {
    console.error(`Missing ${path.relative(process.cwd(), dir) || "."}/node_modules: run npm install there first.`);
    process.exit(1);
  }
}

const isWindows = process.platform === "win32";
const children: ChildProcess[] = [];
let stopping = false;

function start(name: string, cwd: string, color: number) {
  // Own process group, so stopping it also stops npm's tsx child. On Windows npm
  // is npm.cmd (needs a shell) and detached would open a new console window;
  // stop() kills the tree with taskkill instead.
  const child = spawn(isWindows ? "npm run dev" : "npm", isWindows ? [] : ["run", "dev"], {
    cwd,
    detached: !isWindows,
    shell: isWindows,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = `\x1b[${color}m[${name}]\x1b[0m `;
  for (const stream of [child.stdout, child.stderr]) {
    let partial = "";
    stream.on("data", (chunk: Buffer) => {
      const lines = (partial + chunk.toString()).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(tag + line + "\n");
    });
  }
  child.on("exit", (code) => {
    if (stopping) return;
    console.log(`${tag}exited with code ${code}; stopping the other service`);
    stop(code ?? 1);
  });
  children.push(child);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (!child.pid) continue;
      if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start("backend", backendDir, 35);
start("server ", serverDir, 36);
