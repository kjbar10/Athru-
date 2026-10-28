const fs = require('fs');
let content = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8');

const targetStr = `        </div>
      ) : (
        /* WORKOUT IN PROGRESS: THE MAIN GYM COMPANION LOGGING DASHBOARD */`;

const replaceStr = `        </div>
        </div>
        </div>
      ) : (
        /* WORKOUT IN PROGRESS: THE MAIN GYM COMPANION LOGGING DASHBOARD */`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync('src/components/WorkoutTrackerTab.tsx', content);
