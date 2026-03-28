import fs from "fs";

const TIME_LIMIT = 600000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== PROGRESS =====
function saveProgress(p) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(p));
  } catch {}
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
    const realHours = g.group ? Math.ceil(g.hours / 2) : g.hours;

    for (let h = 0; h < realHours; h++) {
      out.push({
        id: `${i}_${h}_${g.teacher}_${g.subject}`,
        ...g
      });
    }
  });

  // 🔥 sort ciasności
  out.sort((a, b) => {
    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const tightA = a.hours / Math.max(ta?.availability.length || 1, 1);
    const tightB = b.hours / Math.max(tb?.availability.length || 1, 1);

    return tightB - tightA;
  });

  return out;
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

// ===== CHECK =====
function teacherAvailableRaw(tid, d, h, data) {
  const t = data.teachers.find(x => x.id === tid);
  return t && t.availability.includes(d + "_" + h);
}

function teacherOk(tid, d, h, tBusy, data) {
  return teacherAvailableRaw(tid, d, h, data) &&
    !tBusy[tid+"_"+d+"_"+h];
}

function classesFree(classes, d, h, cBusy) {
  return classes.every(c => !cBusy[c+"_"+d+"_"+h]);
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

// ===== COUNT (FIX GODZIN) =====
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

// ===== CHAIN MOVE (FIXED) =====
function tryChainMove(schedule, lesson, data, depth = 8, visited = new Set()) {
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

      const moved = tryChainMove(schedule, blocker, data, depth - 1, visited);

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

// ===== CONSTRUCT =====
function construct(lessons, data) {
  let s = {}, tBusy = {}, cBusy = {};

  for (let l of lessons) {

    let placed = false;

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

    if (!placed) {
      const moved = tryChainMove(s, l, data);
      if (moved) {
        const { d, h } = moved;
        place(l, d, h, s, tBusy, cBusy, data);
        placed = true;
      }
    }

    if (!placed) {
      console.log("❌ NIE WSTAWIONO:", l.subject, l.teacher);
    }

    ({ tBusy, cBusy } = rebuildBusy(s));
  }

  return s;
}

// ===== MAIN =====
async function generateSchedule(data) {

  let lessons = getLessons(data);

  let best = null;
  let bestMissing = Infinity;

  const start = Date.now();

  while (Date.now() - start < TIME_LIMIT) {

    const s = construct(lessons, data);

    const missing = countMissing(s, lessons);

    console.log("missing:", missing);

    if (missing < bestMissing) {
      best = s;
      bestMissing = missing;
    }

    if (missing === 0) break;
  }

  // ===== FINAL CLOSING =====
  if (bestMissing > 0 && bestMissing <= 5) {
    console.log("💣 FINAL DOMYKANIE");

    for (let l of lessons) {
      const moved = tryChainMove(best, l, data, 12);
      if (moved) {
        const { d, h } = moved;
        const { tBusy, cBusy } = rebuildBusy(best);

        if (
          teacherOk(l.teacher, d, h, tBusy, data) &&
          classesFree(l.classes, d, h, cBusy)
        ) {
          place(l, d, h, best, tBusy, cBusy, data);
        }
      }
    }
  }

  const finalMissing = countMissing(best, lessons);

  if (finalMissing > 0) {
    console.log("❌ NIE WSTAWIONO GODZIN:", finalMissing);
  } else {
    console.log("✅ PLAN POPRAWNY");
  }

  return {
    status: "OK",
    missing: finalMissing,
    schedule: best
  };
}

export { generateSchedule };
