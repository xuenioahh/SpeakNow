import { spawn } from "node:child_process";

const children = [];
const frontendOrigin = new URL(process.env.SPEAKNOW_ORIGIN || 'http://localhost:5173');
if (frontendOrigin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(frontendOrigin.hostname)) {
  throw new Error('For local development, set SPEAKNOW_ORIGIN to an http localhost URL.');
}

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, SPEAKNOW_ORIGIN: frontendOrigin.origin },
  });

  child.on("exit", (code, signal) => {
    if (signal || code) {
      process.exitCode = code || 1;
      shutdown();
    }
  });

  children.push({ name, child });
}

function shutdown() {
  while (children.length) {
    const { child } = children.pop();
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start("backend", process.execPath, ["backend/server.js"]);
start("frontend", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:frontend", "--", "--host", frontendOrigin.hostname.replace(/^\[|\]$/g, ""), "--port", frontendOrigin.port || "80", "--strictPort"]);
