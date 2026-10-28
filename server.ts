import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as cheerio from "cheerio";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Gemini SDK with User-Agent header for telemetry
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// A collection of popular curated Instagram workout samples for instant testing/demo fallback
const CURATED_SAMPLES: { [key: string]: { caption: string; title: string } } = {
  "arms-shoulders": {
    title: "Curated Hypertrophy Arm & Shoulder Split",
    caption: `🔥 SHREDDED ARMS & SHOULDERS WORKOUT 🔥
Grab your dumbbells, let's get after it! This is designed to maximize muscle definition and sleeve-ripping pumps.

1️⃣ DB Shoulder Press - 4 sets x 10, 10, 8, 8 reps (heavy, slow negatives)
2️⃣ Lateral Raises - 4 sets x 15 reps (hold 1 sec at top, target lateral head)
3️⃣ Incline Dumbbell Curl - 3 sets x 12 reps (full stretch at bottom)
4️⃣ Incline Hammer Curls - 3 sets x 12 reps (heavy, slow control)
5️⃣ Overhead Cable Tricep Extension - 4 sets x 12 reps (squeeze tricep long head)
6️⃣ Cable Face Pulls - 3 sets x 15 reps (high reps, rear delt focus)

Save this post, try it on your next upper day, and let's build together! 💪 #arms #workout #shoulders #hypertrophy #fitness`,
  },
  "legs-glutes": {
    title: "Curated Leg Day Volume Booster",
    caption: `🍑 ULTIMATE LEGS & GLUTES VOLUME BUILDER 🍑
Leg day is non-negotiable. High volume today for leg definition and strength.

1️⃣ Barbell Back Squat - 4 sets x 8, 8, 6, 6 reps (ass to grass, explosive upward phase)
2️⃣ Romanian Deadlifts (RDL) - 4 sets x 10 reps (focus on hamstring stretch, flat back)
3️⃣ Bulgarian Split Squats - 3 sets x 12 reps per leg (high tension, drop sets on the last)
4️⃣ Leg Extensions - 3 sets x 15 reps (peak contraction at top, burning out)
5️⃣ Seated Hamstring Curl - 3 sets x 12 reps (controlled negatives)
6️⃣ Standing Calf Raises - 4 sets x 20 reps (full stretch and squeeze)

Legs are going to be jelly after this! Drink your protein! 🥛🔥 #legday #squat #glutes #hamstrings #workout`,
  },
  "push-power": {
    title: "Curated Push Split (Chest, Shoulders, Triceps)",
    caption: `⚡ PUSH DAY - MAXIMUM DEFINITION & FAT LOSS FINISHER ⚡
Push day power! Focused on heavy compounds followed by a metabolic finisher for that shredded look.

1️⃣ Flat Barbell Bench Press - 4 sets x 8 reps (power focus)
2️⃣ Dumbbell Incline Flyes - 3 sets x 12 reps (deep chest stretch, keep elbows bent)
3️⃣ Standing Overhead Press (OHP) - 4 sets x 8 reps (strong core engagement)
4️⃣ Cable Tricep Pushdowns - 4 sets x 12 reps (super-setting with Overhead extensions)
5️⃣ Push-Ups to Failure - 3 sets (bodyweight burnout)

Save & Share! Let's get these gains! 💯 #pushday #chestday #benchpress #fitnessjourney`,
  },
};

/**
 * Backend parsing function that extracts the text/caption from the provided Instagram link.
 * Falls back gracefully to standard split generation or search.
 */
async function extractInstagramCaption(url: string): Promise<{ caption: string; source: string; wasSuccessful: boolean }> {
  const cleanUrl = url.trim();

  // If the user selected a sample key, return it immediately
  for (const key of Object.keys(CURATED_SAMPLES)) {
    if (cleanUrl.includes(`sample-${key}`) || cleanUrl.endsWith(key)) {
      return {
        caption: CURATED_SAMPLES[key].caption,
        source: `Curated Sample Workout: ${CURATED_SAMPLES[key].title}`,
        wasSuccessful: true,
      };
    }
  }

  // Basic check for valid URL format
  if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
    return {
      caption: "",
      source: "Invalid link format",
      wasSuccessful: false,
    };
  }

  try {
    // Attempt to scrape Instagram post caption
    const response = await fetch(cleanUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract meta tags which frequently contain the caption on Instagram post embeds
    let caption = "";
    
    const ogDescription = $('meta[property="og:description"]').attr("content");
    const ogTitle = $('meta[property="og:title"]').attr("content");
    const twitterDescription = $('meta[name="twitter:description"]').attr("content");
    const description = $('meta[name="description"]').attr("content");

    if (ogDescription && ogDescription.length > 10) {
      caption = ogDescription;
    } else if (twitterDescription && twitterDescription.length > 10) {
      caption = twitterDescription;
    } else if (description && description.length > 10) {
      caption = description;
    } else if (ogTitle && ogTitle.length > 15) {
      caption = ogTitle;
    }

    // Clean up typical Instagram boilerplate if present
    if (caption) {
      caption = caption
        .replace(/^[0-9]+ Likes, [0-9]+ Comments - .*? on Instagram: "/, "")
        .replace(/"$/, "")
        .replace(/See Instagram photos and videos from.*/gi, "");
    }

    // Check if we hit a login block (common with cloud scrapers)
    const isLoginBlock = html.includes("login") || html.includes("accounts/login") || !caption;

    if (isLoginBlock) {
      console.warn("Instagram scraper redirected to login page or failed to find caption meta tags.");
      return {
        caption: "",
        source: "Instagram rate limit/login block. Using intelligent workout splitter fallback.",
        wasSuccessful: false,
      };
    }

    return {
      caption: caption.trim(),
      source: "Instagram Embed Scraper",
      wasSuccessful: true,
    };
  } catch (err: any) {
    console.error("Scraper failed:", err.message);
    return {
      caption: "",
      source: `Scraper error: ${err.message}. Running fallback splitter.`,
      wasSuccessful: false,
    };
  }
}

/**
 * Builds a robust system instruction modifier to restrict exercise selections
 * based on the user's available equipment.
 */
function getEquipmentConstraintPrompt(availableEquipment?: string[]): string {
  if (!Array.isArray(availableEquipment) || availableEquipment.length === 0) {
    return "";
  }
  
  const equipmentNames = availableEquipment.map(id => {
    switch (id) {
      case "barbell": return "Barbell (Free Weight)";
      case "dumbbell": return "Dumbbells";
      case "cables": return "Cable Machine";
      case "smith_machine": return "Smith Machine";
      case "kettlebell": return "Kettlebells";
      case "bands": return "Resistance Bands";
      case "bodyweight": return "Bodyweight / Pull-up / Dips";
      case "adjustable_bench": return "Adjustable Bench";
      case "leg_press": return "Leg Press Machine";
      case "machines": return "Gym Machines";
      case "rack_attachments": return "Rack-Mounted Attachments";
      default: return id;
    }
  });

  return `
CRITICAL EQUIPMENT CONSTRAINT (MANDATORY SCIENCE-BASED REGULATION):
The user ONLY has the following equipment available: [${equipmentNames.join(", ")}].
You MUST ONLY select and generate exercises that can be completed with this equipment. If any equipment category is NOT in this list, you are STRICTLY FORBIDDEN from generating exercises requiring that equipment.

Strict Translation Rules:
- If 'Barbell (Free Weight)' is NOT in the list, you MUST NOT generate any barbell-based exercises (e.g., standard barbell bench press, barbell squats, barbell rows, deadlifts).
- If 'Dumbbells' is NOT in the list, you MUST NOT suggest dumbbell exercises (e.g., dumbbell chest press, dumbbell flyes, dumbbell curls).
- If 'Cable Machine' is NOT in the list, do not generate cable crossovers, tricep pushdowns, cable lateral raises, or any cable movements.
- If 'Smith Machine' is NOT in the list, do not generate smith machine exercises.
- If they have 'Smith Machine' but do NOT have 'Barbell (Free Weight)', you MUST NOT suggest barbell squats; you MUST suggest 'Smith Machine Squats' or 'Smith Machine Back Squats' instead.
- If 'Rack-Mounted Attachments' is NOT in the list, or 'Barbell (Free Weight)' is NOT in the list, you MUST NOT suggest landmine exercises (e.g. landmine press, landmine rows, landmine rotations). They are 100% forbidden unless BOTH 'Barbell (Free Weight)' AND 'Rack-Mounted Attachments' are present!
- If 'Gym Machines' is NOT in the list, you MUST NOT suggest single-joint pin-loaded machine movements (e.g. Leg Extension, Seated Leg Curl, Seated Chest Press machine).
- If 'Leg Press Machine' is NOT in the list, do not suggest leg press exercises.
- If 'Adjustable Bench' is NOT in the list, you MUST NOT suggest incline/decline chest press, seated shoulder presses, or incline chest flyes. Suggest standing, floor, or flat-ground alternatives instead.
- If they only have 'Bodyweight / Pull-up / Dips' and/or 'Resistance Bands', you MUST design a world-class calisthenics-only or calisthenics-band routine (such as pushups, pullups, dips, bodyweight squats, lunges, band-assisted exercises).

Verify every single exercise in your plan against this equipment list. If an exercise fails to meet the criteria, replace it with a suitable alternative that is 100% compliant and science-backed.`;
}

/**
 * Cleanse any ambiguous exercise names containing 'or', '/', or dual-equipment parentheses
 * into a single, concrete, consistent exercise name for accurate AI progressive overload tracking.
 */
function cleanExerciseName(name: string): string {
  if (!name) return "";
  let clean = name.trim();

  const KNOWN_REPLACEMENTS: Record<string, string> = {
    "Dumbbell or Barbell Romanian Deadlift (RDL)": "Dumbbell Romanian Deadlifts",
    "Barbell or Dumbbell Romanian Deadlift (RDL)": "Romanian Deadlifts (Barbell)",
    "Barbell or Dumbbell Goblet Squat": "Barbell Back Squats",
    "Flat Dumbbell or Barbell Press": "Flat Dumbbell Chest Press",
    "Triceps Rope Pushdown or Dips": "Tricep Rope Pushdowns",
    "Lat Pulldown or Bent-Over Cable Row": "Lat Pulldowns (Wide Grip)",
    "Lat Pulldown or Bodyweight Pull-ups": "Lat Pulldowns (Wide Grip)",
    "Inverted Rows / Pull-ups": "Inverted Rows",
    "Face Pulls (Cable or Resistance Band)": "Cable Face Pulls",
    "Barbell or Dumbbell Biceps Curls": "Dumbbell Bicep Curls",
    "Incline Dumbbell Flyes or Cable Crossovers": "Incline Dumbbell Flyes",
    "Calf Raises (Standing or Seated)": "Standing Calf Raises",
    "Hanging Leg Raises or Knee Tucks": "Hanging Knee Raises",
    "Barbell or Goblet Squat": "Barbell Back Squats",
    "Thrusters (Dumbbell or Barbell)": "Dumbbell Thrusters",
    "Snatches (Barbell or Dumbbell)": "Barbell Snatches",
    "Upright Rows (Barbell or Cable)": "Barbell Upright Rows",
    "Cable Curls (Rope or Bar)": "Cable Bicep Curls",
    "Preacher Curls (Ez-Bar or Dumbbell)": "Preacher Curls (EZ-Bar)",
    "Preacher Curls (Ez-Bar / Dumbbell)": "Preacher Curls (EZ-Bar)"
  };

  for (const [pattern, replacement] of Object.entries(KNOWN_REPLACEMENTS)) {
    if (clean.toLowerCase() === pattern.toLowerCase()) {
      return replacement;
    }
  }

  // Handle parentheses with 'or' (e.g. "Thrusters (Dumbbell or Barbell)" -> "Dumbbell Thrusters")
  if (/\(([^)]*?\bor\b[^)]*?)\)/i.test(clean)) {
    const match = clean.match(/\(([^)]*?\bor\b[^)]*?)\)/i);
    if (match) {
      const options = match[1].split(/\bor\b/i).map(s => s.trim()).filter(Boolean);
      const chosenOption = options[0] || "";
      const baseName = clean.replace(match[0], "").trim();
      if (chosenOption && baseName) {
        clean = `${chosenOption} ${baseName}`;
      } else if (baseName) {
        clean = baseName;
      }
    }
  }

  // Split on ' or ' if still present
  if (/\s+or\s+/i.test(clean)) {
    const parts = clean.split(/\s+or\s+/i).map(p => p.trim()).filter(Boolean);
    clean = parts[0] || clean;
  }

  // Split on ' / ' if still present
  if (/\s+\/\s+/i.test(clean)) {
    const parts = clean.split(/\s+\/\s+/i).map(p => p.trim()).filter(Boolean);
    clean = parts[0] || clean;
  }

  clean = clean.replace(/\s+/g, " ").trim();
  clean = clean.replace(/^[-—\s]+|[-—\s]+$/g, "");

  return clean;
}

/**
 * Robust programmatic workout generator that parses text and applies personalization rules
 * when Gemini API services are down or over quota.
 */
