// Diagnóstico de los hallazgos de docs/analisis-radar-onix.md.
// Los casos sintéticos originales (comisión duplicada, límite de pesos, drawdown, agregación 4H,
// alineación de retornos y semilla del portafolio) viven ahora como pruebas de regresión
// en tests/fixes.test.js, que ejecutan el motor completo en lugar de fragmentos del código.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const r = spawnSync(process.execPath, ['--test', path.join(root, 'tests', 'fixes.test.js')], { stdio: 'inherit' });
process.exitCode = r.status ?? 1;
