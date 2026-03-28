import fs from "fs";

const TIME_LIMIT = 600000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== FIX HELPERS =====
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

// ===== CONSTRUCT (BEZ ZMIAN) =====
function construct(lessons, data) {
  let s = {}, tBusy = {}, cBusy = {};

  let queue = [...lessons];
  let attempts = 0;

  while (queue.length > 0 && attempts < lessons.length * 400) {
    const l = queue.shift();
    attempts++;

    let placedFlag = false;
    let best = null;
    let bestScore = -9999;

    const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);
    const shuffledHours = [...HOURS].sort(() => Math.random() - 0.5);

    for (let d of shuffledDays) {
      for (let h of shuffledHours) {

        if (!teacherOk(l.teacher, d, h, tBusy, data)) continue;
        if (!classesFree(l.classes, d, h, cBusy)) continue;

        if (l.block === 2) {
          if (h >= 8) continue;

          if (
            !teacherOk(l.teacher, d, h+1, tBusy, data) ||
            !classesFree(l.classes, d, h+1, cBusy)
          ) continue;
        }

        let score = 0;

        const teacher = data.teachers.find(t => t.id === l.teacher);
        const avail = teacher?.availability || [];

        if (avail.length <= 6) score += 20;
        if (avail.includes(d + "_" + h)) score += 10;

        if (h >= 2 && h <= 6) score += 2;
        if (h === 1) score += 1;

        for (let c of l.classes) {
          const day = s[c]?.[d] || {};
          score -= Object.keys(day).length;
        }

        if (l.group) score += 5;

        if (score > bestScore || Math.random() < 0.3) {
          bestScore = score;
          best = { d, h };
        }
      }
    }

    if (best) {
      if (place(l, best.d, best.h, s, tBusy, cBusy, data)) {
        placedFlag = true;
      }

      ({ tBusy, cBusy } = rebuildBusy(s));

    } else {
      outer:
      for (let d of DAYS) {
        for (let h of HOURS) {
          if (
            teacherOk(l.teacher, d, h, tBusy, data) &&
            classesFree(l.classes, d, h, cBusy)
          ) {
            if (place(l, d, h, s, tBusy, cBusy, data)) {
              placedFlag = true;
            }

            ({ tBusy, cBusy } = rebuildBusy(s));
            break outer;
          }
        }
      }
    }

    if (!placedFlag) {
      l._tries = (l._tries || 0) + 1;

      if (!l._logged) {
        console.log("❌ NIE WSTAWIONO:", l.subject, l.teacher);
        l._logged = true;
      }

      if (l._tries < 3) {
        queue.push(l);
      }

      continue;
    }

    ({ tBusy, cBusy } = rebuildBusy(s));
  }

  return s;
}
// ===== SCORE (BEZ ZMIAN) =====
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

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          penalty += 800;
        }
      }

      const first = Math.min(...hours);

      if (first === 1) penalty -= 60;
      else if (first === 2) penalty += 50;
      else if (first === 3) penalty += 120;
      else penalty += 200;

      if (hours.length < 4) penalty += 60;
      if (hours.length > 7) penalty += 60;

      let subjects = {};

      hours.forEach(h => {
        const sub = day[h]?.subject;
        if (!subjects[sub]) subjects[sub] = 0;
        subjects[sub]++;
      });

      for (let sub in subjects) {
        if (["matematyka","j.polski","j.angielski"].includes(sub)) {
          if (subjects[sub] > 1) penalty += 80;
        }
      }

      for (let h of hours) {
        const cur = day[h]?.subject;
        const next = day[h+1]?.subject;

        if (cur === "wych.fizy." && next !== "wych.fizy.") {
          penalty += 120;
        }
      }
    }
  }

  return -penalty;
}

// ===== COUNT LESSONS =====
function countLessons(schedule) {
  const set = new Set();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];
        set.add(l.id);
      }
    }
  }

  return set.size;
}

// ===== DESTROY (FIX: NIE RUSZAJ TIGHT TEACHERS) =====
function randomDestroy(schedule, percent = 0.1) {
  const all = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        all.push({ cls, d, h });
      }
    }
  }

  const toRemove = Math.floor(all.length * percent);

  for (let i = 0; i < toRemove; i++) {
    const r = all[Math.floor(Math.random() * all.length)];
    const lesson = schedule[r.cls]?.[r.d]?.[r.h];
    if (!lesson) continue;

    // 🔥 FIX
    if (isTightTeacher(lesson, data)) continue;

    for (let c of lesson.classes) {
      delete schedule[c][r.d][r.h];
    }
  }

  return schedule;
}

function smartDestroy(schedule, lessons, data) {
  const freq = {};

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];
        freq[l.teacher] = (freq[l.teacher] || 0) + 1;
      }
    }
  }

  const worst = Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,3)
    .map(x=>x[0]);

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];

        // 🔥 FIX
        if (isTightTeacher(l, data)) continue;

        if (worst.includes(l.teacher) && Math.random() < 0.3) {
          for (let c of l.classes) {
            delete schedule[c][d][h];
          }
        }
      }
    }
  }

  return schedule;
}