function generateProgrammaticFallback(
  inputText: string,
  muscleDefinition: boolean,
  lowerFat: boolean,
  optimizeLegs: boolean,
  customNotes: string,
  focus?: string
) {
  const text = (inputText || "").toLowerCase();
  
  // 1. Determine Split Type
  let split = "Full Body Athlete Split";
  let splitKey = "full-body";
  
  if (text.includes("leg") || text.includes("squat") || text.includes("glute") || text.includes("quad") || text.includes("lower")) {
    split = "Ultimate Legs & Glutes Day";
    splitKey = "legs-glutes";
  } else if (text.includes("push") || text.includes("bench") || text.includes("chest") || text.includes("press") || text.includes("tricep")) {
    split = "Power Push Split (Chest, Shoulders & Triceps)";
    splitKey = "push-power";
  } else if (text.includes("pull") || text.includes("back") || text.includes("row") || text.includes("bicep") || text.includes("lats") || text.includes("rear")) {
    split = "Hypertrophy Pull Split (Back & Biceps)";
    splitKey = "pull";
  } else if (text.includes("arm") || text.includes("shoulder") || text.includes("curl") || text.includes("lateral")) {
    split = "Sleeve-Busting Arms & Shoulders";
    splitKey = "arms-shoulders";
  }

  // 2. Simple Heuristics to Extract Hand-Written Exercises
  const parsedExercises: Array<{ name: string; sets: number; reps: string }> = [];
  const lines = (inputText || "").split("\n");
  
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.length < 5 || cleanLine.length > 120) continue;
    
    // Check for common exercise action terms
    const hasExerciseWords = /(squat|press|curl|raise|extension|deadlift|row|pull|chin|lunge|calf|fly|pushup|dip|plank|rdl|thruster)/i.test(cleanLine);
    if (hasExerciseWords) {
      // Isolate the name by stripping leading emojis, list symbols, and trailing sets/reps info
      let name = cleanLine.replace(/^[0-9️⃣\-)\.\s★🔥⚡️🔸•\[\]]+|[-—x×*].*$/g, "").trim();
      name = name.replace(/^[^a-zA-Z]+/g, "").trim();
      
      // Capitalize words
      name = name.split(" ").map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : "").join(" ").trim();
      
      if (name.length > 3 && name.length < 60 && !parsedExercises.some(e => e.name.toLowerCase() === name.toLowerCase())) {
        let sets = 3;
        let reps = "10-12";
        
        // Parse working sets (e.g. "4 sets", "4x", "4 x")
        const setsMatch = cleanLine.match(/(\d+)\s*(?:sets|working sets|set)/i) || cleanLine.match(/(\d+)\s*[x×]/i);
        if (setsMatch) {
          const parsedSets = parseInt(setsMatch[1], 10);
          if (!isNaN(parsedSets) && parsedSets > 0 && parsedSets <= 10) {
            sets = parsedSets;
          }
        }
        
        // Parse reps (e.g. "x 12", "12 reps", "10-12")
        const repsMatch = cleanLine.match(/[x×]\s*(\d+-\d+|\d+)\s*(?:reps|rep)?/i) || cleanLine.match(/(\d+-\d+|\d+)\s*(?:reps|rep)/i);
        if (repsMatch) {
          reps = repsMatch[1];
        } else if (cleanLine.toLowerCase().includes("failure")) {
          reps = "Failure";
        }
        
        parsedExercises.push({ name, sets, reps });
      }
    }
  }
  
  // 3. Define Clean, Premium Templates of Exercises
  const templates: { [key: string]: Array<{ name: string; sets: number; reps: string; restSeconds: number; targetMuscleGroup: string; formGuide: string[]; proTip: string }> } = {
    "legs-glutes": [
      {
        name: "Barbell Back Squats",
        sets: optimizeLegs ? 5 : 4,
        reps: muscleDefinition ? "10-12 reps" : "6-8 reps",
        restSeconds: lowerFat ? 60 : 90,
        targetMuscleGroup: "Quads & Glutes",
        formGuide: [
          "Set up the barbell securely on your upper back, keep your chest high and core fully braced.",
          "Squat down under complete control until your thighs are parallel or below parallel to the floor.",
          "Drive back up explosively by pushing through your mid-foot, keeping knees aligned with your toes."
        ],
        proTip: muscleDefinition ? "Slow down the descent (eccentric phase) for 3 full seconds to maximize motor unit recruitment and definition." : "Keep full tension on the quads by stopping just short of lockout at the top of each repetition."
      },
      {
        name: "Romanian Deadlifts (RDL)",
        sets: 4,
        reps: "10-12 reps",
        restSeconds: lowerFat ? 60 : 90,
        targetMuscleGroup: "Hamstrings & Glutes",
        formGuide: [
          "Hold dumbbells or a barbell in front of your thighs with a slight bend in your knees.",
          "Hinge at the hips, pushing them straight back, keeping the weight close to your shins.",
          "Lower until you feel a deep stretch in your hamstrings, then squeeze your glutes to stand back up."
        ],
        proTip: "Focus entirely on the hip hinge. Do not let your lower back round as you lower the weight."
      },
      {
        name: "Bulgarian Split Squats",
        sets: 3,
        reps: "12 reps per leg",
        restSeconds: 60,
        targetMuscleGroup: "Quads & Glutes",
        formGuide: [
          "Place one foot behind you elevated on a bench or box, holding dumbbells at your sides.",
          "Lower your hips under control until your back knee is just above the floor.",
          "Push through your front heel to return to the starting position."
        ],
        proTip: lowerFat ? "Minimize rest between legs to keep heart rate elevated and maximize metabolic output." : "Lean forward slightly to target the glutes, or stay upright to emphasize the quads."
      },
      {
        name: "Leg Extensions",
        sets: 3,
        reps: muscleDefinition ? "12-15 reps" : "10-12 reps",
        restSeconds: lowerFat ? 45 : 60,
        targetMuscleGroup: "Quads",
        formGuide: [
          "Sit in the extension machine, adjusting the roller pad to rest comfortably on your lower shins.",
          "Extend your legs fully to lift the weight, gripping the handles to keep your hips seated.",
          "Squeeze your quadriceps at the top of the movement for 1 full second before lowering under control."
        ],
        proTip: "Rotate your toes slightly inward or outward to target different heads of the quadriceps."
      },
      {
        name: "Seated Hamstring Curls",
        sets: 3,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Hamstrings",
        formGuide: [
          "Position yourself in the machine with the thigh pad secured firmly against your legs.",
          "Curl the pad down towards your glutes, squeezing your hamstrings at peak contraction.",
          "Slowly release the weight back to the starting position under continuous tension."
        ],
        proTip: "Perform a 2-second hold at the bottom contraction to emphasize definition in the hamstring muscles."
      },
      {
        name: "Standing Calf Raises",
        sets: 4,
        reps: "15-20 reps",
        restSeconds: 45,
        targetMuscleGroup: "Calves",
        formGuide: [
          "Stand on the edge of a step with your heels hanging off, keeping knees straight.",
          "Lower your heels fully to get a deep calf stretch, holding for 1 second.",
          "Press up onto your toes as high as possible, squeezing the calf muscles at the top."
        ],
        proTip: "Avoid bouncing. Control the entire range of motion, pausing at both the top and bottom."
      }
    ],
    "push-power": [
      {
        name: "Incline Dumbbell Bench Press",
        sets: 4,
        reps: muscleDefinition ? "10-12 reps" : "8-10 reps",
        restSeconds: lowerFat ? 60 : 90,
        targetMuscleGroup: "Upper Chest & Front Delts",
        formGuide: [
          "Lie on an incline bench set to 30 degrees, holding dumbbells at chest level.",
          "Press the weights straight up over your chest under control, keeping wrists stacked over elbows.",
          "Lower the dumbbells slowly until you feel a deep stretch in your upper pectoral fibers."
        ],
        proTip: muscleDefinition ? "Focus on squeezing your chest together at the top of the lift without touching the dumbbells." : "Keep your shoulder blades retracted and pinned back to protect your shoulders."
      },
      {
        name: "Dumbbell Shoulder Press",
        sets: 4,
        reps: "10 reps",
        restSeconds: 60,
        targetMuscleGroup: "Shoulders (Anterior/Lateral Delts)",
        formGuide: [
          "Sit on an upright bench, holding dumbbells at shoulder level with an overhand grip.",
          "Press the weights vertically until your arms are fully extended over your head.",
          "Lower under control back to ear level to maintain continuous tension."
        ],
        proTip: "Stop the press just before elbow lockout to keep maximum tension loaded on the shoulder muscles."
      },
      {
        name: "Dumbbell Incline Flyes",
        sets: 3,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Chest (Pectorals)",
        formGuide: [
          "Lie on a 30-degree incline bench holding dumbbells overhead, palms facing each other.",
          "With a slight bend in your elbows, open your arms wide to lower the weights in an arc.",
          "Bring the weights back together using your chest muscles, visualizing hugging a large tree."
        ],
        proTip: "Use a slow 3-second negative to fully load the chest fibers at their stretched position."
      },
      {
        name: "Tricep Rope Pushdowns",
        sets: 4,
        reps: muscleDefinition ? "12-15 reps" : "10-12 reps",
        restSeconds: lowerFat ? 45 : 60,
        targetMuscleGroup: "Triceps (Lateral/Medial Heads)",
        formGuide: [
          "Attach a rope to a high cable, holding with a neutral grip and elbows tucked to your ribs.",
          "Extend your arms fully downwards, parting the rope ends at the bottom of the movement.",
          "Squeeze your triceps tightly before allowing the hands to return to chest level under control."
        ],
        proTip: "Keep your shoulders completely pinned down and back. Do not let your bodyweight press the rope."
      },
      {
        name: "Dumbbell Lateral Raises",
        sets: 4,
        reps: "12-15 reps",
        restSeconds: 45,
        targetMuscleGroup: "Lateral Shoulders",
        formGuide: [
          "Stand tall, holding light dumbbells at your sides with a slight forward hip lean.",
          "Raise your arms out to the sides in a wide arc until they are parallel to the floor.",
          "Lower the weights slowly, resisting gravity all the way down."
        ],
        proTip: "Lead with your elbows and keep your pinkies slightly raised at the top to target the lateral head."
      },
      {
        name: "Push-Ups to Failure",
        sets: 3,
        reps: "To failure",
        restSeconds: 60,
        targetMuscleGroup: "Chest, Shoulders & Triceps",
        formGuide: [
          "Place hands slightly wider than shoulder-width on the floor, keeping body in a straight line.",
          "Lower your chest to the ground by bending at the elbows, keeping them tucked at a 45-degree angle.",
          "Push back up to the top, squeezing your pectorals at lock out."
        ],
        proTip: lowerFat ? "Increase tempo on the upward phase to build high metabolic output and burn maximum calories." : "Slow down each repetition to accumulate peak time under tension."
      }
    ],
    "pull": [
      {
        name: "Lat Pulldowns",
        sets: 4,
        reps: "10-12 reps",
        restSeconds: lowerFat ? 60 : 90,
        targetMuscleGroup: "Back (Lats)",
        formGuide: [
          "Sit at a pulldown station and grip the bar slightly wider than shoulder-width.",
          "Pull the bar down to your upper chest while driving your elbows down and back.",
          "Slowly release the bar to the start position, allowing your lats to fully stretch."
        ],
        proTip: "Pull with your elbows, not your hands, to ensure maximum lat activation over biceps."
      },
      {
        name: "Seated Cable Rows",
        sets: 4,
        reps: "10-12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Mid-Back & Rhomboids",
        formGuide: [
          "Place feet on the platform and hold the attachment, sitting with a tall posture and slight lean.",
          "Row the handle towards your belly button, squeezing your shoulder blades tightly together.",
          "Extend your arms fully to return the weight, keeping a flat back."
        ],
        proTip: "Hold the contraction for 1 second at your abdomen to build high definition in the mid-back."
      },
      {
        name: "Incline Dumbbell Curls",
        sets: 3,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Biceps (Short Head)",
        formGuide: [
          "Lie back on a 45-degree incline bench with dumbbells hanging straight down.",
          "Keep your elbows locked in place and curl the weights up, supinating your wrists at the top.",
          "Lower the weights under control back to a full stretch at the bottom."
        ],
        proTip: "Supinating your pinky finger outwards at the top of the curl maximizes the biceps peak contraction."
      },
      {
        name: "Dumbbell Hammer Curls",
        sets: 3,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Biceps (Brachialis)",
        formGuide: [
          "Stand tall holding dumbbells with a neutral grip (palms facing each other).",
          "Curl the dumbbells up simultaneously while keeping your elbows pinned to your sides.",
          "Lower slowly to a full extension under control."
        ],
        proTip: "This targets the brachialis, widening your arm profile when viewed from the front."
      },
      {
        name: "Rear Delt Cable Flyes",
        sets: 3,
        reps: "15 reps",
        restSeconds: 45,
        targetMuscleGroup: "Rear Shoulders",
        formGuide: [
          "Stand at a cable cross-over machine with the cables set high, holding the left cable with your right hand and vice versa.",
          "Pull your arms back horizontally in a wide arc, squeezing your rear deltoids.",
          "Slowly return to the start position, maintaining full tension."
        ],
        proTip: "Keep your upper traps relaxed so your rear shoulder delts perform all the work."
      }
    ],
    "arms-shoulders": [
      {
        name: "Dumbbell Shoulder Press",
        sets: 4,
        reps: "10 reps",
        restSeconds: 60,
        targetMuscleGroup: "Shoulders (Anterior/Lateral Delts)",
        formGuide: [
          "Sit on an upright bench, holding dumbbells at shoulder level with an overhand grip.",
          "Press the weights vertically until your arms are fully extended over your head.",
          "Lower under control back to ear level to maintain continuous tension."
        ],
        proTip: "Stop the press just before elbow lockout to keep maximum tension loaded on the shoulder muscles."
      },
      {
        name: "Dumbbell Lateral Raises",
        sets: 4,
        reps: "12-15 reps",
        restSeconds: 45,
        targetMuscleGroup: "Lateral Shoulders",
        formGuide: [
          "Stand tall, holding light dumbbells at your sides with a slight forward hip lean.",
          "Raise your arms out to the sides in a wide arc until they are parallel to the floor.",
          "Lower the weights slowly, resisting gravity all the way down."
        ],
        proTip: "Lead with your elbows and keep your pinkies slightly raised at the top to target the lateral head."
      },
      {
        name: "Incline Dumbbell Curls",
        sets: 3,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Biceps (Short Head)",
        formGuide: [
          "Lie back on a 45-degree incline bench with dumbbells hanging straight down.",
          "Keep your elbows locked in place and curl the weights up, supinating your wrists at the top.",
          "Lower the weights under control back to a full stretch at the bottom."
        ],
        proTip: "Supinating your pinky finger outwards at the top of the curl maximizes the biceps peak contraction."
      },
      {
        name: "Overhead Tricep Rope Extensions",
        sets: 4,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Triceps (Long Head)",
        formGuide: [
          "Facing away from a low cable pully, hold a rope attachment behind your head with elbows bent.",
          "Extend your elbows vertically, pulling the rope overhead while keeping elbows close to your ears.",
          "Lower under control to get a deep stretch in the tricep long head."
        ],
        proTip: "Keep your core tight and don't overarch your lower back as you lift overhead."
      },
      {
        name: "Dumbbell Hammer Curls",
        sets: 3,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Biceps (Brachialis)",
        formGuide: [
          "Stand tall holding dumbbells with a neutral grip (palms facing each other).",
          "Curl the dumbbells up simultaneously while keeping your elbows pinned to your sides.",
          "Lower slowly to a full extension under control."
        ],
        proTip: "This targets the brachialis, widening your arm profile when viewed from the front."
      }
    ],
    "full-body": [
      {
        name: "Dumbbell Goblet Squats",
        sets: 4,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Quads & Glutes",
        formGuide: [
          "Hold a single heavy dumbbell vertically in front of your chest like a goblet, bracing your core.",
          "Squat down by hinging your hips back and bending your knees until thighs are parallel to the ground.",
          "Stand back up with control, pushing through the center of your feet."
        ],
        proTip: "Keep your elbows tucked and chest upright to maintain ideal posture throughout the squat."
      },
      {
        name: "Dumbbell Romanian Deadlifts",
        sets: 4,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Hamstrings & Glutes",
        formGuide: [
          "Hold dumbbells in front of your thighs with a slight bend in your knees.",
          "Hinge at the hips, pushing them straight back, keeping the weight close to your shins.",
          "Go down until you feel a deep hamstring stretch, then stand back up."
        ],
        proTip: "Squeeze your glutes hard at the top of the motion for a full posterior chain workout."
      },
      {
        name: "Incline Dumbbell Bench Press",
        sets: 4,
        reps: "10-12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Chest & Shoulders",
        formGuide: [
          "Lie on an incline bench set to 30 degrees, holding dumbbells at chest level.",
          "Press the weights straight up over your chest under control.",
          "Lower the dumbbells slowly until you feel a deep chest stretch."
        ],
        proTip: "Keep your shoulder blades retracted and pinned back to protect your shoulders."
      },
      {
        name: "Chest-Supported Dumbbell Rows",
        sets: 4,
        reps: "12 reps",
        restSeconds: 60,
        targetMuscleGroup: "Lats & Mid-Back",
        formGuide: [
          "Lie face down on a 30-degree incline bench with dumbbells in your hands hanging down.",
          "Row the weights up towards your lower ribs, pulling your shoulders back and driving elbows up.",
          "Release slowly under control to fully stretch your back."
        ],
        proTip: "This chest support completely isolates your mid-back and eliminates any leg or lower back momentum."
      },
      {
        name: "Dumbbell Lateral Raises",
        sets: 3,
        reps: "15 reps",
        restSeconds: 45,
        targetMuscleGroup: "Lateral Shoulders",
        formGuide: [
          "Stand tall, holding light dumbbells at your sides with a slight forward hip lean.",
          "Raise your arms out to the sides in a wide arc until they are parallel to the floor.",
          "Lower the weights slowly, resisting gravity all the way down."
        ],
        proTip: "Avoid using momentum. Control the raising and lowering phases entirely."
      }
    ]
  };

  // Helper to adjust reps based on user's custom notes & input text
  const adjustRepsBasedOnNotes = (defaultReps: string): string => {
    const combined = `${customNotes} ${inputText}`.toLowerCase();
    
    // Look for explicit numeric range like 6-10, 4-8, 5-8, 6-8, 5x5, 6 to 10
    const rangeMatch = combined.match(/\b(\d+)\s*[-to–x]\s*(\d+)\s*(?:reps|rep)?\b/i);
    if (rangeMatch) {
      return `${rangeMatch[1]}-${rangeMatch[2]} reps`;
    }
    
    const singleMatch = combined.match(/\b(5x5|5\s*x\s*5)\b/i);
    if (singleMatch) {
      return "5 reps";
    }

    if (combined.includes("heavy") || combined.includes("strength") || combined.includes("lower reps") || combined.includes("lower the rep") || combined.includes("lower range")) {
      return "6-10 reps";
    }
    
    return defaultReps;
  };

  const activeTemplate = templates[splitKey] || templates["full-body"];
  const finalExercises: any[] = [];
  
  if (parsedExercises.length >= 3) {
    parsedExercises.forEach((pe, index) => {
      const tmpl = activeTemplate[index % activeTemplate.length];
      const origReps = pe.reps.includes("rep") ? pe.reps : `${pe.reps} reps`;
      finalExercises.push({
        name: pe.name,
        sets: pe.sets,
        reps: adjustRepsBasedOnNotes(origReps),
        restSeconds: lowerFat ? 45 : 60,
        targetMuscleGroup: tmpl ? tmpl.targetMuscleGroup : "Target Muscle Group",
        formGuide: tmpl ? tmpl.formGuide : [
          "Set up safely and adjust position to match your body structure.",
          "Execute the contraction phase under control with high muscle tension.",
          "Resist gravity during the return phase through a complete range of motion."
        ],
        proTip: tmpl ? tmpl.proTip : "Focus on mind-muscle connection and controlled eccentrics."
      });
    });
  } else {
    activeTemplate.forEach(e => {
      finalExercises.push({
        ...e,
        reps: adjustRepsBasedOnNotes(e.reps)
      });
    });
  }

  const totalSets = finalExercises.reduce((sum, e) => sum + e.sets, 0);
  const estimatedDurationMinutes = Math.max(30, Math.round(totalSets * 2.5 + 10));

  const explanationParts = [
    `This premium program was dynamically customized by Coach Pro for **${split}**.`,
    muscleDefinition ? "We optimized every exercise with a focus on hypertrophy, peak muscular contraction, and slow negatives to maximize muscle definition and aesthetic pump." : null,
    lowerFat ? "We embedded metabolic conditioning protocols with reduced rest times and high-density active work sets to boost calorie expenditure during and after your session." : null,
    optimizeLegs ? "We elevated leg volume and compound stimulation to unlock glute, hamstring, and quad potential with targeted, high-output movements." : null,
    customNotes ? `Tailored specifically for your requirements: "${customNotes}".` : null,
    "The workout contains elite-tier form guides, specific rest configurations, and pro-tips to ensure pristine execution in the gym."
  ].filter(Boolean);

  return {
    originalSourceType: inputText.includes("http") ? "instagram_link" : "raw_text",
    workoutTitle: `InstaFit Premium: ${split}`,
    targetSplit: split,
    focusExplanation: explanationParts.join(" "),
    estimatedDurationMinutes,
    exercises: finalExercises
  };
}

// 1) Webhook/URL endpoint (`/share`) that intercepts shared URL or text string.
// Redirects to standard React SPA frontend with the link in query params.
app.all("/share", (req: Request, res: Response) => {
  const sharedText = (req.query.text as string) || (req.query.url as string) || (req.body.text as string) || (req.body.url as string) || "";
  console.log(`Intercepted mobile share action with text: "${sharedText}"`);

  if (sharedText) {
    // Redirect to frontend and pass the shared text/URL as a query parameter
    return res.redirect(`/?share_text=${encodeURIComponent(sharedText)}`);
  }
  return res.redirect("/");
});

