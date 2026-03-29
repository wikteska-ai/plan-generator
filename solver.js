// solver_v2.js

const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== MERGE GROUPS =====
function buildLessons(data) {
  const map = {};

  data.lessons.forEach((l, i) => {
    const key = l.group
      ? "G_" + l.group
      : `${l.class}_${l.subject}_${l.teacher}`;

    if (!map[key]) {
      map[key] = {
        subject: l.subject,
        teacher: l.teacher,
        classes: [],
        hours: l.hours,
        group: l.group || null
      };
    }

    map[key].classes.push(l.class);
  });

  const out = [];

  Object.values(map).forEach((g, i) => {
    for (let h = 0; h < g.hours; h++) {
      out.push({
        id: `${i}_${h}`,
        ...g
      });
    }
  });

  return out;
}

// ===== DIFFICULTY =====
function lessonDifficulty(l, data) {
  const t = data.teachers.find(t => t.id === l.teacher);
  const avail = t?.availability.length || 0;

  let difficulty = avail * 10;

  // 🔥 NOWE: liczba klas (ważne!)
  difficulty -= l.classes.length * 5;

  // 🔥 NOWE: grupy
  if (l.group) difficulty -= 10;

  // 🔥 NOWE: rzadkie przedmioty (mało godzin = trudniejsze)
  if (l.hours <= 1) difficulty -= 10;

  return difficulty;
}
// ===== SORT =====
function sortLessons(lessons, data) {
  return lessons.sort((a, b) => {

    const da = lessonDifficulty(a, data);
    const db = lessonDifficulty(b, data);

    // 🔥 1. NAJTRUDNIEJSZE (mało slotów) NAJPIERW
    if (da !== db) return da - db;

    // 🔥 2. potem grupy (bo trudniejsze logistycznie)
    if (a.group && !b.group) return -1;
    if (!a.group && b.group) return 1;

    return 0;
  });
}

// ===== STATE =====
function createState() {
  return {
    schedule: {},
    teacherBusy: {},
    classBusy: {}
  };
}

// ===== CHECKS =====
function teacherOk(tid, d, h, state, data) {
  const t = data.teachers.find(t => t.id === tid);
  return t &&
    t.availability.includes(d + "_" + h) &&
    !state.teacherBusy[tid + "_" + d + "_" + h];
}

function classesOk(classes, d, h, state) {
  return classes.every(c => !state.classBusy[c + "_" + d + "_" + h]);
}

// ===== PLACE =====
function place(l, d, h, state) {
  const key = d + "_" + h;

  state.teacherBusy[l.teacher + "_" + key] = true;

  for (let c of l.classes) {
    state.classBusy[c + "_" + key] = true;

    if (!state.schedule[c]) state.schedule[c] = {};
    if (!state.schedule[c][d]) state.schedule[c][d] = {};

    state.schedule[c][d][h] = l;
  }
}

 function scoreSlot(l, d, h, state) {
  let score = 0;

  for (let c of l.classes) {
    const day = state.schedule[c]?.[d] || {};
    const hours = Object.keys(day).map(Number);

    // 🟢 START DNIA (lżej!)
    if (hours.length === 0) {
      if (h === 1) score += 6;
      if (h === 2) score += 3;
      if (h > 3) score -= 5;
    }

    // 🟢 CIĄGŁOŚĆ (lżej)
    if (hours.includes(h - 1)) score += 6;
    if (hours.includes(h + 1)) score += 6;

    // 🔴 OKIENKA (DUŻO LŻEJ)
    if (hours.includes(h - 2) && !hours.includes(h - 1)) {
      score -= 10;
    }
    if (hours.includes(h + 2) && !hours.includes(h + 1)) {
      score -= 10;
    }

    // 🟡 ROZMIAR DNIA
    const newSize = hours.length + 1;

    if (newSize < 4) score += 3;
    if (newSize > 7) score -= 5;
    if (newSize > 8) score -= 15;

    // 🟡 SAMOTNA LEKCJA (lżej!)
    if (hours.length === 1 && Math.abs(hours[0] - h) > 1) {
      score -= 8;
    }
  }

  // 🟣 grupy
  if (l.group) score += 4;

  // 🔥 NOWE: lekka preferencja wcześniejszych godzin
  score += (9 - h) * 0.8;

  return score;
}

