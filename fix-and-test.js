const fs = require('fs');
const content = fs.readFileSync('electron/main.js', 'utf8');
try {
    new Function(content);
    console.log('Syntax OK');
} catch (e) {
    console.log('Syntax Error:', e.message);
    const lines = content.split('\n');
    console.log('Problem near line:', e.lineNumber || 'unknown');
}
