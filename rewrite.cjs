const fs = require('fs');
const content = fs.readFileSync('src/components/StretchingTrackerTab.tsx', 'utf-8');
const target = 'if (isRoutineActive) {';
const index = content.indexOf(target);
const newContent = content.substring(0, index) + 
`if (isRoutineActive) {
    if (showCompletionScreen) {
      const totalSecondsElapsed = selectedRoutine.poses.reduce((acc, p) => acc + (p.holdSeconds || 30), 0);
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 space-y-6 animate-in zoom-in duration-500">
          <div className="bg-zinc-900/90 border border-zinc-800 p-8 rounded-2xl shadow-2xl max-w-lg w-full text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="w-10 h-10" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase font-bold text-emerald-400 tracking-wider">
                {selectedRoutine.title}
              </span>
              <h3 className="text-3xl font-black text-white">Stretching Protocol Complete!</h3>
              <p className="text-sm text-zinc-300 max-w-md mx-auto mt-2">
                Excellent job! You completed {completedPoseIds.length + 1} poses across {formatRoutineDuration(totalSecondsElapsed)} of guided mobility work.
              </p>
            </div>
            <button
              onClick={() => {
                setShowCompletionScreen(false);
                setIsRoutineActive(false);
                setSelectedRoutine(CURATED_STRETCH_ROUTINES[0]);
                setCurrentPoseIndex(0);
                setCompletedPoseIds([]);
              }}
              className="w-full py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg transition shadow-lg cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" /> Return to Hub
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 pb-24 animate-in fade-in duration-300">
        <div className="bg-zinc-900/95 border border-zinc-800 p-4 sm:p-5 rounded-2xl shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={() => setShowExitConfirm(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition text-xs font-bold cursor-pointer shrink-0 shadow"
            >
              <ArrowLeft className="w-4 h-4 text-emerald-400" />
              <span>Exit Protocol</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  {selectedRoutine.category} Protocol
                </span>
                {isTimerRunning && (
                  <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live In-Progress
                  </span>
                )}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white truncate tracking-tight mt-0.5">
                {selectedRoutine.title}
              </h2>
            </div>
          </div>
        </div>

        {/* COMBINED BOX: VIDEO + TIMER */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-8 max-w-4xl mx-auto">
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold px-3 py-1 rounded-full">
                {currentPose.targetArea}
              </span>
              <span className="text-xs text-zinc-400 font-mono">
                {currentPose.type.toUpperCase()}
              </span>
            </div>
            <h3 className="text-3xl font-black text-white tracking-tight mt-1">
              {currentPose.name}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* VIDEO SIDE */}
            <div className="flex justify-center">
              <StretchAnimationViewer pose={currentPose} onClose={() => {}} />
            </div>

            {/* TIMER SIDE */}
            <div className="space-y-8 flex flex-col items-center">
              <div className="relative w-56 h-56 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <defs>
                    <linearGradient id="emeraldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#14b8a6" />
                    </linearGradient>
                  </defs>
                  <circle cx="112" cy="112" r="96" stroke="#18181b" strokeWidth="16" fill="transparent" />
                  <circle 
                    cx="112" cy="112" r="96" 
                    stroke="url(#emeraldGradient)" 
                    strokeWidth="16" fill="transparent" 
                    strokeDasharray={2 * Math.PI * 96} 
                    strokeDashoffset={(2 * Math.PI * 96) - ((2 * Math.PI * 96) * progressPercent) / 100} 
                    strokeLinecap="round" 
                    className="transition-all duration-300" 
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
                  <span className={\`text-6xl font-black font-mono tracking-tighter transition-all \${isTimerRunning ? "text-emerald-400" : "text-white"}\`}>
                    {secondsRemaining}s
                  </span>
                  <span className="text-xs text-zinc-400 font-mono uppercase tracking-widest font-bold">
                    {isTimerRunning ? "HOLDING POSE" : "TIMER PAUSED"}
                  </span>
                </div>
              </div>

              {/* TACTILE CONTROLS */}
              <div className="flex items-center justify-center gap-4">
                <button onClick={handlePrevPose} disabled={currentPoseIndex === 0} className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition shadow" title="Previous Pose">
                  <ChevronLeft className="w-7 h-7" />
                </button>
                <button onClick={handlePauseResume} className={\`w-20 h-20 rounded-2xl font-bold shadow-2xl transition transform active:scale-95 flex items-center justify-center \${isTimerRunning ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20" : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30"}\`} title={isTimerRunning ? "Pause Timer" : "Start Timer"}>
                  {isTimerRunning ? <Pause className="w-10 h-10" /> : <Play className="w-10 h-10 ml-1" />}
                </button>
                <button onClick={handleSkipPose} className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition shadow" title="Skip to Next Pose">
                  <SkipForward className="w-7 h-7" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {showExitConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-2xl max-w-sm w-full space-y-5 animate-in zoom-in-95 duration-200">
              <div className="flex items-start gap-3 text-amber-400">
                <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-base text-white tracking-tight">End Routine Early?</h4>
                  <p className="text-xs text-zinc-400 font-medium leading-relaxed">
                    You have not completed all poses. Are you sure you want to exit the protocol now?
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowExitConfirm(false)} className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition cursor-pointer">
                  Cancel, Resume
                </button>
                <button onClick={() => { setShowExitConfirm(false); setIsRoutineActive(false); }} className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-black border border-amber-500/20 transition cursor-pointer">
                  Yes, Exit Protocol
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // MAIN HUB VIEW (NO ACTIVE ROUTINE)
  // =========================================================================
  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="text-center space-y-4 pt-4">
        <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
          Stretching & Recovery Studio
        </h2>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-1 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl mx-auto w-full max-w-lg shadow-inner">
        {(["pre-post", "yoga", "generator"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveHubTab(tab)}
            className={\`flex-1 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-300 cursor-pointer \${activeHubTab === tab ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"}\`}
          >
            {tab === "pre-post" && <Wind className="w-4 h-4" />}
            {tab === "yoga" && <Layers className="w-4 h-4" />}
            {tab === "generator" && <Sparkles className="w-4 h-4" />}
            {tab === "pre-post" ? "Pre/Post Protocol" : tab === "yoga" ? "Yoga & Mobility" : "AI Generator"}
          </button>
        ))}
      </div>

      {activeHubTab === "pre-post" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-3 items-center bg-zinc-950 p-2 rounded-xl border border-zinc-800">
            <span className="text-zinc-400 font-bold text-xs uppercase tracking-wider pl-2 shrink-0">Filter by Target Area:</span>
            <div className="flex flex-1 w-full gap-2 items-center">
              <div className="relative flex-1 w-full">
                <select value={protocolCategoryFilter} onChange={(e) => setProtocolCategoryFilter(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-bold rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer appearance-none">
                  <option value="" disabled>Select Target Area...</option>
                  <option value="All">All Areas</option>
                  <option value="Full Body">Full Body</option>
                  <option value="Lower Body">Lower Body</option>
                  <option value="Upper Body">Upper Body</option>
                  <option value="Lower Back">Lower Back</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
              {protocolCategoryFilter && (
                <button onClick={() => setProtocolCategoryFilter("")} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition shadow-sm"><X className="w-4 h-4" /></button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GENERATED_PRE_POST_ROUTINES.filter(r => protocolCategoryFilter === "All" || !protocolCategoryFilter || r.category.includes(protocolCategoryFilter)).map((routine, idx) => (
              <div key={idx} onClick={() => { setSelectedRoutine(routine); setCurrentPoseIndex(0); setSecondsRemaining(routine.poses[0].holdSeconds); setIsTimerRunning(false); setCompletedPoseIds([]); setIsRoutineActive(true); }} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl hover:border-emerald-500/50 transition cursor-pointer group shadow">
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-zinc-800 text-emerald-400">{routine.category}</span>
                  <span className="text-[11px] font-mono font-bold text-zinc-400 bg-zinc-950 px-2 py-1 rounded flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{routine.estimatedMinutes}m</span>
                </div>
                <h3 className="text-lg font-bold text-zinc-200 group-hover:text-emerald-400 transition">{routine.title}</h3>
                <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{routine.description}</p>
                <div className="mt-4 pt-4 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 font-mono">{routine.poses.length} poses included</span>
                  <button className="text-xs font-bold text-emerald-400 flex items-center gap-1 group-hover:gap-2 transition-all"><Play className="w-3.5 h-3.5" /> Start</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeHubTab === "yoga" && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-3 items-center bg-zinc-950 p-2 rounded-xl border border-zinc-800">
            <span className="text-zinc-400 font-bold text-xs uppercase tracking-wider pl-2 shrink-0">Filter by Target Area:</span>
            <div className="flex flex-1 w-full gap-2 items-center">
              <div className="relative flex-1 w-full">
                <select value={yogaCategoryFilter} onChange={(e) => setYogaCategoryFilter(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs font-bold rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer appearance-none">
                  <option value="" disabled>Select Target Area...</option>
                  <option value="All">All Areas</option>
                  <option value="Full Body">Full Body</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                  <ChevronDown className="w-4 h-4" />
                </div>
              </div>
              {yogaCategoryFilter && (
                <button onClick={() => setYogaCategoryFilter("")} className="p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition shadow-sm"><X className="w-4 h-4" /></button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {GENERATED_YOGA_ROUTINES.filter(r => yogaCategoryFilter === "All" || !yogaCategoryFilter || r.category.includes(yogaCategoryFilter)).map((routine, idx) => (
              <div key={idx} onClick={() => { setSelectedRoutine(routine); setCurrentPoseIndex(0); setSecondsRemaining(routine.poses[0].holdSeconds); setIsTimerRunning(false); setCompletedPoseIds([]); setIsRoutineActive(true); }} className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl hover:border-emerald-500/50 transition cursor-pointer group shadow">
                <div className="flex justify-between items-start mb-3">
                  <span className="px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-zinc-800 text-emerald-400">{routine.category}</span>
                  <span className="text-[11px] font-mono font-bold text-zinc-400 bg-zinc-950 px-2 py-1 rounded flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{routine.estimatedMinutes}m</span>
                </div>
                <h3 className="text-lg font-bold text-zinc-200 group-hover:text-emerald-400 transition">{routine.title}</h3>
                <p className="text-xs text-zinc-400 mt-2 line-clamp-2">{routine.description}</p>
                <div className="mt-4 pt-4 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 font-mono">{routine.poses.length} poses included</span>
                  <button className="text-xs font-bold text-emerald-400 flex items-center gap-1 group-hover:gap-2 transition-all"><Play className="w-3.5 h-3.5" /> Start</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeHubTab === "generator" && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Describe Your Need</h3>
            <textarea
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-4 h-32 resize-none"
              placeholder="E.g., I have tight shoulders from sitting at my desk all day..."
            />
            <button className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition shadow">
              Generate Routine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
`;
fs.writeFileSync('src/components/StretchingTrackerTab.tsx', newContent);