// ===== FIND BEST SLOT =====
function findBestSlot(l, state, data) {
  let best = null;
  let bestScore = -9999;

  for (let d of DAYS) {
    for (let h of HOURS) {

      if (!teacherOk(l.teacher, d, h, state, data)) continue;
      if (!classesOk(l.classes, d, h, state)) continue;

      const sc = scoreSlot(l, d, h, state);

    if (sc > bestScore || Math.random() < 0.1) {
        bestScore = sc;
        best = { d, h };
      }
    }
  }

  return best;
}
function canPlace(l, d, h, schedule, data) {
  const state = buildStateFromSchedule(schedule);

  return (
    teacherOk(l.teacher, d, h, state, data) &&
    classesOk(l.classes, d, h, state)
  );
}

function placeLesson(l, d, h, schedule) {
  for (let c of l.classes) {
    if (!schedule[c]) schedule[c] = {};
    if (!schedule[c][d]) schedule[c][d] = {};
    schedule[c][d][h] = l;
  }
}

function removeLesson(l, schedule) {
  for (let c of l.classes) {
    for (let d in schedule[c]) {
      for (let h in schedule[c][d]) {
        if (schedule[c][d][h].id === l.id) {
          delete schedule[c][d][h];
        }
      }
    }
  }
}
// ===== SOLVE =====
function solveOnce(data) {
  const lessons = sortLessons(buildLessons(data), data);
  const state = createState();
console.log("=== KOLEJNOŚĆ LEKCJI ===");
console.log("📊 TOTAL LESSONS:", lessons.length);
  
lessons.slice(0, 10).forEach(l => {
  const t = data.teachers.find(x => x.id === l.teacher);
  console.log(
    l.teacher,
    "avail:", t?.availability.length,
    "group:", l.group
  );
});
  let placed = 0;

  for (let l of lessons) {
    const slot = findBestSlot(l, state, data);

    if (slot) {
      place(l, slot.d, slot.h, state);
      placed++;
    } else {
      console.log("❌ MISS:", l.subject, l.teacher, l.classes);
    }
  }
  console.log(
  "➡️ placed:", placed,
  "/", lessons.length,
  "missing:", lessons.length - placed
);

// 🔍 lista brakujących lekcji
if (placed < lessons.length) {
  const placedIds = new Set();

  for (let cls in state.schedule) {
    for (let d in state.schedule[cls]) {
      for (let h in state.schedule[cls][d]) {
        placedIds.add(state.schedule[cls][d][h].id);
      }
    }
  }

  const missing = lessons.filter(l => !placedIds.has(l.id));

  console.log("❌ MISSING LESSONS:");
  missing.forEach(l =>
    console.log(l.subject, l.teacher, l.classes)
  );
}

return {
  schedule: state.schedule,
  placed,
  total: lessons.length,
  missingLessons: lessons.filter(l => {
    for (let cls in state.schedule) {
      for (let d in state.schedule[cls]) {
        for (let h in state.schedule[cls][d]) {
          if (state.schedule[cls][d][h].id === l.id) return false;
        }
      }
    }
    return true;
  })
};
}

// ===== SCORE =====
function score(schedule) {
  let penalty = 0;

  for (let cls in schedule) {
    for (let d of DAYS) {

      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      // ❌ pusty dzień (NIE CHCESZ TEGO)
      if (hours.length === 0) {
        penalty += 900;
        continue;
      }

      // ❌ START DNIA
      const first = hours[0];

      if (first > 2) penalty += 200; // bardzo źle
      if (first === 2) penalty += 10; // lekko źle

      // ❌ ZA MAŁO LEKCJI
      if (hours.length < 4) {
        penalty += (4 - hours.length) * 80;
      }

      // ❌ ZA DUŻO LEKCJI
      if (hours.length > 7) {
        penalty += (hours.length - 7) * 40;
      }

      if (hours.length > 8) {
        penalty += 200;
      }

      // ❌ OKIENKA (NAJWAŻNIEJSZE)
      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          const gapSize = hours[i] - hours[i-1] - 1;
          penalty += 150 * gapSize;
        }
      }

      // 🟢 BONUS ZA IDEALNY DZIEŃ
      let isContinuous = true;

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          isContinuous = false;
          break;
        }
      }

      if (
        isContinuous &&
        hours.length >= 4 &&
        hours.length <= 7 &&
        first <= 2
      ) {
        penalty -= 50;
      }
    }
  }

  return -penalty;
}
function findWorstDay(schedule) {
  let worst = null;
  let worstScore = -Infinity;

  for (let cls in schedule) {
    for (let d of DAYS) {

      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length === 0) continue;

      let penalty = 0;

      // okienka
      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          penalty += 100;
        }
      }

      // start dnia
      if (hours[0] > 2) penalty += 50;

      if (penalty > worstScore) {
        worstScore = penalty;
        worst = { cls, d };
      }
    }
  }

  return worst;
}
function rebuildDay(schedule, data) {
  const target = findWorstDay(schedule);
  if (!target) return null;

  const newSchedule = JSON.parse(JSON.stringify(schedule));

  const lessons = [];

  // 🔥 zbierz lekcje
  for (let h in newSchedule[target.cls][target.d]) {
    lessons.push(newSchedule[target.cls][target.d][h]);
  }

  // 🔥 usuń dzień
  delete newSchedule[target.cls][target.d];

  // 🔥 sortuj (ważne — trudniejsze najpierw)
  lessons.sort((a, b) => b.classes.length - a.classes.length);

  // 🔥 próbuj wstawiać od początku dnia
  for (let h = 1; h <= 8; h++) {
    for (let i = 0; i < lessons.length; i++) {
      const l = lessons[i];

      if (canPlace(l, target.d, h, newSchedule, data)) {
        placeLesson(l, target.d, h, newSchedule);
        lessons.splice(i, 1);
        break;
      }
    }
  }

  // 🔒 KLUCZ: sprawdzenie globalne
  if (lessons.length === 0 && isValidSchedule(newSchedule, data)) {
    return newSchedule;
  }

  return null; // rollback jeśli coś nie wyszło
}

