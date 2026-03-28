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
  return t?.availability.length || 0;
}

// ===== SORT =====
function sortLessons(lessons, data) {
  return lessons.sort((a, b) => {
    // grupy najpierw
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;

    return lessonDifficulty(a, data) - lessonDifficulty(b, data);
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

      if (sc > bestScore) {
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

  return {
    schedule: state.schedule,
    placed
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

// ===== MULTI RUN =====
function generateSchedule(data, runs = 10) {
  let best = null;

  for (let i = 0; i < runs; i++) {
    console.log("🚀 RUN", i);

    const result = solveOnce(data);
    const sc = score(result.schedule);

    console.log("➡️ placed:", result.placed, "score:", sc);

    if (!best || sc > best.score) {
      best = {
        schedule: result.schedule,
        score: sc,
        placed: result.placed
      };
    }
  }

  return best;
}

export { generateSchedule };
