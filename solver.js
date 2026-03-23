// 🔥 PRODUCTION TIMETABLE ENGINE (DROP-IN REPLACEMENT)
// kompatybilny z Twoim API: generateSchedule(data)

import fs from "fs";

const TIME_LIMIT = 240000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== PROGRESS =====
function saveProgress(p) {
  try { fs.writeFileSync("progress.json", JSON.stringify(p)); } catch {}
}

// ===== LESSON BUILD (GRUPY + BLOKI) =====
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
    for (let h = 0; h < g.hours; h += g.block) {
      out.push({ id: i + "_" + h, ...g });
    }
  });

  // 🔥 SORTOWANIE (kluczowe)
  out.sort((a,b) => {
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;
    if (a.block !== b.block) return b.block - a.block;
    return b.classes.length - a.classes.length;
  });

  return out;
}

// ===== CHECKS =====
function teacherOk(tid, d, h, tBusy, data) {
  const t = data.teachers.find(x => x.id === tid);
  return t && t.availability.includes(d+"_"+h) && !tBusy[tid+"_"+d+"_"+h];
}

function classesFree(classes, d, h, cBusy) {
  return classes.every(c => !cBusy[c+"_"+d+"_"+h]);
}

function canPlace(l, d, h, tBusy, cBusy, data) {
  if (!teacherOk(l.teacher,d,h,tBusy,data)) return false;
  if (!classesFree(l.classes,d,h,cBusy)) return false;

  if (l.block === 2) {
    const h2 = h+1;
    if (!HOURS.includes(h2)) return false;
    if (!teacherOk(l.teacher,d,h2,tBusy,data)) return false;
    if (!classesFree(l.classes,d,h2,cBusy)) return false;
  }

  return true;
}

function place(l, d, h, s, tBusy, cBusy) {
  tBusy[l.teacher+"_"+d+"_"+h] = true;

  for (let c of l.classes) {
    cBusy[c+"_"+d+"_"+h] = true;

    if (!s[c]) s[c] = {};
    if (!s[c][d]) s[c][d] = {};

    s[c][d][h] = l;
  }

  if (l.block === 2) place(l, d, h+1, s, tBusy, cBusy);
}

// ===== CONSTRUCT (SMART) =====
function construct(lessons, data) {

  let s = {}, tBusy = {}, cBusy = {};

  for (let l of lessons) {

    let best = null;
    let bestScore = -9999;

    for (let d of DAYS) {
      for (let h of HOURS) {

        if (!canPlace(l,d,h,tBusy,cBusy,data)) continue;

        let score = 0;

        // środek dnia lepszy
        if (h >= 2 && h <= 6) score += 3;

        // rozkład
        for (let c of l.classes) {
          const day = s[c]?.[d] || {};
          score -= Object.keys(day).length;
        }

        // bonus za grupy
        if (l.group) score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = { d, h };
        }
      }
    }

    if (best) place(l, best.d, best.h, s, tBusy, cBusy);
  }

  return s;
}

// ===== SCORE (ULEPSZONY) =====
function score(s) {

  let penalty = 0;

  for (let cls in s) {

    for (let d of DAYS) {

      const day = s[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length === 0) penalty += 80;
      if (hours.length < 4) penalty += 30;
      if (hours.length > 7) penalty += 30;

      // okienka
      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 40;
      }

      // powtarzalność
      for (let i = 2; i < hours.length; i++) {
        const l1 = day[hours[i]]?.subject;
        const l2 = day[hours[i-1]]?.subject;
        const l3 = day[hours[i-2]]?.subject;

        if (l1 === l2 && l2 === l3) penalty += 25;
      }
    }
  }

  return -penalty;
}

// ===== IMPROVE (SIMULATED ANNEALING+) =====
function improve(s, data, ms) {

  let best = JSON.parse(JSON.stringify(s));
  let bestScore = score(best);

  let current = JSON.parse(JSON.stringify(s));
  let currentScore = bestScore;

  const start = Date.now();

  while (Date.now() - start < ms) {

    let next = JSON.parse(JSON.stringify(current));

    // losowa zamiana
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

    const { best, bestScore } = improve(s, data, 2000);

    if (bestScore > globalScore) {
      globalScore = bestScore;
      globalBest = best;
    }

    if (iter % 2 === 0) {
      saveProgress({
        percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
        iter,
        score: globalScore
      });
    }
  }

  saveProgress({ percent: 100 });

  return {
    status: "OK",
    score: globalScore,
    schedule: globalBest
  };
}

export { generateSchedule };
