import fs from "fs";

const TIME_LIMIT = 300000; // możesz dać 300000 (5 min)

function saveProgress(p) {
  try { fs.writeFileSync("progress.json", JSON.stringify(p)); } catch {}
}

// ====== DATA ======

function getLessons(data) {
  // grupy + rozbicie na pojedyncze godziny
  const grouped = {};
  data.lessons.forEach(l => {
    const key = l.group
      ? "G_" + l.group
      : l.subject === "edu.wczesno."
        ? `S_${l.class}_${l.subject}_${l.teacher}`
        : `S_${l.class}_${l.subject}`;

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

  const out = [];
  let idx = 0;
  Object.values(grouped).forEach(g => {
    for (let i = 0; i < g.hours; i++) {
      out.push({
        id: idx++,
        subject: g.subject,
        teacher: g.teacher,
        classes: g.classes.slice()
      });
    }
  });
  return out;
}

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ====== HELPERS ======

function teacherOk(tid, d, h, tBusy, data) {
  const t = data.teachers.find(x => x.id === tid);
  return t && t.availability.includes(d+"_"+h) && !tBusy[tid+"_"+d+"_"+h];
}

function classesFree(classes, d, h, cBusy) {
  for (let c of classes) {
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

function remove(l, d, h, s, tBusy, cBusy) {
  delete tBusy[l.teacher+"_"+d+"_"+h];
  for (let c of l.classes) {
    delete cBusy[c+"_"+d+"_"+h];
    if (s[c] && s[c][d]) delete s[c][d][h];
  }
}

// ====== CONSTRUCTION ======
// najpierw coś ułóż (nie idealnie)
function construct(lessons, data) {
  const s = {}, tBusy = {}, cBusy = {};
  // trudni nauczyciele najpierw
  const sorted = lessons.slice().sort((a,b)=>{
    const ta = data.teachers.find(x=>x.id===a.teacher);
    const tb = data.teachers.find(x=>x.id===b.teacher);
    return (ta?.availability.length||999) - (tb?.availability.length||999);
  });

  for (let l of sorted) {
    let best = null, bestScore = -1e9;

    for (let d of DAYS) {
      for (let h of HOURS) {
        if (!teacherOk(l.teacher,d,h,tBusy,data)) continue;
        if (!classesFree(l.classes,d,h,cBusy)) continue;

        // prosta preferencja: środek dnia + rozkład dni
        let sc = 0;
        if (h>=2 && h<=6) sc += 2;

        for (let c of l.classes) {
          const day = s[c]?.[d] || {};
          sc -= Object.keys(day).length; // balans
        }

        if (sc > bestScore) {
          bestScore = sc;
          best = {d,h};
        }
      }
    }

    if (best) place(l, best.d, best.h, s, tBusy, cBusy);
    // jeśli nie – pomijamy (naprawimy później)
  }

  return { s, tBusy, cBusy };
}

// ====== SCORING ======

function score(s) {
  let penalty = 0;

  for (let cls in s) {
    for (let d of DAYS) {
      const day = s[cls]?.[d] || {};
      const hs = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hs.length === 0) penalty += 60;        // pusty dzień
      if (hs.length < 4) penalty += 25;          // za mało
      if (hs.length > 7) penalty += 15;          // za dużo

      for (let i=1;i<hs.length;i++){
        if (hs[i] !== hs[i-1]+1) penalty += 20;  // okienka
      }

      // klasy 1–3: start 1–2
      if (Number(cls) <= 3 && hs.length>0) {
        if (Math.min(...hs) > 2) penalty += 25;
      }
    }
  }

  return -penalty;
}

// ====== LOCAL MOVES ======

function randomMove(s, data) {
  const classes = Object.keys(s);
  if (!classes.length) return;

  const c = classes[Math.floor(Math.random()*classes.length)];
  const d = Object.keys(s[c]||{})[Math.floor(Math.random()*Object.keys(s[c]||{}).length)];
  if (!d) return;

  const h = Object.keys(s[c][d])[Math.floor(Math.random()*Object.keys(s[c][d]).length)];
  if (!h) return;

  const l = s[c][d][h];

  // spróbuj przenieść gdzie indziej
  for (let i=0;i<10;i++){
    const d2 = DAYS[Math.floor(Math.random()*5)];
    const h2 = HOURS[Math.floor(Math.random()*8)];

    // sprawdź na świeżo (bez starych zajętości tej lekcji)
    const tBusy = {}, cBusy = {};
    for (let cls in s) {
      for (let dd in s[cls]) {
        for (let hh in s[cls][dd]) {
          const ll = s[cls][dd][hh];
          if (ll.id === l.id) continue;
          tBusy[ll.teacher+"_"+dd+"_"+hh] = true;
          for (let cc of ll.classes) cBusy[cc+"_"+dd+"_"+hh] = true;
        }
      }
    }

    if (teacherOk(l.teacher,d2,h2,tBusy,data) &&
        classesFree(l.classes,d2,h2,cBusy)) {

      // usuń stare
      for (let cc of l.classes) delete s[cc][d][h];

      // wstaw nowe
      for (let cc of l.classes) {
        if (!s[cc][d2]) s[cc][d2] = {};
        s[cc][d2][h2] = l;
      }
      return;
    }
  }
}

// ====== ANNEALING (naprawa do skutku) ======

function improve(s, data, durationMs) {
  let best = JSON.parse(JSON.stringify(s));
  let bestScore = score(best);

  let cur = JSON.parse(JSON.stringify(s));
  let curScore = bestScore;

  const start = Date.now();

  while (Date.now()-start < durationMs) {

    const next = JSON.parse(JSON.stringify(cur));
    randomMove(next, data);

    const sc = score(next);

    // temperatura maleje
    const t = 1 - (Date.now()-start)/durationMs;

    if (sc > curScore || Math.random() < Math.exp((sc-curScore)/(10*(t+0.01)))) {
      cur = next;
      curScore = sc;

      if (sc > bestScore) {
        best = JSON.parse(JSON.stringify(next));
        bestScore = sc;
      }
    }
  }

  return { best, bestScore };
}

// ====== MAIN ======

async function generateSchedule(data) {

  const lessons = getLessons(data);

  let globalBest = null;
  let globalScore = -1e9;

  const start = Date.now();
  let iter = 0;

  while (Date.now()-start < TIME_LIMIT) {

    // 1) konstrukcja
    let { s } = construct(lessons, data);

    // 2) poprawa (annealing)
    const { best, bestScore } = improve(s, data, 2000);

    if (bestScore > globalScore) {
      globalBest = best;
      globalScore = bestScore;
    }

    iter++;

    if (iter % 2 === 0) {
      saveProgress({
        percent: Math.floor(((Date.now()-start)/TIME_LIMIT)*100),
        score: globalScore,
        iter
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

  return {
    status: "OK",
    placed,
    total: lessons.length,
    elapsed: Math.floor((Date.now()-start)/1000),
    schedule: globalBest
  };
}

export { generateSchedule };
