const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
const HOURS = [1,2,3,4,5,6,7,8];

// ===== BUILD LESSONS =====
function buildLessons(data) {
  const out = [];
  let id = 0;

  data.lessons.forEach(l => {
    for (let i = 0; i < l.hours; i++) {
      out.push({
        id: id++,
        class: l.class,
        subject: l.subject,
        teacher: l.teacher,
        group: l.group || null
      });
    }
  });

  console.log("📊 TOTAL LESSONS:", out.length);
  return out;
}
function forcePlaceG1Missing(state, lessons, data) {
  console.log("🔥 FORCE G1 START (GROUP AWARE)");

  const missing = lessons.filter(l =>
    !state.used.has(l.id) && l._groupLevel === "G1"
  );

  for (let M of missing) {

    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {

        const c = M.class;

        const t = data.teachers.find(x => x.id === M.teacher);
        if (!t.availability.includes(d + "_" + h)) continue;

        if (state.classBusy[c + "_" + d + "_" + h]) continue;

        const tKey = M.teacher + "_" + d + "_" + h;
        const busy = state.teacherBusy[tKey] || [];

        let toRemove = [];

        let blocked = false;

        for (let existing of busy) {

          // 🔥 jeśli grupa → zbierz CAŁĄ grupę
          if (existing.group) {

            const groupLessons = [];

            for (let cls in state.schedule) {
              for (let dd in state.schedule[cls]) {
                for (let hh in state.schedule[cls][dd]) {

                  const l = state.schedule[cls][dd][hh];

                  if (
                    l.teacher === existing.teacher &&
                    l.group === existing.group &&
                    dd === d &&
                    Number(hh) === h
                  ) {
                    groupLessons.push(l);
                  }
                }
              }
            }

            toRemove.push(...groupLessons);

          } else {
            toRemove.push(existing);
          }
        }

        if (blocked) continue;

        // 🔥 usuwamy wszystko naraz
        for (let r of toRemove) {
          console.log(
            "💣 REMOVE:",
            r.subject,
            "| T:", r.teacher,
            "| G:", r.group
          );

          removeLesson(r, state);
          state.used.delete(r.id);
        }

        // 🔥 wstawiamy M
        place(M, d, h, state);
        state.used.add(M.id);

        console.log("🔥 FORCE PLACE:", M.subject, c, d, h);

        placed = true;
        break;
      }
      if (placed) break;
    }

    if (!placed) {
      console.log("❌ STILL G1 MISSING:", M.subject, M.teacher);
    }
  }
}
function safePlaceG1Missing(state, lessons, data) {
  console.log("🟢 SAFE G1 START");

  const missing = lessons.filter(l =>
    !state.used.has(l.id) && l._groupLevel === "G1"
  );

  for (let M of missing) {

    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {

        const c = M.class;

        // 🔒 tylko poprawne miejsce
        if (canPlace(M, d, h, state, data)) {

          console.log("✅ SAFE PLACE:", M.subject, c, d, h);

          place(M, d, h, state);
          state.used.add(M.id);

          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      console.log("❌ SAFE FAIL:", M.subject, M.teacher);
    }
  }
}
function tryInsertMissing(state, lessons, data) {
  console.log("🧩 INSERT MISSING START");

  let missing = lessons.filter(l => !state.used.has(l.id));

  for (let M of missing) {

    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {

        const c = M.class;

        // 🟢 1. bezpośrednie wstawienie
        if (canPlace(M, d, h, state, data)) {
          console.log("✅ DIRECT INSERT:", M.subject, c, d, h);

          place(M, d, h, state);
          state.used.add(M.id);

          placed = true;
          break;
        }

        // 🔄 2. próba replace
        const existing = state.schedule[c]?.[d]?.[h];

        if (existing) {

          // ❌ WARUNKI BLOKUJĄCE
          if (
            existing.teacher === M.teacher ||        // ten sam nauczyciel
            existing.group                          // ma grupę
          ) {
            continue; // 🔥 pomijamy ten slot
          }

          // 🔥 tymczasowo usuń
          removeLesson(existing, state);

          if (canPlace(M, d, h, state, data)) {

            console.log(
              "🔁 REPLACE:",
              M.subject,
              "→", c, d, h,
              "| OUT:", existing.subject,
              existing.teacher
            );

            place(M, d, h, state);
            state.used.add(M.id);

            // 🔥 wyrzucona wraca do missing
            state.used.delete(existing.id);

            placed = true;
            break;
          } else {
            // rollback
            place(existing, d, h, state);
          }
        }
      }
      if (placed) break;
    }

    if (!placed) {
      console.log(
        "❌ STILL MISSING:",
        M.subject,
        M.teacher,
        M.class
      );
    }
  }
}
function tryInsertMissing2(state, lessons, data) {
  console.log("🧩 INSERT MISSING START");

  let missing = lessons.filter(l => !state.used.has(l.id));

  for (let M of missing) {

    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {

        const c = M.class;

        // 🟢 1. bezpośrednie wstawienie
        if (canPlace(M, d, h, state, data)) {
          console.log("✅ DIRECT INSERT:", M.subject, c, d, h);

          place(M, d, h, state);
          state.used.add(M.id);

          placed = true;
          break;
        }

        // 🔄 2. próba replace
        const existing = state.schedule[c]?.[d]?.[h];

        if (existing) {

          // ❌ WARUNKI BLOKUJĄCE
          if (
            existing.teacher === M.teacher ||        // ten sam nauczyciel
            existing._groupLevel === "G1" ||         // G1
            existing.group                          // ma grupę
          ) {
            continue; // 🔥 pomijamy ten slot
          }

          // 🔥 tymczasowo usuń
          removeLesson(existing, state);

          if (canPlace(M, d, h, state, data)) {

            console.log(
              "🔁 REPLACE:",
              M.subject,
              "→", c, d, h,
              "| OUT:", existing.subject,
              existing.teacher
            );

            place(M, d, h, state);
            state.used.add(M.id);

            // 🔥 wyrzucona wraca do missing
            state.used.delete(existing.id);

            placed = true;
            break;
          } else {
            // rollback
            place(existing, d, h, state);
          }
        }
      }
      if (placed) break;
    }

    if (!placed) {
      console.log(
        "❌ STILL MISSING:",
        M.subject,
        M.teacher,
        M.class
      );
    }
  }
}
function tryFillGaps(state, lessons, data) {
  console.log("🧪 GAP FILL START");

  const missing = lessons.filter(l => !state.used.has(l.id));

  for (let c = 0; c <= 8; c++) {
    for (let d of DAYS) {
      for (let h of HOURS) {

        // jeśli slot zajęty → pomiń
        if (state.classBusy[c + "_" + d + "_" + h]) continue;

        // 🔍 kandydaci (ignorujemy used!)
        const candidates = lessons.filter(l =>
          l.class === c &&
          canPlace(l, d, h, state, data)
        );

        for (let A of candidates) {

          // 🔍 znajdź gdzie A jest użyta
          let found = null;

          for (let cls in state.schedule) {
            for (let dd in state.schedule[cls]) {
              for (let hh in state.schedule[cls][dd]) {

                const placed = state.schedule[cls][dd][hh];

                if (placed.id === A.id) {
                  found = { cls, d: dd, h: Number(hh), lesson: placed };
                  break;
                }
              }
              if (found) break;
            }
            if (found) break;
          }

          if (!found) continue;

          // 🔄 próbujemy wstawić missing w miejsce A
          for (let M of missing) {

            if (
              M.class == found.cls &&
              canPlace(M, found.d, found.h, state, data)
            ) {

              console.log(
                "🔁 SWAP:",
                A.subject, "→ GAP",
                "|", M.subject, "→", found.cls, found.d, found.h
              );

              // 🔥 usuń A
              removeLesson(A, state);

              // 🔥 wstaw A do GAP
              place(A, d, h, state);

              // 🔥 wstaw M w stare miejsce
              place(M, found.d, found.h, state);

              state.used.add(M.id);

              break;
            }
          }
        }
      }
    }
  }
}
function removeLesson(l, state) {
  for (let cls in state.schedule) {
    for (let d in state.schedule[cls]) {
      for (let h in state.schedule[cls][d]) {

        if (state.schedule[cls][d][h].id === l.id) {

          delete state.schedule[cls][d][h];

          const key = d + "_" + h;
          const tKey = l.teacher + "_" + key;

          // usuń z teacherBusy
          state.teacherBusy[tKey] =
            (state.teacherBusy[tKey] || []).filter(x => x.id !== l.id);

          // usuń z classBusy
          delete state.classBusy[cls + "_" + key];

          return;
        }
      }
    }
  }
}
// ===== AVAILABILITY % =====
function teacherAvailabilityPercent(t) {
  return t.availability.length / 40;
}
function getTeacherStats(data) {
  const load = {};
  const availability = {};

  data.teachers.forEach(t => {
    availability[t.id] = t.availability.length;
  });

  data.lessons.forEach(l => {
    load[l.teacher] = (load[l.teacher] || 0) + l.hours;
  });

  return { load, availability };
}
// ===== SPLIT GROUPS =====
function splitGroups(lessons, data) {
  const g1 = [];
  const g2 = [];
  const g3 = [];

  const { load, availability } = getTeacherStats(data);

  lessons.forEach(l => {
    const teacherLoad = load[l.teacher] || 0;
    const teacherAvail = availability[l.teacher] || 1;

    // 🔥 realny "ścisk"
    const ratio = teacherLoad / teacherAvail;

    // 🔥 KLUCZOWA LOGIKA
    if (ratio >= 1 || l.group) {
      l._groupLevel = "G1";
      g1.push(l);

    } else if (ratio >= 0.5) {
      l._groupLevel = "G2";
      g2.push(l);

    } else {
      l._groupLevel = "G3";
      g3.push(l);
    }

  });

  return { g1, g2, g3 };
}
function sortGroup(group, data) {
  const { load, availability } = getTeacherStats(data);

  return group.sort((a, b) => {
    const ra = (load[a.teacher] || 0) / (availability[a.teacher] || 1);
    const rb = (load[b.teacher] || 0) / (availability[b.teacher] || 1);

    // 🔥 1. bardziej przeciążeni pierwsi
    if (ra !== rb) return rb - ra;

    // 🔥 2. grupy wcześniej
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
    classBusy: {},
    used: new Set()
  };
}

// ===== CHECK =====
function canPlace(l, d, h, state, data) {
  const t = data.teachers.find(x => x.id === l.teacher);

  if (!t.availability.includes(d + "_" + h)) return false;

  const key = d + "_" + h;
  const tKey = l.teacher + "_" + key;

  const busy = state.teacherBusy[tKey] || [];

  // 🔴 jeśli lekcja NIE ma grupy → nauczyciel musi być wolny
  if (!l.group) {
    if (busy.length > 0) return false;
  }

  // 🔵 jeśli lekcja MA grupę
  if (l.group) {
    for (let existing of busy) {

      // jeśli istniejąca lekcja bez grupy → konflikt
      if (!existing.group) return false;

      // jeśli różne grupy → konflikt
      if (existing.group !== l.group) return false;
    }
  }

  // klasy jak wcześniej
  if (state.classBusy[l.class + "_" + d + "_" + h]) return false;

  return true;
}
// ===== PLACE =====
function place(l, d, h, state) {
  const key = d + "_" + h;
  const tKey = l.teacher + "_" + key;

  // 🔥 teacherBusy jako lista
  if (!state.teacherBusy[tKey]) {
    state.teacherBusy[tKey] = [];
  }

  state.teacherBusy[tKey].push(l);

  state.classBusy[l.class + "_" + key] = true;

  if (!state.schedule[l.class]) state.schedule[l.class] = {};
  if (!state.schedule[l.class][d]) state.schedule[l.class][d] = {};

  state.schedule[l.class][d][h] = l;
  state.used.add(l.id);
}

// ===== COUNT GAPS =====
function countGaps(schedule) {
  let total = 0;

  for (let cls in schedule) {
    for (let d of DAYS) {
      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i-1] + 1) {
          total += hours[i] - hours[i-1] - 1;
        }
      }
    }
  }

  return total;
}