// DALL-E 3 Cardio Thumbnail Generation with Local Asset Caching
const CARDIO_CACHE_DIR = path.join(process.cwd(), "public", "cardio_images");
if (!fs.existsSync(CARDIO_CACHE_DIR)) {
  fs.mkdirSync(CARDIO_CACHE_DIR, { recursive: true });
}

app.post("/api/generate-cardio-image", async (req: Request, res: Response) => {
  try {
    const { exerciseName, id } = req.body;
    if (!exerciseName || !id) {
      return res.status(400).json({ error: "Missing exerciseName or id" });
    }

    const cleanId = String(id).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const cacheFilePath = path.join(CARDIO_CACHE_DIR, `${cleanId}.png`);

    // 1. Check local static cache
    if (fs.existsSync(cacheFilePath)) {
      return res.json({
        url: `/cardio_images/${cleanId}.png`,
        cached: true,
        id: cleanId,
      });
    }

    // 2. Build explicit clinical fitness prompt
    const prompt = `A realistic 3D anatomical grayscale rendering of a person performing ${exerciseName} on a white background, highlighting the primary active muscle groups in red, in the style of clinical fitness diagrams.`;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return res.json({
        url: `/cardio_images/${cleanId}.png`,
        cached: false,
        fallback: true,
        message: "OpenAI API key not configured. Serving clinical anatomical rendering.",
        prompt,
      });
    }

    // 3. Call OpenAI DALL-E 3 API
    console.log(`Calling OpenAI DALL-E 3 for cardio exercise: ${exerciseName}...`);
    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      console.warn("OpenAI DALL-E 3 API error response:", errText);
      return res.status(openaiRes.status).json({ error: errText, fallback: true });
    }

    const data = await openaiRes.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ error: "No image payload returned from DALL-E 3", fallback: true });
    }

    // 4. Save to local disk cache for static asset serving
    const buffer = Buffer.from(b64, "base64");
    fs.writeFileSync(cacheFilePath, buffer);
    console.log(`Saved DALL-E 3 generated image to ${cacheFilePath}`);

    return res.json({
      url: `/cardio_images/${cleanId}.png`,
      cached: false,
      newlyGenerated: true,
      id: cleanId,
    });
  } catch (err: any) {
    console.error("DALL-E 3 generation error:", err);
    return res.status(500).json({ error: err.message, fallback: true });
  }
});

// API endpoint for processing the shared workout post
app.post("/api/share", async (req: Request, res: Response) => {
  try {
    const { url, rawText, muscleDefinition, lowerFat, optimizeLegs, customNotes, recentExercises, availableEquipment } = req.body;

    let targetTextToAnalyze = rawText || "Push Day Split";
    let scraperMethodUsed = "Custom Goal Engine";
    let isScraperSuccess = true;

    console.log(`Text being analyzed by Gemini (first 100 chars): "${targetTextToAnalyze.substring(0, 100)}..."`);

    // Define response schema for Gemini model
    const workoutResponseSchema = {
      type: Type.OBJECT,
      properties: {
        originalSourceType: {
          type: Type.STRING,
          description: "One of: 'instagram_link', 'raw_text', 'concept_split'."
        },
        workoutTitle: {
          type: Type.STRING,
          description: "A highly motivating, custom premium workout title."
        },
        targetSplit: {
          type: Type.STRING,
          description: "Targeted split group (e.g., Push Day, Legs & Glutes, Lower Body focus)."
        },
        focusExplanation: {
          type: Type.STRING,
          description: "Coach explanation of how this was tailored. Keep it extremely short (1-2 sentences maximum, under 30 words). Use ONLY words and numbers. No dashes, hashtags, asterisks, bolding, bullet points, or markdown symbols."
        },
        estimatedDurationMinutes: {
          type: Type.INTEGER,
          description: "Total duration in minutes including warm up and rests."
        },
        exercises: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: "Name of the exercise."
              },
              sets: {
                type: Type.INTEGER,
                description: "Number of working sets."
              },
              reps: {
                type: Type.STRING,
                description: "Reps or rep target range (e.g. '12, 10, 8 (Pyramid)', '10-12 reps', 'To failure')."
              },
              restSeconds: {
                type: Type.INTEGER,
                description: "Rest time between sets in seconds."
              },
              targetMuscleGroup: {
                type: Type.STRING,
                description: "Primary target muscle group."
              },
              formGuide: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 to 5 step-by-step form execution directions."
              },
              proTip: {
                type: Type.STRING,
                description: "Dynamic trainer pro-tip targeted at the user's focus goals (definition, fat loss, or leg strength)."
              },
              warmupSets: {
                type: Type.INTEGER,
                description: "Number of warm-up sets to perform before heavy working sets (1 for isolation/accessory, 2 for heavy compound movements like bench, squat, deadlift, overhead press) to prevent injury."
              },
              warmupNote: {
                type: Type.STRING,
                description: "Specific injury-prevention warmup cue for this movement (e.g. 'Perform 1-2 light sets at 40-50% load to lubricate joints and prime motor units before heavy sets.')."
              }
            },
            required: ["name", "sets", "reps", "restSeconds", "targetMuscleGroup", "formGuide", "proTip", "warmupSets", "warmupNote"]
          }
        }
      },
      required: ["originalSourceType", "workoutTitle", "targetSplit", "focusExplanation", "estimatedDurationMinutes", "exercises"]
    };

    // Prompt building for LLM Personalization Engine
    const userFocusSummary = [
      muscleDefinition ? "Maximize muscle definition (hypertrophy-oriented, targeted peak contraction, 3-second negatives)" : null,
      lowerFat ? "Optimize for lower body fat percentage (incorporate active-rest protocols, brief transition phases, calorie-burning superset variations)" : null,
      optimizeLegs ? "High volume legs emphasis (optimize leg workout intensity, full range quad/glute activation)" : null,
      customNotes ? `Custom User Target: "${customNotes}"` : null,
      Array.isArray(recentExercises) && recentExercises.length > 0 ? `Recently completed exercises to AVOID: [${recentExercises.join(", ")}]` : null
    ].filter(Boolean).join("\n- ");

    const systemInstruction = `You are an elite, world-class athletic fitness coach and exercise scientist.
Your goal is to parse any workout text or target fitness goals/muscle groups described by the user (e.g. "I want bigger shoulders and arms") and output a highly personalized, structured, 100% science-based workout routine.

CRITICAL INJURY-PREVENTION PROTOCOL:
Every exercise MUST have warmupSets (1-2 sets) and a warmupNote to prevent acute joint or muscle injuries before heavy working sets. Lifters must warm up with 40-50% load.

Apply the following strict science-backed customization rules:
1. TARGET GOALS / MUSCLE GROUPS: If the user describes certain targets or goals (e.g. "I want bigger shoulders and big arms"), you MUST design a premium 5-7 exercise routine that targets those specific muscle groups with exceptional detail based on hypertrophy biomechanics (e.g., target muscle length-tension relationships, stretch-mediated hypertrophy).
2. PROGRESSIVE OVERLOAD (THE 2-FOR-2 RULE): Always include scientific advice in the "proTip" for each exercise, explaining that when the user can complete 2 additional reps beyond their target on their final set for two consecutive workouts, they must increase the load by 2.5% to 5% (5-10 lbs for compound movements, 2.5-5 lbs for isolation) to trigger progressive overload.
3. CUSTOM USER NOTES (HIGHEST PRIORITY OVERRIDE): You MUST strictly honor custom requests in the User's Custom Notes. If the notes ask for a heavy day, strength day, powerlifting, lower rep ranges, or a specific rep range (like "6-10", "4-8", "5x5", "6-10 reps"), you MUST change the reps of ALL generated exercises to match that range. Do not default to the 10-15 reps definition style if the user explicitly requested a heavy or lower rep style!
4. MUSCLE DEFINITION: Prioritize clean range of motion, squeeze phases, and slow negatives (eccentric contraction). Give specific form instructions. (Note: Only use high-rep ranges here if not overridden by a custom 'heavy' or 'strength' note).
5. BODY FAT LOSS: Optimize calorie expenditure. Rest periods should be smart. Recommend pairing complementary exercises if appropriate, and suggest high metabolic output.
6. CONCEPT SPLITS: If the input text is a split name or split concept (e.g. "Legs", "Push Day", "Upper Body", "Chest"), you MUST build a full, high-quality, professional 5-7 exercise routine from scratch that perfectly implements the split while aligning to the definition, fat loss, and leg goals. Do not output placeholders.
7. 1-REP MAX / 1RM DAY: If the user notes or input description request a 1-Rep Max (1RM) test or 1-rep max day (e.g. "one rep max dumbbell incline shoulder press", "1RM testing"), you MUST set the reps target string for that exercise strictly to "1 (1-Rep Max)" or "1RM" so that the application's dedicated 1-Rep Max Warm Up & Target Calculator activates for the user. Do not give standard multi-rep ranges for a 1RM test.
8. DYNAMIC VARIATION / CONSECUTIVE SPLIT ROTATION: If the user has recently performed certain exercises (as specified in the 'Recently completed exercises to AVOID' list in personalization settings), you MUST NOT select those exact exercises. Instead, design a fresh, alternative routine focusing on different movements, angles, or equipment for that same split group (e.g., if their recent push day used flat bench press, suggest incline dumbbell press, overhead press, or chest flyes instead; if squats were done, suggest leg press or lunges) to maximize progressive variation and muscle building.
9. STRICT EXERCISE NAMING RULE - NEVER USE 'OR' OR DUAL-EQUIPMENT OPTIONS: You MUST NEVER output 'or', '/', or dual options in any exercise name (e.g. NEVER output 'Dumbbell or Barbell Romanian Deadlift (RDL)', 'Barbell or Dumbbell Goblet Squat', 'Lat Pulldown or Pull-ups', 'Incline Dumbbell or Barbell Press'). Always select and output exactly ONE concrete exercise with specific equipment (e.g. 'Dumbbell Romanian Deadlifts') so that progressive overload tracking and future weight/reps recommendations remain 100% precise.

You MUST respond with a valid JSON matching the requested schema.`;

    const prompt = `Please design a highly targeted and personalized workout based on the following description or fitness goal.
Goal or Workout Description:
    """
${targetTextToAnalyze}
    """

User's Personalization Settings:
- Muscle Definition Focus: ${muscleDefinition ? "ENABLED" : "DISABLED"}
- Fat Loss Focus: ${lowerFat ? "ENABLED" : "DISABLED"}
- Leg Day Volume Booster: ${optimizeLegs ? "ENABLED" : "DISABLED"}
- Custom user notes: ${customNotes || "None"}
- Recently completed exercises to avoid: ${Array.isArray(recentExercises) ? JSON.stringify(recentExercises) : "[]"}

Specific adjustments to perform:
- CRITICAL OVERRIDE: If the Custom user notes specify a rep range (like "6-10", "4-8", "5 reps") or a training style (like "heavy", "heavy day", "strength"), you MUST customize the reps of all generated exercises to match this heavy/low-rep target instead of the default 10-12 range.
- 1-REP MAX / 1RM DAY OVERRIDE: If the Custom notes or input description asks for a 1-Rep Max (1RM) day/test (e.g., "one rep max dumbbell incline shoulder press"), set the target reps for that exercise to "1 (1-Rep Max)" or "1RM" instead of standard reps.
- If specific exercises are in the description, adapt them to target the user's settings (e.g., adjust rep ranges to 10-15 reps for definition unless overridden by a heavy custom note, recommend compound sets, and enhance leg exercises if leg optimization is ON).
- DYNAMIC ROTATION OVERRIDE: If any exercises from the user's description match the 'Recently completed exercises to avoid' list, you MUST replace them with high-quality alternative exercises for the same target muscle group/movement pattern.
- Create a complete structured routine with set, reps, rest, form guides, and a tailored pro-tip for each exercise.
${getEquipmentConstraintPrompt(availableEquipment)}
- Format strictly as a JSON object matching the response schema.`;

    // Generate content using a robust model cascade (gemini-2.5-flash -> gemini-3.5-flash -> gemini-flash-latest -> gemini-3.1-flash-lite) to handle any transient availability/quota issues
    const modelsToTry = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let response;
    let success = false;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting workout plan generation with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: workoutResponseSchema,
            temperature: 0.2,
          },
        });
        success = true;
        break;
      } catch (err: any) {
        console.log(`[Cascade Info] Model ${modelName} returned status:`, err.message || err);
        lastError = err;
        // Wait 500ms before trying the next model
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    let parsedWorkout;

    if (!success || !response) {
      console.log("[Cascade Info] Initiating robust programmatic fallback...");
      parsedWorkout = generateProgrammaticFallback(
        targetTextToAnalyze,
        !!muscleDefinition,
        !!lowerFat,
        !!optimizeLegs,
        customNotes || ""
      );
      scraperMethodUsed = `${scraperMethodUsed} (Offline Fallback Coach)`;
    } else {
      const generatedText = response.text;
      if (!generatedText) {
        throw new Error("No response text received from Gemini API");
      }

      let cleanText = generatedText.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\n?|```$/g, "").trim();
      }

      parsedWorkout = JSON.parse(cleanText);
    }

    // Ensure all exercise names are strictly concrete with no 'or' / dual options
    if (parsedWorkout && Array.isArray(parsedWorkout.exercises)) {
      parsedWorkout.exercises = parsedWorkout.exercises.map((ex: any) => ({
        ...ex,
        name: cleanExerciseName(ex.name)
      }));
    }

    res.json({
      success: true,
      scraperMethod: scraperMethodUsed,
      scraperSuccess: isScraperSuccess,
      originalTextSnippet: targetTextToAnalyze.substring(0, 300) + (targetTextToAnalyze.length > 300 ? "..." : ""),
      workoutPlan: parsedWorkout,
    });

  } catch (error: any) {
    console.error("Failed to generate personalized workout plan:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error during personalization generation",
    });
  }
});

// Endpoint to dynamically swap or replace a single exercise if the user doesn't like it
app.post("/api/swap-exercise", async (req: Request, res: Response) => {
  try {
    const { 
      currentExerciseName, 
      targetMuscleGroup, 
      workoutTitle, 
      muscleDefinition, 
      lowerFat, 
      optimizeLegs, 
      customNotes,
      recentExercises,
      availableEquipment 
    } = req.body;

    if (!currentExerciseName) {
      return res.status(400).json({ success: false, error: "Missing current exercise name" });
    }

    const exerciseResponseSchema = {
      type: Type.OBJECT,
      properties: {
        name: {
          type: Type.STRING,
          description: "Name of the alternative exercise."
        },
        sets: {
          type: Type.INTEGER,
          description: "Number of working sets."
        },
        reps: {
          type: Type.STRING,
          description: "Reps or rep target range."
        },
        restSeconds: {
          type: Type.INTEGER,
          description: "Rest time between sets in seconds."
        },
        targetMuscleGroup: {
          type: Type.STRING,
          description: "Primary target muscle group."
        },
        formGuide: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "3 to 5 step-by-step form execution directions."
        },
        proTip: {
          type: Type.STRING,
          description: "Dynamic trainer pro-tip."
        }
      },
      required: ["name", "sets", "reps", "restSeconds", "targetMuscleGroup", "formGuide", "proTip"]
    };

    const systemInstruction = `You are an elite, world-class athletic fitness coach and exercise scientist.
Your task is to take an exercise that the user does not like, and suggest a fresh, highly effective, personalized alternative exercise that targets the EXACT SAME muscle group/function.

Rules:
1. You MUST NOT use the exercise they don't like ("${currentExerciseName}").
2. You MUST NOT use any of the exercises listed in the recent exercises array if provided.
3. Keep the target reps, sets, and rest matching the tone and personalization options of the user (definition, fat loss, leg day volume, custom notes).
4. Provide highly detailed execution steps and a pro-tip.
5. STRICT EXERCISE NAMING RULE - NEVER USE 'OR' OR DUAL-EQUIPMENT OPTIONS: You MUST NEVER output 'or', '/', or dual options in any exercise name (e.g. NEVER output 'Dumbbell or Barbell Romanian Deadlift (RDL)', 'Barbell or Dumbbell Goblet Squat', 'Lat Pulldown or Pull-ups', 'Incline Dumbbell or Barbell Press'). Always select and output exactly ONE concrete exercise with specific equipment so that progressive overload tracking and future weight/reps recommendations remain 100% precise.`;

    const prompt = `Please suggest a high-quality alternative for:
- Exercise to swap out: "${currentExerciseName}"
- Target Muscle/Function: "${targetMuscleGroup || "Same as original"}"
- Workout Split Name: "${workoutTitle || "General Workout"}"
- Muscle Definition Focus: ${muscleDefinition ? "ENABLED" : "DISABLED"}
- Fat Loss Focus: ${lowerFat ? "ENABLED" : "DISABLED"}
- Leg Day Volume Booster: ${optimizeLegs ? "ENABLED" : "DISABLED"}
- Custom user notes: ${customNotes || "None"}
- Other exercises to avoid: ${JSON.stringify(recentExercises || [])}
${getEquipmentConstraintPrompt(availableEquipment)}`;

    const modelsToTry = ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let response;
    let success = false;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting exercise swap with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: exerciseResponseSchema,
            temperature: 0.5,
          },
        });
        success = true;
        break;
      } catch (err: any) {
        console.log(`[Cascade Info] Swap model ${modelName} status:`, err.message || err);
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    if (!success || !response) {
      console.log("[Cascade Info] Initiating local fallback for exercise swap...");
      const fallbackEx = {
        name: cleanExerciseName(`${currentExerciseName} Alternative (Dumbbell Variation)`),
        sets: 3,
        reps: "10-12 reps",
        restSeconds: 60,
        targetMuscleGroup: targetMuscleGroup || "General",
        formGuide: [
          "Perform a highly controlled contraction.",
          "Keep tension on the targeted muscle group throughout.",
          "Ensure slow negatives and full ranges of motion."
        ],
        proTip: "Focus on mind-muscle connection and slow eccentric negatives with this alternative movement."
      };
      return res.json({ success: true, exercise: fallbackEx });
    }

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    let cleanText = text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```(?:json)?\n?|```$/g, "").trim();
    }

    const parsedExercise = JSON.parse(cleanText);
    if (parsedExercise && parsedExercise.name) {
      parsedExercise.name = cleanExerciseName(parsedExercise.name);
    }
    return res.json({ success: true, exercise: parsedExercise });

  } catch (error: any) {
    console.error("Error in /api/swap-exercise:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to swap exercise" });
  }
});

// Endpoint to generate a periodized workout program outline (Week, Month, Year)
app.post("/api/generate-program", async (req: Request, res: Response) => {
  try {
    const { 
      splitType, 
      timeline, 
      muscleDefinition, 
      lowerFat, 
      optimizeLegs, 
      customNotes,
      availableEquipment 
    } = req.body;

    const validatedSplit = splitType || "ppl";
    const validatedTimeline = timeline || "month";

    // Helper to get days of week based on split
    const getDaysForSplit = (type: string) => {
      switch (type) {
        case "ppl_ul":
          return [
            { dayIndex: 0, dayName: "Monday", splitName: "Push" },
            { dayIndex: 1, dayName: "Tuesday", splitName: "Pull" },
            { dayIndex: 2, dayName: "Wednesday", splitName: "Legs" },
            { dayIndex: 3, dayName: "Thursday", splitName: "Rest Day" },
            { dayIndex: 4, dayName: "Friday", splitName: "Upper Body" },
            { dayIndex: 5, dayName: "Saturday", splitName: "Lower Body" },
            { dayIndex: 6, dayName: "Sunday", splitName: "Rest Day" }
          ];
        case "ppl":
          return [
            { dayIndex: 0, dayName: "Monday", splitName: "Push" },
            { dayIndex: 1, dayName: "Tuesday", splitName: "Pull" },
            { dayIndex: 2, dayName: "Wednesday", splitName: "Legs" },
            { dayIndex: 3, dayName: "Thursday", splitName: "Rest Day" },
            { dayIndex: 4, dayName: "Friday", splitName: "Push" },
            { dayIndex: 5, dayName: "Saturday", splitName: "Pull" },
            { dayIndex: 6, dayName: "Sunday", splitName: "Legs" }
          ];
        case "upper_lower":
          return [
            { dayIndex: 0, dayName: "Monday", splitName: "Upper Body" },
            { dayIndex: 1, dayName: "Tuesday", splitName: "Lower Body" },
            { dayIndex: 2, dayName: "Wednesday", splitName: "Rest Day" },
            { dayIndex: 3, dayName: "Thursday", splitName: "Upper Body" },
            { dayIndex: 4, dayName: "Friday", splitName: "Lower Body" },
            { dayIndex: 5, dayName: "Saturday", splitName: "Rest Day" },
            { dayIndex: 6, dayName: "Sunday", splitName: "Rest Day" }
          ];
        case "full_body":
          return [
            { dayIndex: 0, dayName: "Monday", splitName: "Full Body" },
            { dayIndex: 1, dayName: "Tuesday", splitName: "Rest Day" },
            { dayIndex: 2, dayName: "Wednesday", splitName: "Full Body" },
            { dayIndex: 3, dayName: "Thursday", splitName: "Rest Day" },
            { dayIndex: 4, dayName: "Friday", splitName: "Full Body" },
            { dayIndex: 5, dayName: "Saturday", splitName: "Rest Day" },
            { dayIndex: 6, dayName: "Sunday", splitName: "Rest Day" }
          ];
        case "arnold":
          return [
            { dayIndex: 0, dayName: "Monday", splitName: "Chest & Back" },
            { dayIndex: 1, dayName: "Tuesday", splitName: "Shoulders & Arms" },
            { dayIndex: 2, dayName: "Wednesday", splitName: "Legs" },
            { dayIndex: 3, dayName: "Thursday", splitName: "Rest Day" },
            { dayIndex: 4, dayName: "Friday", splitName: "Chest & Back" },
            { dayIndex: 5, dayName: "Saturday", splitName: "Shoulders & Arms" },
            { dayIndex: 6, dayName: "Sunday", splitName: "Legs" }
          ];
        case "bro":
          return [
            { dayIndex: 0, dayName: "Monday", splitName: "Chest Day" },
            { dayIndex: 1, dayName: "Tuesday", splitName: "Back Day" },
            { dayIndex: 2, dayName: "Wednesday", splitName: "Legs Day" },
            { dayIndex: 3, dayName: "Thursday", splitName: "Shoulders Day" },
            { dayIndex: 4, dayName: "Friday", splitName: "Arms Day" },
            { dayIndex: 5, dayName: "Saturday", splitName: "Rest Day" },
            { dayIndex: 6, dayName: "Sunday", splitName: "Rest Day" }
          ];
        default:
          return [
            { dayIndex: 0, dayName: "Monday", splitName: "Push" },
            { dayIndex: 1, dayName: "Tuesday", splitName: "Pull" },
            { dayIndex: 2, dayName: "Wednesday", splitName: "Legs" },
            { dayIndex: 3, dayName: "Thursday", splitName: "Rest Day" },
            { dayIndex: 4, dayName: "Friday", splitName: "Push" },
            { dayIndex: 5, dayName: "Saturday", splitName: "Pull" },
            { dayIndex: 6, dayName: "Sunday", splitName: "Legs" }
          ];
      }
    };

    // Define phases for weeks
    const phases: ('Hypertrophy Volume' | 'Heavy Strength' | 'Metabolic Conditioning' | 'Deload / Recovery')[] = [
      "Hypertrophy Volume",
      "Heavy Strength",
      "Metabolic Conditioning",
      "Deload / Recovery"
    ];

    let totalWeeks = 4;
    if (validatedTimeline === "week") {
      totalWeeks = 1;
    } else if (validatedTimeline === "month") {
      totalWeeks = 4;
    } else if (validatedTimeline === "quarter") {
      totalWeeks = 12;
    } else if (validatedTimeline === "year") {
      totalWeeks = 52;
    }

    const weeksList = [];
    const baseDays = getDaysForSplit(validatedSplit);

    for (let w = 1; w <= totalWeeks; w++) {
      // Cycle through phases
      const phaseIndex = (w - 1) % 4;
      const currentPhase = phases[phaseIndex];

      const daysInWeek = baseDays.map(d => {
        const isRest = d.splitName.toLowerCase().includes("rest");
        let focusVal: any = currentPhase;
        if (isRest) {
          focusVal = "Rest Day";
        }

        return {
          dayIndex: d.dayIndex,
          dayName: d.dayName,
          splitName: d.splitName,
          focus: focusVal,
          workout: null // Filled on-demand
        };
      });

      weeksList.push({
        weekNumber: w,
        phase: currentPhase,
        days: daysInWeek
      });
    }

    // Generate a beautiful, motivational periodization overview from Gemini
    const splitNamesFull = {
      ppl_ul: "Science Hybrid (PPL + Upper/Lower) Split",
      ppl: "Push / Pull / Legs Split",
      upper_lower: "Upper / Lower Split",
      full_body: "Full Body Athlete Split",
      arnold: "Arnold Golden-Era Split",
      bro: "Bro Classic Bodybuilding Split"
    };

    const currentSplitName = splitNamesFull[validatedSplit as keyof typeof splitNamesFull] || "Custom Split";
    
    const systemInstruction = `You are an elite exercise scientist and head athletic trainer.
Your job is to write a highly professional, extremely brief (1-2 sentences maximum, under 35-40 words total), plain-text coach's summary and focus description for a client's upcoming workout program.
Explain the strategic focus in a quick direct trainer tone.
CRITICAL FORMATTING RULES:
- Keep it extremely short (no more than 35-40 words total, ideally 1-2 quick sentences). No one wants to read a huge book!
- Use ONLY words and numbers.
- STRICTLY DO NOT use any dashes, hashtags, hyphens, bullet points, asterisks, bolding, list symbols, special characters, markdown formatting, or symbols of any kind.`;

    const prompt = `Generate a periodization coaching overview for:
- Split Type: ${currentSplitName}
- Timeline Duration: ${validatedTimeline} (${totalWeeks} total weeks planned)
- Personalization Settings:
  * Muscle Definition focus: ${muscleDefinition ? "ENABLED" : "DISABLED"}
  * Fat loss optimization: ${lowerFat ? "ENABLED" : "DISABLED"}
  * High-volume leg emphasis: ${optimizeLegs ? "ENABLED" : "DISABLED"}
  * Custom user notes: ${customNotes || "None"}
  * Available Equipment restriction: ${availableEquipment ? JSON.stringify(availableEquipment) : "All gym equipment"} (Adjust coaching overview to acknowledge this restriction if not 'all gym equipment', e.g. "Dumbbell-only home setup", "Calisthenics only", etc.)`;

    let coachOverview = "Your high-performance periodized program has been calculated. Follow the scheduled phases to maximize progressive overload and muscle building.";
    const coachModelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    for (const modelName of coachModelsToTry) {
      try {
        console.log(`Attempting coach overview generation with model: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          }
        });
        if (response && response.text) {
          coachOverview = response.text.trim();
          break;
        }
      } catch (err: any) {
        console.log(`[Cascade Info] Coach overview model ${modelName} status:`, err.message || err);
        // Wait 300ms before trying the next model
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    const programTitle = `${totalWeeks}-Week Periodized ${currentSplitName}`;

    res.json({
      success: true,
      program: {
        id: "prog_" + Date.now(),
        name: programTitle,
        splitType: validatedSplit,
        timeline: validatedTimeline,
        weeks: weeksList,
        coachOverview: coachOverview,
        createdAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error("Error in /api/generate-program:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to generate program outline" });
  }
});

