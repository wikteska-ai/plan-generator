// solver_v2.js

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== MERGE GROUPS =====
function buildLessons(data) {
  const map = {};

  data.lessons.forEach((l, i) => {
    const key = l.group
      ? "G_" + l.group
      : `${l.class}_${l.subject}_${l.teacher}`;

    if (!map[key]) {
      map[key] = {
        subject: l.subject,
        teacher: l.teacher,
        classes: [],
        hours: l.hours,
        group: l.group || null
      };
    }

    map[key].classes.push(l.class);
  });

  const out = [];

  Object.values(map).forEach((g, i) => {
    for (let h = 0; h < g.hours; h++) {
      out.push({
        id: `${i}_${h}`,
        ...g
      });
    }
  });

  return out;
}

// ===== DIFFICULTY =====
function lessonDifficulty(l, data) {
  const t = data.teachers.find(t => t.id === l.teacher);

  const avail = t?.availability.length || 0;

  // 🔥 NAJWAŻNIEJSZE: dostępność (małe = trudne)
  let difficulty = avail * 10;

  // 🔥 grupy ważne, ale NIE ważniejsze niż brak slotów
  if (l.group) difficulty -= 5;

  // 🔥 wiele klas trochę trudniejsze
  difficulty -= (l.classes.length - 1) * 2;

  return difficulty;
}
// ===== SORT =====
function sortLessons(lessons, data) {
  return lessons.sort((a, b) => {

    const da = lessonDifficulty(a, data);
    const db = lessonDifficulty(b, data);

    // 🔥 1. NAJTRUDNIEJSZE (mało slotów) NAJPIERW
    if (da !== db) return da - db;

    // 🔥 2. potem grupy (bo trudniejsze logistycznie)
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;

    return 0;
  });
}

// ===== STATE =====
function createState() {
  return {
    schedule: {},
    teacherBusy: {},
    classBusy: {}
  };
}

// ===== CHECKS =====
function teacherOk(tid, d, h, state, data) {
  const t = data.teachers.find(t => t.id === tid);
  return t &&
    t.availability.includes(d + "_" + h) &&
    !state.teacherBusy[tid + "_" + d + "_" + h];
}

function classesOk(classes, d, h, state) {
  return classes.every(c => !state.classBusy[c + "_" + d + "_" + h]);
}

// ===== PLACE =====
function place(l, d, h, state) {
  const key = d + "_" + h;

  state.teacherBusy[l.teacher + "_" + key] = true;

  for (let c of l.classes) {
    state.classBusy[c + "_" + key] = true;

    if (!state.schedule[c]) state.schedule[c] = {};
    if (!state.schedule[c][d]) state.schedule[c][d] = {};

    state.schedule[c][d][h] = l;
  }
}

// ===== SLOT SCORE =====
function scoreSlot(l, d, h, state) {
  let score = 0;

  // 🎯 środek dnia najlepszy
  if (h >= 2 && h <= 6) score += 5;
  if (h === 1) score += 2;
  if (h === 8) score -= 2;

  for (let c of l.classes) {
    const day = state.schedule[c]?.[d] || {};
    const hours = Object.keys(day).map(Number);

    // kara za przeładowanie dnia
    score -= hours.length * 2;

    // bonus za ciągłość
    if (hours.includes(h - 1)) score += 3;
    if (hours.includes(h + 1)) score += 3;
  }

  // grupy ważniejsze
  if (l.group) score += 5;

  return score;
}

// ===== FIND BEST SLOT =====
function findBestSlot(l, state, data) {
  let best = null;
  let bestScore = -9999;

  for (let d of DAYS) {
    for (let h of HOURS) {

      if (!teacherOk(l.teacher, d, h, state, data)) continue;
      if (!classesOk(l.classes, d, h, state)) continue;

      const sc = scoreSlot(l, d, h, state);

    if (sc > bestScore || Math.random() < 0.1) {
        bestScore = sc;
        best = { d, h };
      }
    }
  }

  return best;
}