// ===== GAP DETECTION =====
function findGaps(schedule) {
  const gaps = [];

  for (let cls in schedule) {
    for (let d of DAYS) {
      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        const prev = hours[i-1];
        const curr = hours[i];

        if (curr > prev + 1) {
          const size = curr - prev - 1;

          for (let h = prev + 1; h < curr; h++) {
            gaps.push({
              cls,
              d,
              h,
              size // 🔥 wielkość dziury
            });
          }
        }
      }
    }
  }

  // 🔥 NAJGORSZE DZIURY NA POCZĄTEK
  gaps.sort((a, b) => b.size - a.size);

  return gaps;
}
function fixBiggestGap(schedule, data) {
  const gaps = findGaps(schedule);
  if (gaps.length === 0) return null;

  const gap = gaps[0]; // największy

  const entries = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        entries.push({
          cls,
          d,
          h: Number(h),
          lesson: schedule[cls][d][h]
        });
      }
    }
  }

  // 🔥 próbuj wiele razy (klucz!)
  for (let i = 0; i < 20; i++) {
    const candidate = entries[Math.floor(Math.random() * entries.length)];

    if (!candidate.lesson) continue;

    const newSchedule = JSON.parse(JSON.stringify(schedule));

    removeLesson(candidate.lesson, newSchedule);

    if (canPlace(candidate.lesson, gap.d, gap.h, newSchedule, data)) {
      placeLesson(candidate.lesson, gap.d, gap.h, newSchedule);

      if (isValidSchedule(newSchedule, data)) {
        return newSchedule;
      }
    }
  }

  return null;
}
// ===== GAP FIX =====
function tryFixGap(schedule, data) {
  const gaps = findGaps(schedule);

  if (gaps.length === 0) return null;

const topN = Math.min(5, gaps.length);
const gap = gaps[0]; // 🔥 zawsze największa dziura
  const entries = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        entries.push({ cls, d, h, lesson: schedule[cls][d][h] });
      }
    }
  }

let bestCandidate = null;
let bestScore = -9999;

for (let i = 0; i < 20; i++) {
  const candidate = entries[Math.floor(Math.random() * entries.length)];

  const sc = scoreSlot(candidate.lesson, gap.d, gap.h, buildStateFromSchedule(schedule));

  if (sc > bestScore) {
    bestScore = sc;
    bestCandidate = candidate;
  }
}