// Endpoint to generate a highly optimized workout plan for a single day in the periodized calendar
app.post("/api/generate-planner-day", async (req: Request, res: Response) => {
  try {
    const { 
      splitName, 
      focus, 
      weekNumber, 
      muscleDefinition, 
      lowerFat, 
      optimizeLegs, 
      customNotes,
      recentExercises,
      availableEquipment 
    } = req.body;

    if (!splitName || splitName.toLowerCase().includes("rest")) {
      return res.status(400).json({ success: false, error: "Cannot generate workout for rest day" });
    }

    const dayWorkoutSchema = {
      type: Type.OBJECT,
      properties: {
        workoutTitle: {
          type: Type.STRING,
          description: "Title of the workout including focus and phase"
        },
        focusExplanation: {
          type: Type.STRING,
          description: "Coach explanation of how this targets the focus. Keep it extremely short (1-2 sentences maximum, under 30 words). Use ONLY words and numbers. No dashes, hashtags, asterisks, bolding, bullet points, or markdown symbols."
        },
        estimatedDurationMinutes: {
          type: Type.INTEGER,
          description: "Estimated completion time in minutes."
        },
        exercises: {
          type: Type.ARRAY,
          description: "A list of 5 to 7 exercises that perfectly implement this split.",
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: "Name of the exercise."
              },
              sets: {
                type: Type.INTEGER,
                description: "Number of working sets."
              },
              reps: {
                type: Type.STRING,
                description: "Reps or rep target range."
              },
              restSeconds: {
                type: Type.INTEGER,
                description: "Rest time between sets in seconds."
              },
              targetMuscleGroup: {
                type: Type.STRING,
                description: "Primary target muscle group."
              },
              formGuide: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "3 to 5 step-by-step form execution directions."
              },
              proTip: {
                type: Type.STRING,
                description: "Dynamic trainer pro-tip."
              },
              warmupSets: {
                type: Type.INTEGER,
                description: "Number of warm-up sets (1-2) before working sets to prevent injury."
              },
              warmupNote: {
                type: Type.STRING,
                description: "Injury-prevention warmup cue for this movement."
              },
              progressiveOverloadReason: {
                type: Type.STRING,
                description: "1-sentence transparent explanation of why this weight/rep target is chosen to drive progressive overload."
              }
            },
            required: ["name", "sets", "reps", "restSeconds", "targetMuscleGroup", "formGuide", "proTip", "warmupSets", "warmupNote"]
          }
        }
      },
      required: ["workoutTitle", "focusExplanation", "estimatedDurationMinutes", "exercises"]
    };

    const systemInstruction = `Role: You are Arthur, an elite, highly adaptable fitness coach and exercise scientist inside ATHRU. Never refer to yourself as an AI, bot, or virtual assistant. Never include the word "AI" in generated titles or text.
Your task is to generate a comprehensive, highly optimized, 100% science-based 5-7 exercise workout routine for a single day of a periodized program.

Core Directives:
1. Dynamic Adaptability: Ensure all exercise selections strictly adhere to the available equipment and user constraints.
2. Transparent Progressive Overload: For each exercise, provide a clear 1-sentence transparent progressiveOverloadReason explaining why this load/rep target was assigned (e.g. "Targeted at 8-10 reps with 90s rest to maximize mechanical tension and stimulate myofibrillar hypertrophy in the growth zone.").
3. Smart Cardio & Mobility Integration: Prevent training interference with adjacent days.

INJURY PREVENTION PROTOCOL:
Incorporate warmupSets (1-2 sets) and a warmupNote on every exercise to prime the joints and muscles before heavy working sets so athletes do not get hurt.

CRITICAL SCIENCE-BASED PROGRESSION RULES based on the FOCUS parameter:
1. 'Heavy Strength' (Heavy Loading Phase - Neuromuscular Adaptation):
   - Science Base: Target myofibrillar hypertrophy and neural recruitment.
   - Intensity: 82-90% of 1-Rep Max (1RM) or Rate of Perceived Exertion (RPE) 8.5 to 9.5.
   - Reps: 4 to 6 reps or 5 to 8 reps. 
   - Sets: 4 to 5 working sets per movement.
   - Rest: 150-180 seconds to fully replenish ATP-CP energy stores.
2. 'Hypertrophy Volume' (Muscle Growth & Sarcoplasmic Hypertrophy Phase):
   - Science Base: Maximize mechanical tension, localized muscular fatigue, and micro-tears.
   - Intensity: 70-80% of 1-Rep Max (1RM) or RPE 8.
   - Reps: 8 to 12 reps.
   - Sets: 3 to 4 working sets per movement.
   - Rest: 90 seconds (optimal for maintaining tension while allowing metabolic recovery).
3. 'Metabolic Conditioning' (Cardio-Strength & Lactate Threshold Swell Phase):
   - Science Base: Maximize mitochondrial density, lactate clearance, and capillary density.
   - Intensity: 60-65% of 1-Rep Max (1RM) or RPE 7 to 8.
   - Reps: 12 to 15 reps or 15 to 20 reps.
   - Rest: 45-60 seconds (brief transitions to trigger localized growth hormone response).
   - Sets: 3 sets per movement.
4. 'Deload / Recovery' (Joint Rest & Systemic Nervous System Recovery):
   - Science Base: Decrease systemic fatigue, allow tendon/ligament remodeling, and prevent overreaching.
   - Intensity: 50% of 1-Rep Max (1RM) or RPE 5 to 6. Keep at least 3-4 reps in reserve.
   - Reps: 10 to 12 controlled reps (tempo: 3-second eccentric).
   - Rest: 60-90 seconds.
   - Sets: 3 sets with light load to promote blood flow.

THE 2-FOR-2 PROGRESSION RULE (For All Generated Plans):
In the exercise 'proTip', explicitly state the precise weight and rep progression triggers based on the '2-for-2 science rule': 'If you can complete 2 more reps than your target on the final set for 2 consecutive workouts, increase the load by 2.5% to 5% to trigger progressive overload.'

AVOIDANCE RULE:
If a list of recent exercises to avoid is provided, you MUST NOT select those exact exercises. Instead, design alternative movements targeting the same split.

STRICT EXERCISE NAMING RULE - NEVER USE 'OR' OR DUAL-EQUIPMENT OPTIONS:
You MUST NEVER output 'or', '/', or dual options in any exercise name. Always select and output exactly ONE concrete exercise with specific equipment so that progressive overload tracking remains 100% precise.

You MUST respond with a valid JSON matching the requested schema.`;

    const prompt = `Please build a premium, 100% science-based, highly optimized workout routine for:
- Split Name: "${splitName}"
- Periodization Phase / Focus: "${focus}"
- Current Program Week: Week ${weekNumber || 1}
- Personalization Settings:
  * Muscle Definition Focus: ${muscleDefinition ? "ENABLED" : "DISABLED"}
  * Fat Loss Focus: ${lowerFat ? "ENABLED" : "DISABLED"}
  * Leg Day Volume Booster: ${optimizeLegs ? "ENABLED" : "DISABLED"}
  * Custom User Notes: ${customNotes || "None"}
- Recently completed exercises to AVOID (to maximize muscle-building variation): ${JSON.stringify(recentExercises || [])}
${getEquipmentConstraintPrompt(availableEquipment)}

Make sure that:
1. Every exercise proTip is explicitly science-backed, mentioning the specific 1RM % or RPE, rest interval rationale, and the progressive overload rules.
2. The workoutTitle and focusExplanation explain the precise biological mechanism of the phase (e.g. myofibrillar protein synthesis, lactic acid tolerance, neural drive recruitment, or tendon recovery).`;

    const modelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let response;
    let success = false;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting day workout generation with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: dayWorkoutSchema,
            temperature: 0.6,
          },
        });
        success = true;
        break;
      } catch (err: any) {
        console.log(`[Cascade Info] Day workout model ${modelName} status:`, err.message || err);
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    let parsedWorkout: any;

    if (!success || !response) {
      console.log("[Cascade Info] Initiating local fallback for day workout generation...");
      parsedWorkout = generateProgrammaticFallback(
        `${splitName || "Full Body"} ${focus || "Hypertrophy"}`,
        !!muscleDefinition,
        !!lowerFat,
        !!optimizeLegs,
        customNotes || "",
        focus || "Hypertrophy"
      );
    } else {
      const text = response.text;
      if (!text) {
        throw new Error("Empty response from Gemini");
      }

      let cleanText = text.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\n?|```$/g, "").trim();
      }

      parsedWorkout = JSON.parse(cleanText);
    }

    if (parsedWorkout && Array.isArray(parsedWorkout.exercises)) {
      parsedWorkout.exercises = parsedWorkout.exercises.map((ex: any) => ({
        ...ex,
        name: cleanExerciseName(ex.name)
      }));
    }

    parsedWorkout.originalSourceType = "planner";
    parsedWorkout.targetSplit = splitName;

    return res.json({ success: true, workoutPlan: parsedWorkout });

  } catch (error: any) {
    console.error("Error in /api/generate-planner-day:", error);
    res.status(500).json({ success: false, error: error.message || "Failed to generate day workout" });
  }
});

// API endpoint for generating AI stretching and mobility routines
app.post("/api/generate-stretching", async (req: Request, res: Response) => {
  try {
    const { prompt, category } = req.body;
    const userPrompt = prompt || "Full Body Daily Reset";

    const stretchSchema = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        title: { type: Type.STRING },
        category: { type: Type.STRING },
        estimatedMinutes: { type: Type.INTEGER },
        description: { type: Type.STRING },
        poses: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              targetArea: { type: Type.STRING },
              holdSeconds: { type: Type.INTEGER },
              type: { type: Type.STRING, description: "static, dynamic, or pnf" },
              instructions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              tips: { type: Type.STRING },
              benefits: { type: Type.STRING }
            },
            required: ["id", "name", "targetArea", "holdSeconds", "type", "instructions", "tips", "benefits"]
          }
        }
      },
      required: ["id", "title", "category", "estimatedMinutes", "description", "poses"]
    };

    const systemInstruction = `You are a licensed physical therapist and mobility coach. Generate a science-based, 4 to 6 pose stretching routine tailored to the user's specific prompt. Ensure safe form, hold times (30-60s), and step-by-step execution instructions. Respond strictly with JSON.`;

    const aiPrompt = `Design a custom stretching routine for: "${userPrompt}". Category: ${category || "Full Body"}.`;

    const modelsToTry = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
    let response;
    let success = false;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Stretching AI] Attempting routine generation with model: ${modelName}`);
        response = await ai.models.generateContent({
          model: modelName,
          contents: aiPrompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: stretchSchema,
            temperature: 0.2
          }
        });
        success = true;
        break;
      } catch (err: any) {
        console.warn(`[Stretching AI] Model ${modelName} failed:`, err.message);
      }
    }

    if (success && response && response.text) {
      let cleanText = response.text.trim();
      if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      }
      const routine = JSON.parse(cleanText);
      // Ensure estimatedMinutes is strictly calculated from the exact sum of pose durations
      if (Array.isArray(routine.poses) && routine.poses.length > 0) {
        const totalSecs = routine.poses.reduce((sum: number, p: any) => sum + (Number(p.holdSeconds) || 45), 0);
        routine.estimatedMinutes = Math.max(1, Math.round(totalSecs / 60));
      }
      return res.json({ success: true, routine });
    }

    // Fallback routine if AI service is offline
    const fallbackRoutine = {
      id: `ai-stretch-${Date.now()}`,
      title: `Mobility Reset: ${userPrompt.substring(0, 25)}`,
      category: category || "Full Body",
      estimatedMinutes: 5,
      description: `Custom mobility routine designed for ${userPrompt}.`,
      poses: [
        {
          id: "fb-1",
          name: "Cat-Cow Dynamic Spine Flow",
          targetArea: "Spine & Core",
          holdSeconds: 60,
          type: "dynamic",
          instructions: [
            "Inhale to drop belly and lift chest (Cow).",
            "Exhale to round spine up towards ceiling (Cat)."
          ],
          tips: "Match breath to movement smoothly.",
          benefits: "Increases spinal lubrication and relieves stiffness."
        },
        {
          id: "fb-2",
          name: "World's Greatest Stretch (Left)",
          targetArea: "Hips & Thoracic Spine",
          holdSeconds: 60,
          type: "dynamic",
          instructions: [
            "Step left leg into deep lunge, rotate chest up toward reaching left hand."
          ],
          tips: "Keep back leg engaged.",
          benefits: "Total body joint prep and hip flexor release."
        },
        {
          id: "fb-3",
          name: "World's Greatest Stretch (Right)",
          targetArea: "Hips & Thoracic Spine",
          holdSeconds: 60,
          type: "dynamic",
          instructions: [
            "Step right leg into deep lunge, rotate chest up toward reaching right hand."
          ],
          tips: "Follow reaching hand with your eyes.",
          benefits: "Total body joint prep and hip flexor release."
        },
        {
          id: "fb-4",
          name: "Seated Hamstring Fold",
          targetArea: "Hamstrings & Lower Back",
          holdSeconds: 60,
          type: "static",
          instructions: [
            "Sit with legs extended, hinge gently from hips toward feet."
          ],
          tips: "Keep spine straight and long.",
          benefits: "Lengthens tight hamstrings."
        },
        {
          id: "fb-5",
          name: "Extended Child's Pose",
          targetArea: "Lower Back & Shoulders",
          holdSeconds: 60,
          type: "static",
          instructions: [
            "Kneel with toes touching, reach arms long out in front."
          ],
          tips: "Breathe deeply into your lower back.",
          benefits: "Decompresses vertebrae and relaxes nervous system."
        }
      ]
    };
    const fallbackSecs = fallbackRoutine.poses.reduce((sum, p) => sum + p.holdSeconds, 0);
    fallbackRoutine.estimatedMinutes = Math.max(1, Math.round(fallbackSecs / 60));

    return res.json({ success: true, routine: fallbackRoutine });
  } catch (err: any) {
    console.error("Error in /api/generate-stretching:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Programmatic fallback curator for user onboarding plans
 */
function generateCuratedPlanFallback(answers: any) {
  const mainGoal = answers.mainGoal || "All of the above";
  const freqStr = answers.workoutFrequency || "4 days";
  let freq = 4;
  if (freqStr.includes("2")) freq = 2;
  else if (freqStr.includes("3")) freq = 3;
  else if (freqStr.includes("5")) freq = 5;
  else if (freqStr.includes("6")) freq = 6;

  let duration = 60;
  const durStr = answers.dailyDuration || "45-60 minutes";
  if (durStr.includes("15-30")) duration = 30;
  else if (durStr.includes("30-45")) duration = 45;
  else if (durStr.includes("45-60")) duration = 60;
  else if (durStr.includes("60-90")) duration = 60;
  else if (durStr.includes("90+")) duration = 90;
  else duration = 60;

  const equipment = answers.availableEquipment || "Full Commercial Gym";
  const runGoal = answers.cardioGoal || "5K / 10K Distance & Speed";

  let schedule: any[] = [];

  if (freq >= 5) {
    schedule = [
      { id: "day-1", dayName: "Monday", activityType: "Strength Workout", title: "Upper Body Hypertrophy & Power", summary: `Focused upper body split (${duration} mins) targeting chest, back, shoulders & arms.`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-2", dayName: "Tuesday", activityType: runGoal.includes("No") ? "Strength Workout" : "Cardio Run", title: runGoal.includes("No") ? "Lower Body & Glutes Power" : "Interval Cardio & Speed Workout", summary: runGoal.includes("No") ? "Squats, lunges, RDLs & calves." : `Aerobic cardio conditioning (${duration} mins).`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-3", dayName: "Wednesday", activityType: "Stretching & Mobility", title: "Spine, Hip Flexor & Posture Reset", summary: "Deep mobility flow targeting hip flexors, lower back decompression & desk posture.", targetDurationMinutes: 30, intensity: "Low" },
      { id: "day-4", dayName: "Thursday", activityType: "Strength Workout", title: "Lower Body & Core Focus", summary: `Squat & deadlift variations (${duration} mins) with core stabilization.`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-5", dayName: "Friday", activityType: "Strength Workout", title: "Push & Pull Athletic Compound", summary: "Full body athletic compounds with progressive overload.", targetDurationMinutes: duration, intensity: "Moderate" },
      { id: "day-6", dayName: "Saturday", activityType: runGoal.includes("No") ? "Stretching & Mobility" : "Cardio Run", title: runGoal.includes("No") ? "Full Body Cooldown Flow" : "Zone 2 Steady Endurance Run", summary: runGoal.includes("No") ? "Relaxed stretching session." : `Conversational pace distance run (${duration} mins).`, targetDurationMinutes: duration, intensity: "Moderate" },
      { id: "day-7", dayName: "Sunday", activityType: "Rest Day", title: "Full Active Recovery & CNS Reset", summary: "Zero heavy strain. Light walk & hydration to reset for next week.", targetDurationMinutes: 0, intensity: "Rest" }
    ];
  } else if (freq === 3 || freq === 4) {
    schedule = [
      { id: "day-1", dayName: "Monday", activityType: "Strength Workout", title: "Upper Body Strength & Definition", summary: `Chest, shoulders, back & triceps (${duration} mins).`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-2", dayName: "Tuesday", activityType: runGoal.includes("No") ? "Stretching & Mobility" : "Cardio Run", title: runGoal.includes("No") ? "Postural Reset & Mobility" : "Cardio Pace & Stamina Run", summary: runGoal.includes("No") ? "Spine and neck mobility stretch." : `Interval cardio session (${duration} mins) with target pace goals.`, targetDurationMinutes: duration, intensity: "Moderate" },
      { id: "day-3", dayName: "Wednesday", activityType: "Strength Workout", title: "Lower Body & Glute Power", summary: `Squats, hamstring curls & lunges (${duration} mins).`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-4", dayName: "Thursday", activityType: "Stretching & Mobility", title: "Hip Flexor & Lower Back Relief", summary: "Targeted mobility for tight hips and lumbar spine de-straining.", targetDurationMinutes: 30, intensity: "Low" },
      { id: "day-5", dayName: "Friday", activityType: "Strength Workout", title: "Full Body Athletic Volume", summary: `Compound lifts (${duration} mins) covering all major muscle groups.`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-6", dayName: "Saturday", activityType: runGoal.includes("No") ? "Active Recovery" : "Cardio Run", title: runGoal.includes("No") ? "Active Recovery (30m Walk + 30m Stretch)" : "Zone 2 Endurance Aerobic Base", summary: runGoal.includes("No") ? "30-minute low-impact recovery walk followed by a 30-minute full body restorative stretch." : `Steady pace active session (${duration} mins) to promote circulation.`, targetDurationMinutes: runGoal.includes("No") ? 60 : duration, intensity: "Low" },
      { id: "day-7", dayName: "Sunday", activityType: "Rest Day", title: "Complete Rest & Muscle Repair", summary: "Rest day to maximize muscle protein synthesis and recovery.", targetDurationMinutes: 0, intensity: "Rest" }
    ];
  } else {
    schedule = [
      { id: "day-1", dayName: "Monday", activityType: "Strength Workout", title: "Full Body Strength Split A", summary: `Total body compound workout (${duration} mins) covering chest, back, quads & core.`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-2", dayName: "Tuesday", activityType: "Stretching & Mobility", title: "Spine & Hip Flexor Flow", summary: "Light mobility flow to relieve body stiffness.", targetDurationMinutes: 30, intensity: "Low" },
      { id: "day-3", dayName: "Wednesday", activityType: "Rest Day", title: "Rest & Hydration", summary: "Complete recovery.", targetDurationMinutes: 0, intensity: "Rest" },
      { id: "day-4", dayName: "Thursday", activityType: "Strength Workout", title: "Full Body Strength Split B", summary: `Total body workout (${duration} mins) focusing on shoulders, hamstrings, glutes & arms.`, targetDurationMinutes: duration, intensity: "High" },
      { id: "day-5", dayName: "Friday", activityType: runGoal.includes("No") ? "Stretching & Mobility" : "Cardio Run", title: runGoal.includes("No") ? "Full Body Cooldown" : "Cardio & Stamina Session", summary: `Heart health & aerobic capacity (${duration} mins).`, targetDurationMinutes: duration, intensity: "Moderate" },
      { id: "day-6", dayName: "Saturday", activityType: "Active Recovery", title: "Active Recovery (30m Walk + 30m Stretch)", summary: "30-minute low-impact recovery walk followed by a 30-minute full body restorative mobility stretch.", targetDurationMinutes: 60, intensity: "Low" },
      { id: "day-7", dayName: "Sunday", activityType: "Rest Day", title: "Rest Day", summary: "Recovery day.", targetDurationMinutes: 0, intensity: "Rest" }
    ];
  }

  const strengthCount = schedule.filter(s => s.activityType === "Strength Workout").length;
  const cardioCount = schedule.filter(s => s.activityType === "Cardio Run").length;
  const mobilityCount = schedule.filter(s => s.activityType === "Stretching & Mobility").length;

  return {
    id: `plan-${Date.now()}`,
    createdAt: new Date().toISOString(),
    answers,
    weeklyOverview: {
      programTitle: `Personalized ${answers.mainGoal} Routine`,
      tagline: `Optimized for ${answers.workoutFrequency}, ${answers.dailyDuration} per session, using ${answers.availableEquipment}.`,
      weeklyStrengthDays: strengthCount,
      weeklyCardioDays: cardioCount,
      weeklyMobilityDays: mobilityCount,
      estimatedWeeklyCalories: (strengthCount * 320) + (cardioCount * 350) + (mobilityCount * 80),
      aiCoachNotes: `Your plan balances progressive overload on strength days with structured cardio and targeted mobility based on your goal ("${answers.mainGoal}") and safety note ("${answers.specialNotes || "None"}").`
    },
    weeklySchedule: schedule
  };
}

// API endpoint for generating AI curated user onboarding plan
app.post("/api/generate-curated-plan", async (req: Request, res: Response) => {
  try {
    const { answers } = req.body;
    if (!answers) {
      return res.status(400).json({ success: false, error: "Missing onboarding answers" });
    }

    const planSchema = {
      type: Type.OBJECT,
      properties: {
        id: { type: Type.STRING },
        weeklyOverview: {
          type: Type.OBJECT,
          properties: {
            programTitle: { type: Type.STRING },
            tagline: { type: Type.STRING },
            weeklyStrengthDays: { type: Type.INTEGER },
            weeklyCardioDays: { type: Type.INTEGER },
            weeklyMobilityDays: { type: Type.INTEGER },
            estimatedWeeklyCalories: { type: Type.INTEGER },
            aiCoachNotes: { type: Type.STRING }
          },
          required: ["programTitle", "tagline", "weeklyStrengthDays", "weeklyCardioDays", "weeklyMobilityDays", "estimatedWeeklyCalories", "aiCoachNotes"]
        },
        weeklySchedule: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              dayName: { type: Type.STRING },
              activityType: { 
                type: Type.STRING,
                enum: ["Strength Workout", "Cardio Run", "Stretching & Mobility", "Active Recovery", "Rest Day"]
              },
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              targetDurationMinutes: { type: Type.INTEGER },
              intensity: { type: Type.STRING }
            },
            required: ["id", "dayName", "activityType", "title", "summary", "targetDurationMinutes", "intensity"]
          }
        }
      },
      required: ["weeklyOverview", "weeklySchedule"]
    };

    const systemInstruction = `Role: You are Arthur, an elite, highly adaptable fitness coach and head architect inside ATHRU. Build a 7-day Weekly Schedule (Monday through Sunday) customized strictly to the user's 10 onboarding answers. Never use the word "AI" in titles, summaries, coach notes, or descriptions.
Core Directives:
1. Dynamic Adaptability & Living Plan: Create a sustainable, progressive schedule that balances lifting, cardio, mobility, and rest.
2. CRITICAL ACTIVITY TYPE SPECIFICATION:
   - "Strength Workout": For ANY day involving weight lifting, resistance training, gym workouts, bodyweight strength, split lifting (Push, Pull, Legs, Upper, Lower, Full Body, chest, back, rows, presses, dips, squats, deadlifts, etc.). If the user is scheduled to do a lift, activityType MUST BE "Strength Workout"! NEVER classify a day with resistance movements or lifts as "Stretching & Mobility", even if mobility warmups or thoracic decompression are included!
   - "Cardio Run": For dedicated runs, HIIT sprints, intervals, or tempo endurance.
   - "Stretching & Mobility": ONLY for dedicated recovery yoga flows or stretching sessions with ZERO resistance lifts.
   - "Active Recovery": For light walking + stretching combination days.
   - "Rest Day": For complete rest.
   weeklyStrengthDays, weeklyCardioDays, weeklyMobilityDays in weeklyOverview MUST accurately match the count of each activityType in weeklySchedule!
3. Transparent Progressive Overload: Ground exercise selections and volume targets in progressive stimulus.
4. Smart Cardio & Mobility Integration: Prevent training interference! If a heavy lifting day (like squats, deadlifts, or leg day) is scheduled for the next day, only prescribe light mobility or Zone 2 cardio the day before—never heavy HIIT or fatiguing sprint work. Link stretching routines directly to the muscle groups worked that day or preceding days.
CRITICAL DURATION RULE: For all targetDurationMinutes, workout titles, and cardio sessions, NEVER output a duration range like '40-45 minutes' or '30-40 min'. Always provide a single integer number (e.g. exactly 40 or 45). Respond strictly with JSON.`;

    const aiPrompt = `Generate a customized 7-day weekly schedule based on these user onboarding answers:
- Main Usage Goal: ${answers.mainGoal}
- Weekly Frequency: ${answers.workoutFrequency}
- Daily Duration: ${answers.dailyDuration}
- Experience Level: ${answers.experienceLevel}
- Primary Focus Area: ${answers.primaryFocusArea}
- Available Equipment: ${answers.availableEquipment}
- Running / Cardio Goal: ${answers.cardioGoal}
- Flexibility / Mobility Goal: ${answers.flexibilityGoal}
- Rest & Recovery Preference: ${answers.restPreference}
- Special Notes / Constraints: ${answers.specialNotes || "None"}
`;

    const modelsToTry = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let response;
    let success = false;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: aiPrompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: planSchema,
            temperature: 0.3
          }
        });
        success = true;
        break;
      } catch (err: any) {
        console.warn(`[Curated Plan AI] Model ${modelName} failed:`, err.message);
      }
    }

    if (success && response && response.text) {
      const generated = JSON.parse(response.text.trim());
      let schedule = generated.weeklySchedule;
      if (Array.isArray(schedule)) {
        schedule = schedule.map((d: any) => {
          let cleanDur = typeof d.targetDurationMinutes === 'number' ? d.targetDurationMinutes : 45;
          if (typeof d.targetDurationMinutes === 'string') {
            const match = d.targetDurationMinutes.match(/(\d+)\s*[-–—]\s*(\d+)/);
            cleanDur = match ? parseInt(match[2], 10) : parseInt(d.targetDurationMinutes, 10) || 45;
          }
          const cleanTitle = (d.title || "").replace(/(\d+)\s*[-–—]\s*(\d+)\s*(mins?|minutes?)?/gi, (_m: string, _a: string, b: string, unit: string) => unit ? `${b} ${unit}` : b);
          return {
            ...d,
            title: cleanTitle,
            targetDurationMinutes: cleanDur
          };
        });
      }

      // Guarantee weeklyStrengthDays, weeklyCardioDays, weeklyMobilityDays accurately match the schedule
      const strengthCount = schedule.filter((s: any) => s.activityType === "Strength Workout").length;
      const cardioCount = schedule.filter((s: any) => s.activityType === "Cardio Run").length;
      const mobilityCount = schedule.filter((s: any) => s.activityType === "Stretching & Mobility").length;

      const curatedPlan = {
        id: `plan-${Date.now()}`,
        createdAt: new Date().toISOString(),
        answers,
        weeklyOverview: {
          ...generated.weeklyOverview,
          weeklyStrengthDays: strengthCount,
          weeklyCardioDays: cardioCount,
          weeklyMobilityDays: mobilityCount
        },
        weeklySchedule: schedule
      };
      return res.json({ success: true, plan: curatedPlan });
    }

    // Fallback if AI service is offline
    const fallbackPlan = generateCuratedPlanFallback(answers);
    return res.json({ success: true, plan: fallbackPlan });
  } catch (err: any) {
    console.error("Error in /api/generate-curated-plan:", err);
    // Fallback on error
    const fallbackPlan = generateCuratedPlanFallback(req.body.answers || {});
    return res.json({ success: true, plan: fallbackPlan });
  }
});

// API endpoint for generating progressive AI next week plan
app.post("/api/generate-next-week-plan", async (req: Request, res: Response) => {
  try {
    const { currentPlan, focus } = req.body;
    if (!currentPlan || !currentPlan.weeklySchedule) {
      return res.status(400).json({ success: false, error: "Missing current plan" });
    }

    const nextWeekSchema = {
      type: Type.OBJECT,
      properties: {
        nextWeekOverview: {
          type: Type.OBJECT,
          properties: {
            programTitle: { type: Type.STRING },
            tagline: { type: Type.STRING },
            aiCoachNotes: { type: Type.STRING }
          },
          required: ["programTitle", "tagline", "aiCoachNotes"]
        },
        nextWeekSchedule: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              dayName: { type: Type.STRING },
              activityType: { 
                type: Type.STRING,
                enum: ["Strength Workout", "Cardio Run", "Stretching & Mobility", "Active Recovery", "Rest Day"]
              },
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              targetDurationMinutes: { type: Type.INTEGER },
              intensity: { type: Type.STRING }
            },
            required: ["id", "dayName", "activityType", "title", "summary", "targetDurationMinutes", "intensity"]
          }
        }
      },
      required: ["nextWeekOverview", "nextWeekSchedule"]
    };

    const systemInstruction = `Role: You are Arthur, an elite, highly adaptable fitness coach and exercise physiologist. Given the athlete's current 7-day workout schedule and onboarding profile, create next week's progressive training split. Never use the word "AI" in titles, summaries, coach notes, or descriptions.
Core Directives:
1. CRITICAL ACTIVITY TYPE SPECIFICATION:
   - "Strength Workout": For any weight lifting, resistance training, or split lifting day (even if mobility warmups are included).
   - "Cardio Run": For dedicated cardio or running days.
   - "Stretching & Mobility": For dedicated mobility or yoga days without lifting.
   - "Active Recovery": For walking/stretching combination days.
   - "Rest Day": For complete rest.
2. Communication & Style: Keep coaching notes concise and direct (1 to 3 short sentences).
3. Transparent Progressive Overload: Whenever you advance strength volume, reps, or intensity (+2.5-5% load adaptation), include a clear, 1-sentence rationale explaining why (e.g., "You completed last week's targets cleanly, so loads are bumped 2.5-5% to keep you in the growth zone.").
4. Smart Cardio & Mobility Integration: Prevent training interference. If a heavy lifting day (like squats/deadlifts) is scheduled for tomorrow, only prescribe light mobility or Zone 2 cardio today—never heavy HIIT. Link stretching directly to the muscles just worked.
5. Keep the same day count/structure so it builds directly on their current habits.
Respond strictly in JSON matching the schema.`;

    const aiPrompt = `Current Program Title: ${currentPlan.weeklyOverview?.programTitle || "Weekly Routine"}
Main Goal: ${currentPlan.answers?.mainGoal || "Strength & Fitness"}
Equipment: ${currentPlan.answers?.availableEquipment || "Full Gym"}
Focus notes: ${focus || "Progressive volume and overload"}

Current 7-Day Schedule:
${(currentPlan.weeklySchedule || []).map((d: any) => `- ${d.dayName}: [${d.activityType}] ${d.title} (${d.targetDurationMinutes} mins, ${d.intensity} intensity) - ${d.summary}`).join("\n")}

Generate next week's progressive schedule with updated titles, summaries, and duration targets. Ensure all 7 days (Monday through Sunday) are present.`;

    const modelsToTry = ["gemini-3.8-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
    let response;
    let success = false;

    for (const modelName of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: aiPrompt,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: nextWeekSchema,
            temperature: 0.3
          }
        });
        success = true;
        break;
      } catch (err: any) {
        console.warn(`[Next Week AI] Model ${modelName} failed:`, err.message);
      }
    }

    if (success && response && response.text) {
      const parsed = JSON.parse(response.text.trim());
      return res.json({
        success: true,
        overview: parsed.nextWeekOverview,
        schedule: parsed.nextWeekSchedule.map((d: any, idx: number) => ({
          ...d,
          id: `next-week-${idx + 1}-${Date.now()}`,
          completed: false
        }))
      });
    }

    return res.status(500).json({ success: false, error: "AI generation failed" });
  } catch (err: any) {
    console.error("Error in /api/generate-next-week-plan:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// API: COACH AI CHATBOT (GEMINI 2.5 FLASH WITH FUNCTION CALLING FOR PLAN EDITS)
// ============================================================================
app.post("/api/coach/chat", async (req: Request, res: Response) => {
  try {
    const { messages, userContext } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: "Messages array is required." });
    }

    const systemInstruction = `Role: You are Arthur, an elite, highly adaptable fitness coach inside ATHRU. Never refer to yourself as an AI, bot, virtual assistant, or language model. Never use the word "AI". You are Arthur, their dedicated coach.

Communication Style:
- Be extremely concise. Use 1 to 3 short sentences maximum per response.
- Do not write paragraphs or output large walls of text.
- Be conversational, direct, and encouraging.
- Never use markdown asterisks (*). Keep text completely clean and readable.

Core Directives:
1. Dynamic Adaptability: Operate as a "living" plan. If a user states they have limited time (e.g. 20-30 mins), lack equipment (e.g. only dumbbells, at home, no barbells), or feel sore/injured (e.g. elbow hurts, sore lower back, shoulders, knees), instantly recalculate their workout to fit the new constraint without complaining or lecturing. Call the adaptWorkoutForConstraints tool immediately so their schedule updates live on their screen!
- CRITICAL RULES FOR SORENESS & INJURY ADAPTATIONS:
  * Title Format: When adapting a workout for soreness or injury (such as an elbow hurt), set adaptedWorkoutTitle strictly to: "[BodyPart] Friendly [Original Workout Title]" — specifically if the elbow hurts, use "Elbow Friendly [Original Workout Title]" (e.g., if the original routine was "Upper Body Hypertrophy" or "Push Day", the title MUST be "Elbow Friendly Upper Body Hypertrophy" or "Elbow Friendly Push Day").
  * Duration Preservation: Keep the athlete's scheduled workout duration (e.g. 60 mins from USER APP CONTEXT) intact. Do NOT shorten to 25 minutes unless the athlete explicitly said they are short on time.
  * Exercise Programming for Injured Elbow: If the athlete's elbow hurts, eliminate high elbow torque, heavy forearm gripping, and direct elbow flexion/extension under shear stress. If upper body isn't viable without pain, convert to a lower body and core session (e.g. Leg Press, Hack Squats, Calf Raises, Core crunches).
2. Transparent Progressive Overload: Whenever you increase a user's weight or reps, explain exactly why in one sentence. Example: "You hit 150 lbs easily last week, so we are bumping to 155 lbs today to keep you in the growth zone."
3. Smart Cardio & Mobility Integration: Prevent training interference. If a heavy lifting day (like squats or deadlifts) is scheduled for tomorrow, only prescribe light mobility or Zone 2 cardio today—never heavy HIIT. Link stretching directly to the muscles they just worked.
4. Universal Training Question Answering:
- You must answer ANY question the athlete asks regarding their training, current routine, scheduled workout, exercises, sets, reps, weights, warmups, technique, deloads, recovery, cardio, rest days, nutrition, or exercise science.
- Answer directly and authoritatively in 1 to 3 short sentences. Never avoid or deflect questions, and never give a generic canned response like "I'm Arthur, ask me anything".
- For specific questions about their current routine, today's workout, or scheduled exercises: state the exact exercises, sets, reps, and weights from USER APP CONTEXT.
- For open-ended training questions: provide direct coaching advice rooted in elite exercise science and physiology.
- For training topics outside the active schedule (e.g. nutrition, bulking, sleep, creatine, foam rolling): provide elite exercise science principles with concise practical application.

FULL APP & DATA INTEGRATION - ZERO GUESSWORK (NEVER GUESS):
- You designed and oversee the athlete's entire plan: today's scheduled workouts, weekly schedule, target weights, rep ranges, cardio sessions, and recovery stretches.
- You have complete access to all their logged lifts, exercise history, PRs, cardio logs, and stretching sessions in USER APP CONTEXT.
- When asked why a specific stretch, cardio session, workout split, exercise, or weight is suggested, state the exact coaching rationale with complete authority and confidence in 1 to 3 short sentences.

USER APP CONTEXT:
${userContext ? JSON.stringify(userContext, null, 2) : "Athlete session active."}
`;

    // Define function declarations for actionable plan edits
    const tools = [{
      functionDeclarations: [
        {
          name: "adaptWorkoutForConstraints",
          description: "Dynamically recalculates and instantly updates today's workout when the user has limited time, lacks equipment, or feels sore in specific muscle groups or joints. Immediately adjusts exercises, sets, reps, and durations to fit the constraint without friction.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              constraintType: {
                type: Type.STRING,
                description: "Type of constraint: 'limited_time', 'equipment_lack', 'muscle_soreness', or 'mixed'."
              },
              adaptedWorkoutTitle: {
                type: Type.STRING,
                description: "The formatted title of the adapted workout, strictly following 'Elbow Friendly [Original Workout Title]' or '[BodyPart] Friendly [Original Workout Title]'."
              },
              timeLimitMinutes: {
                type: Type.INTEGER,
                description: "Available workout time in minutes (e.g. 20, 25, 30, 45, 60)."
              },
              soreAreaOrRestrictedMuscle: {
                type: Type.STRING,
                description: "Muscle group or joint that is sore or needs to be rested/worked around (e.g. 'lower back', 'shoulders', 'knees', 'chest')."
              },
              equipmentAvailable: {
                type: Type.STRING,
                description: "Equipment available (e.g. 'dumbbells only', 'bodyweight only', 'machines only')."
              },
              actionSummary: {
                type: Type.STRING,
                description: "1-sentence summary of the workout adjustment made."
              },
              progressiveOverloadNote: {
                type: Type.STRING,
                description: "1-sentence explanation of overload rationale or stimulus preservation."
              },
              revisedExercises: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    sets: { type: Type.INTEGER },
                    reps: { type: Type.STRING },
                    restSeconds: { type: Type.INTEGER },
                    targetMuscleGroup: { type: Type.STRING },
                    proTip: { type: Type.STRING },
                    progressiveOverloadReason: { type: Type.STRING }
                  },
                  required: ["name", "sets", "reps", "restSeconds", "targetMuscleGroup"]
                },
                description: "The adapted list of 3 to 5 exercises perfectly tailored to the constraint."
              }
            },
            required: ["constraintType", "actionSummary"]
          }
        },
        {
          name: "adjustStrengthRepRange",
          description: "Converts today's workout (or the active workout on screen) to heavy strength loading by lowering rep ranges to 3-6 reps, scaling up target weights (+10-15% / 80-85% 1RM), and extending rest intervals to 2-3 minutes for compound lifts.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              targetRepRange: {
                type: Type.STRING,
                description: "Target rep range for strength, e.g. '3-5 reps' or '4-6 reps' or '5 reps'."
              },
              weightIncreasePercentage: {
                type: Type.NUMBER,
                description: "Percentage to scale up target weights (default 10 to 15 percent, representing ~80-85% 1RM intensity)."
              },
              restSeconds: {
                type: Type.INTEGER,
                description: "Rest duration in seconds for compound lifts (default 180 seconds / 3 minutes)."
              },
              reason: {
                type: Type.STRING,
                description: "1-sentence concise coaching rationale for this strength conversion."
              },
              targetExerciseName: {
                type: Type.STRING,
                description: "Optional specific exercise to convert, or 'all' for the whole workout session."
              }
            },
            required: ["targetRepRange"]
          }
        },
        {
          name: "adjustRepRangeAndVolume",
          description: "Adjusts repetition ranges, working sets count, or weights for an exercise or the entire current workout session based on user request.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              targetRepRange: {
                type: Type.STRING,
                description: "New repetition range (e.g. '3-5 reps', '6-8 reps', '10-12 reps')."
              },
              setsCount: {
                type: Type.INTEGER,
                description: "Number of working sets."
              },
              weightAdjustment: {
                type: Type.STRING,
                description: "Weight adjustment instruction, e.g. '+10%', '-5 lbs', '80% 1RM'."
              },
              restSeconds: {
                type: Type.INTEGER,
                description: "Rest interval in seconds."
              },
              exerciseName: {
                type: Type.STRING,
                description: "Exercise to modify, or 'all'."
              },
              reason: {
                type: Type.STRING,
                description: "1-sentence rationale for the adjustment."
              }
            },
            required: ["targetRepRange"]
          }
        },
        {
          name: "swapWorkoutSplit",
          description: "Swaps or updates the user's workout split for today or a specific day of the week (e.g. swap chest for legs, switch to pull day, rest day, etc.).",
          parameters: {
            type: Type.OBJECT,
            properties: {
              targetSplit: {
                type: Type.STRING,
                description: "The name of the workout split to switch to. E.g. 'Legs & Glutes', 'Push (Chest/Shoulders/Triceps)', 'Pull (Back & Biceps)', 'Arms & Shoulders', 'Full Body Hypertrophy', 'Active Recovery / Mobility', 'Cardio / HIIT'."
              },
              targetDayName: {
                type: Type.STRING,
                description: "The day of the week to swap, e.g. 'Monday', 'Tuesday', or 'today'."
              },
              reason: {
                type: Type.STRING,
                description: "1-sentence concise coaching rationale for this swap."
              },
              focusNotes: {
                type: Type.STRING,
                description: "Key focus points or intensity cues for the new workout."
              }
            },
            required: ["targetSplit"]
          }
        },
        {
          name: "replaceExercise",
          description: "Replaces an exercise in the user's current workout with an effective alternative.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              exerciseToReplace: {
                type: Type.STRING,
                description: "The name of the exercise to remove/replace."
              },
              newExerciseName: {
                type: Type.STRING,
                description: "The replacement exercise name."
              },
              targetMuscleGroup: {
                type: Type.STRING,
                description: "The primary muscle group targeted."
              },
              sets: {
                type: Type.INTEGER,
                description: "Number of working sets."
              },
              reps: {
                type: Type.STRING,
                description: "Target repetition range, e.g. '8-10 reps', '12-15 reps'."
              },
              reason: {
                type: Type.STRING,
                description: "1-sentence reason why this replacement is beneficial."
              }
            },
            required: ["exerciseToReplace", "newExerciseName"]
          }
        },
        {
          name: "addCardioOrStretchSession",
          description: "Adds or schedules a cardio or stretching session into the user's schedule.",
          parameters: {
            type: Type.OBJECT,
            properties: {
              sessionType: {
                type: Type.STRING,
                description: "Type of session: 'Zone 2 Low-Impact Cardio', 'Stairmaster', 'Treadmill', 'Swimming', 'Pre-Lift Dynamic Warmup', 'Post-Workout Decompression', etc."
              },
              durationMinutes: {
                type: Type.INTEGER,
                description: "Target duration in minutes."
              },
              notes: {
                type: Type.STRING,
                description: "Intensity or pacing instructions."
              }
            },
            required: ["sessionType", "durationMinutes"]
          }
        }
      ]
    }];

    // Build Gemini contents payload from message history
    const contents = messages.map((m: { role: string; text: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: (m.text || "").replace(/\*/g, "") }]
    }));

    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.8-flash"
    ];
    let response: any = null;
    let success = false;

    for (const modelName of modelsToTry) {
      try {
        const generatePromise = ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            tools,
            temperature: 0.4
          }
        });
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout after 10000ms for ${modelName}`)), 10000);
        });

        response = await Promise.race([generatePromise, timeoutPromise]);
        success = true;
        break;
      } catch (err: any) {
        console.warn(`[Coach Chat AI] Model ${modelName} failed or timed out:`, err.message);
      }
    }

    if (success && response) {
      // Check for function calls
      const functionCalls = response.functionCalls;
      let actionPayload: any = null;

      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        actionPayload = {
          name: call.name,
          args: call.args
        };
      }

      let rawResponseText = response.text || "";
      // Clean any accidental asterisks from model output
      rawResponseText = rawResponseText.replace(/\*/g, "").trim();

      const responseText = rawResponseText || (
        actionPayload 
          ? `Plan updated: ${actionPayload.args.actionSummary || actionPayload.args.reason || actionPayload.args.targetSplit || 'workout adapted to your schedule'}.`
          : "Understood. Let me know what you need to adjust in your training."
      );

      return res.json({
        success: true,
        text: responseText,
        action: actionPayload
      });
    }

    // =========================================================================
    // ARTHUR UNIVERSAL COACHING FALLBACK KNOWLEDGE ENGINE (1-3 CONCISE SENTENCES)
    // Guarantees Arthur authoritatively answers ANY question about the user's
    // training, routine, exercises, sets/reps, schedule, and exercise science.
    // =========================================================================
    const lastUserMessage = messages[messages.length - 1]?.text || "";
    const lower = lastUserMessage.toLowerCase();
    const todayPlan = userContext?.todayScheduledPlan;
    const weeklySchedule: any[] = userContext?.fullWeeklySchedule || [];
    const progressions: string[] = userContext?.exerciseProgressions || [];
    const personalRecords: string[] = userContext?.personalRecords || [];
    const activeWorkout = userContext?.activeTrackedWorkout;

    // 1. SPECIFIC QUESTION ABOUT TODAY'S WORKOUT OR CURRENT ROUTINE
    const isTodayRoutineQuery = (
      (lower.includes("exercise") || lower.includes("workout") || lower.includes("routine") || lower.includes("plan") || lower.includes("session") || lower.includes("doing today")) &&
      (lower.includes("today") || lower.includes("current") || lower.includes("scheduled") || lower.includes("have") || lower.includes("what is my") || lower.includes("what are my") || lower.includes("show me") || lower.includes("what's my") || lower.includes("whats my") || lower.includes("what do i")) &&
      !lower.includes("tomorrow") && !lower.includes("yesterday") && !lower.includes("increase") && !lower.includes("why")
    );

    if (isTodayRoutineQuery || lower.includes("what exercises do i have") || lower.includes("what is my workout") || lower.includes("what are my exercises") || lower.includes("today's workout") || lower.includes("todays workout")) {
      const todayExercises = todayPlan?.workoutDetails?.exercises || [];
      if (todayExercises.length > 0) {
        const exerciseSummary = todayExercises.slice(0, 4).map((e: any) => `${e.name} (${e.sets} sets of ${e.reps}${e.suggestedWeight ? ' @ ' + e.suggestedWeight : ''})`).join(", ");
        const extraCount = todayExercises.length > 4 ? ` plus ${todayExercises.length - 4} accessory movements` : "";
        return res.json({
          success: true,
          text: `Today's session is ${todayPlan?.workoutDetails?.workoutTitle || todayPlan?.title}: ${exerciseSummary}${extraCount}. Focus on explosive concentric drive and full muscular control on every rep!`,
          action: null
        });
      } else if (activeWorkout && activeWorkout.exercises?.length > 0) {
        const activeSummary = activeWorkout.exercises.slice(0, 4).map((e: any) => `${e.name} (${e.setsCount || 3} sets)`).join(", ");
        return res.json({
          success: true,
          text: `Your active tracked workout is ${activeWorkout.title}: ${activeSummary}. Attack every set with full focus and log your weights!`,
          action: null
        });
      } else if (todayPlan?.activityType === "rest" || todayPlan?.activityType === "recovery" || lower.includes("rest")) {
        return res.json({
          success: true,
          text: `Today is programmed as ${todayPlan?.title || "Active Recovery"} (${todayPlan?.activityType || "rest"}). Focus on hydration, quality sleep, and light mobility to allow your central nervous system to recharge!`,
          action: null
        });
      } else if (todayPlan?.title) {
        return res.json({
          success: true,
          text: `Today's focus is ${todayPlan.title} (${todayPlan.durationMinutes || 45} minutes). ${todayPlan.summary || "Execute with maximum focus to keep compounding your progress!"}`,
          action: null
        });
      }
    }

    // 2. TOMORROW / UPCOMING WORKOUT / WEEKLY SCHEDULE
    const isTomorrowScheduleQuery = (
      (lower.includes("tomorrow") || lower.includes("next workout") || lower.includes("upcoming session")) &&
      !lower.includes("cardio") && !lower.includes("stretch") && !lower.includes("eat") && !lower.includes("protein") && !lower.includes("rest between") && !lower.includes("warm up")
    );

    if (isTomorrowScheduleQuery) {
      const daysOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const currentDayIdx = new Date().getDay();
      const tomorrowDayName = daysOrder[(currentDayIdx + 1) % 7];
      const tomorrowDay = weeklySchedule.find((d: any) => d.dayName?.toLowerCase() === tomorrowDayName.toLowerCase()) || weeklySchedule[1];
      const tomorrowTitle = tomorrowDay?.workoutTitle || tomorrowDay?.title || "Scheduled Training";
      const exercisesSnippet = tomorrowDay?.workoutExercises?.slice(0, 3).join(", ");
      return res.json({
        success: true,
        text: `Tomorrow is ${tomorrowDay?.dayName || "your next session"}: ${tomorrowTitle}${exercisesSnippet ? ` focusing on ${exercisesSnippet}` : ''}. Rest up tonight and hydrate well so you show up fully recovered!`,
        action: null
      });
    }

    const isWeeklyScheduleQuery = (
      lower.includes("weekly schedule") ||
      lower.includes("full schedule") ||
      lower.includes("my schedule") ||
      lower.includes("training split") ||
      lower.includes("weekly routine") ||
      (lower.includes("schedule") && (lower.includes("what is") || lower.includes("show") || lower.includes("view") || lower.includes("how does my")))
    ) && !lower.includes("cardio") && !lower.includes("stretch") && !lower.includes("eat") && !lower.includes("protein");

    if (isWeeklyScheduleQuery) {
      if (weeklySchedule.length > 0) {
        const scheduleBrief = weeklySchedule.slice(0, 5).map((d: any) => `${d.dayName?.slice(0,3) || 'Day'}: ${d.title || d.workoutTitle || 'Session'}`).join(" | ");
        return res.json({
          success: true,
          text: `Your weekly split is: ${scheduleBrief}. This periodization distributes systemic volume evenly to optimize muscle protein synthesis and prevent CNS burnout.`,
          action: null
        });
      }
    }

    if (lower.includes("rest day") || lower.includes("next rest") || lower.includes("day off")) {
      const restDay = weeklySchedule.find((d: any) => d.activityType === "rest" || d.activityType === "recovery" || d.title?.toLowerCase().includes("rest"));
      return res.json({
        success: true,
        text: restDay ? `Your next scheduled rest day is ${restDay.dayName} for ${restDay.title}. Dedicated rest restores muscle glycogen and prepares your joints for the next heavy lifting cycle.` : "You have structured rest and active recovery scheduled between heavy lift days. Listen to your body and prioritize 8 hours of sleep!",
        action: null
      });
    }

    // 3. REST INTERVALS & REST PERIODS
    if (lower.includes("rest between") || lower.includes("rest time") || lower.includes("how long to rest") || lower.includes("rest period") || lower.includes("seconds rest")) {
      return res.json({
        success: true,
        text: "Rest 2 to 3 minutes between heavy compound lifts (squats, bench, deadlifts) to fully recharge ATP and phosphocreatine. For accessory and isolation movements, keep rest to 60 to 90 seconds to maximize localized metabolic stress.",
        action: null
      });
    }

    // 4. TRAINING TO FAILURE / RIR / RPE
    if (lower.includes("failure") || lower.includes("train to failure") || lower.includes("rir") || lower.includes("rpe") || lower.includes("reps in reserve")) {
      return res.json({
        success: true,
        text: "Keep 1 to 2 reps in reserve (RIR 1-2) on compound barbell and dumbbell lifts to maintain clean biomechanics and prevent excessive systemic fatigue. You can take the final set of isolation movements all the way to technical failure.",
        action: null
      });
    }

    // 5. WARM-UP & MOBILITY PREPARATION
    if (lower.includes("warm up") || lower.includes("warmup") || lower.includes("how to warm") || lower.includes("stretch before") || lower.includes("pre workout warm")) {
      return res.json({
        success: true,
        text: "Start with 3 to 5 minutes of dynamic mobility: arm circles, hip openers, and bodyweight squats to lubricate joint capsules. Then perform 2 to 3 progressive warm-up ramp sets of your first lift before attacking working weight.",
        action: null
      });
    }

    // 6. SORENESS / DOMS / TRAINING WHILE SORE
    if (lower.includes("train while sore") || lower.includes("workout while sore") || lower.includes("doms") || (lower.includes("sore") && (lower.includes("can i") || lower.includes("should i") || lower.includes("good")))) {
      return res.json({
        success: true,
        text: "Light to moderate muscle soreness is completely safe to train through, and light blood flow often relieves stiffness. If the soreness is in a joint or feels acute, tell me and I will immediately recalculate your workout to de-load that area.",
        action: null
      });
    }

    // 7. DYNAMIC ADAPTABILITY: Muscle Soreness / Joint Discomfort
    if (lower.includes("sore") || lower.includes("hurts") || lower.includes("pain") || lower.includes("stiff") || lower.includes("tweaked")) {
      const isElbow = lower.includes("elbow");
      const soreArea = isElbow 
        ? "elbow" 
        : lower.includes("back") 
        ? "lower back" 
        : lower.includes("shoulder") 
        ? "shoulders" 
        : lower.includes("knee") 
        ? "knees" 
        : lower.includes("wrist")
        ? "wrists"
        : "sore joints";

      const scheduledDuration = userContext?.todayScheduledPlan?.durationMinutes || 60;
      const rawOrigTitle = userContext?.todayScheduledPlan?.workoutDetails?.workoutTitle || 
                           userContext?.todayScheduledPlan?.title || 
                           userContext?.currentWorkoutTitle || 
                           "Workout Session";
      const cleanOrigTitle = rawOrigTitle
        .replace(/^Adaptive\s+(\d+m\s+)?(Joint-Friendly\s+|Dumbbell\s+|Express\s+)?/i, "")
        .replace(/^(Elbow|Shoulder|Back|Knee|Joint)\s+Friendly\s+/i, "")
        .trim() || "Full Body Split";

      const adaptedTitle = isElbow 
        ? `Elbow Friendly ${cleanOrigTitle}`
        : `${soreArea.charAt(0).toUpperCase() + soreArea.slice(1)} Friendly ${cleanOrigTitle}`;

      const elbowExercises = [
        { name: "Leg Press / Hack Squat", sets: 4, reps: "10-12 reps", restSeconds: 75, targetMuscleGroup: "Quads & Glutes", proTip: "Direct quad tension with zero elbow or arm stress.", progressiveOverloadReason: "Preserves high systemic hypertrophy while elbow joint recovers." },
        { name: "Dumbbell Romanian Deadlifts (Neutral / Strapped)", sets: 4, reps: "10-12 reps", restSeconds: 75, targetMuscleGroup: "Hamstrings & Glutes", proTip: "Arms act as loose cables without elbow bending.", progressiveOverloadReason: "Posterior chain loading with zero elbow joint torque." },
        { name: "Seated Machine Pec Deck (Forearm Pad Contact)", sets: 3, reps: "12-15 reps", restSeconds: 60, targetMuscleGroup: "Chest", proTip: "Drive with forearms against pads, zero hand gripping.", progressiveOverloadReason: "Chest stimulation completely bypassing distal elbow tendons." },
        { name: "Standing Calf Raises", sets: 3, reps: "15 reps", restSeconds: 45, targetMuscleGroup: "Calves", proTip: "Hold peak contraction for 1 second.", progressiveOverloadReason: "Progressive calf overload while upper body rests." },
        { name: "Hanging Knee Raises / Abdominal Crunches", sets: 3, reps: "15 reps", restSeconds: 45, targetMuscleGroup: "Core", proTip: "Controlled pelvic tuck.", progressiveOverloadReason: "Spinal decompression and core bracing with elbow at rest." }
      ];

      const generalSoreExercises = [
        { name: "Chest-Supported Dumbbell Rows", sets: 3, reps: "12-15 reps", restSeconds: 60, targetMuscleGroup: "Mid-Back", proTip: "Support chest on bench to eliminate spine torque.", progressiveOverloadReason: "Isolates back without axial spinal loading." },
        { name: "Leg Press / Hack Squat", sets: 3, reps: "12 reps", restSeconds: 75, targetMuscleGroup: "Quads", proTip: "Keep hips down against pad.", progressiveOverloadReason: "Direct quad tension with lower back completely supported." },
        { name: "Seated Cable Flyes", sets: 3, reps: "12-15 reps", restSeconds: 60, targetMuscleGroup: "Chest", proTip: "Smooth, controlled contraction.", progressiveOverloadReason: "Smooth joint-friendly resistance curve." },
        { name: "Hanging Knee Raises", sets: 3, reps: "15 reps", restSeconds: 45, targetMuscleGroup: "Core & Hip Flexors", proTip: "Controlled pelvic tuck.", progressiveOverloadReason: "Decompresses spine while training active core bracing." }
      ];

      return res.json({
        success: true,
        text: `I adapted your workout into ${adaptedTitle} for ${scheduledDuration} minutes. We eliminated elbow torque and heavy grip strain, protecting your elbow while keeping your training stimulus high.`,
        action: {
          name: "adaptWorkoutForConstraints",
          args: {
            constraintType: "muscle_soreness",
            soreAreaOrRestrictedMuscle: soreArea,
            adaptedWorkoutTitle: adaptedTitle,
            timeLimitMinutes: scheduledDuration,
            actionSummary: `Recalculated workout to de-load the ${soreArea} while keeping your ${scheduledDuration}-minute session on track.`,
            progressiveOverloadNote: "Substituted joint-friendly movements to preserve hypertrophy stimulus without strain.",
            revisedExercises: isElbow ? elbowExercises : generalSoreExercises
          }
        }
      });
    }

    // 8. DYNAMIC ADAPTABILITY: Limited Time / Short On Time
    if (lower.includes("short on time") || lower.includes("limited time") || lower.includes("in a rush") || lower.includes("in a hurry") || lower.includes("quick workout") || (lower.includes("only have") && (lower.includes("min") || lower.includes("minute")))) {
      return res.json({
        success: true,
        text: "I adjusted your workout into an express 25-minute density circuit with paired supersets. You will get maximum muscular stimulus with zero wasted time. Let's get to work!",
        action: {
          name: "adaptWorkoutForConstraints",
          args: {
            constraintType: "limited_time",
            timeLimitMinutes: 25,
            actionSummary: "Condensed workout into an express 25-minute superset routine.",
            progressiveOverloadNote: "Maintained training density by pairing compound antagonistic lifts.",
            revisedExercises: [
              { name: "Dumbbell Goblet Squats", sets: 3, reps: "10-12 reps", restSeconds: 45, targetMuscleGroup: "Quads & Glutes", proTip: "Deep breath at the top, fast lockout.", progressiveOverloadReason: "Density circuit maintaining high mechanical tension." },
              { name: "Dumbbell Romanian Deadlifts", sets: 3, reps: "10-12 reps", restSeconds: 45, targetMuscleGroup: "Hamstrings", proTip: "Hinge deep with flat spine.", progressiveOverloadReason: "Posterior chain loading with quick setup." },
              { name: "Incline Dumbbell Bench Press", sets: 3, reps: "10-12 reps", restSeconds: 45, targetMuscleGroup: "Upper Chest", proTip: "Drive elbows inward at top.", progressiveOverloadReason: "Upper body compound builder fitting short time frame." },
              { name: "Dumbbell Neutral-Grip Rows", sets: 3, reps: "10-12 reps", restSeconds: 45, targetMuscleGroup: "Lats & Mid-Back", proTip: "Squeeze shoulder blades hard.", progressiveOverloadReason: "Antagonist upper body balance." }
            ]
          }
        }
      });
    }

    // 9. DYNAMIC ADAPTABILITY: Equipment Lack
    if (lower.includes("no barbell") || lower.includes("dumbbell only") || lower.includes("only dumbbells") || lower.includes("at home") || lower.includes("bodyweight only") || lower.includes("no gym") || lower.includes("hotel")) {
      return res.json({
        success: true,
        text: "I recalibrated your workout for dumbbells and bodyweight so you can get a killer workout right where you are. Let's get after it!",
        action: {
          name: "adaptWorkoutForConstraints",
          args: {
            constraintType: "equipment_lack",
            equipmentAvailable: "Dumbbells and Bodyweight",
            actionSummary: "Converted session to dumbbell and bodyweight movements.",
            progressiveOverloadNote: "Substituted barbell lifts with high-tension dumbbell alternatives.",
            revisedExercises: [
              { name: "Dumbbell Goblet Squats", sets: 4, reps: "10-12 reps", restSeconds: 60, targetMuscleGroup: "Quads & Glutes", proTip: "Pause 1 sec at the bottom.", progressiveOverloadReason: "High quad tension matching barbell squat stimulus." },
              { name: "Dumbbell Floor Press", sets: 4, reps: "10-12 reps", restSeconds: 60, targetMuscleGroup: "Chest & Triceps", proTip: "Elbows tap floor gently.", progressiveOverloadReason: "Heavy chest loading without bench equipment." },
              { name: "Single-Arm Dumbbell Row", sets: 4, reps: "10-12 reps", restSeconds: 60, targetMuscleGroup: "Lats & Upper Back", proTip: "Pull elbow to hip.", progressiveOverloadReason: "Heavy unilateral back recruitment." },
              { name: "Dumbbell Romanian Deadlifts", sets: 3, reps: "12 reps", restSeconds: 60, targetMuscleGroup: "Hamstrings & Glutes", proTip: "Push hips straight back.", progressiveOverloadReason: "Posterior chain hypertrophy with dumbbells." }
            ]
          }
        }
      });
    }

    // 10. SMART CARDIO & MOBILITY INTERFERENCE (Checked before single-word exercise cues)
    if (lower.includes("cardio") || lower.includes("hiit") || lower.includes("sprint") || lower.includes("interval") || lower.includes("running") || (lower.includes("run") && !lower.includes("routine"))) {
      if (lower.includes("squat") || lower.includes("leg") || lower.includes("tomorrow") || lower.includes("heavy")) {
        return res.json({
          success: true,
          text: "Stick strictly to light Zone 2 low-impact cardio or dynamic mobility today. Never do heavy HIIT or intense running before a heavy squat day to prevent interference and keep your legs fresh!",
          action: {
            name: "addCardioOrStretchSession",
            args: {
              sessionType: "Zone 2 Low-Impact Cardio",
              durationMinutes: 20,
              notes: "Conversational pace to protect leg drive for tomorrow's squats."
            }
          }
        });
      }
      const scheduledCardio = todayPlan?.cardioDetails;
      if (scheduledCardio) {
        return res.json({
          success: true,
          text: `Your programmed cardio is ${scheduledCardio.type}: ${scheduledCardio.durationMinutes} minutes at ${scheduledCardio.intensity} intensity (${scheduledCardio.notes || 'aerobic base conditioning'}). Keep intensity in Zone 2 to avoid interfering with your lifting!`,
          action: null
        });
      }
      return res.json({
        success: true,
        text: "I program light Zone 2 cardio or active mobility on lifting days to prevent training interference. Keeping intensity conversational preserves your glycogen and central nervous system for heavy lifts—never do heavy HIIT before leg days!",
        action: {
          name: "addCardioOrStretchSession",
          args: {
            sessionType: "Zone 2 Low-Impact Cardio",
            durationMinutes: 20,
            notes: "Zone 2 steady-state recovery without leg interference."
          }
        }
      });
    }

    // 11. STRETCHING & MOBILITY EXPLANATIONS
    if (lower.includes("stretch") || lower.includes("mobility") || lower.includes("flexibility") || lower.includes("foam roll")) {
      const stretchDetail = todayPlan?.stretchDetails;
      const targetArea = stretchDetail?.targetAreas?.join(", ") || "hips, glutes, and hamstrings";
      const routineName = stretchDetail?.title || "Lower Body & Hips Recovery";

      return res.json({
        success: true,
        text: `${routineName} is programmed to decompress your ${targetArea} after lifting. Static post-workout stretching relieves fascial stiffness, lowers resting muscle tone, and accelerates systemic recovery.`,
        action: null
      });
    }

    // 12. NUTRITION, PROTEIN, PRE/POST-WORKOUT MEALS, CREATINE
    if (lower.includes("protein") || lower.includes("eat") || lower.includes("nutrition") || lower.includes("meal") || lower.includes("pre workout") || lower.includes("post workout") || lower.includes("creatine") || lower.includes("diet") || lower.includes("bulk") || lower.includes("cut")) {
      return res.json({
        success: true,
        text: "Aim for 0.7 to 1.0 grams of high-quality protein per pound of bodyweight daily to support muscle protein synthesis. Pre-workout, consume easily digestible carbohydrates 60 to 90 minutes before lifting to top off glycogen stores.",
        action: null
      });
    }

    // 13. TRANSPARENT PROGRESSIVE OVERLOAD EXPLANATION
    if (lower.includes("increase") || lower.includes("heavier") || lower.includes("bump") || lower.includes("overload") || lower.includes("more weight") || lower.includes("why is the weight higher") || lower.includes("why did my weight")) {
      const evidence = progressions[0] || "You cleared all target reps with clean form last week";
      return res.json({
        success: true,
        text: `${evidence}, so we bumped your working weight to keep you in the optimal mechanical tension zone. Progressive overload is the biological driver of muscle growth—attack the weight!`,
        action: null
      });
    }

    // 14. SPECIFIC EXERCISE QUESTIONS (Squats, Bench, Deadlifts, Rows, OHP, Pull-ups, Curls)
    const matchedExercise = (todayPlan?.workoutDetails?.exercises || []).find((e: any) =>
      lower.includes(e.name.toLowerCase()) ||
      (lower.includes("squat") && e.name.toLowerCase().includes("squat")) ||
      (lower.includes("bench") && e.name.toLowerCase().includes("bench")) ||
      (lower.includes("deadlift") && e.name.toLowerCase().includes("deadlift")) ||
      (lower.includes("row") && e.name.toLowerCase().includes("row")) ||
      (lower.includes("press") && e.name.toLowerCase().includes("press"))
    );

    if (matchedExercise) {
      return res.json({
        success: true,
        text: `For ${matchedExercise.name}, you are programmed for ${matchedExercise.sets} sets of ${matchedExercise.reps}${matchedExercise.suggestedWeight ? ' at ' + matchedExercise.suggestedWeight : ''} with ${matchedExercise.restSeconds || 60}s rest. ${matchedExercise.proTip || 'Maintain full range of motion and brace your core throughout every rep.'}`,
        action: null
      });
    }

    // Exercise science cues for common exercises when asked generally
    if (lower.includes("squat")) {
      return res.json({
        success: true,
        text: "Screw your feet into the floor, brace your abdominal wall 360 degrees, and descend with knees tracking over your toes. Drive explosively out of the hole while keeping your chest proud and spine neutral.",
        action: null
      });
    }
    if (lower.includes("bench press") || (lower.includes("bench") && !lower.includes("swap"))) {
      return res.json({
        success: true,
        text: "Retract and depress your shoulder blades into the bench, tuck your elbows at ~45 degrees, and drive through your heels. Lower under control to your mid-chest and press up with explosive intent.",
        action: null
      });
    }
    if (lower.includes("deadlift") || lower.includes("rdl")) {
      return res.json({
        success: true,
        text: "Hinge deeply at your hips with a flat back, keep the bar glued to your body, and push the floor away. Lock out by squeezing your glutes firmly rather than hyperextending your lumbar spine.",
        action: null
      });
    }
    if (lower.includes("overhead press") || lower.includes("shoulder press") || lower.includes("ohp")) {
      return res.json({
        success: true,
        text: "Squeeze your glutes and brace your abs to create a rigid torso foundation, then press vertically directly over your midfoot. Lock out overhead with active traps for shoulder stability.",
        action: null
      });
    }
    if (lower.includes("row") || lower.includes("pull up") || lower.includes("pulldown")) {
      return res.json({
        success: true,
        text: "Initiate each repetition by depressing your scapulae and driving your elbows straight back. Squeeze hard at the peak contraction for a full second to maximize back lat and rhomboid recruitment.",
        action: null
      });
    }
    if (lower.includes("bicep") || lower.includes("curl") || lower.includes("tricep")) {
      return res.json({
        success: true,
        text: "Lock your elbows to your sides to eliminate shoulder swinging and isolate the target arm muscles. Emphasize a controlled 3-second lowering phase to maximize muscle fiber damage and growth.",
        action: null
      });
    }


    // 15. IS MY PLAN WORKING / PROGRESS & PRs
    if (lower.includes("stronger") || lower.includes("getting stronger") || lower.includes("is my plan working") || lower.includes("am i progressing") || lower.includes("results") || lower.includes("pr")) {
      const evidence = progressions.length > 0
        ? `You've progressed on ${progressions.slice(0, 2).join(" and ")}.`
        : "You are consistently adding weight and reps to your working sets.";

      return res.json({
        success: true,
        text: `Yes, 100%! ${evidence} Keep leaving 1 to 2 reps in reserve, eat adequate protein, and the strength adaptations will keep compounding!`,
        action: null
      });
    }

    // 16. WORKOUT SPLIT SWAPS
    if (lower.includes("swap to leg") || (lower.includes("leg day") && lower.includes("swap"))) {
      return res.json({
        success: true,
        text: "I swapped today's session to Legs & Glutes. Let's attack those squats and RDLs today!",
        action: {
          name: "swapWorkoutSplit",
          args: {
            targetSplit: "Legs & Glutes",
            targetDayName: "today",
            reason: "Targeted leg day workout as requested.",
            focusNotes: "Heavy squats, deep lunges, and controlled hamstring work."
          }
        }
      });
    }

    if (lower.includes("swap to push") || lower.includes("chest day") || (lower.includes("push day") && lower.includes("swap"))) {
      return res.json({
        success: true,
        text: "Swapped today's workout to Power Push (Chest, Shoulders & Triceps). Time to get a great upper body pump!",
        action: {
          name: "swapWorkoutSplit",
          args: {
            targetSplit: "Push (Chest, Shoulders & Triceps)",
            targetDayName: "today",
            reason: "Power and upper body pressing focus.",
            focusNotes: "Incline pressing, lateral raises, and tricep pushdowns."
          }
        }
      });
    }

    if (lower.includes("swap to pull") || (lower.includes("pull day") && lower.includes("swap")) || lower.includes("back day")) {
      return res.json({
        success: true,
        text: "Swapped today to Pull Day (Back & Biceps). Focus on pulling through your elbows and squeezing every rep!",
        action: {
          name: "swapWorkoutSplit",
          args: {
            targetSplit: "Pull (Back & Biceps)",
            targetDayName: "today",
            reason: "Back thickness and bicep volume.",
            focusNotes: "Heavy rows, lat pulldowns, and bicep curls."
          }
        }
      });
    }

    // 17. CONVERT TO STRENGTH PROTOCOL
    if (lower.includes("strength") || lower.includes("lower rep") || lower.includes("heavy weight") || lower.includes("power")) {
      return res.json({
        success: true,
        text: "I adjusted your target reps to 3-5 reps with ~12% heavier loads and 3-minute rest periods. Bring maximum power to each set!",
        action: {
          name: "adjustStrengthRepRange",
          args: {
            targetRepRange: "3-5 reps",
            weightIncreasePercentage: 12,
            restSeconds: 180,
            reason: "Heavy strength protocol: 3-5 reps with ~80-85% 1RM intensity and 3 min rest."
          }
        }
      });
    }

    // 18. UNIVERSAL COACHING ADVICE (AUTHORITATIVE & CONCISE, NEVER A CANNED GREETING)
    return res.json({
      success: true,
      text: "Every repetition and scheduled session compounds toward your physique and strength goals. Focus on progressive mechanical tension, clean form, and 8 hours of sleep—what specific exercise or routine adjustment do you want to break down next?",
      action: null
    });

  } catch (err: any) {
    console.error("Error in /api/coach/chat:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Exercise dataset proxy route to eliminate all browser CORS and iframe sandbox restrictions
let cachedExercisesPayload: any = null;
app.get("/api/exercises-dataset", async (req: Request, res: Response) => {
  if (cachedExercisesPayload) {
    return res.json(cachedExercisesPayload);
  }

  const sources = [
    "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json",
    "https://cdn.jsdelivr.net/gh/RepDB/exercise-dataset@main/exercises.json",
    "https://exercise-dataset.com/exercises.json"
  ];

  for (const url of sources) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        cachedExercisesPayload = json;
        console.log(`[ExerciseDataset API] Successfully fetched and cached exercises from ${url}`);
        return res.json(json);
      }
    } catch (err: any) {
      console.warn(`[ExerciseDataset API] Failed to fetch from ${url}:`, err.message);
    }
  }

  return res.status(502).json({ error: "Failed to fetch exercise dataset from upstream sources" });
});

