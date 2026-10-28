const fs = require('fs');

const createPose = (id, name, targetArea, time, type = "static", instructions = ["Follow the movement", "Breathe deeply"]) => ({
  id, name, targetArea, holdSeconds: time, type,
  instructions,
  tips: "Keep breathing.",
  benefits: "Improves flexibility and mobility."
});

const prePostRoutines = [];
const prePostAreas = ["Full Body", "Lower Body", "Upper Body", "Hips & Glutes", "Back & Spine", "Neck & Shoulders", "Legs & Calves"];

for (let i = 1; i <= 35; i++) {
  const targetArea = prePostAreas[i % prePostAreas.length];
  prePostRoutines.push({
    id: `pre-post-gen-${i}`,
    title: `${targetArea} ${i % 2 === 0 ? 'Activation' : 'Cooldown'} Protocol`,
    category: targetArea,
    estimatedMinutes: 5 + (i % 5),
    description: `A targeted sequence focusing on the ${targetArea} to prepare you for a workout or aid recovery afterwards.`,
    poses: [
      createPose(`pose-${i}-1`, `${targetArea} Stretch 1`, targetArea, 30),
      createPose(`pose-${i}-2`, `${targetArea} Stretch 2`, targetArea, 45),
      createPose(`pose-${i}-3`, `${targetArea} Stretch 3`, targetArea, 30),
      createPose(`pose-${i}-4`, `${targetArea} Stretch 4`, targetArea, 60),
      createPose(`pose-${i}-5`, `${targetArea} Stretch 5`, targetArea, 30)
    ]
  });
}

const yogaRoutines = [];
const yogaAreas = ["Vinyasa Flow", "Yin Yoga", "Hatha Basics", "Restorative", "Power Yoga", "Morning Flow", "Evening Wind Down"];
const yogaTargetAreas = ["Full Body", "Hips & Core", "Spine Flexibility", "Shoulders & Chest", "Hamstrings"];

for (let i = 1; i <= 35; i++) {
  const style = yogaAreas[i % yogaAreas.length];
  const targetArea = yogaTargetAreas[i % yogaTargetAreas.length];
  const durationMinutes = 30 + (i % 3) * 15; // 30, 45, or 60 minutes
  
  // Distribute the time across 6 poses
  const holdTime = (durationMinutes * 60) / 6;
  
  yogaRoutines.push({
    id: `yoga-gen-${i}`,
    title: `${style}: ${targetArea} Focus`,
    category: targetArea,
    estimatedMinutes: durationMinutes,
    description: `A ${style} class emphasizing ${targetArea} openness, alignment, and mindful breathing.`,
    poses: [
      createPose(`ypose-${i}-1`, `Sun Salutation A`, "Full Body", holdTime, "dynamic"),
      createPose(`ypose-${i}-2`, `Downward Dog`, targetArea, holdTime),
      createPose(`ypose-${i}-3`, `Warrior Flow`, targetArea, holdTime),
      createPose(`ypose-${i}-4`, `Pigeon Pose`, targetArea, holdTime),
      createPose(`ypose-${i}-5`, `Child's Pose`, "Full Body", holdTime),
      createPose(`ypose-${i}-6`, `Savasana`, "Full Body", holdTime)
    ]
  });
}

const fileContent = `
import { StretchRoutine } from "../types";

export const GENERATED_PRE_POST_ROUTINES: StretchRoutine[] = ${JSON.stringify(prePostRoutines, null, 2)};

export const GENERATED_YOGA_ROUTINES: StretchRoutine[] = ${JSON.stringify(yogaRoutines, null, 2)};
`;

fs.writeFileSync('src/data/generatedRoutines.ts', fileContent);