// ===== SOLVE =====
function solveOnce(data) {
  const lessons = sortLessons(buildLessons(data), data);
  const state = createState();
console.log("=== KOLEJNOŚĆ LEKCJI ===");
console.log("📊 TOTAL LESSONS:", lessons.length);
  
lessons.slice(0, 10).forEach(l => {
  const t = data.teachers.find(x => x.id === l.teacher);
  console.log(
    l.teacher,
    "avail:", t?.availability.length,
    "group:", l.group
  );
});
  let placed = 0;

  for (let l of lessons) {
    const slot = findBestSlot(l, state, data);

    if (slot) {
      place(l, slot.d, slot.h, state);
      placed++;
    } else {
      console.log("❌ MISS:", l.subject, l.teacher, l.classes);
    }
  }
  console.log(
  "➡️ placed:", placed,
  "/", lessons.length,
  "missing:", lessons.length - placed
);

// 🔍 lista brakujących lekcji
if (placed < lessons.length) {
  const placedIds = new Set();

  for (let cls in state.schedule) {
    for (let d in state.schedule[cls]) {
      for (let h in state.schedule[cls][d]) {
        placedIds.add(state.schedule[cls][d][h].id);
      }
    }
  }

  const missing = lessons.filter(l => !placedIds.has(l.id));

  console.log("❌ MISSING LESSONS:");
  missing.forEach(l =>
    console.log(l.subject, l.teacher, l.classes)
  );
}

 return {
  schedule: state.schedule,
  placed,
  total: lessons.length
};
}

// ===== SCORE =====
function score(schedule) {
  let penalty = 0;

  for (let cls in schedule) {
    for (let d of DAYS) {
      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length === 0) continue;

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          penalty += 20;
        }
      }

      if (hours.length > 7) penalty += 10;
    }
  }

  return -penalty;
}
// ===== GAP DETECTION =====
function findGaps(schedule) {
  const gaps = [];

  for (let cls in schedule) {
    for (let d of DAYS) {
      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        const prev = hours[i-1];
        const curr = hours[i];

        if (curr > prev + 1) {
          for (let h = prev + 1; h < curr; h++) {
            gaps.push({ cls, d, h });
          }
        }
      }
    }
  }

  return gaps;
}
// ===== GAP FIX =====
function tryFixGap(schedule, data) {
  const gaps = findGaps(schedule);

  if (gaps.length === 0) return null;

  const gap = gaps[Math.floor(Math.random() * gaps.length)];

  const entries = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        entries.push({ cls, d, h, lesson: schedule[cls][d][h] });
      }
    }
  }

  const candidate = entries[Math.floor(Math.random() * entries.length)];

  if (!candidate.lesson) return null;

  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const { teacherBusy, classBusy } = rebuildBusy(newSchedule);

  // usuń starą lekcję
  for (let c of candidate.lesson.classes) {
    delete newSchedule[c][candidate.d][candidate.h];
    delete classBusy[c + "_" + candidate.d + "_" + candidate.h];
  }

  delete teacherBusy[candidate.lesson.teacher + "_" + candidate.d + "_" + candidate.h];

  // sprawdź czy można wstawić w gap
  const canPlace =
    teacherOk(candidate.lesson.teacher, gap.d, gap.h, { teacherBusy, classBusy }, data) &&
    classesOk(candidate.lesson.classes, gap.d, gap.h, { classBusy });

  if (!canPlace) return null;

  // wstaw w gap
  for (let c of candidate.lesson.classes) {
    if (!newSchedule[c][gap.d]) newSchedule[c][gap.d] = {};
    newSchedule[c][gap.d][gap.h] = candidate.lesson;
  }

  return newSchedule;
}
function rebuildBusy(schedule) {
  const teacherBusy = {};
  const classBusy = {};

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];
        const key = d + "_" + h;

        teacherBusy[l.teacher + "_" + key] = true;
        classBusy[cls + "_" + key] = true;
      }
    }
  }

  return { teacherBusy, classBusy };
}
function trySwap(schedule, data) {
  const entries = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        entries.push({ cls, d, h, lesson: schedule[cls][d][h] });
      }
    }
  }

  if (entries.length < 2) return null;

  const a = entries[Math.floor(Math.random() * entries.length)];
  const b = entries[Math.floor(Math.random() * entries.length)];

  if (!a.lesson || !b.lesson) return null;
  if (a.lesson.id === b.lesson.id) return null;

  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const { teacherBusy, classBusy } = rebuildBusy(newSchedule);

  // 🔥 usuń A
  for (let c of a.lesson.classes) {
    delete newSchedule[c][a.d][a.h];
    delete classBusy[c + "_" + a.d + "_" + a.h];
  }

  // 🔥 usuń B
  for (let c of b.lesson.classes) {
    delete newSchedule[c][b.d][b.h];
    delete classBusy[c + "_" + b.d + "_" + b.h];
  }

  delete teacherBusy[a.lesson.teacher + "_" + a.d + "_" + a.h];
  delete teacherBusy[b.lesson.teacher + "_" + b.d + "_" + b.h];

  // 🔥 sprawdź
  const canPlaceA =
    teacherOk(a.lesson.teacher, b.d, b.h, { teacherBusy, classBusy }, data) &&
    classesOk(a.lesson.classes, b.d, b.h, { classBusy });

  const canPlaceB =
    teacherOk(b.lesson.teacher, a.d, a.h, { teacherBusy, classBusy }, data) &&
    classesOk(b.lesson.classes, a.d, a.h, { classBusy });

  if (!canPlaceA || !canPlaceB) return null;

  // 🔥 wstaw A → B
  for (let c of a.lesson.classes) {
    if (!newSchedule[c][b.d]) newSchedule[c][b.d] = {};
    newSchedule[c][b.d][b.h] = a.lesson;
  }

  // 🔥 wstaw B → A
  for (let c of b.lesson.classes) {
    if (!newSchedule[c][a.d]) newSchedule[c][a.d] = {};
    newSchedule[c][a.d][a.h] = b.lesson;
  }

  return newSchedule;
}