// ===== SWAP (BEZ ZMIAN) =====
function trySwap(schedule, data) {
  const entries = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        entries.push({ cls, d, h, lesson: schedule[cls][d][h] });
      }
    }
  }

  if (entries.length < 2) return schedule;

  const a = entries[Math.floor(Math.random() * entries.length)];
  const b = entries[Math.floor(Math.random() * entries.length)];

  if (!a.lesson || !b.lesson) return schedule;
  if (a.lesson.id === b.lesson.id) return schedule;

  const { tBusy, cBusy } = rebuildBusy(schedule);

  const canPlaceA =
    teacherOk(a.lesson.teacher, b.d, b.h, tBusy, data) &&
    classesFree(a.lesson.classes, b.d, b.h, cBusy);

  const canPlaceB =
    teacherOk(b.lesson.teacher, a.d, a.h, tBusy, data) &&
    classesFree(b.lesson.classes, a.d, a.h, cBusy);

  if (!canPlaceA || !canPlaceB) return schedule;

  for (let c of a.lesson.classes) delete schedule[c][a.d][a.h];
  for (let c of b.lesson.classes) delete schedule[c][b.d][b.h];

  for (let c of a.lesson.classes) {
    if (!schedule[c][b.d]) schedule[c][b.d] = {};
    schedule[c][b.d][b.h] = a.lesson;
  }

  for (let c of b.lesson.classes) {
    if (!schedule[c][a.d]) schedule[c][a.d] = {};
    schedule[c][a.d][a.h] = b.lesson;
  }

  return schedule;
}
// ===== IMPROVE (FIXED) =====
function improve(s, data, ms) {
  let best = JSON.parse(JSON.stringify(s));
  let bestScore = score(best);

  let current = JSON.parse(JSON.stringify(s));
  let currentScore = bestScore;

  const start = Date.now();

  while (Date.now() - start < ms) {

    let next;

    if (Math.random() < 0.7) {
      next = JSON.parse(JSON.stringify(current));
    } else {
      next = current;
    }

    if (Math.random() < 0.3) {
      next = trySwap(next, data);
    }

    if (Math.random() < 0.1) {
      next = randomDestroy(next, 0.05);
    }

    // 🔥 FIX — NIE TRAĆ LEKCJI
    const before = countLessons(current);
    const after = countLessons(next);

    if (after < before) continue;

    let sc = score(next);

    if (
      sc > currentScore ||
      Math.random() < 0.1
    ) {
      current = next;
      currentScore = sc;

      if (sc > bestScore) {
        best = JSON.parse(JSON.stringify(next));
        bestScore = sc;
      }
    }
  }

  return { best, bestScore };
}

// ===== TRY MAKE SPACE (BEZ ZMIAN) =====
function tryMakeSpace(schedule, lesson, data) {
  for (let d of DAYS) {
    for (let h of HOURS) {

      let existing = null;

      for (let c of lesson.classes) {
        if (schedule[c]?.[d]?.[h]) {
          existing = schedule[c][d][h];
          break;
        }
      }

      if (!existing) continue;

      for (let d2 of DAYS) {
        for (let h2 of HOURS) {

          const { tBusy, cBusy } = rebuildBusy(schedule);

          if (
            teacherOk(existing.teacher, d2, h2, tBusy, data) &&
            classesFree(existing.classes, d2, h2, cBusy)
          ) {
            for (let cc of existing.classes) {
              delete schedule[cc][d][h];
            }

            for (let cc of existing.classes) {
              if (!schedule[cc][d2]) schedule[cc][d2] = {};
              schedule[cc][d2][h2] = existing;
            }

            return { d, h };
          }
        }
      }
    }
  }

  return null;
}

// ===== CHAIN MOVE (FINAL FIX) =====
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

        // 🔥 KLUCZOWY FIX
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

// ===== MAIN (FIXED LOGIC) =====
async function generateSchedule(data) {

  let lessons = getLessons(data);

  let globalBest = null;

  const start = Date.now();

  while (Date.now() - start < TIME_LIMIT) {

    let s = construct(lessons, data);

    let { best, bestScore } = improve(s, data, 5000);

    let missing = countMissing(best, lessons);

    console.log("missing:", missing);

    // 🔥 FIX — NIE TRAĆ NAJLEPSZEGO
    if (
      !globalBest ||
      missing < globalBest.missing ||
      (missing === globalBest.missing && bestScore > globalBest.score)
    ) {
      globalBest = {
        schedule: best,
        missing,
        score: bestScore
      };
    }

    if (missing === 0) break;
  }

  // ===== FINAL DOMKNIĘCIE =====
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
    score: globalBest.score,
    missing: finalMissing,
    schedule: globalBest.schedule
  };
}

// ===== EXPORT =====
export { generateSchedule };
