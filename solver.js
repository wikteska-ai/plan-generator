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

function validateGroups(state) {
  for (let cls in state.schedule) {
    for (let d in state.schedule[cls]) {
      for (let h in state.schedule[cls][d]) {
        const l = state.schedule[cls][d][h];
        if (!l.group) continue;

        const group = getFullGroupAtSlot(state, l, d, h);

        if (group.length < 2) {
          console.log("⚠️ BROKEN GROUP:", l.group, d, h);
        }
      }
    }
  }
}

function getFullGroupAtSlot(state, lesson, d, h) {
  if (!lesson.group) return [lesson];

  const groupLessons = [];

  for (let cls in state.schedule) {
    const l = state.schedule[cls]?.[d]?.[h];

    if (
      l &&
      l.teacher === lesson.teacher &&
      l.group === lesson.group
    ) {
      groupLessons.push(l);
    }
  }

  return groupLessons;
}

function cloneState(state) {
  return {
    schedule: JSON.parse(JSON.stringify(state.schedule)),
    teacherBusy: JSON.parse(JSON.stringify(state.teacherBusy)),
    classBusy: { ...state.classBusy },
    used: new Set([...state.used])
  };
}

function optimizeLateHours(state, lessons, data) {
  console.log("✨ OPTIMIZE LATE HOURS START");

  for (let cls in state.schedule) {
    if (Number(cls) < 4) continue;

    for (let d of DAYS) {
      for (let h of [8, 7]) {
        const base = state.schedule[cls]?.[d]?.[h];
        if (!base) continue;

        const groupLessons = getGroupLessonsAtSlot(state, base, d, h);

        for (let d2 of DAYS) {
          for (let h2 of HOURS) {
            if (d2 === d && h2 >= h) continue;

            let canMove = true;

            for (let l of groupLessons) {
              const tt = data.teachers.find(x => x.id === l.teacher);

              if (!tt.availability.includes(d2 + "_" + h2)) {
                canMove = false;
                break;
              }

              if (!canPlace(l, d2, h2, state, data)) {
                canMove = false;
                break;
              }
            }

            if (!canMove) continue;

            for (let l of groupLessons) {
              removeLesson(l, state);
              state.used.delete(l.id);
            }

            for (let l of groupLessons) {
              place(l, d2, h2, state);
              state.used.add(l.id);
            }

            break;
          }
        }
      }
    }
  }

  console.log("✨ OPTIMIZE LATE HOURS END");
}function optimizeEarlyClasses(state, lessons, data) {
  console.log("🧸 OPTIMIZE 0-3 START");

  for (let cls in state.schedule) {
    if (Number(cls) > 3) continue;

    for (let d of DAYS) {
      for (let h of [8, 7, 6]) {
        const base = state.schedule[cls]?.[d]?.[h];
        if (!base) continue;

        const groupLessons = getGroupLessonsAtSlot(state, base, d, h);

        for (let d2 of [d, ...DAYS]) {
          for (let h2 of HOURS) {
            if (d2 === d && h2 >= h) continue;

            let canMove = true;

            for (let l of groupLessons) {
              const tt = data.teachers.find(x => x.id === l.teacher);

              if (!tt.availability.includes(d2 + "_" + h2)) {
                canMove = false;
                break;
              }

              if (!canPlace(l, d2, h2, state, data)) {
                canMove = false;
                break;
              }
            }

            if (!canMove) continue;

            console.log(
              "🧸 MOVE:",
              base.subject,
              "| FROM:",
              d,
              h,
              "| TO:",
              d2,
              h2,
              "| GROUP:",
              base.group || "single"
            );

            for (let l of groupLessons) {
              removeLesson(l, state);
              state.used.delete(l.id);
            }

            for (let l of groupLessons) {
              place(l, d2, h2, state);
              state.used.add(l.id);
            }

            break;
          }
        }
      }
    }
  }

  console.log("🧸 OPTIMIZE 0-3 END");
}

function getGroupLessonsAtSlot(state, lesson, d, h) {
  if (!lesson.group) return [lesson];

  const out = [];

  for (let cls in state.schedule) {
    const l = state.schedule[cls]?.[d]?.[h];

    if (
      l &&
      l.teacher === lesson.teacher &&
      l.group === lesson.group
    ) {
      out.push(l);
    }
  }

  return out;
}

