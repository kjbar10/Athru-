const fs = require('fs');

// Tennis Shoe Designs:
// Design 1: Classic Low-Top Tennis Sneaker
// - Low cut collar
// - Flat rubber cupsole with tread line & toe bumper
// - Defined tongue and 3 distinct lace cross-bars
// - Heel tab and side sneaker accent
const tennisShoe1 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Sole / outsole (flat classic tennis shoe cupsole) -->
  <path d="M2 19h20c0-1-.8-2-2-2H4c-1.2 0-2 1-2 2z" />
  <!-- Upper body of sneaker -->
  <path d="M2 17l1.5-6a2 2 0 0 1 1.9-1.5h3.1l2.5 3.5h7c2.2 0 4 1.8 4 4v0" />
  <!-- Toe cap (classic rubber toe cap like tennis shoes) -->
  <path d="M16 17c0-2.2 1.5-4 4-4" />
  <!-- Laces (horizontal tennis shoe eyelet bars) -->
  <line x1="9" y1="12" x2="13" y2="12" />
  <line x1="10" y1="14.5" x2="14" y2="14.5" />
  <!-- Ankle collar opening -->
  <path d="M5.5 9.5l2-3a1.5 1.5 0 0 1 1.3-.7h2.2" />
</svg>
`;

// Design 2: Sleek Athletic Tennis Sneaker
const tennisShoe2 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Rubber cupsole with toe roll -->
  <path d="M2.5 18.5h17c1.5 0 2.5-1 2.5-2.5v-.5H2v1.5c0 .8.7 1.5 1.5 1.5z" />
  <!-- Sneaker upper -->
  <path d="M2 15.5l1.8-6a2 2 0 0 1 1.9-1.5h3.3l2 3h6.5a4.5 4.5 0 0 1 4.5 4.5v0" />
  <!-- Rounded tennis toe cap bumper -->
  <path d="M16.5 15.5a3.5 3.5 0 0 1 3.5-3.5" />
  <!-- Tennis laces -->
  <line x1="9" y1="11" x2="13" y2="11" />
  <line x1="10" y1="13" x2="14.5" y2="13" />
  <!-- Ankle collar & tongue -->
  <path d="M6 8l2.2-3.2a1.2 1.2 0 0 1 1-.5h2" />
</svg>
`;

// Design 3: Clear Tennis Shoe / Sneaker (instantly readable)
// Thick flat sole, low ankle, distinct tongue with laces, rounded toe
const tennisShoe3 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Flat thick sneaker sole -->
  <path d="M2.5 18h18.5a1 1 0 0 0 1-1v-.5H2v.5a1 1 0 0 0 1 1z" />
  <!-- Sneaker profile -->
  <path d="M2 16.5L3.8 10a2 2 0 0 1 2-1.5h3.7l2.5 3h6.5a3.5 3.5 0 0 1 3.5 3.5v1.5" />
  <!-- Tennis toe cap arc -->
  <path d="M17 16.5c0-1.8 1.5-3 4-3" />
  <!-- Laces -->
  <line x1="9.5" y1="11.5" x2="13.5" y2="11.5" />
  <line x1="10.5" y1="14" x2="15" y2="14" />
  <!-- Low cut collar -->
  <path d="M6 8.5l1.5-3a1 1 0 0 1 .9-.5h2.6" />
</svg>
`;

// YOGA POSES:
// Yoga Pose 1: Classic Tree Pose (Vrikshasana) - Standing on one leg, other leg bent sideways at knee, arms arched overhead in prayer
const yogaTree = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <circle cx="12" cy="4" r="1.8" />
  <!-- Body & standing leg straight down -->
  <line x1="12" y1="6" x2="12" y2="21" />
  <!-- Bent yoga leg (foot placed against standing knee/thigh) -->
  <polyline points="12 15 17 12 12 10" />
  <!-- Overhead prayer arms (hands joined high in anjali mudra) -->
  <path d="M8 9.5C8 6.5 10 5.5 12 5.5s4 1 4 4" />
</svg>
`;

// Yoga Pose 2: Tree Pose with arms meeting at prayer hands overhead
const yogaTree2 = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <circle cx="12" cy="5" r="2" />
  <!-- Spine & standing leg straight to ground -->
  <line x1="12" y1="7" x2="12" y2="21" />
  <!-- Bent yoga leg forming triangular tree branch -->
  <polyline points="12 15 17.5 12 12 10" />
  <!-- Arms curved up with hands meeting above head in prayer -->
  <path d="M7.5 11C7.5 7 10 3 12 2c2 1 4.5 5 4.5 9" />
</svg>
`;

// Yoga Pose 3: Clear Seated Lotus Yoga Pose with Overhead Stretch / Prayer Hands
const yogaLotusPrayer = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <circle cx="12" cy="5.5" r="2" />
  <!-- Torso -->
  <line x1="12" y1="7.5" x2="12" y2="15" />
  <!-- Arms arched up in prayer overhead -->
  <path d="M8 12C8 8.5 10 4 12 3c2 1 4 5.5 4 9" />
  <!-- Crossed yoga legs (lotus base) -->
  <path d="M4 19c2-2.5 5-3.5 8-2 3-1.5 6-.5 8 2" />
  <line x1="3" y1="20" x2="21" y2="20" />
</svg>
`;

