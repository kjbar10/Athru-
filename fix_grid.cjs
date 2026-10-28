const fs = require('fs');
let content = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8');

const target = `            )}
          </div>
        </div>
      ) : (
        /* WORKOUT IN PROGRESS: THE MAIN GYM COMPANION LOGGING DASHBOARD */`;

const replacement = `            )}
          </div>
        </div>
        </div>
      ) : (
        /* WORKOUT IN PROGRESS: THE MAIN GYM COMPANION LOGGING DASHBOARD */`;

content = content.replace(target, replacement);
fs.writeFileSync('src/components/WorkoutTrackerTab.tsx', content);
