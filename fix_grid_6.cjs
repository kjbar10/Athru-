const fs = require('fs');
let lines = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8').split('\n');

let d = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  d += opens - closes;
  if (i > 2880 && i < 2930) {
     console.log(`${i}: ${d} | ${line}`);
  }
}
