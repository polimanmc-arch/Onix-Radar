const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { checkUiEncoding } = require('./check-ui-encoding');

checkUiEncoding();

const files = [
  'public/app/ui/chartModal.js',
  'public/app/ui/appHeader.js',
  'public/app/ui/tabNav.js',
  'public/app/ui/selectedChartLayer.js',
  'public/app/ui/scannerTab.js',
  'public/app/ui/portfolioTab.js',
  'public/app/ui/backtestTab.js',
  'public/app/main.js',
];

const diagnostics = [];
const outputs = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      jsx: ts.JsxEmit.React,
      jsxFactory: 'React.createElement',
      jsxFragmentFactory: 'React.Fragment',
      allowJs: true,
      checkJs: false,
      module: ts.ModuleKind.None,
      removeComments: false,
      ignoreDeprecations: '6.0',
    },
    fileName: path.basename(file).replace(/\.js$/, '.jsx'),
    reportDiagnostics: true,
  });
  if (out.diagnostics?.length) diagnostics.push(...out.diagnostics.map(d => ({ file, d })));
  const outPath = file.replace('public/app/', 'public/app/compiled/');
  outputs.push({ outPath, text: out.outputText });
}

if (diagnostics.length) {
  for (const { file, d } of diagnostics) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    console.error(`[${file}] ${msg}`);
  }
  process.exitCode = 1;
} else {
  for (const { outPath, text } of outputs) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, text, 'utf8');
  }
  console.log('JSX precompiled successfully.');
}
