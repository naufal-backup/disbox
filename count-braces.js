const fs = require('fs');
const code = fs.readFileSync('electron/main.js', 'utf8');
let open = 0, close = 0;
for (let i = 0; i < code.length; i++) {
  if (code[i] === '{') open++;
  if (code[i] === '}') close++;
}
console.log('Open:', open, 'Close:', close, 'Balance:', open - close);
