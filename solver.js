const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== BUILD LESSONS =====
function buildLessons(data) {
  const out = [];
  let id = 0;

  data.lessons.forEach(l => {
    for (let i = 0; i < l.hours; i++) {
      out.push({
        id: id++,
        class: l.class,
        subject: l.subject,
        teacher: l.teacher,
        group: l.group || null
      });
    }
  });

  console.log("📊 TOTAL LESSONS:", out.length);
  return out;
}

// ===== AVAILABILITY % =====
function teacherAvailabilityPercent(t) {
  return t.availability.length / 40;
}

// ===== SPLIT GROUPS =====
function splitGroups(lessons, data) {
  const g1 = [];
  const g2 = [];
  const g3 = [];

  lessons.forEach(l => {
    const t = data.teachers.find(x => x.id === l.teacher);
    const perc = teacherAvailabilityPercent(t);

    if (perc < 0.1 || l.group) {
      g1.push(l);
    } else if (perc < 0.6) {
      g2.push(l);
    } else {
      g3.push(l);
    }
  });

  console.log("📦 G1:", g1.length, "G2:", g2.length, "G3:", g3.length);

  return { g1, g2, g3 };
}

// ===== STATE =====
function createState() {
  return {
    schedule: {},
    teacherBusy: {},
    classBusy: {},
    used: new Set()
  };
}

// ===== CHECK =====
function canPlace(l, d, h, state, data) {
  const t = data.teachers.find(x => x.id === l.teacher);

  if (!t.availability.includes(d + "_" + h)) return false;

  if (state.teacherBusy[l.teacher + "_" + d + "_" + h]) return false;

  if (state.classBusy[l.class + "_" + d + "_" + h]) return false;

  return true;
}

// ===== PLACE =====
function place(l, d, h, state) {
  const key = d + "_" + h;

  state.teacherBusy[l.teacher + "_" + key] = true;
  state.classBusy[l.class + "_" + key] = true;

  if (!state.schedule[l.class]) state.schedule[l.class] = {};
  if (!state.schedule[l.class][d]) state.schedule[l.class][d] = {};

  state.schedule[l.class][d][h] = l;
  state.used.add(l.id);
}

// ===== COUNT GAPS =====
function countGaps(schedule) {
  let total = 0;

  for (let cls in schedule) {
    for (let d of DAYS) {
      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          total += hours[i] - hours[i-1] - 1;
        }
      }
    }
  }

  return total;
}

// ===== BUILD ORDER (godzina → klasa → dzień) =====
function buildOrder(startIndex) {
  const slots = [];

  for (let h of HOURS) {
    for (let c = 0; c <= 8; c++) {
      for (let d of DAYS) {
        slots.push({ c, d, h });
      }
    }
  }

  return [...slots.slice(startIndex), ...slots.slice(0, startIndex)];
}

// ===== RUN STEP =====
function runStep(group, state, data, order, label) {
  console.log("➡️ STEP:", label);

  for (let slot of order) {
    const { c, d, h } = slot;

    if (state.classBusy[c + "_" + d + "_" + h]) continue;

    const candidates = group.filter(l =>
      !state.used.has(l.id) &&
      l.class === c &&
      canPlace(l, d, h, state, data)
    );

    console.log("🔍", label, "SLOT", c, d, h, "→", candidates.length);

    if (candidates.length > 0) {
      const l = candidates[0];
      place(l, d, h, state);
    }
  }
}

// ===== ONE RUN =====
function runOnce(data, startIndex) {
  console.log("\n🚀 RUN START:", startIndex);

  const lessons = buildLessons(data);
  const { g1, g2, g3 } = splitGroups(lessons, data);

  const state = createState();
  const order = buildOrder(startIndex);

  runStep(g1, state, data, order, "G1");
  runStep(g2, state, data, order, "G2");
  runStep(g3, state, data, order, "G3");

  const gaps = countGaps(state.schedule);
  const missing = lessons.length - state.used.size;

  console.log("📉 GAPS:", gaps);
  console.log("❌ MISSING:", missing);

  return { gaps, missing };
}

// ===== MAIN =====
function generateSchedule(data) {
  const results = [];

  // 🔥 45 startów (pierwszy rząd)
  for (let i = 0; i < 45; i++) {
    const res = runOnce(data, i);
    results.push(res);
  }

  console.log("\n✅ DONE");
  console.log("📊 WYNIKI:");

  results.forEach((r, i) => {
    console.log("RUN", i, "→ gaps:", r.gaps, "missing:", r.missing);
  });
}
export { generateSchedule };
