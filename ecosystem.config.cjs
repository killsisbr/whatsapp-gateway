module.exports = {
  apps: [{
    name: 'whatsapp-gateway',
    script: 'D:/WHATSAPP-GATEWAY/dist/index.js',
    cwd: 'D:/WHATSAPP-GATEWAY',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
    },
    out_file: 'D:/WHATSAPP-GATEWAY/logs/gateway-out.log',
    error_file: 'D:/WHATSAPP-GATEWAY/logs/gateway-err.log',
    merge_logs: true,
    time: true,
  }],
};