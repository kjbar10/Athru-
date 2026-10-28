const fs = require('fs');
const content = fs.readFileSync('src/components/StretchingTrackerTab.tsx', 'utf-8');
console.log("File length:", content.split('\n').length);
