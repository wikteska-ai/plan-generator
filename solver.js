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
        : `${l.class}_${l.subject}`;

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
function construct(lessons, data) {

  let s = {}, tBusy = {}, cBusy = {};

  for (let l of lessons) {

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
    } else {

      // 🔥 FALLBACK (NAJWAŻNIEJSZY FIX)
      outer:
      for (let d of DAYS) {
        for (let h of HOURS) {

          if (teacherOk(l.teacher,d,h,tBusy,data) &&
              classesFree(l.classes,d,h,cBusy)) {

            place(l, d, h, s, tBusy, cBusy);
            break outer;
          }
        }
      }
    }
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
          penalty += 200;
        }
      }

      // 🔥 START DNIA
      const first = Math.min(...hours);
      if (first === 2) penalty += 40;
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
  let count = 0;

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      count += Object.keys(schedule[cls][d]).length;
    }
  }

  return count;
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
    // 🔥 BIG MOVE (zamiana całych dni)
if (Math.random() < 0.15) {

  const classes = Object.keys(next);
  const c1 = classes[Math.floor(Math.random()*classes.length)];
  const c2 = classes[Math.floor(Math.random()*classes.length)];

  if (c1 === c2) continue;

  const d = DAYS[Math.floor(Math.random()*5)];

  const day1 = next[c1]?.[d];
  const day2 = next[c2]?.[d];

  if (!day1 || !day2) continue;

  // zamiana
  next[c1][d] = day2;
  next[c2][d] = day1;
}
// 🔥 STRONG SHIFT DOWN (usuwa okienka agresywnie)
if (Math.random() < 0.4) {

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
  const classes = Object.keys(next);
  const c = classes[Math.floor(Math.random()*classes.length)];

  const days = Object.keys(next[c] || {});
  if (!days.length) continue;

  const d = days[Math.floor(Math.random()*days.length)];

  const hours = Object.keys(next[c][d] || {});
  if (!hours.length) continue;

  const h = Number(hours[Math.floor(Math.random()*hours.length)]);
  const lesson = next[c][d][h];

  const d2 = DAYS[Math.floor(Math.random()*5)];
  const h2 = HOURS[Math.floor(Math.random()*8)];

  // 🔒 SPRAWDZENIE KONFLIKTU (WAŻNE!)
  let conflict = false;

  for (let cc of lesson.classes) {
    if (next[cc]?.[d2]?.[h2]) {
      conflict = true;
      break;
    }
  }

  if (!conflict) {
    delete next[c][d][h];

    if (!next[c][d2]) next[c][d2] = {};
    next[c][d2][h2] = lesson;
  }

} else {

  // ===== SWAP =====
  const classes = Object.keys(next);
  const c = classes[Math.floor(Math.random()*classes.length)];
  const d = DAYS[Math.floor(Math.random()*5)];

  const hours = Object.keys(next[c]?.[d] || {});
  if (hours.length < 2) continue;

  const h1 = Number(hours[0]);
  const h2 = Number(hours[1]);

  const temp = next[c][d][h1];
  next[c][d][h1] = next[c][d][h2];
  next[c][d][h2] = temp;
}
const before = countLessons(current);
const after = countLessons(next);

// ❌ jeśli zgubił lekcje → odrzuć ruch
if (after < before) continue;

let sc = score(next);
    if (sc > currentScore || Math.random() < 0.15) {
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

  if (bestScore > globalScore) {
    globalScore = bestScore;
    globalBest = best;

    console.log("🔥 Nowy najlepszy score:", globalScore);
  }

  saveProgress({
    percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
    iter,
    score: globalScore
  });
}
  saveProgress({ percent: 100 });

  return {
    status: "OK",
    score: globalScore,
    schedule: globalBest,
    placed: lessons.length,
    total: lessons.length
  };
}

export { generateSchedule };
