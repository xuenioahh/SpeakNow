import { spawn } from "node:child_process";

const children = [];

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
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
start("frontend", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:frontend"]);
