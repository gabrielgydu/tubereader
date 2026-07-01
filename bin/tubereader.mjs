#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const dataDir = join(projectRoot, ".tubereader");
const pidFile = join(dataDir, "server.pid");
const logFile = join(dataDir, "server.log");

if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const command = process.argv[2];

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start() {
  if (existsSync(pidFile)) {
    const pid = parseInt(readFileSync(pidFile, "utf8"), 10);
    if (isRunning(pid)) {
      console.log(`tubereader is already running (pid ${pid})`);
      process.exit(0);
    }
    unlinkSync(pidFile);
  }

  const { openSync } = await import("node:fs");
  const out = openSync(logFile, "a");
  const child = spawn("npm", ["run", "dev"], {
    cwd: projectRoot,
    detached: true,
    stdio: ["ignore", out, out],
  });

  writeFileSync(pidFile, String(child.pid));
  child.unref();
  console.log(`tubereader started (pid ${child.pid})`);
  console.log(`logs: ${logFile}`);
}

function stop() {
  if (!existsSync(pidFile)) {
    console.log("tubereader is not running");
    process.exit(0);
  }

  const pid = parseInt(readFileSync(pidFile, "utf8"), 10);
  if (!isRunning(pid)) {
    console.log("tubereader is not running (stale pid file removed)");
    unlinkSync(pidFile);
    process.exit(0);
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
  unlinkSync(pidFile);
  console.log(`tubereader stopped (pid ${pid})`);
}

function status() {
  if (!existsSync(pidFile)) {
    console.log("tubereader is not running");
    process.exit(0);
  }
  const pid = parseInt(readFileSync(pidFile, "utf8"), 10);
  if (isRunning(pid)) {
    console.log(`tubereader is running (pid ${pid})`);
  } else {
    console.log("tubereader is not running (stale pid file removed)");
    unlinkSync(pidFile);
  }
}

function logs() {
  if (!existsSync(logFile)) {
    console.log("No logs yet");
    process.exit(0);
  }
  execSync(`tail -f ${logFile}`, { stdio: "inherit" });
}

const actions = { start, stop, status, logs, build, serve };

function build() {
  execSync("npm run build", { cwd: projectRoot, stdio: "inherit" });
}

function serve() {
  execSync("npm run start", { cwd: projectRoot, stdio: "inherit" });
}

if (!command || !actions[command]) {
  console.log("Usage: tubereader <command>\n");
  console.log("Commands:");
  console.log("  start    Start the dev server in the background");
  console.log("  stop     Stop the dev server");
  console.log("  status   Check if the server is running");
  console.log("  logs     Tail the server logs");
  console.log("  build    Build for production");
  console.log("  serve    Serve the production build");
  process.exit(command ? 1 : 0);
}

await actions[command]();
