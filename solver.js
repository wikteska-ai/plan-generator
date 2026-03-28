import fs from "fs";

const TIME_LIMIT = 60000;
const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== HELPERS =====
function getTeacher(data, id) {
  return data.teachers.find(t => t.id === id);
}

// ===== PROGRESS =====
function saveProgress(p) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(p));
  } catch {}
}

// ===== LESSONS (FIXED) =====
function getLessons(data) {
  let grouped = {};

  data.lessons.forEach(l => {
    const key = l.group
      ? "G_" + l.group
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
    const realHours = g.group
      ? Math.ceil(g.hours / 2)
      : g.hours;

    for (let h = 0; h < realHours; h++) {
      out.push({
        id: `${i}_${h}`,
        ...g
      });
    }
  });

  // 🔥 najpierw ciasne przypadki
  out.sort((a, b) => {
    const ta = getTeacher(data, a.teacher);
    const tb = getTeacher(data, b.teacher);

    const tightA = ta.availability.length / (a.hours || 1);
    const tightB = tb.availability.length / (b.hours || 1);

    return tightA - tightB;
  });

  return out;
}

// ===== CHECK =====
function teacherOk(tid, d, h, tBusy, data) {
  const t = getTeacher(data, tid);
  return t && t.availability.includes(d + "_" + h) && !tBusy[tid+"_"+d+"_"+h];
}

function classesFree(classes, d, h, cBusy) {
  if (!classes) return false;
  return classes.every(c => !cBusy[c+"_"+d+"_"+h]);
}

// ===== PLACE =====
function place(l, d, h, s, tBusy, cBusy, data) {

  if (!teacherOk(l.teacher, d, h, tBusy, data)) return false;

  if (l.block === 2) {
    if (h >= 8) return false;

    if (
      !teacherOk(l.teacher, d, h+1, tBusy, data) ||
      !classesFree(l.classes, d, h+1, cBusy)
    ) return false;
  }

  for (let c of l.classes) {
    if (!s[c]) s[c] = {};
    if (!s[c][d]) s[c][d] = {};

    s[c][d][h] = l;
    cBusy[c+"_"+d+"_"+h] = true;
  }

  tBusy[l.teacher+"_"+d+"_"+h] = true;

  if (l.block === 2) {
    for (let c of l.classes) {
      s[c][d][h+1] = l;
      cBusy[c+"_"+d+"_"+(h+1)] = true;
    }
    tBusy[l.teacher+"_"+d+"_"+(h+1)] = true;
  }

  return true;
}

// ===== CORE CONSTRUCT =====
function construct(lessons, data) {

  let s = {};
  let tBusy = {};
  let cBusy = {};

  for (let l of lessons) {

    let placed = false;
    const teacher = getTeacher(data, l.teacher);

    // 🔥 najpierw tylko dostępne sloty nauczyciela
    const slots = teacher.availability.map(x => {
      const [d,h] = x.split("_");
      return { d, h: +h };
    });

    for (let {d,h} of slots) {
      if (!classesFree(l.classes, d, h, cBusy)) continue;

      if (place(l, d, h, s, tBusy, cBusy, data)) {
        placed = true;
        break;
      }
    }

    // 🔥 fallback brute
    if (!placed) {
      for (let d of DAYS) {
        for (let h of HOURS) {
          if (
            teacherOk(l.teacher, d, h, tBusy, data) &&
            classesFree(l.classes, d, h, cBusy)
          ) {
            if (place(l, d, h, s, tBusy, cBusy, data)) {
              placed = true;
              break;
            }
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      console.log("❌ NIE WSTAWIONO:", l.subject, l.teacher);
    }
  }

  return s;
}

// ===== COUNT =====
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

// ===== MAIN =====
async function generateSchedule(data) {

  const lessons = getLessons(data);

  let best = null;
  let bestMissing = Infinity;

  const start = Date.now();
  let iter = 0;

  while (Date.now() - start < TIME_LIMIT) {

    iter++;

    const shuffled = [...lessons].sort(() => Math.random() - 0.5);

    const s = construct(shuffled, data);

    const missing = countMissing(s, lessons);

    console.log("ITER", iter, "missing:", missing);

    if (missing < bestMissing) {
      best = s;
      bestMissing = missing;
    }

    if (missing === 0) break;

    saveProgress({
      percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
      iter,
      missing
    });
  }

  saveProgress({ percent: 100 });

  return {
    status: "OK",
    missing: bestMissing,
    schedule: best
  };
}

export { generateSchedule };
