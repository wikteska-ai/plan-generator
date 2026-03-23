import fs from "fs";

const TIME_LIMIT = 120000;

function saveProgress(p) {
  try { fs.writeFileSync("progress.json", JSON.stringify(p)); } catch {}
}

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== TWOJA ORYGINALNA LOGIKA LEKCJI (BEZ ZMIAN) =====
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
        hours: l.hours
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

  return out;
}

// ===== BEZPIECZNE CHECK =====
function canPlace(l, d, h, s, tBusy, cBusy, data) {

  const t = data.teachers.find(x => x.id === l.teacher);
  if (!t) return false;

  if (!t.availability.includes(d+"_"+h)) return false;
  if (tBusy[l.teacher+"_"+d+"_"+h]) return false;

  for (let c of l.classes) {
    if (cBusy[c+"_"+d+"_"+h]) return false;
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
}

// ===== KONSTRUKCJA (POPRAWIONA ALE BEZPIECZNA) =====
function construct(lessons, data) {

  let s = {}, tBusy = {}, cBusy = {};

  const shuffled = [...lessons].sort(() => Math.random() - 0.5);

  for (let l of shuffled) {

    let best = null;
    let bestScore = -999;

    for (let d of DAYS) {
      for (let h of HOURS) {

        if (!canPlace(l,d,h,s,tBusy,cBusy,data)) continue;

        let score = 0;

        // 🔥 mocny poranek
        if (h === 1) score += 15;
        if (h === 2) score += 10;
        if (h === 3) score += 6;

        if (h >= 7) score -= 5;

        for (let c of l.classes) {
          const day = s[c]?.[d] || {};
          score -= Object.keys(day).length;
        }

        if (score > bestScore) {
          bestScore = score;
          best = { d, h };
        }
      }
    }

    if (best) {
      place(l, best.d, best.h, s, tBusy, cBusy);
    }
  }

  return s;
}

// ===== SCORE (MOCNIEJSZY) =====
function score(s) {

  let penalty = 0;

  for (let cls in s) {

    for (let d of DAYS) {

      const day = s[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length === 0) penalty += 100;
      if (hours.length < 4) penalty += 50;
      if (hours.length > 7) penalty += 30;

      // 🔥 OKIENKA MOCNA KARA
      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 80;
      }

      // start
      if (hours.length > 0 && Math.min(...hours) > 2) {
        penalty += 60;
      }
    }
  }

  return -penalty;
}

// ===== SAFE MOVE =====
function move(s) {

  const classes = Object.keys(s);
  if (!classes.length) return;

  const c = classes[Math.floor(Math.random()*classes.length)];
  const d = Object.keys(s[c] || {})[0];
  if (!d) return;

  const h = Object.keys(s[c][d])[0];
  if (!h) return;

  const l = s[c][d][h];
  if (!l) return;

  const d2 = DAYS[Math.floor(Math.random()*5)];
  const h2 = HOURS[Math.floor(Math.random()*8)];

  delete s[c][d][h];

  if (!s[c][d2]) s[c][d2] = {};
  s[c][d2][h2] = l;
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

    move(next);

    let sc = score(next);

    if (sc > currentScore || Math.random() < 0.2) {
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
  let globalScore = -999;

  const start = Date.now();
  let iter = 0;

  while (Date.now() - start < TIME_LIMIT) {

    iter++;

    let s = construct(lessons, data);

    const { best, bestScore } = improve(s, data, 1000);

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

  if (!globalBest) globalBest = {};

  let placed = 0;

  for (let c in globalBest) {
    for (let d in globalBest[c]) {
      placed += Object.keys(globalBest[c][d]).length;
    }
  }

  saveProgress({ percent: 100 });

  return {
    status: "OK",
    placed,
    total: lessons.length,
    elapsed: Math.floor((Date.now()-start)/1000),
    schedule: globalBest
  };
}

export { generateSchedule };
