const fs = require('fs');
const content = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8');
const parts = content.split('/* NO WORKOUT IN PROGRESS: PRESET SEARCH & LIST VIEW */');
const activePart = parts[1].split('/* WORKOUT IN PROGRESS: THE MAIN GYM COMPANION LOGGING DASHBOARD */')[0];
console.log(activePart.split('\n').slice(-20).join('\n'));
