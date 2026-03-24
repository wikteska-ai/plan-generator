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
    for (let h = 0; h < g.hours; h++) {
      out.push({
        id: i + "_" + h,
        ...g
      });
    }
  });

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

// ===== CONSTRUCT =====
function rebuildBusy(schedule) {
  let tBusy = {};
  let cBusy = {};

  for (let c in schedule) {
    for (let d in schedule[c]) {
      for (let h in schedule[c][d]) {
        const l = schedule[c][d][h];
        tBusy[l.teacher+"_"+d+"_"+h] = true;
        cBusy[c+"_"+d+"_"+h] = true;
      }
    }
  }

  return { tBusy, cBusy };
}

function construct(lessons, data) {

  let s = {}, tBusy = {}, cBusy = {};

  for (let l of lessons) {

    let placedFlag = false;
    let best = null;
    let bestScore = -9999;

    for (let d of DAYS) {
      for (let h of HOURS) {

        if (!teacherOk(l.teacher,d,h,tBusy,data)) continue;
        if (!classesFree(l.classes,d,h,cBusy)) continue;

        let score = 0;

        const day = s[l.classes[0]]?.[d] || {};
        if (day[h-1]) score += 6;
        if (day[h+1]) score += 6;

        if (h >= 2 && h <= 6) score += 2;

        if (h === 1) score += 4;
        if (h === 2) score += 1;

        for (let c of l.classes) {
          const dmap = s[c]?.[d] || {};
          score -= Object.keys(dmap).length * 2;
        }

        if (l.group) score += 5;

        const t = data.teachers.find(x => x.id === l.teacher);
        if (t && t.availability.length < 10) score += 5;

        if (score > bestScore) {
          bestScore = score;
          best = { d, h };
        }
      }
    }

    if (best) {
      place(l, best.d, best.h, s, tBusy, cBusy);
      placedFlag = true;
    } else {

      outer:
      for (let d of DAYS) {
        for (let h of HOURS) {

          if (teacherOk(l.teacher,d,h,tBusy,data) &&
              classesFree(l.classes,d,h,cBusy)) {

            place(l, d, h, s, tBusy, cBusy);
            placedFlag = true;
            break outer;
          }
        }
      }
    }

    // ✅ TYLKO LOG — bez rozwalania planu
    if (!placedFlag) {
      console.log("❌ NIE WSTAWIONO:", l.subject, l.classes);
    }

    ({ tBusy, cBusy } = rebuildBusy(s));
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

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          penalty += 800;
        }
      }

      const first = Math.min(...hours);

      if (first === 1) penalty -= 60;
      else if (first === 2) penalty += 40;
      else if (first === 3) penalty += 120;
      else penalty += 300;

      if (hours.length <= 2) penalty += 200;
      else if (hours.length === 3) penalty += 120;
      if (hours.length > 7) penalty += 60;

      let subjects = {};

      hours.forEach(h => {
        const sub = day[h]?.subject;
        if (!subjects[sub]) subjects[sub] = 0;
        subjects[sub]++;
      });

      for (let sub in subjects) {

        const count = subjects[sub];

        if (count >= 3) penalty += 300;

        if (count === 2) {

          let positions = [];

          hours.forEach(h => {
            if (day[h]?.subject === sub) {
              positions.push(h);
            }
          });

          positions.sort((a,b)=>a-b);

          if (positions[1] !== positions[0] + 1) {
            penalty += 200;
          } else {
            penalty -= 20;
          }
        }
      }

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

// ===== IMPROVE =====
function improve(s, data, ms) {

  let best = JSON.parse(JSON.stringify(s));
  let bestScore = score(best);

  let current = JSON.parse(JSON.stringify(s));
  let currentScore = bestScore;

  const start = Date.now();

  while (Date.now() - start < ms) {

    let next = JSON.parse(JSON.stringify(current));

    if (Math.random() < 0.6) {

      const classes = Object.keys(next);
      const c = classes[Math.floor(Math.random()*classes.length)];

      const days = Object.keys(next[c] || {});
      if (!days.length) continue;

      const d = days[Math.floor(Math.random()*days.length)];

      const hours = Object.keys(next[c][d] || {});
      if (!hours.length) continue;

      const h = Number(hours[Math.floor(Math.random()*hours.length)]);
      const lesson = next[c][d][h];

      if (lesson.classes.length > 1) continue;

      const d2 = DAYS[Math.floor(Math.random()*5)];
      const h2 = HOURS[Math.floor(Math.random()*8)];

      const t = data.teachers.find(x => x.id === lesson.teacher);
      if (!t || !t.availability.includes(d2+"_"+h2)) continue;

      let ok = true;

      for (let cc of lesson.classes) {
        if (next[cc]?.[d2]?.[h2]) ok = false;
      }

      if (!ok) continue;

      delete next[c][d][h];

      if (!next[c][d2]) next[c][d2] = {};
      next[c][d2][h2] = lesson;
    }

    let sc = score(next);

    if (sc > currentScore || Math.random() < 0.1) {
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

  while (Date.now() - start < TIME_LIMIT) {

    let s = construct(lessons, data);

    const { best, bestScore } = improve(s, data, 10000);

    if (bestScore > globalScore) {
      globalScore = bestScore;
      globalBest = best;

      console.log("🔥 Nowy najlepszy score:", globalScore);
    }

    saveProgress({
      percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
      score: globalScore
    });
  }

  return {
    status: "OK",
    score: globalScore,
    schedule: globalBest
  };
}

export { generateSchedule };