function swapInsertMissing(state, lessons, data) {
  console.log("🟠 SWAP INSERT START (ATOM GROUP SAFE)");

  let missing = getRealMissing(lessons, state);

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

        if (busy.length === 0) {
          place(M, d, h, state);
          state.used.add(M.id);

          console.log("🟠 INSERT:", M.subject, c, d, h);

          placed = true;
          break;
        }

        let entities = [];

        for (let l of busy) {
          if (l.id === M.id) continue;

          if (l.group) {
            const groupLessons = [];

            for (let cls in state.schedule) {
              const x = state.schedule[cls]?.[d]?.[h];

              if (
                x &&
                x.teacher === l.teacher &&
                x.group === l.group
              ) {
                groupLessons.push(x);
              }
            }

            entities.push(groupLessons);
          } else {
            entities.push([l]);
          }
        }

        entities = [
          ...new Map(entities.map(e => [e[0].id, e])).values()
        ];

        const testState = cloneState(state);

        for (let entity of entities) {
          for (let r of entity) {
            removeLesson(r, testState);
            testState.used.delete(r.id);
          }
        }

        if (!canPlace(M, d, h, testState, data)) continue;

        place(M, d, h, testState);
        testState.used.add(M.id);

        let success = true;

        for (let entity of entities) {
          let inserted = false;

          for (let d2 of DAYS) {
            for (let h2 of HOURS) {
              if (d2 === d && h2 === h) continue;

              let ok = true;

              for (let l of entity) {
                const tt = data.teachers.find(x => x.id === l.teacher);

                if (!tt.availability.includes(d2 + "_" + h2)) {
                  ok = false;
                  break;
                }

                if (!canPlace(l, d2, h2, testState, data)) {
                  ok = false;
                  break;
                }
              }

              if (ok) {
                for (let l of entity) {
                  place(l, d2, h2, testState);
                  testState.used.add(l.id);
                }

                inserted = true;
                break;
              }
            }

            if (inserted) break;
          }

          if (!inserted) {
            success = false;
            break;
          }
        }

        if (!success) continue;

        for (let entity of entities) {
          for (let r of entity) {
            console.log("💣 SWAP OUT:", r.subject, r.teacher, "| G:", r.group);

            removeLesson(r, state);
            state.used.delete(r.id);
          }
        }

        place(M, d, h, state);
        state.used.add(M.id);

        console.log("🟠 SWAP IN:", M.subject, c, d, h);

        for (let entity of entities) {
          let inserted = false;

          for (let d2 of DAYS) {
            for (let h2 of HOURS) {
              if (d2 === d && h2 === h) continue;

              let ok = true;

              for (let l of entity) {
                const tt = data.teachers.find(x => x.id === l.teacher);

                if (!tt.availability.includes(d2 + "_" + h2)) {
                  ok = false;
                  break;
                }

                if (!canPlace(l, d2, h2, state, data)) {
                  ok = false;
                  break;
                }
              }

              if (ok) {
                for (let l of entity) {
                  place(l, d2, h2, state);
                  state.used.add(l.id);

                  console.log(
                    "🔁 REINSERT:",
                    l.subject,
                    "| T:",
                    l.teacher,
                    "| G:",
                    l.group,
                    d2,
                    h2
                  );
                }

                inserted = true;
                break;
              }
            }

            if (inserted) break;
          }
        }

        placed = true;
        break;
      }

      if (placed) break;
    }

    if (!placed) {
      console.log("❌ SWAP FAIL:", M.subject, M.teacher);
    }
  }
}function getRealMissing(lessons, state) {
  const placedIds = new Set();

  for (let cls in state.schedule) {
    for (let d in state.schedule[cls]) {
      for (let h in state.schedule[cls][d]) {
        placedIds.add(state.schedule[cls][d][h].id);
      }
    }
  }

  return lessons.filter(l => !placedIds.has(l.id));
}

