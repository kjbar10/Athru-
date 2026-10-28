const fs = require('fs');
let content = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8');

const targetStr = `            )}
          </div>
        </div>
      ) : (`;

const replaceStr = `            )}
          </div>
        </div>
        </div>
        </div>
      ) : (`;

content = content.replace(targetStr, replaceStr);
fs.writeFileSync('src/components/WorkoutTrackerTab.tsx', content);
