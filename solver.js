import fs from "fs";

const TIME_LIMIT = 600000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== EXTRA FIX =====
function teacherAvailableRaw(tid, d, h, data) {
  const t = data.teachers.find(x => x.id === tid);
  return t && t.availability.includes(d + "_" + h);
}

function isTightTeacher(l, data) {
  const t = data.teachers.find(t => t.id === l.teacher);
  return (t?.availability.length || 0) <= l.hours;
}

// ===== PROGRESS =====
function saveProgress(p) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(p));
  } catch {}
}

// ===== LEKCJE =====
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
    const realHours = g.group ? Math.ceil(g.hours / 2) : g.hours;

    for (let h = 0; h < realHours; h++) {
      out.push({
        id: `${i}_${h}_${g.teacher}_${g.subject}_${g.classes.join("-")}`,
        ...g
      });
    }
  });

  out.sort((a, b) => {
    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const availA = ta?.availability.length || 0;
    const availB = tb?.availability.length || 0;

    const tightA = a.hours / Math.max(availA, 1);
    const tightB = b.hours / Math.max(availB, 1);

    if (tightA !== tightB) return tightB - tightA;
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;

    return Math.random() - 0.5;
  });

  return out;
}

// ===== CHECK =====
function teacherOk(tid, d, h, tBusy, data) {
  const t = data.teachers.find(x => x.id === tid);
  return t && t.availability.includes(d + "_" + h) && !tBusy[tid + "_" + d + "_" + h];
}

function classesFree(classes, d, h, cBusy) {
  return classes.every(c => !cBusy[c + "_" + d + "_" + h]);
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

  tBusy[l.teacher + "_" + d + "_" + h] = true;

  for (let c of l.classes) {
    cBusy[c + "_" + d + "_" + h] = true;

    if (!s[c]) s[c] = {};
    if (!s[c][d]) s[c][d] = {};

    s[c][d][h] = l;
  }

  if (l.block === 2) {
    tBusy[l.teacher + "_" + d + "_" + (h+1)] = true;

    for (let c of l.classes) {
      cBusy[c + "_" + d + "_" + (h+1)] = true;
      s[c][d][h+1] = l;
    }
  }

  return true;
}

// ===== BUSY =====
function rebuildBusy(schedule) {
  let tBusy = {};
  let cBusy = {};

  for (let c in schedule) {
    for (let d in schedule[c]) {
      for (let h in schedule[c][d]) {
        const l = schedule[c][d][h];
        tBusy[l.teacher + "_" + d + "_" + h] = true;
        cBusy[c + "_" + d + "_" + h] = true;
      }
    }
  }

  return { tBusy, cBusy };
}

// ===== CHAIN MOVE FIX =====
function tryChainMove(schedule, lesson, data, depth = 6, visited = new Set()) {
  if (visited.has(lesson.id)) return false;
  visited.add(lesson.id);
  if (depth <= 0) return false;

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

      const moved = tryChainMove(schedule, blocker, data, depth - 1, visited);

      if (moved) {

        if (!teacherAvailableRaw(blocker.teacher, moved.d, moved.h, data)) continue;

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

// ===== COUNT MISSING FIX =====
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

// ===== MAIN (TWÓJ FLOW ZOSTAJE) =====
async function generateSchedule(data) {
  let lessons = getLessons(data);

  let globalBest = null;

  const start = Date.now();

  while (Date.now() - start < TIME_LIMIT) {

    let s = construct(lessons, data);

    let missing = countMissing(s, lessons);

    console.log("missing:", missing);

    if (!globalBest || missing < globalBest.missing) {
      globalBest = {
        schedule: s,
        missing
      };
    }

    if (missing === 0) break;
  }

  // ===== FINAL CLOSING =====
  if (globalBest && globalBest.missing > 0 && globalBest.missing <= 5) {

    let s = JSON.parse(JSON.stringify(globalBest.schedule));

    for (let l of lessons) {

      let moved = tryChainMove(s, l, data, 12, new Set());

      if (moved) {
        const { d, h } = moved;
        const { tBusy, cBusy } = rebuildBusy(s);

        if (
          teacherOk(l.teacher, d, h, tBusy, data) &&
          classesFree(l.classes, d, h, cBusy)
        ) {
          for (let c of l.classes) {
            if (!s[c]) s[c] = {};
            if (!s[c][d]) s[c][d] = {};
            s[c][d][h] = l;
          }
        }
      }
    }

    globalBest.schedule = s;
    globalBest.missing = countMissing(s, lessons);
  }

  const finalMissing = countMissing(globalBest.schedule, lessons);

  if (finalMissing > 0) {
    console.log("❌ NIE WSTAWIONO GODZIN:", finalMissing);
  } else {
    console.log("✅ PLAN POPRAWNY");
  }

  return {
    status: "OK",
    missing: finalMissing,
    schedule: globalBest.schedule
  };
}

export { generateSchedule };
