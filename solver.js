const TIME_LIMIT = 30000;

// 📦 LEKCJE
function getAllLessons(data) {

  let grouped = {};

  data.lessons.forEach(l => {

    const key = l.group ? l.group : "SINGLE_" + l.class + "_" + l.subject;

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

// 🧠 sprawdzanie
function canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data) {

  const teacher = data.teachers.find(t => t.id === lesson.teacher);
  if (!teacher || !teacher.availability.includes(day + "_" + hour)) return false;

  if (teacherBusy[lesson.teacher + "_" + day + "_" + hour]) return false;

  if ((teacherCount[lesson.teacher] || 0) >= teacher.maxHours) return false;

  for (let cls of lesson.classes) {

    if (classBusy[cls + "_" + day + "_" + hour]) return false;

    const daySchedule = schedule[cls]?.[day];

    if (daySchedule && Object.keys(daySchedule).length >= 7) return false;
  }

  return true;
}

// 📌 place
function place(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount) {

  teacherBusy[lesson.teacher + "_" + day + "_" + hour] = true;
  teacherCount[lesson.teacher] = (teacherCount[lesson.teacher] || 0) + 1;

  for (let cls of lesson.classes) {

    classBusy[cls + "_" + day + "_" + hour] = true;

    if (!schedule[cls]) schedule[cls] = {};
    if (!schedule[cls][day]) schedule[cls][day] = {};

    schedule[cls][day][hour] = {
      subject: lesson.subject,
      teacher: lesson.teacher,
      group: lesson.classes.length > 1
    };
  }
}

// ❌ remove
function remove(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount) {

  delete teacherBusy[lesson.teacher + "_" + day + "_" + hour];
  teacherCount[lesson.teacher]--;

  for (let cls of lesson.classes) {
    delete classBusy[cls + "_" + day + "_" + hour];
    delete schedule[cls][day][hour];
  }
}

// 🧠 GREEDY
function greedyFill(lessons, schedule, teacherBusy, classBusy, teacherCount, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  let notPlaced = [];

  for (let lesson of lessons) {

    let placed = false;

    for (let day of days) {
      for (let hour of hours) {

        if (canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data)) {
          place(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    if (!placed) {
      notPlaced.push(lesson);
    }
  }

  return notPlaced;
}

// 🔧 REPAIR
function repair(notPlaced, schedule, teacherBusy, classBusy, teacherCount, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  for (let lesson of [...notPlaced]) {

    for (let day of days) {
      for (let hour of hours) {

        if (canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data)) {
          place(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);
          notPlaced = notPlaced.filter(l => l !== lesson);
          break;
        }
      }
    }
  }

  return notPlaced;
}

// 🔥 SWAP (FINAL)
function trySwap(notPlaced, schedule, teacherBusy, classBusy, teacherCount, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  for (let lesson of [...notPlaced]) {

    for (let cls of lesson.classes) {

      const clsSchedule = schedule[cls];
      if (!clsSchedule) continue;

      for (let day in clsSchedule) {
        for (let hour in clsSchedule[day]) {

          const existing = clsSchedule[day][hour];
          const h = parseInt(hour);

          // usuń istniejącą lekcję
          const fakeLesson = {
            classes: [cls],
            teacher: existing.teacher,
            subject: existing.subject
          };

          remove(fakeLesson, day, h, schedule, teacherBusy, classBusy, teacherCount);

          // spróbuj wstawić brakującą
          if (canPlace(lesson, day, h, schedule, teacherBusy, classBusy, teacherCount, data)) {

            place(lesson, day, h, schedule, teacherBusy, classBusy, teacherCount);

            // spróbuj gdzieś przenieść starą
            for (let d of days) {
              for (let hh of hours) {

                if (canPlace(fakeLesson, d, hh, schedule, teacherBusy, classBusy, teacherCount, data)) {

                  place(fakeLesson, d, hh, schedule, teacherBusy, classBusy, teacherCount);

                  return [];
                }
              }
            }
          }

          // rollback
          place(fakeLesson, day, h, schedule, teacherBusy, classBusy, teacherCount);
        }
      }
    }
  }

  return notPlaced;
}

// 🧠 WALIDACJA
function noEmptyDays(schedule) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];

  for (let cls in schedule) {
    for (let day of days) {
      if (!schedule[cls][day] || Object.keys(schedule[cls][day]).length === 0) {
        return false;
      }
    }
  }

  return true;
}

function isDayContinuous(daySchedule) {

  if (!daySchedule) return true;

  const hours = Object.keys(daySchedule).map(Number).sort((a,b)=>a-b);

  for (let i = 1; i < hours.length; i++) {
    if (hours[i] !== hours[i-1] + 1) return false;
  }

  return true;
}

// 🎯 MAIN
async function generateSchedule(data) {

  let lessons = getAllLessons(data);

  // 🔥 trudni najpierw
  lessons.sort((a, b) => {
    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);
    return (ta?.availability.length || 999) - (tb?.availability.length || 999);
  });

  for (let attempt = 0; attempt < 20; attempt++) {

    console.log("🔥 Próba:", attempt);

    let schedule = {};
    let teacherBusy = {};
    let classBusy = {};
    let teacherCount = {};

    let notPlaced = greedyFill(lessons, schedule, teacherBusy, classBusy, teacherCount, data);

    notPlaced = repair(notPlaced, schedule, teacherBusy, classBusy, teacherCount, data);

    notPlaced = trySwap(notPlaced, schedule, teacherBusy, classBusy, teacherCount, data);

    console.log("❗ nieułożone:", notPlaced.length);

    if (notPlaced.length === 0) {

      if (!noEmptyDays(schedule)) continue;

      let ok = true;
      for (let cls in schedule) {
        for (let day in schedule[cls]) {
          if (!isDayContinuous(schedule[cls][day])) ok = false;
        }
      }

      if (!ok) continue;

      console.log("✅ PLAN GOTOWY");

      return {
        status: "OK",
        notPlaced: 0,
        gaps: 0,
        schedule
      };
    }
  }

  console.log("❌ FAIL");

  return {
    status: "FAIL",
    message: "Nie znaleziono w czasie limitu"
  };
}

export { generateSchedule };
