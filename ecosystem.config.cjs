// PM2 process file for the production server.
//   pm2 start ecosystem.config.cjs && pm2 save
// The port must match the "App Port" of the Node.js site in CloudPanel.
module.exports = {
  apps: [
    {
      name: "fms",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3010 -H 127.0.0.1",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1G",
      time: true,
    },
  ],
};
