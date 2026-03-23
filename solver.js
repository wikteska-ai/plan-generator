import fs from "fs";

const TIME_LIMIT = 280000; // 3 min

function saveProgress(p) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(p));
  } catch {}
}

// 📦 lekcje
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

// 🧠 sortowanie (NAJWAŻNIEJSZE)
function sortLessons(lessons, data) {

  return lessons.sort((a, b) => {

    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const diffA = ta.availability.length;
    const diffB = tb.availability.length;

    // 🔥 najpierw trudni nauczyciele
    if (diffA !== diffB) return diffA - diffB;

    // 🔥 potem grupy
    if ((a.group ? 1 : 0) !== (b.group ? 1 : 0)) {
      return (b.group ? 1 : 0) - (a.group ? 1 : 0);
    }

    // 🔥 potem klasy 1–3
    if ((a.class <= 3) !== (b.class <= 3)) {
      return (a.class <= 3 ? -1 : 1);
    }

    return 0;
  });
}

// 🧠 sprawdzanie
function canPlace(l, d, h, s, tBusy, cBusy, data) {

  const t = data.teachers.find(x => x.id === l.teacher);

  if (!t.availability.includes(d + "_" + h)) return false;
  if (tBusy[l.teacher + "_" + d + "_" + h]) return false;
  if (cBusy[l.class + "_" + d + "_" + h]) return false;

  // klasy 1–3
  const day = s[l.class]?.[d] || {};
  const hours = Object.keys(day).map(Number);

  if (l.class <= 3) {

    if (hours.length === 0 && h > 2) return false;

    if (hours.length > 0) {
      const min = Math.min(...hours);
      const max = Math.max(...hours);

      if (h !== min - 1 && h !== max + 1) return false;
    }
  }

  return true;
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

// 🔥 BACKTRACKING (SERCE)
function solve(lessons, index, s, tBusy, cBusy, data, start) {

  if (Date.now() - start > TIME_LIMIT) return false;

  if (index === lessons.length) return true;

  const l = lessons[index];

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  for (let d of days) {
    for (let h of hours) {

      if (!canPlace(l, d, h, s, tBusy, cBusy, data)) continue;

      place(l, d, h, s, tBusy, cBusy);

      if (solve(lessons, index + 1, s, tBusy, cBusy, data, start)) {
        return true;
      }

      remove(l, d, h, s, tBusy, cBusy);
    }
  }

  return false;
}

// 🧠 naprawa
function improve(s) {

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

// 🧠 MAIN
async function generateSchedule(data) {

  let lessons = getLessons(data);
  lessons = sortLessons(lessons, data);

  let s = {};
  let tBusy = {};
  let cBusy = {};

  const start = Date.now();

  const ok = solve(lessons, 0, s, tBusy, cBusy, data, start);

  if (!ok) {
    return {
      status: "FAIL",
      message: "Nie udało się ułożyć planu w czasie"
    };
  }

  // 🔥 popraw jakość
  for (let i = 0; i < 200; i++) {
    improve(s);
  }

  // 📊 licz
  let placed = 0;
  for (let cls in s) {
    for (let d in s[cls]) {
      placed += Object.keys(s[cls][d]).length;
    }
  }

  saveProgress({ percent: 100 });

  return {
    status: "OK",
    placed,
    total: lessons.length,
    elapsed: Math.floor((Date.now()-start)/1000),
    schedule: s
  };
}

export { generateSchedule };
