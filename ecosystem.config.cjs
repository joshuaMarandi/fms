// PM2 process file for the production server.
//   pm2 start ecosystem.config.cjs && pm2 save
// The port comes from PORT in .env.local and must match the "App Port" of the Node.js site in CloudPanel.
const fs = require("fs");
const path = require("path");

function envPort() {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = fs.readFileSync(path.join(__dirname, file), "utf8");
      const m = text.match(/^\s*PORT\s*=\s*"?(\d+)"?\s*$/m);
      if (m) return m[1];
    } catch {
      // file missing: try the next one
    }
  }
  return process.env.PORT || "3111";
}

const port = envPort();

module.exports = {
  apps: [
    {
      name: "fms",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port} -H 127.0.0.1`,
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: port },
      max_memory_restart: "1G",
      // Stop retrying after repeated crashes so the error stays visible in `pm2 logs fms`.
      max_restarts: 10,
      min_uptime: "20s",
      restart_delay: 3000,
      time: true,
    },
  ],
};
