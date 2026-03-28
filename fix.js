const fs = require('fs');
let lines = fs.readFileSync('electron/main.js', 'utf8').split('\n');
// Truncate at line 2211 (where duplicated start or logic broke)
lines = lines.slice(0, 2210); 
fs.writeFileSync('electron/main.js', lines.join('\n') + "\n");