function improve(schedule, data, iterations = 1000) {
  let best = JSON.parse(JSON.stringify(schedule));
  let bestScore = score(best);

  let current = best;
  let currentScore = bestScore;

  for (let i = 0; i < iterations; i++) {
let next;

// 🎯 najpierw próbujemy naprawić dziurę
if (Math.random() < 0.7) {
  next = tryFixGap(current, data);
} else {
  next = trySwap(current, data);
}
    if (!next) continue;

    const sc = score(next);

    if (sc > currentScore) {
      current = next;
      currentScore = sc;

      if (sc > bestScore) {
        best = JSON.parse(JSON.stringify(next));
        bestScore = sc;
      }
    }
  }

  console.log("✨ IMPROVED:", bestScore);

  return best;
}
function validateSchedule(schedule, data) {
  const lessonCount = {};

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {

        const l = schedule[cls][d][h];
        lessonCount[l.id] = (lessonCount[l.id] || 0) + 1;
      }
    }
  }

  // policz ile powinno być
  const expected = buildLessons(data).length;

  const actual = Object.keys(lessonCount).length;

  if (actual !== expected) {
    console.log("🚨 ZGUBIONE / DUPLIKATY LEKCJI");
    return false;
  }

  return true;
}
// ===== MULTI RUN =====
function generateSchedule(data, runs = 10) {
  let best = null;

  for (let i = 0; i < runs; i++) {
    console.log("🚀 RUN", i);

    const result = solveOnce(data);
    const isValid = result.placed === result.total;

let sc = null;

if (isValid) {

  // 🔥 tutaj odpalamy improve
  const improved = improve(result.schedule, data, 1000);

  sc = score(improved);

if (validateSchedule(improved, data)) {
  result.schedule = improved;
} else {
  console.log("⚠️ IMPROVE ODRZUCONE (integrity fail)");
}
  console.log("➡️ placed:", result.placed, "score:", sc);
} else {
  console.log("⛔ INVALID (missing):", result.total - result.placed);
}
    // 🔒 WALIDACJA NAUCZYCIELI
let teacherErrors = [];

for (let cls in result.schedule) {
  for (let d in result.schedule[cls]) {
    for (let h in result.schedule[cls][d]) {

      const lesson = result.schedule[cls][d][h];
      const teacher = data.teachers.find(t => t.id === lesson.teacher);

      if (!teacher) {
        teacherErrors.push(`💀 NIEZNANY NAUCZYCIEL ${lesson.teacher}`);
        continue;
      }

      const key = d + "_" + h;

      if (!teacher.availability.includes(key)) {
        teacherErrors.push(
          `❌ ${lesson.teacher} brak dostępności ${key}`
        );
      }
    }
  }
}

if (teacherErrors.length === 0) {
  console.log("✅ TEACHERS OK");
} else {
  console.log("🚨 BŁĘDY NAUCZYCIELI:");
  teacherErrors.forEach(e => console.log(e));
}

if (isValid && sc !== null && (!best || sc > best.score)) {
      best = {
        schedule: result.schedule,
        score: sc,
        placed: result.placed
      };
    console.log("🔥 NEW BEST:", sc);

    }
  }

 if (!best) {
  console.log("🚨 BRAK POPRAWNEGO ROZWIĄZANIA");
  return {
    status: "FAIL",
    schedule: null,
    score: null
  };
}

return best;
}

export { generateSchedule };
