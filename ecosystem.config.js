module.exports = {
  apps: [
    {
      name: 'tshirt-backend',
      script: 'backend/dist/app.js',
      cwd: 'backend',
      interpreter: 'node',
      autorestart: true,
      max_memory_restart: '200M',
    },
    {
      name: 'tshirt-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      cwd: 'frontend',
      interpreter: '/usr/bin/node',
      autorestart: true,
      max_memory_restart: '300M',
    },
    {
      name: 'tshirt-worker',
      script: 'dist/worker.js',
      cwd: 'backend',
      interpreter: 'node',
      autorestart: true,
      max_memory_restart: '300M',
    },
  ],
};