function validateFinal(state, lessons, data) {
  console.log("\n🧪 FINAL VALIDATION START");

  let ok = true;

  const missing = getRealMissing(lessons, state);

  if (missing.length > 0) {
    console.log("❌ MISSING LESSONS:", missing.length);

    missing.forEach(l => {
      console.log(
        " -",
        l.subject,
        "| T:",
        l.teacher,
        "| C:",
        l.class,
        l.group ? "| G:" + l.group : ""
      );
    });

    ok = false;
  } else {
    console.log("✅ ALL LESSONS PLACED");
  }

  const teacherMap = {};

  for (let cls in state.schedule) {
    for (let d in state.schedule[cls]) {
      for (let h in state.schedule[cls][d]) {
        const l = state.schedule[cls][d][h];
        const key = l.teacher + "_" + d + "_" + h;

        if (!teacherMap[key]) {
          teacherMap[key] = [];
        }

        teacherMap[key].push(l);
      }
    }
  }

  for (let key in teacherMap) {
    const lessonsAtSlot = teacherMap[key];

    if (lessonsAtSlot.length > 1) {
      const hasGroup = lessonsAtSlot.some(l => l.group);

      if (hasGroup) {
        const groupId = lessonsAtSlot[0].group;
        const allSameGroup = lessonsAtSlot.every(l => l.group === groupId);

        if (allSameGroup) {
          continue;
        }
      }

      console.log("❌ TEACHER CONFLICT:", key);

      lessonsAtSlot.forEach(l =>
        console.log(" ", l.subject, l.class, l.group || "")
      );

      ok = false;
    }
  }

  if (ok) {
    console.log("🟢 PLAN VALID");
  } else {
    console.log("🔴 PLAN INVALID");
  }

  console.log("🧪 FINAL VALIDATION END\n");
}

function createState() {
  return {
    schedule: {},
    teacherBusy: {},
    classBusy: {},
    used: new Set()
  };
}

function canPlace(l, d, h, state, data) {
  const t = data.teachers.find(x => x.id === l.teacher);

  if (!t.availability.includes(d + "_" + h)) return false;

  const key = d + "_" + h;
  const tKey = l.teacher + "_" + key;
  const busy = state.teacherBusy[tKey] || [];

  if (!l.group) {
    if (busy.length > 0) return false;
  }

  if (l.group) {
    for (let existing of busy) {
      if (!existing.group) return false;
      if (existing.group !== l.group) return false;
    }
  }

  if (state.classBusy[l.class + "_" + d + "_" + h]) return false;

  return true;
}

function place(l, d, h, state) {
  const key = d + "_" + h;
  const tKey = l.teacher + "_" + key;

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

function countGaps(schedule) {
  let total = 0;

  for (let cls in schedule) {
    for (let d of DAYS) {
      const day = schedule[cls]?.[d] || {};
      const hours = Object.keys(day).map(Number).sort((a, b) => a - b);

      for (let i = 1; i < hours.length; i++) {
        if (hours[i] !== hours[i - 1] + 1) {
          total += hours[i] - hours[i - 1] - 1;
        }
      }
    }
  }

  return total;
}

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

function runStep(group, state, data, order, label) {
  console.log("➡️ STEP:", label);

  for (let slot of order) {
    const { c, d, h } = slot;

    if (state.classBusy[c + "_" + d + "_" + h]) continue;

    const candidates = group.filter(
      l =>
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

  safePlaceG1Missing(state, lessons, data);
  forcePlaceG1Missing(state, lessons, data);
  swapInsertMissing(state, lessons, data);
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

  optimizeEarlyClasses(state, lessons, data);
  optimizeLateHours(state, lessons, data);

  validateGroups(state);
  validateFinal(state, lessons, data);

  const gaps = countGaps(state.schedule);
  const missingLessons = getRealMissing(lessons, state);
  const missing = lessons.length - state.used.size;

  console.log("📉 GAPS:", gaps);
  console.log("❌ MISSING:", missing);

  if (missing > 0) {
    console.log("🚨 MISSING LESSONS:");

    missingLessons.forEach(l => {
      console.log(
        " -",
        l.subject,
        "| T:",
        l.teacher,
        "| C:",
        l.class,
        l.group ? "| G:" + l.group : ""
      );
    });
  }

  return {
    gaps,
    missing,
    schedule: state.schedule
  };
}

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

  console.log("\n📅 FINAL SCHEDULE:");

  return {
    schedule: best.schedule,
    score: -best.gaps - best.missing * 1000
  };
}

export { generateSchedule };
