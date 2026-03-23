import fs from "fs";

const TIME_LIMIT = 120000;

function saveProgress(p) {
  try { fs.writeFileSync("progress.json", JSON.stringify(p)); } catch {}
}

// 📦 lekcje
function getLessons(data) {
  let out = [];
  data.lessons.forEach((l, i) => {
    for (let h = 0; h < l.hours; h++) {
      out.push({ id: i + "_" + h, ...l });
    }
  });
  return out;
}

// 📌 place
function place(l, d, h, s, tBusy, cBusy) {

  if (!s[l.class]) s[l.class] = {};
  if (!s[l.class][d]) s[l.class][d] = {};

  s[l.class][d][h] = l;

  tBusy[l.teacher + "_" + d + "_" + h] = true;
  cBusy[l.class + "_" + d + "_" + h] = true;
}

// ❌ remove
function remove(l, d, h, s, tBusy, cBusy) {
  delete s[l.class][d][h];
  delete tBusy[l.teacher + "_" + d + "_" + h];
  delete cBusy[l.class + "_" + d + "_" + h];
}

// 🧠 sprawdzanie (luźne!)
function canPlace(l, d, h, s, tBusy, cBusy, data) {

  const t = data.teachers.find(x => x.id === l.teacher);
  if (!t.availability.includes(d + "_" + h)) return false;

  if (tBusy[l.teacher + "_" + d + "_" + h]) return false;
  if (cBusy[l.class + "_" + d + "_" + h]) return false;

  return true;
}

// 🔵 ETAP 1 — wrzuć wszystko
function randomFill(lessons, data) {

  let s = {}, tBusy = {}, cBusy = {};

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  for (let l of lessons.sort(() => Math.random() - 0.5)) {

    let placed = false;

    for (let i = 0; i < 50; i++) {

      const d = days[Math.floor(Math.random()*5)];
      const h = hours[Math.floor(Math.random()*8)];

      if (canPlace(l, d, h, s, tBusy, cBusy, data)) {
        place(l, d, h, s, tBusy, cBusy);
        placed = true;
        break;
      }
    }

    if (!placed) return null;
  }

  return { s, tBusy, cBusy };
}

// 🟡 ETAP 2 — usuwanie okienek
function fixGaps(s) {

  for (let cls in s) {
    for (let d in s[cls]) {

      let hours = Object.keys(s[cls][d]).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {

          const lesson = s[cls][d][hours[i]];
          delete s[cls][d][hours[i]];

          s[cls][d][hours[i-1]+1] = lesson;
        }
      }
    }
  }
}

// 🔴 ETAP 3 — swap globalny
function randomSwap(s) {

  const classes = Object.keys(s);

  const cls1 = classes[Math.floor(Math.random()*classes.length)];
  const cls2 = classes[Math.floor(Math.random()*classes.length)];

  const d1 = Object.keys(s[cls1] || {})[0];
  const d2 = Object.keys(s[cls2] || {})[0];

  if (!d1 || !d2) return;

  const h1 = Object.keys(s[cls1][d1])[0];
  const h2 = Object.keys(s[cls2][d2])[0];

  if (!h1 || !h2) return;

  const l1 = s[cls1][d1][h1];
  const l2 = s[cls2][d2][h2];

  s[cls1][d1][h1] = l2;
  s[cls2][d2][h2] = l1;
}

// 🧠 OCENA (KLUCZ 🔥)
function score(s) {

  let penalty = 0;

  for (let cls in s) {

    for (let d of ["Mon","Tue","Wed","Thu","Fri"]) {

      const day = s[cls][d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length === 0) penalty += 50;

      if (hours.length < 4) penalty += 20;

      if (hours.length > 7) penalty += 10;

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 15;
      }

      // klasy 1–3
      if (cls <= 3 && hours.length > 0) {
        if (Math.min(...hours) > 2) penalty += 20;
      }
    }
  }

  return -penalty;
}

// 🧠 MAIN
async function generateSchedule(data) {

  const lessons = getLessons(data);

  let best = null;
  let bestScore = -999;

  const start = Date.now();
  let iter = 0;

  while (Date.now() - start < TIME_LIMIT) {

    const base = randomFill(lessons, data);
    if (!base) continue;

    let { s } = base;

    // 🔁 poprawki
    for (let i = 0; i < 200; i++) {
      fixGaps(s);
      randomSwap(s);
    }

    const sc = score(s);

    if (sc > bestScore) {
      bestScore = sc;
      best = JSON.parse(JSON.stringify(s));
    }

    iter++;

    if (iter % 5 === 0) {
      saveProgress({
        percent: Math.min(99, Math.floor((Date.now()-start)/1000)),
        score: bestScore,
        iter
      });
    }
  }

  // 📊 liczenie
  let placed = 0;
  for (let cls in best) {
    for (let d in best[cls]) {
      placed += Object.keys(best[cls][d]).length;
    }
  }

  return {
    status: "OK",
    placed,
    total: lessons.length,
    elapsed: Math.floor((Date.now()-start)/1000),
    schedule: best
  };
}

export { generateSchedule };
