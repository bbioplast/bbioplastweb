const fs = require('node:fs');
const path = require('node:path');
const { Script } = require('node:vm');

const root = path.join(__dirname, '..');
let count = 0;
for (const directory of ['', 'public', 'scripts', 'tests']) {
  for (const file of fs.readdirSync(path.join(root, directory))) {
    if (!/\.(js|cjs)$/.test(file)) continue;
    // Ignore local one-off task helpers; application modules are .js.
    if (!directory && file.endsWith('.cjs')) continue;
    const filename = path.join(root, directory, file);
    if (!fs.statSync(filename).isFile()) continue;
    new Script(fs.readFileSync(filename, 'utf8'), { filename });
    count++;
  }
}
console.log(`Syntax checked ${count} JavaScript files.`);
