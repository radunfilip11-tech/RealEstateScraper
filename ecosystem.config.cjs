/**
 * PM2 process manager config for VPS workers.
 *
 * Usage (on VPS, from project root):
 *   pm2 start ecosystem.config.cjs
 *   pm2 status
 *   pm2 logs
 *   pm2 restart all
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'monitor-w1',
      script: 'npm',
      args: 'run monitor -- --worker-id 1',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 50,
      min_uptime: '30s',
      restart_delay: 10000,
      out_file: 'logs/worker-1.log',
      error_file: 'logs/worker-1.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'monitor-w2',
      script: 'npm',
      args: 'run monitor -- --worker-id 2',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 50,
      min_uptime: '30s',
      restart_delay: 10000,
      out_file: 'logs/worker-2.log',
      error_file: 'logs/worker-2.log',
      merge_logs: true,
      time: true,
    },
  ],
};
