const fs = require('fs');
let code = fs.readFileSync('electron/main.js', 'utf8');
const lines = code.split('\n');
// Truncate at line 2210 where the duplicated logic started
const cleanCode = lines.slice(0, 2210).join('\n');
fs.writeFileSync('electron/main.js', cleanCode);
