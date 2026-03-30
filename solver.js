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
function canReinsertStrict(lesson, state, data, skipD, skipH) {
  const t = data.teachers.find(x => x.id === lesson.teacher);

  let found = false;

  for (let d of DAYS) {
    for (let h of HOURS) {

      if (d === skipD && h === skipH) continue;
      if (!t.availability.includes(d + "_" + h)) continue;

      let teacherBusy = false;
      let classBusy = false;

      for (let cls in state.schedule) {
        const l = state.schedule[cls]?.[d]?.[h];
        if (!l) continue;

        if (l.teacher === lesson.teacher) teacherBusy = true;

        // 🔥 FIX: porównanie jako string
        if (String(cls) === String(lesson.class)) {
          classBusy = true;
        }
      }

      if (!teacherBusy && !classBusy) {
        found = true;
      }
    }
  }

  // 🔥 KLUCZ: MUSI ISTNIEĆ PRZYNAJMNIEJ 1 SLOT
  return found;
}
function findReinsertSlot(lesson, state, data, skipD, skipH) {
  const t = data.teachers.find(x => x.id === lesson.teacher);

  for (let d of DAYS) {
    for (let h of HOURS) {

      if (d === skipD && h === skipH) continue;

      if (!t.availability.includes(d + "_" + h)) continue;

      const tKey = lesson.teacher + "_" + d + "_" + h;
      const busy = state.teacherBusy[tKey] || [];

      if (busy.length > 0) continue;
      if (state.classBusy[lesson.class + "_" + d + "_" + h]) continue;

      return { d, h };
    }
  }

  return null;
}
function fillGapsWithG3(state, lessons, data) {
  console.log("🟡 FILL GAPS G3 START");

  const missing = lessons.filter(l =>
    !state.used.has(l.id)
  );

  for (let M of missing) {

    const t = data.teachers.find(x => x.id === M.teacher);
    let placed = false;

    const gaps = findClassGaps(state.schedule, M.class);

    for (let gap of gaps) {
      const { d, h } = gap;

      // 🔒 dostępność nauczyciela
      if (!t.availability.includes(d + "_" + h)) continue;

      const tKey = M.teacher + "_" + d + "_" + h;
      const busy = state.teacherBusy[tKey] || [];

      let canUse = true;
      let toRemove = [];

      // 🔍 sprawdzamy konflikty (TEN SAM nauczyciel)
      for (let l of busy) {

        // ❌ nie ruszamy G1
        if (l._groupLevel === "G1") {
          canUse = false;
          break;
        }

        // 🔒 KLUCZ: czy ta lekcja ma GDZIE WRÓCIĆ
        if (!canReinsertStrict(l, state, data, d, h)) {
          console.log(
            "⛔ SKIP GAP (no slot for conflict):",
            l.subject,
            l.teacher
          );
          canUse = false;
          break;
        }

        toRemove.push(l);
      }

      // ❌ jeśli choć jeden konflikt nie ma gdzie iść → pomijamy GAP
      if (!canUse) continue;

      // 🔥 TERAZ DOPIERO DZIAŁAMY

      // 1️⃣ usuwamy konflikty
      for (let r of toRemove) {
        console.log("💣 REMOVE (conflict):", r.subject, r.teacher);

        removeLesson(r, state);
        state.used.delete(r.id);
      }

      // 2️⃣ wstawiamy M
      place(M, d, h, state);
      state.used.add(M.id);

      console.log("🟡 GAP INSERT:", M.subject, M.class, d, h);

      placed = true;
      break;
    }

    if (!placed) {
      console.log("❌ GAP FAIL:", M.subject, M.teacher);
    }
  }
}
function findClassGaps(schedule, cls) {
  const gaps = [];

  for (let d of DAYS) {
    const day = schedule[cls]?.[d] || {};
    const hours = Object.keys(day).map(Number).sort((a,b)=>a-b);

    if (hours.length === 0) continue;

    for (let i = 1; i < hours.length; i++) {
      const prev = hours[i-1];
      const curr = hours[i];

      if (curr > prev + 1) {
        for (let h = prev + 1; h < curr; h++) {
          gaps.push({ d, h });
        }
      }
    }
  }

  return gaps;
}
function hasAlternativeSlot(lesson, state, data, skipD, skipH) {
  const t = data.teachers.find(x => x.id === lesson.teacher);

  for (let d of DAYS) {
    for (let h of HOURS) {

      // pomijamy aktualny slot
      if (d === skipD && h === skipH) continue;

      if (!t.availability.includes(d + "_" + h)) continue;

      const tKey = lesson.teacher + "_" + d + "_" + h;
      const busy = state.teacherBusy[tKey] || [];

      // 🔒 nauczyciel wolny (lub tylko ta sama lekcja)
      if (busy.length > 0) continue;

      // 🔒 klasa wolna
      if (state.classBusy[lesson.class + "_" + d + "_" + h]) continue;

      return true;
    }
  }

  return false;
}
function aggressiveInsertG1Singles(state, lessons, data) {
  console.log("🔴 AGGRESSIVE G1 SINGLES START");

  const missing = lessons.filter(l =>
    !state.used.has(l.id) &&
    l._groupLevel === "G1" &&
    !l.group
  );

  for (let M of missing) {

    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {

        const c = M.class;

        const t = data.teachers.find(x => x.id === M.teacher);

        // 🔒 tylko dostępność
        if (!t.availability.includes(d + "_" + h)) continue;

        // 👉 1️⃣ usuń co było w tej klasie
        const existing = state.schedule[c]?.[d]?.[h];
        // 🔒 NIE nadpisuj jeśli:
if (existing) {

  // ❌ ten sam nauczyciel
  if (existing.teacher === M.teacher) continue;

  // ❌ G1 nie ruszamy
  if (existing._groupLevel === "G1") continue;

          if (existing._groupLevel === "G2") continue;
}

        if (existing) {
          console.log("🔁 REMOVE (slot):", existing.subject, existing.teacher);

          removeLesson(existing, state);
          state.used.delete(existing.id);
        }

        // 👉 2️⃣ wstawiamy M
        place(M, d, h, state);
        state.used.add(M.id);

        console.log("🔴 INSERT:", M.subject, c, d, h);

        // 👉 3️⃣ sprawdzamy konflikty nauczyciela
        const tKey = M.teacher + "_" + d + "_" + h;
        const busy = state.teacherBusy[tKey] || [];

        let toRemove = [];

        for (let l of busy) {

          // ❌ NIE ruszamy tej co właśnie wstawiliśmy
          if (l.id === M.id) continue;

          // 🔥 jeśli grupa → usuń całą grupę w tym slocie
          if (l.group) {

            for (let cls in state.schedule) {
              for (let dd in state.schedule[cls]) {
                for (let hh in state.schedule[cls][dd]) {

                  const x = state.schedule[cls][dd][hh];

                  if (
                    x.teacher === l.teacher &&
                    x.group === l.group &&
                    dd === d &&
                    Number(hh) === h
                  ) {
                    toRemove.push(x);
                  }
                }
              }
            }

          } else {
            toRemove.push(l);
          }
        }

        // 🔥 deduplikacja
        toRemove = [...new Map(toRemove.map(x => [x.id, x])).values()];

        // 🔥 usuwamy konflikty
        for (let r of toRemove) {
          console.log("💣 REMOVE (conflict):", r.subject, r.teacher);

          removeLesson(r, state);
          state.used.delete(r.id);
        }

        placed = true;
        break;
      }
      if (placed) break;
    }

    if (!placed) {
      console.log("❌ AGGRESSIVE FAIL:", M.subject, M.teacher);
    }
  }
}
function tryPlaceWholeGroup(state, lessons, data) {
  console.log("🟢 TRY PLACE WHOLE GROUP");

  // 🔥 zbierz grupy z missing
  const groups = {};

  lessons.forEach(l => {
    if (!state.used.has(l.id) && l.group) {
      const key = l.teacher + "_" + l.group;
      if (!groups[key]) groups[key] = [];
      groups[key].push(l);
    }
  });

  for (let key in groups) {
    const groupLessons = groups[key];

    // 🔥 klasy tej grupy
    const classes = groupLessons.map(l => l.class);

    for (let d of DAYS) {
      for (let h of HOURS) {

        const teacher = groupLessons[0].teacher;
        const t = data.teachers.find(x => x.id === teacher);

        // 🔒 nauczyciel dostępny
        if (!t.availability.includes(d + "_" + h)) continue;

        // 🔒 nauczyciel wolny
        const tKey = teacher + "_" + d + "_" + h;
        const busy = state.teacherBusy[tKey] || [];
        if (busy.length > 0) continue;

        // 🔒 wszystkie klasy wolne
        let allFree = true;

        for (let c of classes) {
          if (state.classBusy[c + "_" + d + "_" + h]) {
            allFree = false;
            break;
          }
        }

        if (!allFree) continue;

        // 🔥 WSTAWIAMY CAŁĄ GRUPĘ
        console.log("🟢 GROUP PERFECT PLACE:", key, d, h);

        for (let l of groupLessons) {
          place(l, d, h, state);
          state.used.add(l.id);
        }

        break;
      }
    }
  }
}
function forceGroupIntoSingles(state, lessons, data) {
  console.log("🟣 FORCE GROUP INTO SINGLES (CLEAN)");

  const missing = lessons.filter(l =>
    !state.used.has(l.id) && l.group
  );

  for (let M of missing) {

    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {

        const tKey = M.teacher + "_" + d + "_" + h;
        const busy = state.teacherBusy[tKey] || [];

        // 🔒 musi być dokładnie 1 lekcja i bez grupy
        if (busy.length !== 1) continue;

        const existing = busy[0];
        if (existing.group) continue;

        let toRemove = [];

        // 1️⃣ usuń single nauczyciela
        toRemove.push(existing);

        // 2️⃣ usuń WSZYSTKO co blokuje slot dla klas tej grupy
        for (let cls in state.schedule) {
          for (let dd in state.schedule[cls]) {
            for (let hh in state.schedule[cls][dd]) {

              const l = state.schedule[cls][dd][hh];

              if (
                dd === d &&
                Number(hh) === h &&
                l.class !== undefined &&
                l.class !== null
              ) {
                // 🔥 jeśli to inna klasa tej samej grupy slotowej
                // (czyli wszystko co siedzi w tym slocie poza tym co chcemy wstawić)
                if (l.class !== M.class) {
                  toRemove.push(l);
                }
              }
            }
          }
        }

        // 🔥 deduplikacja
        toRemove = [...new Map(toRemove.map(x => [x.id, x])).values()];

        // 🔥 usuwamy
        for (let r of toRemove) {
          console.log(
            "🧹 GROUP CLEAN REMOVE:",
            r.subject,
            r.teacher,
            "| C:", r.class
          );

          removeLesson(r, state);
          state.used.delete(r.id);
        }

        // 🔥 wstawiamy grupę (jedną lekcję — reszta przyjdzie później)
        place(M, d, h, state);
        state.used.add(M.id);

        console.log(
          "🟣 GROUP INSERT:",
          M.subject,
          "| T:", M.teacher,
          "| G:", M.group,
          d, h
        );

        placed = true;
        break;
      }
      if (placed) break;
    }

    if (!placed) {
      console.log(
        "❌ GROUP FORCE FAIL:",
        M.subject,
        M.teacher,
        "G:", M.group
      );
    }
  }
}
function cleanSwapG1(state, lessons, data) {
  console.log("🔵 CLEAN SWAP G1 START (GROUP SAFE)");

  const missing = lessons.filter(l =>
    !state.used.has(l.id) && l._groupLevel === "G1"
  );

  for (let M of missing) {

    let placed = false;

    for (let d of DAYS) {
      for (let h of HOURS) {

        const c = M.class;

        const t = data.teachers.find(x => x.id === M.teacher);

        // 🔒 1. dostępność nauczyciela
        if (!t.availability.includes(d + "_" + h)) continue;

        // 🔒 2. brak konfliktu nauczyciela
    const tKey = M.teacher + "_" + d + "_" + h;
const busy = state.teacherBusy[tKey] || [];

if (busy.length > 0) {
  // 🔥 nauczyciel już coś ma → konflikt → pomijamy
  continue;
}

        const existing = state.schedule[c]?.[d]?.[h];

        let toRemove = [];

        if (existing) {

          if (existing.group) {
            // 🔥 zbierz CAŁĄ grupę w tym slocie
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
                    toRemove.push(l);
                  }
                }
              }
            }

          } else {
            toRemove.push(existing);
          }
        }

        // 🔥 deduplikacja (ważne!)
        toRemove = [...new Map(toRemove.map(x => [x.id, x])).values()];

        // 🔥 usuwamy wszystko
        for (let r of toRemove) {
          console.log("🔁 SWAP OUT:", r.subject, r.teacher, "| G:", r.group);

          removeLesson(r, state);
          state.used.delete(r.id);
        }

        // 🔥 wstawiamy M
        place(M, d, h, state);
        state.used.add(M.id);

        console.log("🔵 SWAP IN:", M.subject, M.class, d, h);

        placed = true;
        break;
      }
      if (placed) break;
    }

    if (!placed) {
      console.log("❌ SWAP FAIL:", M.subject, M.teacher);
    }
  }
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
function tryInsertMissing3(state, lessons, data) {
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
            existing._groupLevel === "G2" ||         // G2

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
  safePlaceG1Missing(state, lessons, data);
  forcePlaceG1Missing(state, lessons, data);
safePlaceG1Missing(state, lessons, data);
  cleanSwapG1(state, lessons, data);
    tryPlaceWholeGroup(state, lessons, data);
forceGroupIntoSingles(state, lessons, data);
  safePlaceG1Missing(state, lessons, data);


  
  runStep(g2, state, data, order, "G2");
  runStep(g3, state, data, order, "G3");
    tryFillGaps(state, lessons, data);
  tryInsertMissing(state, lessons, data);
      tryFillGaps(state, lessons, data);
  aggressiveInsertG1Singles(state, lessons, data);
    tryFillGaps(state, lessons, data);
     tryInsertMissing3(state, lessons, data);
    tryFillGaps(state, lessons, data);   
  tryInsertMissing2(state, lessons, data);
    tryFillGaps(state, lessons, data);
  fillGapsWithG3(state, lessons, data);
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

  return {
    schedule: best.schedule,
    score: -best.gaps - best.missing * 1000 // prosta heurystyka
  };
}
export { generateSchedule };
