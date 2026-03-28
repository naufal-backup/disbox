const fs = require('fs');
const code = fs.readFileSync('electron/main.js', 'utf8');
const lines = code.split('\n');
let balance = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let char of line) {
        if (char === '{') balance++;
        if (char === '}') balance--;
    }
    if (balance < 0) {
        console.log('Balance dropped below 0 at line', i + 1, ':', line);
        // Reset balance to debug further if needed
        // balance = 0;
    }
}
console.log('Final balance:', balance);
