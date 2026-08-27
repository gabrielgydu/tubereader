#!/usr/bin/env node

import { spawn, execSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");
const dataDir = join(projectRoot, ".tubereader");
const pidFile = join(dataDir, "server.pid");
const logFile = join(dataDir, "server.log");

const UNIT = "tubereader.service";
const PORT = 3700;
const HTTPS_PORT = 10001;

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

/**
 * Is the systemd --user production service up? It owns the same port as the
 * dev server, so the two can never run at once.
 */
function serviceActive() {
  try {
    execFileSync("systemctl", ["--user", "is-active", "--quiet", UNIT]);
    return true;
  } catch {
    return false;
  }
}

function systemctl(...args) {
  execFileSync("systemctl", ["--user", ...args], { stdio: "inherit" });
}

async function start() {
  if (serviceActive()) {
    console.error(
      `The production service holds :${PORT}.\n` +
        `Stop it first:  tubereader service stop`
    );
    process.exit(1);
  }

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
  if (serviceActive()) {
    console.log(`tubereader is running as the ${UNIT} production service`);
    console.log(`  tailnet: ${tailnetUrl() ?? `https://<this host>:${HTTPS_PORT}/`}`);
    return;
  }

  if (!existsSync(pidFile)) {
    console.log("tubereader is not running");
    process.exit(0);
  }
  const pid = parseInt(readFileSync(pidFile, "utf8"), 10);
  if (isRunning(pid)) {
    console.log(`tubereader is running (dev server, pid ${pid})`);
  } else {
    console.log("tubereader is not running (stale pid file removed)");
    unlinkSync(pidFile);
  }
}

function logs() {
  if (serviceActive()) {
    systemctl("--no-pager", "status", UNIT);
    execSync(`journalctl --user -u ${UNIT} -f`, { stdio: "inherit" });
    return;
  }
  if (!existsSync(logFile)) {
    console.log("No logs yet");
    process.exit(0);
  }
  execSync(`tail -f ${logFile}`, { stdio: "inherit" });
}

function build() {
  execSync("npm run build", { cwd: projectRoot, stdio: "inherit" });
}

function serve() {
  execSync("npm run start", { cwd: projectRoot, stdio: "inherit" });
}

/** Rebuild + restart the production service and (re)publish it on the tailnet. */
function install() {
  execFileSync(join(projectRoot, "install.sh"), [], {
    cwd: projectRoot,
    stdio: "inherit",
  });
}

function service() {
  const sub = process.argv[3] ?? "status";
  const allowed = ["status", "start", "stop", "restart", "enable", "disable"];
  if (!allowed.includes(sub)) {
    console.error(`Usage: tubereader service <${allowed.join("|")}>`);
    process.exit(1);
  }
  if (sub === "status") {
    systemctl("--no-pager", "status", UNIT);
    return;
  }
  systemctl(sub, UNIT);
  console.log(`${UNIT}: ${sub}`);
}

/** The HTTPS URL Tailscale Serve publishes this app on, if it can be resolved. */
function tailnetUrl() {
  try {
    const json = JSON.parse(
      execFileSync("tailscale", ["status", "--json"], { encoding: "utf8" })
    );
    const host = String(json.Self.DNSName).replace(/\.$/, "");
    return `https://${host}:${HTTPS_PORT}/`;
  } catch {
    return null;
  }
}

function url() {
  const resolved = tailnetUrl();
  if (!resolved) {
    console.error("Could not read the tailnet hostname — is tailscaled up?");
    process.exit(1);
  }
  console.log(resolved);
}

const actions = { start, stop, status, logs, build, serve, install, service, url };

if (!command || !actions[command]) {
  console.log("Usage: tubereader <command>\n");
  console.log("Commands:");
  console.log("  start          Start the dev server in the background");
  console.log("  stop           Stop the dev server");
  console.log("  status         Report which server, if any, is running");
  console.log("  logs           Tail the running server's logs");
  console.log("  build          Build for production");
  console.log("  serve          Serve the production build in the foreground");
  console.log("  install        Build, (re)start the service, publish on the tailnet");
  console.log("  service <cmd>  status|start|stop|restart|enable|disable the service");
  console.log("  url            Print the tailnet HTTPS URL");
  process.exit(command ? 1 : 0);
}

await actions[command]();
