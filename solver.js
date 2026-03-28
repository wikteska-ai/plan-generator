import fs from "fs";

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== HELPERS =====
function getTeacher(data, id) {
  return data.teachers.find(t => t.id === id);
}

function teacherAvailable(tid, d, h, data) {
  const t = getTeacher(data, tid);
  return t && t.availability.includes(d + "_" + h);
}

// ===== LESSONS =====
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
    const count = g.group ? Math.ceil(g.hours / 2) : g.hours;

    for (let h = 0; h < count; h++) {
      out.push({
        id: `${i}_${h}`,
        ...g
      });
    }
  });

  // 🔥 najtrudniejsze najpierw
  out.sort((a, b) => {
    const ta = getTeacher(data, a.teacher);
    const tb = getTeacher(data, b.teacher);
    return ta.availability.length - tb.availability.length;
  });

  return out;
}

// ===== CHECK =====
function canPlace(l, d, h, schedule, data) {

  if (!teacherAvailable(l.teacher, d, h, data)) return false;

  for (let c of l.classes) {
    if (schedule[c]?.[d]?.[h]) return false;
  }

  if (l.block === 2) {
    if (h >= 8) return false;

    if (!teacherAvailable(l.teacher, d, h+1, data)) return false;

    for (let c of l.classes) {
      if (schedule[c]?.[d]?.[h+1]) return false;
    }
  }

  return true;
}

// ===== PLACE =====
function place(l, d, h, schedule) {
  for (let c of l.classes) {
    if (!schedule[c]) schedule[c] = {};
    if (!schedule[c][d]) schedule[c][d] = {};

    schedule[c][d][h] = l;

    if (l.block === 2) {
      schedule[c][d][h+1] = l;
    }
  }
}

// ===== REMOVE =====
function remove(l, d, h, schedule) {
  for (let c of l.classes) {
    delete schedule[c][d][h];

    if (l.block === 2) {
      delete schedule[c][d][h+1];
    }
  }
}

// ===== SCORE (estetyka) =====
function score(schedule) {
  let penalty = 0;

  for (let cls in schedule) {
    for (let d of DAYS) {

      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (!hours.length) continue;

      // okienka
      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) penalty += 50;
      }

      // start dnia
      if (Math.min(...hours) > 1) penalty += 20;

      // ciężkie przedmioty
      let map = {};
      hours.forEach(h => {
        const s = day[h]?.subject;
        map[s] = (map[s] || 0) + 1;
      });

      for (let s in map) {
        if (["matematyka","j.polski","j.angielski"].includes(s)) {
          if (map[s] > 1) penalty += 40;
        }
      }
    }
  }

  return -penalty;
}

// ===== BACKTRACK =====
function solve(index, lessons, schedule, data, best) {

  if (index >= lessons.length) {
    const sc = score(schedule);

    if (!best.score || sc > best.score) {
      best.schedule = JSON.parse(JSON.stringify(schedule));
      best.score = sc;
    }

    return true;
  }

  const l = lessons[index];

  // heurystyka kolejności
  let slots = [];

  for (let d of DAYS) {
    for (let h of HOURS) {
      slots.push({d,h});
    }
  }

  // 🔥 sort slotów (estetyka)
  slots.sort((a,b) => Math.random() - 0.5);

  for (let {d,h} of slots) {

    if (!canPlace(l, d, h, schedule, data)) continue;

    place(l, d, h, schedule);

    if (solve(index + 1, lessons, schedule, data, best)) {
      return true; // 🔥 STOP przy pierwszym poprawnym
    }

    remove(l, d, h, schedule);
  }

  return false;
}

// ===== VALIDATION =====
function validate(schedule, lessons, data) {

  let errors = [];

  // nauczyciele
  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];

        if (!teacherAvailable(l.teacher, d, h, data)) {
          errors.push(`❌ NIEZGODNA DYSPOZYCJA: ${l.teacher} ${d}_${h}`);
        }
      }
    }
  }

  // missing
  const set = new Set();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        set.add(schedule[cls][d][h].id);
      }
    }
  }

  for (let l of lessons) {
    if (!set.has(l.id)) {
      errors.push(`❌ NIE WSTAWIONO: ${l.subject} (${l.teacher})`);
    }
  }

  if (errors.length) {
    console.log("🚨 BŁĘDY:");
    errors.forEach(e => console.log(e));
  } else {
    console.log("✅ PLAN POPRAWNY");
  }
}

// ===== MAIN =====
async function generateSchedule(data) {

  const lessons = getLessons(data);

  let schedule = {};
  let best = { score: -9999, schedule: null };

  console.log("🧠 START SOLVER");

  solve(0, lessons, schedule, data, best);

  validate(best.schedule, lessons, data);

  return {
    status: "OK",
    score: best.score,
    schedule: best.schedule
  };
}

export { generateSchedule };