// ==========================================
// MertenD/musclegroup-image-generator API Implementation
// ==========================================

const MERTEND_AVAILABLE_MUSCLE_GROUPS = [
  "all", "all_lower", "all_upper", "abductors", "abs", "adductors",
  "back", "back_lower", "back_upper", "biceps", "calfs", "chest",
  "core", "core_side", "core_lower", "core_upper", "forearms",
  "gluteus", "hamstring", "hands", "latissimus", "legs", "neck",
  "quadriceps", "shoulders", "shoulders_back", "shoulders_front", "triceps"
];

function hexToRgb(hex: string) {
  const cleanHex = (hex || "3B82F6").replace(/[^0-9A-Fa-f]/g, "");
  const normalized = cleanHex.length === 3
    ? cleanHex.split("").map((c) => c + c).join("")
    : cleanHex.padEnd(6, "0");
  const num = parseInt(normalized, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

// In-memory cache for rendered dynamic muscle group images
const muscleImageBufferCache = new Map<string, Buffer>();

// 1. GET /getMuscleGroups and /api/muscle-image/getMuscleGroups
app.get(["/getMuscleGroups", "/api/muscle-image/getMuscleGroups"], (req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.json(MERTEND_AVAILABLE_MUSCLE_GROUPS);
});

// 2. GET /getBaseImage and /api/muscle-image/getBaseImage
app.get(["/getBaseImage", "/api/muscle-image/getBaseImage"], async (req: Request, res: Response) => {
  try {
    const transparent = req.query.transparentBackground === "1" || req.query.transparentBackground === undefined;
    const baseImgPath = path.join(process.cwd(), "assets/musclegroups", transparent ? "baseImage_transparent.png" : "baseImage.png");
    
    if (fs.existsSync(baseImgPath)) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=604800");
      return res.sendFile(baseImgPath);
    }
    return res.status(404).json({ error: "Base image not found" });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. GET /getImage and /api/muscle-image/getImage
app.get(["/getImage", "/api/muscle-image/getImage"], async (req: Request, res: Response) => {
  try {
    const muscleGroupsQuery = (req.query.muscleGroups as string) || "chest";
    const colorQuery = (req.query.color as string) || "3B82F6";
    const transparent = req.query.transparentBackground !== "0";
    const size = parseInt((req.query.size as string) || "256", 10);

    const cacheKey = `${muscleGroupsQuery.toLowerCase()}_${colorQuery.toLowerCase()}_${transparent ? 1 : 0}_${size}`;
    if (muscleImageBufferCache.has(cacheKey)) {
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=604800");
      return res.send(muscleImageBufferCache.get(cacheKey));
    }

    const baseImgPath = path.join(process.cwd(), "assets/musclegroups", transparent ? "baseImage_transparent.png" : "baseImage.png");
    if (!fs.existsSync(baseImgPath)) {
      return res.status(404).json({ error: "Base image asset not found" });
    }

    const rgb = hexToRgb(colorQuery);
    const groups = muscleGroupsQuery.split(",").map((s) => s.trim().toLowerCase());
    const mergedMask = Buffer.alloc(1920 * 1920 * 4);
    let hasMask = false;

    for (const group of groups) {
      const maskFile = path.join(process.cwd(), "assets/musclegroups", `${group}.png`);
      if (fs.existsSync(maskFile)) {
        hasMask = true;
        const raw = await sharp(maskFile).raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < raw.data.length; i += 4) {
          const a = raw.data[i + 3];
          if (a > 10) {
            mergedMask[i] = rgb.r;
            mergedMask[i + 1] = rgb.g;
            mergedMask[i + 2] = rgb.b;
            mergedMask[i + 3] = a;
          }
        }
      }
    }

    let composited1920;
    if (hasMask) {
      const maskPng = await sharp(mergedMask, {
        raw: { width: 1920, height: 1920, channels: 4 },
      }).png().toBuffer();

      composited1920 = await sharp(baseImgPath)
        .composite([{ input: maskPng }])
        .png()
        .toBuffer();
    } else {
      composited1920 = await sharp(baseImgPath).png().toBuffer();
    }

    const finalImage = await sharp(composited1920)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer();

    muscleImageBufferCache.set(cacheKey, finalImage);

    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=604800");
    return res.send(finalImage);
  } catch (err: any) {
    console.error("Error generating muscle image:", err);
    return res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server mounted as middleware");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Static production build folder served");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully booted and listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Error starting server:", err);
});
