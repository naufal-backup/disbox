const fs = require('fs');
let code = fs.readFileSync('electron/main.js', 'utf8');

// Hapus bagian penutup yang rusak jika ada
code = code.trim();
if (code.endsWith('});')) {
    // Kita biarkan dulu, tapi kita hitung balance
}

let open = 0, close = 0;
for (let i = 0; i < code.length; i++) {
    if (code[i] === '{') open++;
    if (code[i] === '}') close++;
}

console.log('Current balance:', open - close);

if (open > close) {
    console.log('Adding', open - close, 'closing braces...');
    code += '\n' + '}'.repeat(open - close);
}

fs.writeFileSync('electron/main.js', code);
