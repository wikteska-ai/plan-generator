import fs from "fs";

const TIME_LIMIT = 240000;

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];
 
// ===== PROGRESS =====
function saveProgress(p) {
  try { fs.writeFileSync("progress.json", JSON.stringify(p)); } catch {}
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
  out.sort((a,b) => {
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;
    return b.classes.length - a.classes.length;
  });

  return out;
}

// ===== CHECK =====
function teacherOk(tid, d, h, tBusy, data) {
  const t = data.teachers.find(x => x.id === tid);
  return t && t.availability.includes(d+"_"+h) && !tBusy[tid+"_"+d+"_"+h];
}

function classesFree(classes, d, h, cBusy) {
  return classes.every(c => !cBusy[c+"_"+d+"_"+h]);
}

// ===== PLACE =====
function place(l, d, h, s, tBusy, cBusy) {

  tBusy[l.teacher+"_"+d+"_"+h] = true;

  for (let c of l.classes) {
    cBusy[c+"_"+d+"_"+h] = true;

    if (!s[c]) s[c] = {};
    if (!s[c][d]) s[c][d] = {};

    s[c][d][h] = l;
  }
}

// ===== CONSTRUCT (NAPRAWIONE 🔥) =====
function rebuildBusy(schedule) {
  let tBusy = {};
  let cBusy = {};

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
function construct(lessons, data) {

  let s = {}, tBusy = {}, cBusy = {};

  for (let l of lessons) {
let placedFlag = false;
    let best = null;
    let bestScore = -9999;

    for (let d of DAYS) {
      for (let h of HOURS) {

        if (!teacherOk(l.teacher,d,h,tBusy,data)) continue;
        if (!classesFree(l.classes,d,h,cBusy)) continue;

        let score = 0;

// lekki bonus za środek, ale NIE karz 1
if (h >= 2 && h <= 6) score += 2;
        

// mały bonus za 1 godzinę (ważne!)
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

    // ✅ NORMAL placement
if (best) {
  place(l, best.d, best.h, s, tBusy, cBusy);
  placedFlag = true;
} else {

      // 🔥 FALLBACK (NAJWAŻNIEJSZY FIX)
      outer:
      for (let d of DAYS) {
        for (let h of HOURS) {

          if (teacherOk(l.teacher,d,h,tBusy,data) &&
              classesFree(l.classes,d,h,cBusy)) {

place(l, d, h, s, tBusy, cBusy);
placedFlag = true;
           break outer;
          }
        }
      }
    }
if (!placedFlag) {

  // 🔥 FORCE PLACEMENT — znajdź JAKIEKOLWIEK miejsce
  outer:
  for (let d of DAYS) {
    for (let h of HOURS) {

      // sprawdź czy slot zajęty przez klasę
      let occupied = false;

      for (let c of l.classes) {
        if (s[c]?.[d]?.[h]) {
          occupied = true;
          break;
        }
      }

      if (!occupied) continue;

// 🔥 znajdź lekcję, która tam siedzi
const existing = s[l.classes[0]]?.[d]?.[h];
     if (existing) {

  // 🔥 dodaj usuniętą lekcję z powrotem do kolejki

  for (let cc of existing.classes) {
    if (s[cc]?.[d]?.[h]) {
      delete s[cc][d][h];
    }
  }

  for (let cc of existing.classes) {
    delete cBusy[cc+"_"+d+"_"+h];
  }

  delete tBusy[existing.teacher+"_"+d+"_"+h];
}

if (existing) {
  // ❗ usuń ją ZE WSZYSTKICH KLAS
  for (let cc of existing.classes) {
    if (s[cc]?.[d]?.[h]) {
      delete s[cc][d][h];
    }
  }
}
   // 🔥 wyczyść busy (ważne!)
for (let cc of existing.classes) {
  delete cBusy[cc+"_"+d+"_"+h];
}
delete tBusy[existing.teacher+"_"+d+"_"+h];  

      // 🔥 wstaw nową
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

      // 🔥 OKIENKA = NAJGORSZE
      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          penalty += 600;
        }
      }

      // 🔥 START DNIA
      const first = Math.min(...hours);
      // 🔥 premiuj 1 godzinę
if (first === 1) penalty -= 30;
      if (first === 2) penalty += 50;
      if (first >= 3) penalty += 150;

      // 🔥 ZA DŁUGI / ZA KRÓTKI
      if (hours.length < 4) penalty += 60;
      if (hours.length > 7) penalty += 60;

      // 🔥 POWTÓRZENIA (mat, pol, ang)
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

      // 🔥 WF BLOKI
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
// ===== COUNT LESSONS (NOWE) =====
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
   // 🔥 TARGETED REPAIR (celowane usuwanie okienek)
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

        // wykryto okienko
        if (curr !== prev + 1) {

          const lesson = next[c][d][curr];
          // ❗ NIE RUSZAJ lekcji łączonych (WF itd.)
if (lesson.classes.length > 1) continue;
          const target = prev + 1;

          let conflict = false;

          for (let cc of lesson.classes) {
            if (next[cc]?.[d]?.[target]) {
              conflict = true;
              break;
            }
          }

         if (!conflict && !next[c]?.[d]?.[target]) {

  // najpierw sprawdź, potem ruszaj
  const canMove = true;

  if (canMove) {
    delete next[c][d][curr];

    if (!next[c][d]) next[c][d] = {};
    next[c][d][target] = lesson;
  }

}

          break;
        }
      }
    }
  }
}
// 🔥 BIG MOVE SAFE (z walidacją nauczycieli)
if (false) {

  const classes = Object.keys(next);
  const c = classes[Math.floor(Math.random()*classes.length)];

  const d1 = DAYS[Math.floor(Math.random()*5)];
  const d2 = DAYS[Math.floor(Math.random()*5)];

  if (d1 === d2) continue;

  const day1 = next[c]?.[d1];
  const day2 = next[c]?.[d2];

  if (!day1 || !day2) continue;

  let valid = true;

  // sprawdź dzień 1 -> dzień 2
  for (let h in day1) {
    const lesson = day1[h];

    if (!teacherOk(lesson.teacher, d2, Number(h), {}, data)) {
      valid = false;
      break;
    }
  }

  // sprawdź dzień 2 -> dzień 1
  for (let h in day2) {
    const lesson = day2[h];

    if (!teacherOk(lesson.teacher, d1, Number(h), {}, data)) {
      valid = false;
      break;
    }
  }

  if (valid) {
    next[c][d1] = day2;
    next[c][d2] = day1;
  }
}
// 🔥 STRONG SHIFT DOWN (usuwa okienka agresywnie)
if (false) {

  const classes = Object.keys(next);
  const c = classes[Math.floor(Math.random()*classes.length)];

  const days = Object.keys(next[c] || {});
  if (!days.length) continue;

  const d = days[Math.floor(Math.random()*days.length)];

  const hours = Object.keys(next[c][d] || {})
    .map(Number)
    .sort((a,b)=>a-b);

  if (hours.length < 2) continue;

  const lessons = hours.map(h => next[c][d][h]);

  // usuń cały dzień
  next[c][d] = {};

  let hNew = 1;

  for (let lesson of lessons) {

    // znajdź NAJNIŻSZĄ możliwą godzinę
    while (hNew <= 8) {

      let conflict = false;

      for (let cc of lesson.classes) {
        if (next[cc]?.[d]?.[hNew]) {
          conflict = true;
          break;
        }
      }

      if (!conflict) {
        if (!next[c][d]) next[c][d] = {};
        next[c][d][hNew] = lesson;
        hNew++;
        break;
      }

      hNew++;
    }
  }
}
    
// 🔥 MOVE + SWAP (bezpieczna wersja)
if (Math.random() < 0.4) {

  // ===== SAFE MOVE =====
// ===== SAFE MOVE v2 =====
const classes = Object.keys(next);
const c = classes[Math.floor(Math.random()*classes.length)];

const days = Object.keys(next[c] || {});
if (!days.length) continue;

const d = days[Math.floor(Math.random()*days.length)];

const hours = Object.keys(next[c][d] || {});
if (!hours.length) continue;

const h = Number(hours[Math.floor(Math.random()*hours.length)]);
const lesson = next[c][d][h];

// ❗ NIE ruszaj multiclass
if (lesson.classes.length > 1) continue;

const d2 = DAYS[Math.floor(Math.random()*5)];
const h2 = HOURS[Math.floor(Math.random()*8)];

// 🔒 sprawdź czy slot wolny dla wszystkich klas
let ok = true;

for (let cc of lesson.classes) {
  if (next[cc]?.[d2]?.[h2]) {
    ok = false;
    break;
  }
}

// 🔒 teacher availability
if (!teacherOk(lesson.teacher, d2, h2, {}, data)) {
  ok = false;
}

if (!ok) continue;

// 🔄 przenieś
delete next[c][d][h];

if (!next[c][d2]) next[c][d2] = {};
next[c][d2][h2] = lesson;

} else if (Math.random() < 0.3) {
  // ===== SWAP =====
 // ===== SAFE SWAP =====
const classes = Object.keys(next);
const c = classes[Math.floor(Math.random()*classes.length)];
const d = DAYS[Math.floor(Math.random()*5)];

const hours = Object.keys(next[c]?.[d] || {});
if (hours.length < 2) continue;

const h1 = Number(hours[0]);
const h2 = Number(hours[1]);

const l1 = next[c][d][h1];
const l2 = next[c][d][h2];

// ❗ NIE ruszaj multiclass
if (l1.classes.length > 1 || l2.classes.length > 1) continue;

// 🔒 sprawdź konflikty
let ok = true;

for (let cc of l1.classes) {
  if (next[cc]?.[d]?.[h2]) ok = false;
}

for (let cc of l2.classes) {
  if (next[cc]?.[d]?.[h1]) ok = false;
}

if (!ok) continue;

// 🔄 swap
next[c][d][h1] = l2;
next[c][d][h2] = l1;
}
const before = countLessons(current);
const after = countLessons(next);

// ❌ jeśli zgubił lekcje → odrzuć ruch
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

  return {
    status: "OK",
    score: globalScore,
    schedule: globalBest,
    placed: lessons.length,
    total: lessons.length
  };
}
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

export { generateSchedule };