// Yoga Pose 4: Warrior Pose (Virabhadrasana) - unmistakable athletic yoga stretch
const yogaWarrior = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head turned to side -->
  <circle cx="10" cy="5" r="2" />
  <!-- Torso -->
  <line x1="10" y1="7" x2="11" y2="13" />
  <!-- Arms stretched out horizontally front and back -->
  <line x1="3" y1="9" x2="21" y2="9" />
  <!-- Front bent leg in deep lunge -->
  <polyline points="11 13 17 14 18 21" />
  <!-- Back leg straight back to floor -->
  <polyline points="11 13 7 16.5 4 21" />
</svg>
`;

// Yoga Pose 5: Classic Seated Yoga Meditator with hands in Mudra resting on knees
const yogaMudraSeated = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <!-- Head -->
  <circle cx="12" cy="5" r="2" />
  <!-- Torso -->
  <line x1="12" y1="7" x2="12" y2="14" />
  <!-- Arms extending outwards down to knees -->
  <path d="M12 9L6 13l2 3" />
  <path d="M12 9l6 4-2 3" />
  <!-- Crossed legs / lotus position -->
  <path d="M4 18.5c2.5-2 5-2.5 8-1.5 3-1 5.5-.5 8 1.5" />
  <path d="M3 20c4.5 1 13.5 1 18 0" />
</svg>
`;

const html = `<!DOCTYPE html>
<html>
<head>
<style>
body { background: #09090b; color: #f4f4f5; font-family: sans-serif; padding: 20px; }
.card { background: #18181b; padding: 15px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #27272a; }
.row { display: flex; gap: 30px; align-items: center; }
.item { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.sizes { display: flex; gap: 10px; align-items: center; }
.blue { color: #3b82f6; }
.emerald { color: #10b981; }
</style>
</head>
<body>
  <h2>Tennis Shoes</h2>
  <div class="card">
    <div class="row">
      <div class="item">
        <span>Shoe 1</span>
        <div class="sizes blue">
          <div style="width:20px;height:20px">${tennisShoe1}</div>
          <div style="width:24px;height:24px">${tennisShoe1}</div>
          <div style="width:40px;height:40px">${tennisShoe1}</div>
        </div>
      </div>
      <div class="item">
        <span>Shoe 2</span>
        <div class="sizes blue">
          <div style="width:20px;height:20px">${tennisShoe2}</div>
          <div style="width:24px;height:24px">${tennisShoe2}</div>
          <div style="width:40px;height:40px">${tennisShoe2}</div>
        </div>
      </div>
      <div class="item">
        <span>Shoe 3</span>
        <div class="sizes blue">
          <div style="width:20px;height:20px">${tennisShoe3}</div>
          <div style="width:24px;height:24px">${tennisShoe3}</div>
          <div style="width:40px;height:40px">${tennisShoe3}</div>
        </div>
      </div>
    </div>
  </div>

  <h2>Yoga Poses</h2>
  <div class="card">
    <div class="row">
      <div class="item">
        <span>Tree 1</span>
        <div class="sizes emerald">
          <div style="width:20px;height:20px">${yogaTree}</div>
          <div style="width:24px;height:24px">${yogaTree}</div>
          <div style="width:40px;height:40px">${yogaTree}</div>
        </div>
      </div>
      <div class="item">
        <span>Tree 2 (Overhead Prayer)</span>
        <div class="sizes emerald">
          <div style="width:20px;height:20px">${yogaTree2}</div>
          <div style="width:24px;height:24px">${yogaTree2}</div>
          <div style="width:40px;height:40px">${yogaTree2}</div>
        </div>
      </div>
      <div class="item">
        <span>Lotus Prayer</span>
        <div class="sizes emerald">
          <div style="width:20px;height:20px">${yogaLotusPrayer}</div>
          <div style="width:24px;height:24px">${yogaLotusPrayer}</div>
          <div style="width:40px;height:40px">${yogaLotusPrayer}</div>
        </div>
      </div>
      <div class="item">
        <span>Warrior Pose</span>
        <div class="sizes emerald">
          <div style="width:20px;height:20px">${yogaWarrior}</div>
          <div style="width:24px;height:24px">${yogaWarrior}</div>
          <div style="width:40px;height:40px">${yogaWarrior}</div>
        </div>
      </div>
      <div class="item">
        <span>Seated Mudra</span>
        <div class="sizes emerald">
          <div style="width:20px;height:20px">${yogaMudraSeated}</div>
          <div style="width:24px;height:24px">${yogaMudraSeated}</div>
          <div style="width:40px;height:40px">${yogaMudraSeated}</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync('preview_icons.html', html);
console.log("Written preview_icons.html");
