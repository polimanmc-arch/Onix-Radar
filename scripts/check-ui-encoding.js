const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const ts = require('typescript');

function checkUiEncoding(root = path.join(__dirname, '..', 'public')) {
  const errors = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'compiled') continue; // regenerated from validated sources
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!/\.(js|css|html|svg)$/.test(file)) continue;
      let source;
      try { source = decoder.decode(fs.readFileSync(file)); }
      catch { errors.push(`${file}: invalid UTF-8`); continue; }
      if (/\ufffd|\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf]|\u00f0\u0178/.test(source)) {
        errors.push(`${file}: damaged Unicode text`);
      }
      if (!file.endsWith('.js')) continue;
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
      function visit(node) {
        if (ts.isStringLiteral(node) || ts.isJsxText(node) || ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
          const text = node.text.trim();
          // Query-string separators in URLs are legitimate question marks.
          if (!text.startsWith('/') && !text.includes('://') && /\p{L}\?\p{L}/u.test(text)) {
            const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
            errors.push(`${file}:${line}: possible lost accent: ${JSON.stringify(text)}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(parsed);
    }
  }
  walk(root);
  if (errors.length) throw new Error(errors.join('\n'));
}

module.exports = { checkUiEncoding };
if (require.main === module) {
  try { checkUiEncoding(); console.log('UI text encoding verified.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
