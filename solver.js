import fs from "fs";

const TIME_LIMIT = 60000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== HELPERS =====
function getTeacher(data, id) {
  return data.teachers.find(t => t.id === id);
}

function teacherAvailableRaw(tid, d, h, data) {
  const t = getTeacher(data, tid);
  return t && t.availability.includes(d + "_" + h);
}

// ===== BUSY =====
function rebuildBusy(schedule) {
  let tBusy = {}, cBusy = {};

  for (let c in schedule) {
    for (let d in schedule[c]) {
      for (let h in schedule[c][d]) {
        const l = schedule[c][d][h];
        tBusy[l.teacher+"_"+d+"_"+h] = true;
        cBusy[c+"_"+d+"_"+h] = true;
      }
    }
  }

  return { tBusy, cBusy };
}

// ===== LESSONS =====
function getLessons(data) {
  let grouped = {};

  data.lessons.forEach(l => {
    const key = l.group
      ? "G_" + l.group
      : `${l.class}_${l.subject}_${l.teacher}`;

    if (!grouped[key]) {
      grouped[key] = {
        subject: l.subject,
        teacher: l.teacher,
        classes: [],
        hours: l.hours,
        group: l.group,
        block: l.subject === "wych.fizy." ? 2 : 1
      };
    }

    grouped[key].classes.push(l.class);
  });

  let out = [];

  Object.values(grouped).forEach((g, i) => {
    const real = g.group ? Math.ceil(g.hours / 2) : g.hours;

    for (let h = 0; h < real; h++) {
      out.push({
        id: `${i}_${h}`,
        ...g
      });
    }
  });

  // ciasność nauczyciela
  out.sort((a, b) => {
    const ta = getTeacher(data, a.teacher);
    const tb = getTeacher(data, b.teacher);
    return ta.availability.length - tb.availability.length;
  });

  return out;
}

// ===== CHECK =====
function teacherOk(tid, d, h, tBusy, data) {
  return teacherAvailableRaw(tid, d, h, data) &&
    !tBusy[tid+"_"+d+"_"+h];
}

function classesFree(classes, d, h, cBusy) {
  return classes.every(c => !cBusy[c+"_"+d+"_"+h]);
}

// ===== PLACE =====
function place(l, d, h, s, data) {

  const { tBusy, cBusy } = rebuildBusy(s);

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
  }

  if (l.block === 2) {
    for (let c of l.classes) {
      s[c][d][h+1] = l;
    }
  }

  return true;
}

// ===== SCORE (estetyka) =====
function score(s) {
  let penalty = 0;

  for (let cls in s) {
    for (let d of DAYS) {
      const day = s[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (!hours.length) {
        penalty += 200;
        continue;
      }

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 800;
      }

      const first = Math.min(...hours);

      if (first === 1) penalty -= 60;
      else penalty += 120;

      if (hours.length < 4) penalty += 60;
      if (hours.length > 7) penalty += 60;

      let subjects = {};

      hours.forEach(h => {
        const sub = day[h]?.subject;
        subjects[sub] = (subjects[sub] || 0) + 1;
      });

      for (let sub in subjects) {
        if (["matematyka","j.polski","j.angielski"].includes(sub)) {
          if (subjects[sub] > 1) penalty += 80;
        }
      }
    }
  }

  return -penalty;
}

// ===== CHAIN MOVE (FIXED) =====
function tryChainMove(schedule, lesson, data, depth = 6, visited = new Set()) {
  if (visited.has(lesson.id) || depth <= 0) return false;
  visited.add(lesson.id);

  for (let d of DAYS) {
    for (let h of HOURS) {

      const { tBusy, cBusy } = rebuildBusy(schedule);

      if (
        teacherOk(lesson.teacher, d, h, tBusy, data) &&
        classesFree(lesson.classes, d, h, cBusy)
      ) {
        return { d, h };
      }

      let blocker = null;

      for (let c of lesson.classes) {
        if (schedule[c]?.[d]?.[h]) {
          blocker = schedule[c][d][h];
          break;
        }
      }

      if (!blocker) continue;

      const moved = tryChainMove(schedule, blocker, data, depth-1, visited);

      if (moved) {

        if (!teacherAvailableRaw(blocker.teacher, moved.d, moved.h, data)) {
          continue;
        }

        const { tBusy, cBusy } = rebuildBusy(schedule);

        if (
          !teacherOk(blocker.teacher, moved.d, moved.h, tBusy, data) ||
          !classesFree(blocker.classes, moved.d, moved.h, cBusy)
        ) continue;

        for (let cc of blocker.classes) {
          delete schedule[cc][d][h];
        }

        for (let cc of blocker.classes) {
          if (!schedule[cc][moved.d]) schedule[cc][moved.d] = {};
          schedule[cc][moved.d][moved.h] = blocker;
        }

        return { d, h };
      }
    }
  }

  return false;
}

// ===== COUNT HOURS =====
function countMissing(schedule, lessons) {
  let placed = 0;
  let required = 0;

  for (let l of lessons) {
    required += l.block === 2 ? 2 : 1;
  }

  const seen = new Set();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {

        const l = schedule[cls][d][h];
        const key = l.id + "_" + d;

        if (seen.has(key)) continue;
        seen.add(key);

        placed += l.block === 2 ? 2 : 1;
      }
    }
  }

  return required - placed;
}

// ===== MAIN =====
async function generateSchedule(data) {

  const lessons = getLessons(data);

  let best = null;
  let bestScore = -9999;
  let bestMissing = Infinity;

  const start = Date.now();

  while (Date.now() - start < TIME_LIMIT) {

    let s = {};

    for (let l of lessons) {
      if (!place(l, DAYS[Math.floor(Math.random()*5)], HOURS[Math.floor(Math.random()*8)], s, data)) {
        const moved = tryChainMove(s, l, data, 8);
        if (moved) {
          for (let c of l.classes) {
            if (!s[c]) s[c] = {};
            if (!s[c][moved.d]) s[c][moved.d] = {};
            s[c][moved.d][moved.h] = l;
          }
        }
      }
    }

    const missing = countMissing(s, lessons);
    const sc = score(s);

    console.log("missing:", missing);

    if (
      missing < bestMissing ||
      (missing === bestMissing && sc > bestScore)
    ) {
      best = s;
      bestMissing = missing;
      bestScore = sc;
    }

    if (missing === 0) break;
  }

  // ===== FINAL VALIDATION =====
  const missing = countMissing(best, lessons);

  if (missing > 0) {
    console.log("❌ NIE WSTAWIONO GODZIN:", missing);
  }

  for (let cls in best) {
    for (let d in best[cls]) {
      for (let h in best[cls][d]) {
        const l = best[cls][d][h];
        if (!teacherAvailableRaw(l.teacher, d, h, data)) {
          console.log("❌ NIEZGODNA DYSPOZYCJA:", l.teacher, d, h);
        }
      }
    }
  }

  if (missing === 0) {
    console.log("✅ PLAN POPRAWNY");
  }

  return {
    status: "OK",
    missing: bestMissing,
    score: bestScore,
    schedule: best
  };
}

export { generateSchedule };
