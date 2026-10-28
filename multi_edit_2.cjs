const fs = require('fs');
let content = fs.readFileSync('src/components/WorkoutTrackerTab.tsx', 'utf-8');

const topTarget = `        <div className="flex flex-col gap-5">
          

          {/* Main Selection Card: Create Blank Workout */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <h3 className="text-zinc-100 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-blue-500" />
                <span>Custom Workout Tracker</span>
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Start a completely blank gym session to track custom exercises, sets, weights, and reps dynamically as you train.
              </p>
            </div>

            <button
              onClick={() => startBlankWorkout()}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-blue-900/20 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Blank Workout</span>
            </button>
          </div>

          {/* Preset Workouts Dropdown Selector */}
          <div className="flex flex-col gap-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-blue-500" />
                  <span>Select a Pre-designed Workout Template</span>
                </label>
                <p className="text-[11px] text-zinc-500">
                  Choose from one of our science-backed full workout splits to load sets and reps instantly.
                </p>
              </div>`;

const topReplace = `        <div className="flex flex-col gap-5">
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 relative items-stretch">
            {/* Main Selection Card: Create Blank Workout */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col justify-between gap-6 h-full relative z-10">
              <div className="space-y-2">
                <h3 className="text-zinc-100 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  <Dumbbell className="w-4 h-4 text-blue-500" />
                  <span>Custom Workout Tracker</span>
                </h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Start a completely blank gym session to track custom exercises, sets, weights, and reps dynamically as you train.
                </p>
              </div>

              <button
                onClick={() => startBlankWorkout()}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-lg shadow-blue-900/20 w-full mt-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Create Blank Workout</span>
              </button>
            </div>

            <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-center z-20">
              <span className="bg-zinc-950 text-zinc-500 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border border-zinc-800 shadow-sm">Or</span>
            </div>
            
            <div className="flex lg:hidden items-center justify-center -my-2 relative z-20 w-full">
              <span className="bg-zinc-950 text-zinc-500 text-[10px] font-bold uppercase tracking-widest px-4">Or</span>
              <div className="absolute w-full h-px bg-zinc-800 left-0 right-0 -z-10"></div>
            </div>

            {/* Preset Workouts Dropdown Selector */}
            <div className="flex flex-col justify-between gap-6 bg-zinc-900/60 border border-zinc-850 rounded-2xl p-6 shadow-xl h-full relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="flex flex-col gap-2">
                  <label className="text-zinc-300 font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-blue-500" />
                    <span>Select a Pre-designed Workout Template</span>
                  </label>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Choose from one of our science-backed full workout splits to load sets and reps instantly.
                  </p>
                </div>`;

const bottomTargetMatch = /              <\/div>\n            \)}\n          <\/div>\n        <\/div>\n      \) : \(/;

if (content.includes(topTarget) && bottomTargetMatch.test(content)) {
   content = content.replace(topTarget, topReplace);
   content = content.replace(bottomTargetMatch, `              </div>\n            )}\n          </div>\n        </div>\n        </div>\n      ) : (`);
   fs.writeFileSync('src/components/WorkoutTrackerTab.tsx', content);
   console.log("Success");
} else {
   console.log("Did not match target strings");
   if (!content.includes(topTarget)) console.log("Missing topTarget");
   if (!bottomTargetMatch.test(content)) console.log("Missing bottomTarget");
}
