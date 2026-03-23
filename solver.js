import fs from "fs";

const TIME_LIMIT = 120000;

// 📡 progress
function saveProgress(p) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(p));
  } catch {}
}

// 📦 LEKCJE (edu fix)
function getLessons(data) {

  let out = [];

  data.lessons.forEach((l, i) => {

    for (let h = 0; h < l.hours; h++) {
      out.push({
        id: i + "_" + h,
        ...l
      });
    }

  });

  return out;
}

// 🧠 HARD CHECK (LUŹNY!)
function canPlace(l, d, h, s, tBusy, cBusy, data) {

  const t = data.teachers.find(x => x.id === l.teacher);
  if (!t || !t.availability.includes(d + "_" + h)) return false;

  if (tBusy[l.teacher + "_" + d + "_" + h]) return false;

  if (cBusy[l.class + "_" + d + "_" + h]) return false;

  return true;
}

// 📌 PLACE
function place(l, d, h, s, tBusy, cBusy) {

  tBusy[l.teacher + "_" + d + "_" + h] = true;
  cBusy[l.class + "_" + d + "_" + h] = true;

  if (!s[l.class]) s[l.class] = {};
  if (!s[l.class][d]) s[l.class][d] = {};

  s[l.class][d][h] = l;
}

// ❌ REMOVE
function remove(l, d, h, s, tBusy, cBusy) {

  delete tBusy[l.teacher + "_" + d + "_" + h];
  delete cBusy[l.class + "_" + d + "_" + h];
  delete s[l.class][d][h];
}

// 🧠 FAZA 1 — trudne
function placeHard(lessons, s, tBusy, cBusy, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  for (let l of lessons) {

    let placed = false;

    for (let d of days) {
      for (let h of hours) {

        if (canPlace(l, d, h, s, tBusy, cBusy, data)) {
          place(l, d, h, s, tBusy, cBusy);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
  }
}

// 🧠 FAZA 2 — greedy
function fillAll(lessons, s, tBusy, cBusy, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  let notPlaced = [];

  for (let l of lessons) {

    if (s[l.class]) {
      const already = Object.values(s[l.class]).flatMap(d => Object.values(d));
      if (already.find(x => x.id === l.id)) continue;
    }

    let best = null;
    let score = -999;

    for (let d of days) {
      for (let h of hours) {

        if (!canPlace(l, d, h, s, tBusy, cBusy, data)) continue;

        let sc = 0;

        const day = s[l.class]?.[d] || {};
        sc -= Object.keys(day).length;

        if (h >= 2 && h <= 6) sc += 2;

        if (sc > score) {
          score = sc;
          best = { d, h };
        }
      }
    }

    if (best) {
      place(l, best.d, best.h, s, tBusy, cBusy);
    } else {
      notPlaced.push(l);
    }
  }

  return notPlaced;
}

// 🔥 FAZA 3 — naprawa
function improve(schedule) {

  for (let cls in schedule) {

    for (let d in schedule[cls]) {

      const hours = Object.keys(schedule[cls][d]).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {

        if (hours[i] !== hours[i-1] + 1) {

          // próbuj przesunąć
          delete schedule[cls][d][hours[i]];
          schedule[cls][d][hours[i-1]+1] = schedule[cls][d][hours[i]];
        }
      }
    }
  }
}

// 🧠 SCORE (jak człowiek ocenia plan)
function score(schedule) {

  let penalty = 0;

  for (let cls in schedule) {

    for (let d in schedule[cls]) {

      const hours = Object.keys(schedule[cls][d]).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 10;
      }

      if (hours.length < 4) penalty += 20;
      if (hours.length > 7) penalty += 10;
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

    let s = {};
    let tBusy = {};
    let cBusy = {};

    // 🔵 FAZA 1
    const hard = lessons.filter(l => {
      const t = data.teachers.find(x => x.id === l.teacher);
      return (t?.availability.length || 999) < 10;
    });

    placeHard(hard, s, tBusy, cBusy, data);

    // 🟡 FAZA 2
    const notPlaced = fillAll(lessons, s, tBusy, cBusy, data);

    // 🔴 FAZA 3
    improve(s);

    const sc = score(s);

    if (sc > bestScore) {
      bestScore = sc;
      best = JSON.parse(JSON.stringify(s));
    }

    iter++;

    if (iter % 5 === 0) {
      saveProgress({
        percent: Math.min(99, Math.floor((Date.now() - start)/1000)),
        bestScore,
        iter
      });
    }
  }

  saveProgress({ percent: 100 });

  return {
    status: "OK",
    schedule: best
  };
}

export { generateSchedule };
