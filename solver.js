import fs from "fs";

const TIME_LIMIT = 60000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== HELPERS =====
function teacherSlots(t) {
  return t.availability.length;
}

function getTeacher(data, id) {
  return data.teachers.find(t => t.id === id);
}

// ===== LESSONS =====
function getLessons(data) {
  let out = [];

  data.lessons.forEach((l, i) => {
    const count = l.group ? Math.ceil(l.hours / 2) : l.hours;

    for (let h = 0; h < count; h++) {
      out.push({
        id: i + "_" + h,
        ...l,
        block: l.subject === "wych.fizy." ? 2 : 1
      });
    }
  });

  // 🔥 KLUCZ — ciasność nauczyciela
  out.sort((a, b) => {
    const ta = getTeacher(data, a.teacher);
    const tb = getTeacher(data, b.teacher);

    const tightA = teacherSlots(ta) / a.hours;
    const tightB = teacherSlots(tb) / b.hours;

    return tightA - tightB;
  });

  return out;
}

// ===== CHECK =====
function teacherOk(tid, d, h, busy, data) {
  const t = getTeacher(data, tid);
  return t.availability.includes(d + "_" + h) && !busy[tid+"_"+d+"_"+h];
}

function classesFree(classes, d, h, busy) {
  return classes.every(c => !busy[c+"_"+d+"_"+h]);
}

// ===== PLACE =====
function place(l, d, h, s, tBusy, cBusy, data) {

  if (!teacherOk(l.teacher, d, h, tBusy, data)) return false;

  if (l.block === 2) {
    if (h >= 8) return false;

    if (
      !teacherOk(l.teacher, d, h+1, tBusy, data) ||
      !classesFree(l.classes, d, h+1, cBusy)
    ) return false;
  }

  for (let c of l.classes) {
    if (!s[c]) s[c] = {};
    if (!s[c][d]) s[c][d] = {};
    s[c][d][h] = l;
    cBusy[c+"_"+d+"_"+h] = true;
  }

  tBusy[l.teacher+"_"+d+"_"+h] = true;

  if (l.block === 2) {
    for (let c of l.classes) {
      s[c][d][h+1] = l;
      cBusy[c+"_"+d+"_"+(h+1)] = true;
    }
    tBusy[l.teacher+"_"+d+"_"+(h+1)] = true;
  }

  return true;
}

// ===== CORE =====
function construct(lessons, data) {

  let s = {};
  let tBusy = {};
  let cBusy = {};

  for (let l of lessons) {

    let placed = false;

    const teacher = getTeacher(data, l.teacher);

    // 🔥 próbuj tylko w jego slotach
    const slots = teacher.availability
      .map(x => {
        const [d,h] = x.split("_");
        return { d, h: +h };
      });

    for (let {d,h} of slots) {

      if (!classesFree(l.classes, d, h, cBusy)) continue;

      if (place(l, d, h, s, tBusy, cBusy, data)) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      // 🔥 fallback brute force
      for (let d of DAYS) {
        for (let h of HOURS) {
          if (
            teacherOk(l.teacher, d, h, tBusy, data) &&
            classesFree(l.classes, d, h, cBusy)
          ) {
            if (place(l, d, h, s, tBusy, cBusy, data)) {
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      console.log("❌ FAIL:", l.subject, l.teacher);
    }
  }

  return s;
}

// ===== COUNT =====
function countMissing(schedule, lessons) {
  const set = new Set();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        set.add(schedule[cls][d][h].id);
      }
    }
  }

  return lessons.length - set.size;
}

// ===== MAIN =====
async function generateSchedule(data) {

  const lessons = getLessons(data);

  let best = null;
  let bestMissing = Infinity;

  for (let i = 0; i < 50; i++) {

    const shuffled = [...lessons].sort(() => Math.random() - 0.5);

    const s = construct(shuffled, data);

    const missing = countMissing(s, lessons);

    console.log("ITER", i, "missing:", missing);

    if (missing < bestMissing) {
      best = s;
      bestMissing = missing;
    }

    if (missing === 0) break;
  }

  return {
    status: "OK",
    missing: bestMissing,
    schedule: best
  };
}

export { generateSchedule };
