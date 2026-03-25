import fs from "fs";

const TIME_LIMIT = 240000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

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
      : l.subject === "edu.wczesno."
        ? `${l.class}_${l.subject}_${l.teacher}`
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
    for (let h = 0; h < g.hours; h++) {
      out.push({
        id: i + "_" + h,
        ...g
      });
    }
  });

  // 🔥 SORTOWANIE
  out.sort((a, b) => {
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;
    return b.classes.length - a.classes.length;
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
function place(l, d, h, s, tBusy, cBusy) {
  tBusy[l.teacher + "_" + d + "_" + h] = true;

  for (let c of l.classes) {
    cBusy[c + "_" + d + "_" + h] = true;

    if (!s[c]) s[c] = {};
    if (!s[c][d]) s[c][d] = {};

    s[c][d][h] = l;
  }
}

// ===== CONSTRUCT =====
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

function construct(lessons, data) {
  let s = {}, tBusy = {}, cBusy = {};

  for (let l of lessons) {
    let placedFlag = false;
    let best = null;
    let bestScore = -9999;

    for (let d of DAYS) {
      for (let h of HOURS) {
        if (!teacherOk(l.teacher, d, h, tBusy, data)) continue;
        if (!classesFree(l.classes, d, h, cBusy)) continue;

        let score = 0;

        if (h >= 2 && h <= 6) score += 2;
        if (h === 1) score += 1;

        for (let c of l.classes) {
          const day = s[c]?.[d] || {};
          score -= Object.keys(day).length;
        }

        if (l.group) score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = { d, h };
        }
      }
    }

    // NORMAL placement
    if (best) {
      place(l, best.d, best.h, s, tBusy, cBusy);
      placedFlag = true;
    } else {
      // FALLBACK
      outer:
      for (let d of DAYS) {
        for (let h of HOURS) {
          if (
            teacherOk(l.teacher, d, h, tBusy, data) &&
            classesFree(l.classes, d, h, cBusy)
          ) {
            place(l, d, h, s, tBusy, cBusy);
            placedFlag = true;
            break outer;
          }
        }
      }
    }

    if (!placedFlag) {
      // FORCE PLACEMENT
      outer:
      for (let d of DAYS) {
        for (let h of HOURS) {

          let occupied = false;

          for (let c of l.classes) {
            if (s[c]?.[d]?.[h]) {
              occupied = true;
              break;
            }
          }

          if (!occupied) continue;

          const existing = s[l.classes[0]]?.[d]?.[h];

          if (existing) {
            for (let cc of existing.classes) {
              if (s[cc]?.[d]?.[h]) {
                delete s[cc][d][h];
              }
            }

            for (let cc of existing.classes) {
              delete cBusy[cc + "_" + d + "_" + h];
            }

            delete tBusy[existing.teacher + "_" + d + "_" + h];
          }

          if (existing) {
            for (let cc of existing.classes) {
              if (s[cc]?.[d]?.[h]) {
                delete s[cc][d][h];
              }
            }
          }

          for (let cc of existing.classes) {
            delete cBusy[cc + "_" + d + "_" + h];
          }

          delete tBusy[existing.teacher + "_" + d + "_" + h];
if (!teacherOk(l.teacher, d, h, tBusy, data)) continue;
          place(l, d, h, s, tBusy, cBusy);
          placedFlag = true;

          break outer;
        }
      }

      if (!placedFlag) {
        console.log("💀 TOTAL FAIL:", l.subject, l.classes);
      }
    }

    ({ tBusy, cBusy } = rebuildBusy(s));
  }

  return s;
}

// ===== SCORE =====
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

// ===== IMPROVE =====
function improve(s, data, ms) {
  let best = JSON.parse(JSON.stringify(s));
  let bestScore = score(best);

  let current = JSON.parse(JSON.stringify(s));
  let currentScore = bestScore;

  const start = Date.now();

while (Date.now() - start < ms) {
  let next = JSON.parse(JSON.stringify(current));

  let rebuilt = rebuildBusy(next);
  let tBusy = rebuilt.tBusy;
  let cBusy = rebuilt.cBusy;

    // TARGETED REPAIR
    if (Math.random() < 0.7) {
      const classes = Object.keys(next);

      for (let c of classes) {
        const days = Object.keys(next[c] || {});

        for (let d of days) {
          const hours = Object.keys(next[c][d] || {})
            .map(Number)
            .sort((a,b)=>a-b);

          for (let i = 1; i < hours.length; i++) {
            const prev = hours[i-1];
            const curr = hours[i];

            if (curr !== prev + 1) {
              const lesson = next[c][d][curr];

              if (lesson.classes.length > 1) continue;

              const target = prev + 1;

let ok = true;

for (let cc of lesson.classes) {
  if (next[cc]?.[d]?.[target]) {
    ok = false;
    break;
  }
}

if (!ok) continue;

              for (let cc of lesson.classes) {
                if (next[cc]?.[d]?.[target]) {
                  ok = false;
                  break;
                }
              }

              if (!ok) continue;

              delete next[c][d][curr];
              next[c][d][target] = lesson;
              rebuilt = rebuildBusy(next);
tBusy = rebuilt.tBusy;
cBusy = rebuilt.cBusy;

              break;
            }
          }
        }
      }
    }

    const before = countLessons(current);
    const after = countLessons(next);

    if (after < before) continue;

    let sc = score(next);
    const isGood = currentScore > -2000;

    if (
      sc > currentScore ||
      (Math.random() < (isGood ? 0.05 : 0.15))
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

// ===== REPAIR MISSING =====
function repairMissing(schedule, lessons, data) {
  const map = new Set();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        map.add(schedule[cls][d][h].id);
      }
    }
  }

  for (let l of lessons) {
    if (map.has(l.id)) continue;

    outer:
    for (let d of DAYS) {
      for (let h of HOURS) {
        let free = true;

        for (let c of l.classes) {
          if (schedule[c]?.[d]?.[h]) {
            free = false;
            break;
          }
        }

        if (!free) continue;

        for (let c of l.classes) {
          if (!schedule[c]) schedule[c] = {};
          if (!schedule[c][d]) schedule[c][d] = {};
          schedule[c][d][h] = l;
        }

        break outer;
      }
    }
  }

  return schedule;
}


// ===== MAIN =====
async function generateSchedule(data) {
  const lessons = getLessons(data);

  let globalBest = null;
  let globalScore = -9999;

  const start = Date.now();
  let iter = 0;

  while (Date.now() - start < TIME_LIMIT) {
    iter++;

    let s = construct(lessons, data);

    const { best, bestScore } = improve(s, data, 10000);
    const fixed = repairMissing(best, lessons, data);

    if (bestScore > globalScore) {
      globalScore = bestScore;
      globalBest = fixed;

      console.log("🔥 Nowy najlepszy score:", globalScore);
    }

    saveProgress({
      percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
      iter,
      score: globalScore
    });
  }

  saveProgress({ percent: 100 });

  validate(globalBest, lessons);
  const teacherErrors = validateTeachers(globalBest, data);

if (teacherErrors.length) {
  console.log("🚨 BŁĘDY NAUCZYCIELI:");
  teacherErrors.forEach(e => console.log(e));
}

  return {
    status: "OK",
    score: globalScore,
    schedule: globalBest,
    placed: lessons.length,
    total: lessons.length
  };
}

// ===== VALIDATE =====
function validate(schedule, lessons) {
  let map = {};

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];
        map[l.id] = (map[l.id] || 0) + 1;
      }
    }
  }

  lessons.forEach(l => {
    const expected = l.classes.length;
    const actual = map[l.id] || 0;

    if (actual !== expected) {
      console.log("❌ PROBLEM:", l.subject, l.id, actual, "/", expected);
    }
  });
}
function validateTeachers(schedule, data) {
  let errors = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];

        const t = data.teachers.find(x => x.id === l.teacher);

        if (!t.availability.includes(d + "_" + h)) {
          errors.push(`❌ ${l.teacher} brak dostępności ${d}_${h}`);
        }
      }
    }
  }

  return errors;
}

export { generateSchedule };
