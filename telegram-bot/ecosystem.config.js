// pm2 config — รันบอทค้างไว้ (โหมด fork กัน polling ชนกัน เหมือน slip-bot)
module.exports = {
  apps: [
    {
      name: "wp-mcp-bot",
      script: "src/bot.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production" },
    },
  ],
};
