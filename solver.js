import fs from "fs";

const TIME_LIMIT = 120000;

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== PROGRESS =====
function saveProgress(p) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(p));
  } catch (e) {}
}

// ===== LEKCJE =====
function getLessons(data) {

  const out = [];

  data.lessons.forEach((l, i) => {

    for (let h = 0; h < (l.hours || 0); h++) {

      out.push({
        id: i + "_" + h,
        subject: l.subject,
        teacher: l.teacher,
        classes: l.group ? [] : [l.class], // grupy uproszczone żeby nie crashowało
      });
    }
  });

  return out;
}

// ===== CHECK =====
function canPlace(l, d, h, s, tBusy, cBusy, data) {

  const teacher = data.teachers.find(x => x.id === l.teacher);
  if (!teacher) return false;

  if (!teacher.availability.includes(d + "_" + h)) return false;

  if (tBusy[l.teacher + "_" + d + "_" + h]) return false;

  for (let c of l.classes) {
    if (cBusy[c + "_" + d + "_" + h]) return false;
  }

  return true;
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

// ===== KONSTRUKCJA =====
function construct(lessons, data) {

  let s = {}, tBusy = {}, cBusy = {};

  for (let l of lessons.sort(() => Math.random() - 0.5)) {

    let best = null;
    let bestScore = -999;

    for (let d of DAYS) {
      for (let h of HOURS) {

        if (!canPlace(l, d, h, s, tBusy, cBusy, data)) continue;

        let score = 0;

        // 🔥 poranek
        if (h === 1) score += 10;
        if (h === 2) score += 7;
        if (h === 3) score += 5;

        if (h >= 7) score -= 5;

        const day = s[l.classes[0]]?.[d] || {};
        score -= Object.keys(day).length;

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

// ===== SCORE =====
function score(s) {

  let penalty = 0;

  for (let cls in s) {

    for (let d of DAYS) {

      const day = s[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length === 0) penalty += 50;
      if (hours.length < 4) penalty += 20;

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 40;
      }

      if (hours.length > 0 && Math.min(...hours) > 2) penalty += 30;
    }
  }

  return -penalty;
}

// ===== MOVE =====
function move(s) {

  const classes = Object.keys(s);
  if (!classes.length) return;

  const c = classes[Math.floor(Math.random()*classes.length)];
  const d = Object.keys(s[c] || {})[0];
  if (!d) return;

  const h = Object.keys(s[c][d])[0];
  if (!h) return;

  const l = s[c][d][h];

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

  let best = null;
  let bestScore = -999;

  const start = Date.now();
  let iter = 0;

  while (Date.now() - start < TIME_LIMIT) {

    iter++;

    let s = construct(lessons, data);

    const { best: improved, bestScore: sc } = improve(s, data, 500);

    if (sc > bestScore) {
      bestScore = sc;
      best = improved;
    }

    if (iter % 2 === 0) {
      saveProgress({
        percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
        iter,
        score: bestScore
      });
    }
  }

  if (!best) best = {};

  let placed = 0;
  for (let c in best) {
    for (let d in best[c]) {
      placed += Object.keys(best[c][d]).length;
    }
  }

  saveProgress({ percent: 100 });

  return {
    status: "OK",
    placed,
    total: lessons.length,
    elapsed: Math.floor((Date.now()-start)/1000),
    schedule: best
  };
}

export { generateSchedule };
