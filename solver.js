import fs from "fs";

const TIME_LIMIT = 900000;
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
      id: `${i}_${h}_${g.teacher}_${g.subject}_${g.classes.join("-")}`,
        ...g
      });
    }
  });

  // 🔥 SORTOWANIE
 out.sort((a, b) => {
  if (a.group && !b.group) return -1;
  if (!a.group && b.group) return 1;

  const teacherA = data.teachers.find(t => t.id === a.teacher);
  const teacherB = data.teachers.find(t => t.id === b.teacher);

  const availA = teacherA?.availability.length || 0;
  const availB = teacherB?.availability.length || 0;

  const difficultyA = availA / a.hours;
  const difficultyB = availB / b.hours;

  return difficultyA - difficultyB;
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

  // 🔒 TWARDY CHECK — nauczyciel MUSI być dostępny
  if (!teacherOk(l.teacher, d, h, tBusy, data)) {
    throw new Error(`❌ INVALID PLACE ${l.teacher} ${d}_${h}`);
  }

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

  let queue = [...lessons];
let attempts = 0;

while (queue.length > 0 && attempts < lessons.length * 3) {
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

        let score = 0;

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

    // NORMAL placement
    if (best) {
      place(l, best.d, best.h, s, tBusy, cBusy, data);
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
            place(l, d, h, s, tBusy, cBusy, data);
            placedFlag = true;
            break outer;
          }
        }
      }
    }

 if (!placedFlag) {
  queue.push(l); // 🔁 spróbuj później
  continue;
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
    if (!schedule[r.cls]?.[r.d]?.[r.h]) continue;

const lesson = schedule[r.cls]?.[r.d]?.[r.h];
if (!lesson) continue;
    for (let c of lesson.classes) {
      if (schedule[c]?.[r.d]?.[r.h]) {
        delete schedule[c][r.d][r.h];
      }
    }
  }

  return schedule;
}
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

  // sprawdź czy można zamienić
  const canPlaceA =
    teacherOk(a.lesson.teacher, b.d, b.h, tBusy, data) &&
    classesFree(a.lesson.classes, b.d, b.h, cBusy);

  const canPlaceB =
    teacherOk(b.lesson.teacher, a.d, a.h, tBusy, data) &&
    classesFree(b.lesson.classes, a.d, a.h, cBusy);

  if (!canPlaceA || !canPlaceB) return schedule;

  // usuń stare
  for (let c of a.lesson.classes) {
    delete schedule[c][a.d][a.h];
  }

  for (let c of b.lesson.classes) {
    delete schedule[c][b.d][b.h];
  }

  // wstaw zamienione
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
// ===== IMPROVE =====
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
  next = current; // 🔥 reuse
}  if (Math.random() < 0.3) {
  next = trySwap(next, data);
}
  if (Math.random() < 0.1) {
  next = randomDestroy(next, 0.05);
}
let rebuilt, tBusy, cBusy;

    // TARGETED REPAIR
    if (Math.random() < 0.7) {
const classes = Object.keys(next || {});
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
const lesson = next[c]?.[d]?.[curr];
              
if (!lesson || !lesson.classes) continue;
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

             if (!next[c]) next[c] = {};
if (!next[c][d]) next[c][d] = {};

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

if (after < before && Math.random() > 0.3) continue;
    let sc = score(next);
    const isGood = currentScore > -2000;

    if (
      sc > currentScore ||
(Math.random() < (isGood ? 0.1 : 0.25)))
     {
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
function tryMakeSpace(schedule, lesson, data) {
  for (let d of DAYS) {
    for (let h of HOURS) {

      // jeśli slot zajęty
      let existing = null;

      for (let c of lesson.classes) {
        if (schedule[c]?.[d]?.[h]) {
          existing = schedule[c][d][h];
          break;
        }
      }

      if (!existing) continue;

      // spróbuj przenieść istniejącą lekcję gdzie indziej
      for (let d2 of DAYS) {
        for (let h2 of HOURS) {

          const { tBusy, cBusy } = rebuildBusy(schedule);

          const teacher = data.teachers.find(t => t.id === existing.teacher);

if (
  teacherOk(existing.teacher, d2, h2, tBusy, data) &&
  classesFree(existing.classes, d2, h2, cBusy) &&
  teacher?.availability.includes(d2 + "_" + h2)
) {
            // usuń starą
            for (let cc of existing.classes) {
              delete schedule[cc][d][h];
            }

            // wstaw w nowe miejsce
            for (let cc of existing.classes) {
              if (!schedule[cc][d2]) schedule[cc][d2] = {};
              schedule[cc][d2][h2] = existing;
            }

            return { d, h }; // zwolnione miejsce
          }
        }
      }
    }
  }

  return null;
}
function tryChainMove(schedule, lesson, data, depth = 6, visited = new Set()) {
  if (visited.has(lesson.id)) return false;
visited.add(lesson.id);
  if (depth <= 0) return false;

  const shuffledDays = [...DAYS].sort(() => Math.random() - 0.5);
const shuffledHours = [...HOURS].sort(() => Math.random() - 0.5);

for (let d of shuffledDays) {
  for (let h of shuffledHours) {

      const { tBusy, cBusy } = rebuildBusy(schedule);

      if (
        teacherOk(lesson.teacher, d, h, tBusy, data) &&
        classesFree(lesson.classes, d, h, cBusy)
      ) {
        return { d, h };
      }

      // 🔥 jeśli zajęte — spróbuj przesunąć blokującą lekcję
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
  const { tBusy, cBusy } = rebuildBusy(schedule);

  // 🔒 SPRAWDZENIE — czy można tam legalnie wstawić blocker
  const teacher = data.teachers.find(t => t.id === blocker.teacher);

if (
 teacherOk(blocker.teacher, moved.d, moved.h, tBusy, data) &&
  classesFree(blocker.classes, moved.d, moved.h, cBusy)
) {
    // usuń blocker
    for (let cc of blocker.classes) {
      delete schedule[cc][d][h];
    }

    // wstaw blocker gdzie indziej
    for (let cc of blocker.classes) {
      if (!schedule[cc][moved.d]) schedule[cc][moved.d] = {};
      schedule[cc][moved.d][moved.h] = blocker;
    }

    return { d, h };
  }
}
    }
  }

  return false;
}
function destroyAroundLesson(schedule, lesson) {
  for (let c of lesson.classes) {
    for (let d in schedule[c] || {}) {
      for (let h in schedule[c][d] || {}) {
        const l = schedule[c][d][h];

        if (
          l.teacher === lesson.teacher ||
          l.classes.some(cc => lesson.classes.includes(cc))
        ) {
          for (let cc of l.classes) {
            delete schedule[cc][d][h];
          }
        }
      }
    }
  }

  return schedule;
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

 const missingLessons = lessons
  .filter(l => !map.has(l.id))
  .sort((a, b) => {
    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const availA = ta?.availability.length || 0;
    const availB = tb?.availability.length || 0;

    const scoreA = availA / (a.hours || 1);
    const scoreB = availB / (b.hours || 1);

    return scoreA - scoreB;
  });

for (let l of missingLessons) {

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

if (!free) {
  let moved = tryMakeSpace(schedule, l, data);
  if (!moved) {
  schedule = destroyAroundLesson(schedule, l);
  moved = tryChainMove(schedule, l, data, 8);
}

  if (!moved) {
    moved = tryChainMove(schedule, l, data);
  }

 if (moved) {
  const { d: nd, h: nh } = moved;

  const { tBusy, cBusy } = rebuildBusy(schedule);

  if (
    teacherOk(l.teacher, nd, nh, tBusy, data) &&
    classesFree(l.classes, nd, nh, cBusy)
  ) {
    for (let c of l.classes) {
      if (!schedule[c]) schedule[c] = {};
      if (!schedule[c][nd]) schedule[c][nd] = {};
      schedule[c][nd][nh] = l;
    }

    break outer;
  }
}
  continue;
}
    // ✅ NOWE
const { tBusy, cBusy } = rebuildBusy(schedule);

if (
  !teacherOk(l.teacher, d, h, tBusy, data) ||
  !classesFree(l.classes, d, h, cBusy)
) continue;
        

        for (let c of l.classes) {
          if (!schedule[c]) schedule[c] = {};
          if (!schedule[c][d]) schedule[c][d] = {};
          schedule[c][d][h] = l;
        }

        break outer;
      }
    }
  if (process.env.DEBUG) {
  console.log("❌ NIE DA SIĘ WSTAWIĆ:", l.subject, l.classes);
}
  }
