import fs from "fs";

const TIME_LIMIT = 30000;
let lastUpdate = 0;

function saveProgress(state) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(state));
  } catch {}
}

// 📦 LEKCJE (FIX EDU 🔥)
function getAllLessons(data) {

  let grouped = {};

  data.lessons.forEach(l => {

    const key =
      l.group
        ? l.group
        : l.subject === "edu.wczesno."
          ? "SINGLE_" + l.class + "_" + l.subject + "_" + l.teacher
          : "SINGLE_" + l.class + "_" + l.subject;

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

  let lessons = [];

  Object.values(grouped).forEach((g, index) => {
    for (let i = 0; i < g.hours; i++) {
      lessons.push({
        id: index + "_" + i,
        classes: g.classes,
        subject: g.subject,
        teacher: g.teacher
      });
    }
  });

  return lessons;
}

// 🧠 SPRAWDZANIE (ANTY OKIENKA + BALANS 🔥)
function canPlace(l, d, h, s, tBusy, cBusy, tCount, data) {

  const t = data.teachers.find(x => x.id === l.teacher);
  if (!t || !t.availability.includes(d + "_" + h)) return false;

  if (tBusy[l.teacher + "_" + d + "_" + h]) return false;

  if ((tCount[l.teacher] || 0) >= t.maxHours) return false;

  for (let cls of l.classes) {

    if (cBusy[cls + "_" + d + "_" + h]) return false;

    const daySchedule = s[cls]?.[d];

    // ❌ anty okienka
    if (daySchedule) {

      const hours = Object.keys(daySchedule).map(Number);

      if (hours.length > 0) {
        const min = Math.min(...hours);
        const max = Math.max(...hours);

        if (h > min && h < max) return false;
      }

      // ❌ max dzien
      if (hours.length >= 6) return false;
    }
  }

  return true;
}

// 📌 PLACE
function place(l, d, h, s, tBusy, cBusy, tCount, used) {

  if (used.has(l.id)) return false;

  used.add(l.id);

  tBusy[l.teacher + "_" + d + "_" + h] = true;
  tCount[l.teacher] = (tCount[l.teacher] || 0) + 1;

  for (let cls of l.classes) {

    cBusy[cls + "_" + d + "_" + h] = true;

    if (!s[cls]) s[cls] = {};
    if (!s[cls][d]) s[cls][d] = {};

    s[cls][d][h] = {
      subject: l.subject,
      teacher: l.teacher,
      group: l.classes.length > 1,
      id: l.id
    };
  }

  return true;
}

// ❌ REMOVE
function remove(l, d, h, s, tBusy, cBusy, tCount, used) {

  used.delete(l.id);

  delete tBusy[l.teacher + "_" + d + "_" + h];
  tCount[l.teacher]--;

  for (let cls of l.classes) {
    delete cBusy[cls + "_" + d + "_" + h];
    delete s[cls][d][h];
  }
}

// 🎯 GREEDY
function greedyFill(lessons, s, tBusy, cBusy, tCount, used, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"].sort(() => Math.random() - 0.5);
  const hours = [1,2,3,4,5,6,7,8];

  let notPlaced = [];

  for (let l of lessons) {

    if (used.has(l.id)) continue;

    let placed = false;

    for (let d of days) {
      for (let h of hours) {

        if (canPlace(l, d, h, s, tBusy, cBusy, tCount, data)) {
          place(l, d, h, s, tBusy, cBusy, tCount, used);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) notPlaced.push(l);
  }

  return notPlaced;
}

// 🔄 SWAP
function trySwap(notPlaced, s, tBusy, cBusy, tCount, used, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  for (let l of [...notPlaced]) {

    for (let cls of l.classes) {

      const sc = s[cls];
      if (!sc) continue;

      for (let d in sc) {
        for (let h in sc[d]) {

          const existing = sc[d][h];

          const fake = {
            id: existing.id,
            classes: [cls],
            teacher: existing.teacher,
            subject: existing.subject
          };

          remove(fake, d, +h, s, tBusy, cBusy, tCount, used);

          if (canPlace(l, d, +h, s, tBusy, cBusy, tCount, data)) {

            place(l, d, +h, s, tBusy, cBusy, tCount, used);

            for (let dd of days) {
              for (let hh of hours) {

                if (canPlace(fake, dd, hh, s, tBusy, cBusy, tCount, data)) {
                  place(fake, dd, hh, s, tBusy, cBusy, tCount, used);
                  return [];
                }
              }
            }
          }

          place(fake, d, +h, s, tBusy, cBusy, tCount, used);
        }
      }
    }
  }

  return notPlaced;
}

// 🧠 MAIN
async function generateSchedule(data) {

  let lessons = getAllLessons(data);

  const teachers = data.teachers;

  const hard = lessons.filter(l => {
    const t = teachers.find(x => x.id === l.teacher);
    return (t?.availability.length || 999) < 10;
  });

  const groups = lessons.filter(l => l.classes.length > 1);
  const early = lessons.filter(l => l.classes.some(c => c <= 4));

  const rest = lessons.filter(l =>
    !hard.includes(l) &&
    !groups.includes(l) &&
    !early.includes(l)
  );

  const ordered = [...hard, ...groups, ...early, ...rest];

  let best = null;
  let bestScore = 0;

  const start = Date.now();

  while (Date.now() - start < TIME_LIMIT) {

    let s = {};
    let tBusy = {};
    let cBusy = {};
    let tCount = {};
    let used = new Set();

    const shuffled = [...ordered].sort(() => Math.random() - 0.5);

    let notPlaced = greedyFill(shuffled, s, tBusy, cBusy, tCount, used, data);

    notPlaced = trySwap(notPlaced, s, tBusy, cBusy, tCount, used, data);

    const placed = used.size;

    if (placed > bestScore) {
      bestScore = placed;
      best = JSON.parse(JSON.stringify(s));
    }

    const now = Date.now();

    if (now - lastUpdate > 300) {
      saveProgress({
        progress: placed,
        total: ordered.length,
        percent: Math.floor((placed / ordered.length) * 100),
        bestPlaced: bestScore,
        elapsed: Math.floor((now - start) / 1000),
        status: "working"
      });
      lastUpdate = now;
    }

    if (placed === ordered.length) break;
  }

  const elapsed = Math.floor((Date.now() - start) / 1000);

  saveProgress({
    progress: bestScore,
    total: lessons.length,
    percent: Math.floor((bestScore / lessons.length) * 100),
    bestPlaced: bestScore,
    elapsed,
    status: "done"
  });

  return {
    status: bestScore === lessons.length ? "OK" : "PARTIAL",
    placed: bestScore,
    schedule: best
  };
}

export { generateSchedule };
