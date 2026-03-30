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
function getTeacherStats(data) {
  const load = {};
  const availability = {};

  data.teachers.forEach(t => {
    availability[t.id] = t.availability.length;
  });

  data.lessons.forEach(l => {
    load[l.teacher] = (load[l.teacher] || 0) + l.hours;
  });

  return { load, availability };
}
// ===== SPLIT GROUPS =====
function splitGroups(lessons, data) {
  const g1 = [];
  const g2 = [];
  const g3 = [];

  const { load, availability } = getTeacherStats(data);

  lessons.forEach(l => {
    const teacherLoad = load[l.teacher] || 0;
    const teacherAvail = availability[l.teacher] || 1;

    // 🔥 realny "ścisk"
    const ratio = teacherLoad / teacherAvail;

    // 🔥 KLUCZOWA LOGIKA
    if (ratio >= 1 || l.group) {
      l._groupLevel = "G1";
      g1.push(l);

    } else if (ratio >= 0.5) {
      l._groupLevel = "G2";
      g2.push(l);

    } else {
      l._groupLevel = "G3";
      g3.push(l);
    }

    console.log(
      l.teacher,
      "load:", teacherLoad,
      "avail:", teacherAvail,
      "ratio:", ratio.toFixed(2),
      "→", l._groupLevel
    );
  });

  return { g1, g2, g3 };
}
function sortGroup(group, data) {
  const { load, availability } = getTeacherStats(data);

  return group.sort((a, b) => {
    const ra = (load[a.teacher] || 0) / (availability[a.teacher] || 1);
    const rb = (load[b.teacher] || 0) / (availability[b.teacher] || 1);

    // 🔥 1. bardziej przeciążeni pierwsi
    if (ra !== rb) return rb - ra;

    // 🔥 2. grupy wcześniej
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;

    return 0;
  });
}
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

  const key = d + "_" + h;
  const tKey = l.teacher + "_" + key;

  const busy = state.teacherBusy[tKey] || [];

  // 🔴 jeśli lekcja NIE ma grupy → nauczyciel musi być wolny
  if (!l.group) {
    if (busy.length > 0) return false;
  }

  // 🔵 jeśli lekcja MA grupę
  if (l.group) {
    for (let existing of busy) {

      // jeśli istniejąca lekcja bez grupy → konflikt
      if (!existing.group) return false;

      // jeśli różne grupy → konflikt
      if (existing.group !== l.group) return false;
    }
  }

  // klasy jak wcześniej
  if (state.classBusy[l.class + "_" + d + "_" + h]) return false;

  return true;
}
// ===== PLACE =====
function place(l, d, h, state) {
  const key = d + "_" + h;
  const tKey = l.teacher + "_" + key;

  // 🔥 teacherBusy jako lista
  if (!state.teacherBusy[tKey]) {
    state.teacherBusy[tKey] = [];
  }

  state.teacherBusy[tKey].push(l);

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
let { g1, g2, g3 } = splitGroups(lessons, data);

g1 = sortGroup(g1, data);
g2 = sortGroup(g2, data);
g3 = sortGroup(g3, data);
  const state = createState();
  const order = buildOrder(startIndex);

  runStep(g1, state, data, order, "G1");
  runStep(g2, state, data, order, "G2");
  runStep(g3, state, data, order, "G3");

  const gaps = countGaps(state.schedule);
  const missingLessons = lessons.filter(l => !state.used.has(l.id));
  const missing = lessons.length - state.used.size;

  console.log("📉 GAPS:", gaps);
  console.log("❌ MISSING:", missing);
if (missing > 0) {
  console.log("🚨 MISSING LESSONS:");

  missingLessons.forEach(l => {
    console.log(
      " -",
      l.subject,
      "| T:", l.teacher,
      "| C:", l.class,
      l.group ? "| G:" + l.group : ""
    );
  });
}
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