// 🔥 DRUGA FALA — agresywna próba wstawienia brakujących lekcji
for (let i = 0; i < 3; i++) {

  // przelicz co nadal brakuje
  const placed = new Set();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        placed.add(schedule[cls][d][h].id);
      }
    }
  }

  const stillMissing = lessons.filter(l => !placed.has(l.id));

  for (let l of stillMissing) {

    const moved = tryChainMove(schedule, l, data, 10);

    if (!moved) continue;

    const { d, h } = moved;

    const { tBusy, cBusy } = rebuildBusy(schedule);

    // 🔒 ZAWSZE sprawdzamy nauczyciela i klasy
    if (
      teacherOk(l.teacher, d, h, tBusy, data) &&
      classesFree(l.classes, d, h, cBusy)
    ) {
      for (let c of l.classes) {
        if (!schedule[c]) schedule[c] = {};
        if (!schedule[c][d]) schedule[c][d] = {};
        schedule[c][d][h] = l;
      }
    }
  }
}
  return schedule;
}


// ===== MAIN =====
async function generateSchedule(data) {
let lessons = getLessons(data);
  let stagnation = 0;
let lastBestMissing = Infinity;
  let globalBest = null;
  let globalScore = -9999;

  const start = Date.now();
  let iter = 0;

  while (Date.now() - start < TIME_LIMIT) {
    iter++;
console.log("ITER START", iter);
if (
  stagnation > 30 &&
  lastBestMissing > 8 &&
  iter % 10 === 0 &&
  Date.now() - start > 60000
)  {
  console.log("🚨 HARD RESET");

lessons = getLessons(data);
  stagnation = 0;
  lastBestMissing = Infinity;

  continue;
}
    // 🔥 KROK 11 — restart bias


const shuffled = [...lessons];

if (Math.random() < 0.3) {
  shuffled.sort(() => Math.random() - 0.5);
}    let s;

if (globalBest && globalBest.schedule && Math.random() < 0.5) {
  s = JSON.parse(JSON.stringify(globalBest.schedule));

  // 🔥 KLUCZ — rozwal go lekko
  s = randomDestroy(s, 0.2);

} else {
  s = construct(shuffled, data);console.log("AFTER CONSTRUCT");
}    if (Math.random() < 0.3) {
  s = trySwap(s, data);
}

// 🔥 co kilka iteracji rozwal trochę plan
if (iter % 5 === 0) {
  let strength = 0.3;

  if (globalBest && globalBest.missing < 15) strength = 0.2;
  if (globalBest && globalBest.missing < 8) strength = 0.1;

  s = randomDestroy(s, strength);
}   let { best, bestScore } = improve(s, data, 8000);
    // 🔥 AUTOMATYCZNY SOFT IMPROVE gdy dużo missing
if (countMissing(best, lessons) > 20) {
  let s2 = JSON.parse(JSON.stringify(best));

  s2 = randomDestroy(s2, 0.25);
  s2 = repairMissing(s2, lessons, data);

  const newMissing = countMissing(s2, lessons);

  if (newMissing < countMissing(best, lessons)) {
    console.log("⚡ AUTO SOFT:", newMissing);
    best = s2;
  }
}

let candidate = best;
let missing = countMissing(candidate, lessons);
    const originalMissing = missing; // 🔥 KLUCZ
    
console.log("🧠 ORIGINAL:", originalMissing, "NOW:", missing);
    // 🔥 FIX 4 — TUTAJ


if (missing <= 3) {
  console.log("🧊 FREEZE MODE:", missing);

} else if (
  globalBest &&
  missing > globalBest.missing &&
  Math.random() > 0.3
) {
  continue;

} else {
  if (Math.random() < 0.3) {
    s = trySwap(s, data);
  }
}

// 🔥 KOŃCÓWKA — repair
if (missing > 0 && missing <= 20) {
  const before = missing;

  const repaired = repairMissing(
    JSON.parse(JSON.stringify(candidate)),
    lessons,
    data
  );

  const after = countMissing(repaired, lessons);

  if (after <= before) {
    candidate = repaired;
    missing = after;
  }
}
    // 🔥 FIX 4 — DOŁÓŻ IMPROVE NA KOŃCU
if (missing <= 10) {
  const before = missing;

  const improved = improve(candidate, data, 3000);
  const after = countMissing(improved.best, lessons);

  if (after <= before) {
    candidate = improved.best;
    missing = after;
  }
}
   
       if (originalMissing > 0 && originalMissing <= 5) {
if (missing === 0) {
    console.log("🏁 SKIP FINAL PUSH — already perfect");

  } else {
         let s2 = JSON.parse(JSON.stringify(candidate));
         
console.log("💣 ENTER FINAL PUSH:", missing);
     
  // 🔍 znajdź brakujące lekcje
  const placedIds = new Set();

  for (let cls in s2) {
    for (let d in s2[cls]) {
      for (let h in s2[cls][d]) {
        placedIds.add(s2[cls][d][h].id);
      }
    }
  }

const missingLessons = lessons
  .filter(l => !placedIds.has(l.id))
  .slice(0, 3);
  // 🔥 1. usuń DUŻO miejsca wokół nich
for (let l of [...missingLessons].sort(() => Math.random() - 0.5)) {
  s2 = destroyAroundLesson(s2, l);

// 🔥 tylko czasami rozwal
if (Math.random() < 0.4) {
  s2 = randomDestroy(s2, 0.15);
} }

  // 🔥 2. spróbuj chainMove z dużą głębokością
for (let pass = 0; pass < 2; pass++) {

const shuffled = [...missingLessons].sort((a, b) => {
  const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    return (ta?.availability.length || 0) - (tb?.availability.length || 0);
  });

  for (let l of shuffled) {

    let moved = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      console.log("🎯 TRY FINAL:", l.subject, l.teacher);
      moved = tryChainMove(s2, l, data, 10, new Set());
      if (moved) break;
    }

   if (moved) {
  const { d, h } = moved;

  const temp = JSON.parse(JSON.stringify(s2));

// 🔥 symuluj wstawienie
for (let c of l.classes) {
  if (!temp[c]) temp[c] = {};
  if (!temp[c][d]) temp[c][d] = {};
  temp[c][d][h] = l;
}

const { tBusy, cBusy } = rebuildBusy(temp);

let valid = true;

if (!teacherOk(l.teacher, d, h, tBusy, data)) valid = false;
if (!classesFree(l.classes, d, h, cBusy)) valid = false;

if (!valid) continue;
const { tBusy: realT, cBusy: realC } = rebuildBusy(s2);
if (
  !teacherOk(l.teacher, d, h, realT, data) ||
  !classesFree(l.classes, d, h, realC)
) {
  continue;
}
        for (let c of l.classes) {
          if (!s2[c]) s2[c] = {};
          if (!s2[c][d]) s2[c][d] = {};
          s2[c][d][h] = l;
        }
      }
    }
 
  }
     const newMissing = countMissing(s2, lessons);

  if (newMissing < missing) {
    console.log("💥 FINAL PUSH:", newMissing);
    candidate = s2;
    missing = newMissing;
  }
}


}
    // 🔥 FINAL FIX MODE
if (missing > 3 && missing <= 5) {
  let s2 = JSON.parse(JSON.stringify(candidate));

  // 🔥 usuń tylko problematyczne lekcje
  const placedIds = new Set();

  for (let cls in s2) {
    for (let d in s2[cls]) {
      for (let h in s2[cls][d]) {
        placedIds.add(s2[cls][d][h].id);
      }
    }
  }

  const missingLessons = lessons.filter(l => !placedIds.has(l.id));

  // 🔥 usuń trochę miejsca wokół nich
  s2 = randomDestroy(s2, 0.15);

  // 🔥 próbuj je wstawić agresywnie
  for (let l of missingLessons) {
    let depth = 4;

if (missing < 15) depth = 6;
if (missing < 8) depth = 8;
if (missing < 4) depth = 12;

const moved = tryChainMove(s2, l, data, depth);

    if (moved) {
      const { d, h } = moved;

      const { tBusy, cBusy } = rebuildBusy(s2);

      if (
        teacherOk(l.teacher, d, h, tBusy, data) &&
        classesFree(l.classes, d, h, cBusy)
      ) {
        for (let c of l.classes) {
          if (!s2[c]) s2[c] = {};
          if (!s2[c][d]) s2[c][d] = {};
          s2[c][d][h] = l;
        }
      }
    }
  }

  const newMissing = countMissing(s2, lessons);

  if (newMissing < missing) {
    console.log("🎯 FINAL FIX:", newMissing);
    candidate = s2;
    missing = newMissing;
  }
}

    if (missing < lastBestMissing) {
  lastBestMissing = missing;
  stagnation = 0;
} else {
  stagnation++;
}
    const teacherErrors2 = validateTeachers(candidate, data);

if (teacherErrors2.length > 0) {
  console.log("⚠️ INVALID AFTER FIX — revert");

  candidate = best;
  missing = countMissing(candidate, lessons);

} else {
  // OK
}
    
if (
 !globalBest ||
  missing < globalBest.missing ||
  (missing === globalBest.missing && Math.random() < 0.2) ||
  (missing === 0 && globalBest.missing === 0 && bestScore > globalBest.score)
) {
  globalBest = {
    schedule: candidate,
    missing,
    score: bestScore
  };

  console.log("🔥 BEST:", "missing:", missing, "score:", bestScore);
}
   if (globalBest && globalBest.missing <= 1 && missing > globalBest.missing) {
  console.log("⏭️ SKIP — gorsze niż best");
     continue;
}

   saveProgress({
  percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
  iter,
  score: globalBest?.score || globalScore
});

if (
  stagnation > 10 &&
  lastBestMissing > 0
) {
  console.log("🧪 SOFT RESET");

  if (globalBest && globalBest.schedule) {
    let s = JSON.parse(JSON.stringify(globalBest.schedule));

    // 🔥 LEKKIE ROZWALENIE (nie 50%!)
    let strength = 0.3;

    if (globalBest.missing < 15) strength = 0.2;
    if (globalBest.missing < 8) strength = 0.1;

// 🔥 bardziej agresywne niszczenie gdy stuck
let boost = 0;

if (stagnation > 20) boost = 0.15;
if (stagnation > 40) boost = 0.25;

s = randomDestroy(s, strength + boost);
    // 🔥 napraw
    s = repairMissing(s, lessons, data);

    const newMissing = countMissing(s, lessons);

    if (
  newMissing < globalBest.missing ||
  (newMissing === globalBest.missing && Math.random() < 0.3)
) {
      globalBest = {
        schedule: s,
        missing: newMissing,
        score: score(s)
      };

      console.log("🧪 SOFT IMPROVE:", newMissing);
    }
  }

  stagnation = 0;
}
  }

  saveProgress({ percent: 100 });

validate(globalBest.schedule, lessons);
const teacherErrors = validateTeachers(globalBest.schedule, data);
if (teacherErrors.length) {
  console.log("🚨 BŁĘDY NAUCZYCIELI:");
  teacherErrors.forEach(e => console.log(e));
}

return {
  status: "OK",
  score: globalBest.score,
  missing: globalBest.missing,
  schedule: globalBest.schedule
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

if (!t) {
  console.log("💀 NIEZNANY NAUCZYCIEL:", l.teacher);
  continue;
}

if (!t.availability.includes(d + "_" + h)) {
          errors.push(`❌ ${l.teacher} brak dostępności ${d}_${h}`);
        }
      }
    }
  }

  return errors;
}
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
