const fs = require('fs');
const content = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8');

let divCount = 0;
let lines = content.split('\n');
for (let i=0; i<lines.length; i++) {
  const line = lines[i];
  const opens = (line.match(/<div/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  divCount += opens - closes;
  if (divCount < 0) {
      console.log(`Negative div count at line ${i}`);
  }
}
console.log("Total div imbalance in block:", divCount);
