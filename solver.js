// solver_v2.js

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== EXPAND =====
function expandLessons(data) {
  const out = [];

  data.lessons.forEach((l, i) => {
    for (let h = 0; h < l.hours; h++) {
      out.push({
        id: `${i}_${h}`,
        subject: l.subject,
        teacher: l.teacher,
        classes: [l.class],
        group: l.group || null
      });
    }
  });

  return out;
}

// ===== DIFFICULTY =====
function lessonDifficulty(l, data) {
  const t = data.teachers.find(t => t.id === l.teacher);
  const avail = t?.availability.length || 0;

  return avail; // im mniej tym trudniejsza
}

// ===== SORT =====
function sortLessons(lessons, data) {
  return lessons.sort((a, b) => {
    const da = lessonDifficulty(a, data);
    const db = lessonDifficulty(b, data);

    // grupy najpierw
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;

    return da - db;
  });
}

// ===== BUSY MAP =====
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

function classOk(classes, d, h, state) {
  return classes.every(c => !state.classBusy[c + "_" + d + "_" + h]);
}

// ===== PLACE =====
function place(lesson, d, h, state) {
  const key = d + "_" + h;

  state.teacherBusy[lesson.teacher + "_" + key] = true;

  lesson.classes.forEach(c => {
    state.classBusy[c + "_" + key] = true;

    if (!state.schedule[c]) state.schedule[c] = {};
    if (!state.schedule[c][d]) state.schedule[c][d] = {};

    state.schedule[c][d][h] = lesson;
  });
}

// ===== FIND SLOT =====
function findSlot(lesson, state, data) {
  for (let d of DAYS) {
    for (let h of HOURS) {

      if (!teacherOk(lesson.teacher, d, h, state, data)) continue;
      if (!classOk(lesson.classes, d, h, state)) continue;

      return { d, h };
    }
  }

  return null;
}

// ===== SOLVE =====
function solveOnce(data) {
  const lessons = sortLessons(expandLessons(data), data);
  const state = createState();

  let placed = 0;

  for (let l of lessons) {
    const slot = findSlot(l, state, data);

    if (slot) {
      place(l, slot.d, slot.h, state);
      placed++;
    } else {
      console.log("❌ NIE WSTAWIONO:", l.subject, l.teacher);
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
          penalty += 10;
        }
      }
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
