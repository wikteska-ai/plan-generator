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
    const real = g.group ? Math.ceil(g.hours / 2) : g.hours;

    for (let h = 0; h < real; h++) {
      out.push({
        id: `${i}_${h}`,
        ...g
      });
    }
  });

  // ciasność
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

// ===== SCORE (Twoja estetyka) =====
function score(s) {
  let penalty = 0;

  for (let cls in s) {
    for (let d of DAYS) {
      const day = s[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length === 0) {
        penalty += 200;
        continue;
      }

      // okienka
      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 500;
      }

      const first = Math.min(...hours);

      if (first === 1) penalty -= 40;
      else penalty += 100;

      if (hours.length < 4) penalty += 50;
      if (hours.length > 7) penalty += 50;

      // duplikaty ciężkich
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
          if (place(l, d, h, s, tBusy, cBusy, data)) {
            placed = true;
            break;
          }
        }
      }
      if (placed) break;
    }

    if (!placed && forcePlace(l, s, data)) placed = true;

    if (!placed) {
      console.log("❌ NIE WSTAWIONO:", l.subject, l.teacher);
    }
  }

  return s;
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

// ===== VALIDATION =====
function validateAll(schedule, lessons, data) {

  let ok = true;

  // nauczyciele
  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];

        if (!teacherAvailableRaw(l.teacher, d, h, data)) {
          console.log(`❌ NIEZGODNA DYSPOZYCJA: ${l.teacher} ${d}_${h}`);
          ok = false;
        }
      }
    }
  }

  // godziny
  const missing = countMissing(schedule, lessons);
  if (missing > 0) {
    console.log("❌ NIE WSTAWIONO PRZEDMIOTÓW (godziny):", missing);
    ok = false;
  }

  if (ok) console.log("✅ PLAN POPRAWNY");
}

// ===== MAIN =====
async function generateSchedule(data) {

  const lessons = getLessons(data);

  let best = null;
  let bestScore = -9999;
  let bestMissing = Infinity;

  const start = Date.now();

  while (Date.now() - start < TIME_LIMIT) {

    const shuffled = [...lessons].sort(() => Math.random() - 0.5);

    let s = construct(shuffled, data);

    const missing = countMissing(s, lessons);

    let sc = score(s);

    console.log("missing:", missing);

    if (
      missing < bestMissing ||
      (missing === bestMissing && sc > bestScore)
    ) {
      best = s;
      bestMissing = missing;
      bestScore = sc;
    }

    if (missing === 0 && sc > -1000) break;

    saveProgress({
      percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
      missing,
      score: sc
    });
  }

  validateAll(best, lessons, data);

  return {
    status: "OK",
    missing: bestMissing,
    score: bestScore,
    schedule: best
  };
}

export { generateSchedule };
