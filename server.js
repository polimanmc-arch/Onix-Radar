const { createApp } = require('./server/app');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║    📡 Radar Onix - Servidor              ║');
  console.log(`  ║  → http://localhost:${PORT}                  ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});
