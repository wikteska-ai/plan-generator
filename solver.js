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
    const realHours = g.group
      ? Math.ceil(g.hours / 2)
      : g.hours;

    for (let h = 0; h < realHours; h++) {
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

  for (let c of l.classes) {
    if (!s[c]) s[c] = {};
    if (!s[c][d]) s[c][d] = {};
    s[c][d][h] = l;
  }

  return true;
}

// ===== FORCE =====
function forcePlace(l, schedule, data) {

  for (let d of DAYS) {
    for (let h of HOURS) {

      let conflicts = [];

      for (let c of l.classes) {
        if (schedule[c]?.[d]?.[h]) {
          conflicts.push(schedule[c][d][h]);
        }
      }

      for (let con of conflicts) {
        for (let cc of con.classes) {
          delete schedule[cc][d][h];
        }
      }

      const { tBusy, cBusy } = rebuildBusy(schedule);

      if (
        teacherOk(l.teacher, d, h, tBusy, data) &&
        classesFree(l.classes, d, h, cBusy)
      ) {
        for (let c of l.classes) {
          if (!schedule[c]) schedule[c] = {};
          if (!schedule[c][d]) schedule[c][d] = {};
          schedule[c][d][h] = l;
        }
        return true;
      }

      // rollback
      for (let con of conflicts) {
        for (let cc of con.classes) {
          if (!schedule[cc]) schedule[cc] = {};
          if (!schedule[cc][d]) schedule[cc][d] = {};
          schedule[cc][d][h] = con;
        }
      }
    }
  }

  return false;
}

// ===== CHAIN =====
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

// ===== CONSTRUCT =====
function construct(lessons, data) {

  let s = {};

  for (let l of lessons) {

    let { tBusy, cBusy } = rebuildBusy(s);
    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {
        if (
          teacherOk(l.teacher, d, h, tBusy, data) &&
          classesFree(l.classes, d, h, cBusy)
        ) {
          place(l, d, h, s, tBusy, cBusy, data);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed && forcePlace(l, s, data)) placed = true;

    if (!placed) {
      const moved = tryChainMove(s, l, data, 8);
      if (moved) {
        for (let c of l.classes) {
          if (!s[c]) s[c] = {};
          if (!s[c][moved.d]) s[c][moved.d] = {};
          s[c][moved.d][moved.h] = l;
        }
        placed = true;
      }
    }

    if (!placed) {
      console.log("❌ NIE WSTAWIONO:", l.subject, l.teacher);
    }
  }

  return s;
}

// ===== VALIDATION =====
function validateAll(schedule, lessons, data) {

  const errors = [];

  // nauczyciele
  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];

        if (!teacherAvailableRaw(l.teacher, d, h, data)) {
          errors.push(`❌ NIEZGODNA DYSPOZYCJA: ${l.teacher} ${d}_${h}`);
        }
      }
    }
  }

  // missing
  const set = new Set();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        set.add(schedule[cls][d][h].id);
      }
    }
  }

  for (let l of lessons) {
    if (!set.has(l.id)) {
      errors.push(`❌ NIE WSTAWIONO PRZEDMIOTU: ${l.subject} (${l.teacher})`);
    }
  }

  return errors;
}

// ===== MAIN =====
async function generateSchedule(data) {

  const lessons = getLessons(data);

  let best = null;
  let bestMissing = Infinity;

  const start = Date.now();

  while (Date.now() - start < TIME_LIMIT) {

    const shuffled = [...lessons].sort(() => Math.random() - 0.5);

    const s = construct(shuffled, data);

    const missing = countMissing(s, lessons);

    console.log("missing:", missing);

    if (missing < bestMissing) {
      best = s;
      bestMissing = missing;
    }

    if (missing === 0) break;
  }

  // 🔥 FINAL VALIDATION
  const errors = validateAll(best, lessons, data);

  if (errors.length) {
    console.log("🚨 FINAL ERRORS:");
    errors.forEach(e => console.log(e));
  } else {
    console.log("✅ PLAN POPRAWNY");
  }

  return {
    status: "OK",
    missing: bestMissing,
    schedule: best
  };
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

export { generateSchedule };
