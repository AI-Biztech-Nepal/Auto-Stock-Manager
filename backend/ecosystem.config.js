module.exports = {
  apps: [
    {
      name: 'auto-stock-backend',
      cwd: __dirname,
      script: 'venv/bin/uvicorn',
      args: 'server:app --host 127.0.0.1 --port 8001',
      interpreter: 'none',
    },
  ],
};