const candidate = bestCandidate;
  if (!candidate.lesson) return null;

  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const { teacherBusy, classBusy } = rebuildBusy(newSchedule);

  // usuń starą lekcję
  for (let c of candidate.lesson.classes) {
    delete newSchedule[c][candidate.d][candidate.h];
    delete classBusy[c + "_" + candidate.d + "_" + candidate.h];
  }

  delete teacherBusy[candidate.lesson.teacher + "_" + candidate.d + "_" + candidate.h];

  // sprawdź czy można wstawić w gap
  const canPlace =
    teacherOk(candidate.lesson.teacher, gap.d, gap.h, { teacherBusy, classBusy }, data) &&
    classesOk(candidate.lesson.classes, gap.d, gap.h, { classBusy });

  if (!canPlace) return null;

  // wstaw w gap
  for (let c of candidate.lesson.classes) {
    if (!newSchedule[c][gap.d]) newSchedule[c][gap.d] = {};
    newSchedule[c][gap.d][gap.h] = candidate.lesson;
  }

  return newSchedule;
}
function rebuildBusy(schedule) {
  const teacherBusy = {};
  const classBusy = {};

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];
        const key = d + "_" + h;

        teacherBusy[l.teacher + "_" + key] = true;
        classBusy[cls + "_" + key] = true;
      }
    }
  }

  return { teacherBusy, classBusy };
}
function trySwap(schedule, data) {
  const entries = [];

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        entries.push({ cls, d, h, lesson: schedule[cls][d][h] });
      }
    }
  }

  if (entries.length < 2) return null;

  const a = entries[Math.floor(Math.random() * entries.length)];
  const b = entries[Math.floor(Math.random() * entries.length)];

  if (!a.lesson || !b.lesson) return null;
  if (a.lesson.id === b.lesson.id) return null;

  const newSchedule = JSON.parse(JSON.stringify(schedule));
  const { teacherBusy, classBusy } = rebuildBusy(newSchedule);

  // 🔥 usuń A
  for (let c of a.lesson.classes) {
    delete newSchedule[c][a.d][a.h];
    delete classBusy[c + "_" + a.d + "_" + a.h];
  }

  // 🔥 usuń B
  for (let c of b.lesson.classes) {
    delete newSchedule[c][b.d][b.h];
    delete classBusy[c + "_" + b.d + "_" + b.h];
  }

  delete teacherBusy[a.lesson.teacher + "_" + a.d + "_" + a.h];
  delete teacherBusy[b.lesson.teacher + "_" + b.d + "_" + b.h];

  // 🔥 sprawdź
  const canPlaceA =
    teacherOk(a.lesson.teacher, b.d, b.h, { teacherBusy, classBusy }, data) &&
    classesOk(a.lesson.classes, b.d, b.h, { classBusy });

  const canPlaceB =
    teacherOk(b.lesson.teacher, a.d, a.h, { teacherBusy, classBusy }, data) &&
    classesOk(b.lesson.classes, a.d, a.h, { classBusy });

  if (!canPlaceA || !canPlaceB) return null;

  // 🔥 wstaw A → B
  for (let c of a.lesson.classes) {
    if (!newSchedule[c][b.d]) newSchedule[c][b.d] = {};
    newSchedule[c][b.d][b.h] = a.lesson;
  }

  // 🔥 wstaw B → A
  for (let c of b.lesson.classes) {
    if (!newSchedule[c][a.d]) newSchedule[c][a.d] = {};
    newSchedule[c][a.d][a.h] = b.lesson;
  }

  return newSchedule;
}
function buildStateFromSchedule(schedule) {
  const state = createState();

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];
        place(l, d, Number(h), state);
      }
    }
  }

  return state;
}
function isValidSchedule(schedule, data) {
  const state = buildStateFromSchedule(schedule);

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {
        const l = schedule[cls][d][h];

        if (
          !teacherOk(l.teacher, d, Number(h), state, data) ||
          !classesOk(l.classes, d, Number(h), state)
        ) {
          return false;
        }
      }
    }
  }

  return true;
}
function repairSchedule(result, data) {
  const missing = result.missingLessons;

  for (let lesson of missing) {
    let placed = false;

    for (let d of DAYS) {
      for (let h = 1; h <= 8; h++) {

        if (canPlace(lesson, d, h, result.schedule, data)) {
          placeLesson(lesson, d, h, result.schedule);
          result.placed++;
          placed = true;
          break;
        }

        // 🔥 SPRÓBUJ WYMIANY
        const cls = lesson.classes[0];
        const existing = result.schedule[cls]?.[d]?.[h];

        if (existing) {
          removeLesson(existing, result.schedule);

          if (canPlace(lesson, d, h, result.schedule, data)) {
            placeLesson(lesson, d, h, result.schedule);

            // spróbuj wstawić starą gdzie indziej
            if (!tryReinsert(existing, result.schedule, data)) {
              // rollback jeśli się nie udało
              removeLesson(lesson, result.schedule);
              placeLesson(existing, d, h, result.schedule);
            } else {
              result.placed++;
              placed = true;
              break;
            }
          } else {
            // rollback
            placeLesson(existing, d, h, result.schedule);
          }
        }
      }
      if (placed) break;
    }

    if (!placed) {
console.log(
  "💀 NIE DA SIĘ NAPRAWIĆ:",
  lesson.subject,
  lesson.teacher,
  lesson.classes
);    }
  }
}
function tryReinsert(lesson, schedule, data) {
  for (let d of DAYS) {
    for (let h = 1; h <= 8; h++) {
      if (canPlace(lesson, d, h, schedule, data)) {
        placeLesson(lesson, d, h, schedule);
        return true;
      }
    }
  }
  return false;
}
function normalizeSchedule(schedule, data) {
  for (let cls in schedule) {
    for (let d of DAYS) {
      const day = schedule[cls]?.[d] || {};

      let hours = Object.keys(day)
        .map(Number)
        .sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {

          const lesson = day[hours[i]];

          // spróbuj przesunąć w dół
          for (let h = hours[i-1] + 1; h < hours[i]; h++) {
            if (canPlace(lesson, d, h, schedule, data)) {
              removeLesson(lesson, schedule);
              placeLesson(lesson, d, h, schedule);
              break;
            }
          }
        }
      }
    }
  }
}
function compressDay(schedule, data) {
  let newSchedule = JSON.parse(JSON.stringify(schedule));

  for (let cls in newSchedule) {
    for (let d of DAYS) {

      const day = newSchedule[cls]?.[d] || {};
      let hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      if (hours.length <= 1) continue;

      let target = Math.min(...hours);

      for (let h of hours) {
        const lesson = day[h];

        if (h === target) {
          target++;
          continue;
        }

        for (let newH = target; newH < h; newH++) {

          if (canPlace(lesson, d, newH, newSchedule, data)) {

            removeLesson(lesson, newSchedule);
            placeLesson(lesson, d, newH, newSchedule);

            break;
          }
        }

        target++;
      }
    }
  }

  // 🔒 KLUCZOWE — zabezpieczenie
  if (isValidSchedule(newSchedule, data)) {
    return newSchedule;
  }

  return schedule; // rollback jeśli coś się popsuło
}
function fixHardGaps(schedule, data) {
  const state = buildStateFromSchedule(schedule);

  for (let cls in schedule) {
    for (let d of DAYS) {

      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        const prev = hours[i-1];
        const curr = hours[i];

        // jeśli jest okienko
        if (curr > prev + 1) {
          const gapHour = prev + 1;

          const lesson = schedule[cls][d][curr];

          // 🔒 KLUCZ: sprawdzamy constrainty
          if (
            teacherOk(lesson.teacher, d, gapHour, state, data) &&
            classesOk(lesson.classes, d, gapHour, state)
          ) {
            // usuń starą lekcję
            delete schedule[cls][d][curr];

            // wstaw w okienko
            schedule[cls][d][gapHour] = lesson;

            // 🔥 zaktualizuj state
            state.teacherBusy[lesson.teacher + "_" + d + "_" + gapHour] = true;

            for (let c of lesson.classes) {
              state.classBusy[c + "_" + d + "_" + gapHour] = true;
            }
          }
        }
      }
    }
  }

  return schedule;
}
function fixGapsBySwap(schedule, data) {

  for (let cls in schedule) {
    for (let d of DAYS) {

      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        const prev = hours[i-1];
        const curr = hours[i];

        if (curr > prev + 1) {
          const gapHour = prev + 1;

          const lessonA = schedule[cls][d][curr];

          for (let cls2 in schedule) {
            for (let d2 in schedule[cls2]) {
              for (let h2 in schedule[cls2][d2]) {

                const h2num = Number(h2);
                const lessonB = schedule[cls2][d2][h2num];

                if (lessonA === lessonB) continue;

                // 🔥 symulacja
                const tempSchedule = JSON.parse(JSON.stringify(schedule));

                // wykonaj swap na kopii
                tempSchedule[cls][d][curr] = lessonB;
                tempSchedule[cls2][d2][h2num] = lessonA;

                // 🔥 odbuduj state
                const state = buildStateFromSchedule(tempSchedule);

                // 🔒 SPRAWDZENIE GLOBALNE
                let ok = true;

                for (let c in tempSchedule) {
                  for (let dd in tempSchedule[c]) {
                    for (let hh in tempSchedule[c][dd]) {

                      const l = tempSchedule[c][dd][hh];

                      if (
                        !teacherOk(l.teacher, dd, Number(hh), state, data) ||
                        !classesOk(l.classes, dd, Number(hh), state)
                      ) {
                        ok = false;
                        break;
                      }
                    }
                    if (!ok) break;
                  }
                  if (!ok) break;
                }

                if (ok) {
                  return tempSchedule; // 🔥 tylko bezpieczny swap
                }
              }
            }
          }
        }
      }
    }
  }

  return schedule;
}
function improve(schedule, data, iterations = 1000) {
  let best = JSON.parse(JSON.stringify(schedule));
  let bestScore = score(best);

  let current = best;
  let currentScore = bestScore;

  for (let i = 0; i < iterations; i++) {
    let next;

    // 🎯 najpierw próbujemy naprawić dziurę
const r = Math.random();

if (r < 0.5) {
  next = fixBiggestGap(current, data); // 🔥 NOWE
} else if (r < 0.75) {
  next = tryFixGap(current, data);
} else {
  next = trySwap(current, data);
}

    if (!next) continue;

    let sc = score(next);

    // 🔥 DOUBLE MOVE (drugi krok naprawy)
let next2;

// 50% gap, 50% kompresja
const r2 = Math.random();

if (r2 < 0.4) {
  next2 = tryFixGap(next, data);
} else if (r2 < 0.8) {
  next2 = compressDay(next, data);
} else {
  next2 = rebuildDay(next, data); // 🔥 też tu!
}
    if (next2 && isValidSchedule(next2, data)) {
      const sc2 = score(next2);
      if (sc2 > sc) {
        next = next2;
        sc = sc2;
      }
    }

    if (
  sc > currentScore ||
  sc > currentScore - 50
) {
      current = next;
      currentScore = sc;

      if (sc > bestScore) {
        best = JSON.parse(JSON.stringify(next));
        bestScore = sc;
      }
    }

  const rFix = Math.random();
    if (i > iterations * 0.5) {


if (rFix < 0.15) {
  const fixed1 = fixHardGaps(current, data);
  if (fixed1) {
    current = fixed1;
    currentScore = score(current);
  }
} else if (rFix < 0.3) {
  const fixed2 = fixGapsBySwap(current, data);
  if (fixed2) {
    current = fixed2;
    currentScore = score(current);
  }
}}
  }

  console.log("✨ IMPROVED:", bestScore);
  return best;
}
function validateSchedule(schedule, data) {
  const lessonCount = {};

  for (let cls in schedule) {
    for (let d in schedule[cls]) {
      for (let h in schedule[cls][d]) {

        const l = schedule[cls][d][h];
        lessonCount[l.id] = (lessonCount[l.id] || 0) + 1;
      }
    }
  }

  // policz ile powinno być
  const expected = buildLessons(data).length;

  const actual = Object.keys(lessonCount).length;

  if (actual !== expected) {
    console.log("🚨 ZGUBIONE / DUPLIKATY LEKCJI");
    return false;
  }

  return true;
}
// ===== MULTI RUN =====
function generateSchedule(data, runs = 500) {
  let candidates = [];

  for (let i = 0; i < runs; i++) {
    console.log("🚀 RUN", i);

const result = solveOnce(data);

    // 🧩 NOWE: napraw brakujące lekcje
  if (result.placed !== result.total) {
    repairSchedule(result, data);
  }

  // ❗ po naprawie sprawdź jeszcze raz
  if (result.placed !== result.total) {
    console.log("⛔ INVALID:", result.total - result.placed);
    continue;
  }

  // 🧹 NOWE: usuń okienka
  normalizeSchedule(result.schedule, data);

    const isValid = result.placed === result.total;

    if (isValid) {
      const sc = score(result.schedule);

      candidates.push({
        schedule: result.schedule,
        score: sc
      });

      console.log("📦 candidate:", sc);
    } else {
      console.log("⛔ INVALID:", result.total - result.placed);
    }
  }

  if (candidates.length === 0) {
    console.log("🚨 BRAK POPRAWNYCH PLANÓW");
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);

  const top = candidates.slice(0, 10);

  let best = null;

  for (let c of top) {
    console.log("🧪 IMPROVE START:", c.score);

    const improved = improve(c.schedule, data, 1500);
    const sc = score(improved);

    console.log("✨ IMPROVED:", sc);

    if (!best || sc > best.score) {
      best = {
        schedule: improved,
        score: sc
      };

      console.log("🔥 NEW BEST:", sc);
    }
  }

  return best;
}
export { generateSchedule };
