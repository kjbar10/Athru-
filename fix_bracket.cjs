const fs = require('fs');
let content = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8');
content = content.replace(`            )}
          </div>
          </div>`, `            )}
          </div>
        </div>`);
fs.writeFileSync('src/components/WorkoutTrackerTab.tsx', content);