// ===== BUILD ORDER (godzina → klasa → dzień) =====
function buildOrder(startIndex) {
  const slots = [];

  for (let h of HOURS) {
    for (let c = 0; c <= 8; c++) {
      for (let d of DAYS) {
        slots.push({ c, d, h });
      }
    }
  }

  return [...slots.slice(startIndex), ...slots.slice(0, startIndex)];
}

// ===== RUN STEP =====
function runStep(group, state, data, order, label) {
  console.log("➡️ STEP:", label);

  for (let slot of order) {
    const { c, d, h } = slot;

    if (state.classBusy[c + "_" + d + "_" + h]) continue;

    const candidates = group.filter(l =>
      !state.used.has(l.id) &&
      l.class === c &&
      canPlace(l, d, h, state, data)
    );


    if (candidates.length > 0) {
      const l = candidates[0];
      place(l, d, h, state);
    }
  }
}

// ===== ONE RUN =====
function runOnce(data, startIndex) {
  console.log("\n🚀 RUN START:", startIndex);

  const lessons = buildLessons(data);
let { g1, g2, g3 } = splitGroups(lessons, data);

g1 = sortGroup(g1, data);
g2 = sortGroup(g2, data);
g3 = sortGroup(g3, data);
  const state = createState();
  const order = buildOrder(startIndex);

  runStep(g1, state, data, order, "G1");
  // 🔥 NOWE ETAPY
forcePlaceG1Missing(state, lessons, data);
safePlaceG1Missing(state, lessons, data);
  runStep(g2, state, data, order, "G2");
  runStep(g3, state, data, order, "G3");
    tryFillGaps(state, lessons, data);
  tryInsertMissing(state, lessons, data);
    tryFillGaps(state, lessons, data);
  tryInsertMissing2(state, lessons, data);
    tryFillGaps(state, lessons, data);

  const gaps = countGaps(state.schedule);
  const missingLessons = lessons.filter(l => !state.used.has(l.id));
  const missing = lessons.length - state.used.size;

  console.log("📉 GAPS:", gaps);
  console.log("❌ MISSING:", missing);
if (missing > 0) {
  console.log("🚨 MISSING LESSONS:");

  missingLessons.forEach(l => {
    console.log(
      " -",
      l.subject,
      "| T:", l.teacher,
      "| C:", l.class,
      l.group ? "| G:" + l.group : ""
    );
  });
}
return {
  gaps,
  missing,
  schedule: state.schedule
};}

// ===== MAIN =====
function generateSchedule(data) {
  const results = [];

  let best = null;

  for (let i = 0; i < 45; i++) {
    const res = runOnce(data, i);
    results.push(res);

    if (
      !best ||
      res.missing < best.missing ||
      (res.missing === best.missing && res.gaps < best.gaps)
    ) {
      best = res;
    }
  }

  console.log("\n✅ DONE");
  console.log("🏆 BEST RESULT:");
  console.log("missing:", best.missing, "gaps:", best.gaps);

  console.log("\n📊 ALL RUNS:");
  results.forEach((r, i) => {
    console.log("RUN", i, "→ gaps:", r.gaps, "missing:", r.missing);
  });

  // 🔥 FINALNY PLAN
  console.log("\n📅 FINAL SCHEDULE:");

  return best.schedule;
}
export { generateSchedule };
