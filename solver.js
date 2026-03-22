function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// 🧠 liczenie kary
function getPenalty(lesson, day, hour, schedule, teacherBusy, classBusy, data) {

  let penalty = 0;

  const teacher = data.teachers.find(t => t.id === lesson.teacher);
  if (!teacher || !teacher.availability.includes(day + "_" + hour)) return 9999;

  if (teacherBusy[lesson.teacher + "_" + day + "_" + hour]) return 9999;

  for (let cls of lesson.classes) {

    const cKey = cls + "_" + day + "_" + hour;
    if (classBusy[cKey]) return 9999;

    const daySchedule = schedule[cls]?.[day];

    if (!daySchedule && hour !== 1) penalty += 50;

    if (hour > 1 && daySchedule && !daySchedule[hour - 1]) {
      penalty += 200;
    }

    if (daySchedule) {
      const hoursUsed = Object.keys(daySchedule).map(Number);
      const maxHour = Math.max(...hoursUsed);

      if (hour > maxHour + 1) penalty += 150;
    }

    const MAX_LESSONS_PER_DAY = 7;

    if (daySchedule) {
      const count = Object.keys(daySchedule).length;
      if (count >= MAX_LESSONS_PER_DAY) penalty += 200;
    }

    if (hour > 1 && daySchedule && daySchedule[hour - 1]) {
      penalty -= 20;
    }
  }

  return penalty;
}

// 📌 zajmowanie
function occupy(lesson, day, hour, schedule, teacherBusy, classBusy) {

  teacherBusy[lesson.teacher + "_" + day + "_" + hour] = true;

  for (let cls of lesson.classes) {

    const cKey = cls + "_" + day + "_" + hour;
    classBusy[cKey] = true;

    if (!schedule[cls]) schedule[cls] = {};
    if (!schedule[cls][day]) schedule[cls][day] = {};

    schedule[cls][day][hour] = {
      subject: lesson.subject,
      teacher: lesson.teacher,
      group: lesson.classes.length > 1
    };
  }
}

// ❌ usuwanie
function unoccupy(lesson, day, hour, schedule, teacherBusy, classBusy) {

  delete teacherBusy[lesson.teacher + "_" + day + "_" + hour];

  for (let cls of lesson.classes) {
    delete classBusy[cls + "_" + day + "_" + hour];
    delete schedule[cls][day][hour];
  }
}

// 💀 HARD SWAP (klucz!)
function tryHardSwap(lesson, schedule, lessons, teacherBusy, classBusy, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  for (let cls of Object.keys(schedule)) {
    for (let day of Object.keys(schedule[cls])) {
      for (let hour of Object.keys(schedule[cls][day])) {

        const existing = schedule[cls][day][hour];

        const existingLesson = lessons.find(l =>
          l.teacher === existing.teacher &&
          l.subject === existing.subject &&
          l.classes.includes(cls)
        );

        if (!existingLesson) continue;

        // usuń starą
        unoccupy(existingLesson, day, hour, schedule, teacherBusy, classBusy);

        // spróbuj wstawić nową
        if (getPenalty(lesson, day, hour, schedule, teacherBusy, classBusy, data) < 9999) {

          occupy(lesson, day, hour, schedule, teacherBusy, classBusy);

          // spróbuj przywrócić starą gdzie indziej
          for (let d of days) {
            for (let h of hours) {

              if (getPenalty(existingLesson, d, h, schedule, teacherBusy, classBusy, data) < 9999) {
                occupy(existingLesson, d, h, schedule, teacherBusy, classBusy);
                return true;
              }
            }
          }
        }

        // rollback
        occupy(existingLesson, day, hour, schedule, teacherBusy, classBusy);
      }
    }
  }

  return false;
}

// 🧠 znajdź okienka
function findGaps(schedule) {

  let gaps = [];

  for (let cls in schedule) {
    for (let day in schedule[cls]) {

      let started = false;

      for (let h = 1; h <= 8; h++) {

        if (schedule[cls][day][h]) {
          started = true;
        } else if (started) {
          gaps.push({ cls, day, hour: h });
        }
      }
    }
  }

  return gaps;
}

// 🔧 napraw okienka
function tryFixGaps(schedule, lessons, teacherBusy, classBusy, data) {

  const gaps = findGaps(schedule);

  for (let gap of gaps) {

    const { cls, day, hour } = gap;

    for (let lesson of lessons) {

      if (!lesson.classes.includes(cls)) continue;

      const p = getPenalty(lesson, day, hour, schedule, teacherBusy, classBusy, data);

      if (p < 9999) {

        for (let c of lesson.classes) {
          for (let d in schedule[c] || {}) {
            for (let h in schedule[c][d] || {}) {

              const entry = schedule[c][d][h];

              if (
                entry.teacher === lesson.teacher &&
                entry.subject === lesson.subject
              ) {

                unoccupy(lesson, d, h, schedule, teacherBusy, classBusy);
                occupy(lesson, day, hour, schedule, teacherBusy, classBusy);

                return true;
              }
            }
          }
        }
      }
    }
  }

  return false;
}

// 🔁 próba
function tryGenerate(data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

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

  lessons.sort((a, b) => {
    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    return (ta?.availability.length || 999) - (tb?.availability.length || 999);
  });

  lessons = lessons.slice(0, 10).concat(shuffle(lessons.slice(10)));

  let schedule = {};
  let teacherBusy = {};
  let classBusy = {};

  let notPlaced = [];

  for (let lesson of lessons) {

    let bestSlot = null;
    let bestPenalty = 9999;

    const shuffledDays = shuffle(days);
    const shuffledHours = shuffle(hours);

    for (let day of shuffledDays) {
      for (let hour of shuffledHours) {

        const p = getPenalty(lesson, day, hour, schedule, teacherBusy, classBusy, data);

        if (p < bestPenalty) {
          bestPenalty = p;
          bestSlot = { day, hour };
        }
      }
    }

    if (bestSlot && bestPenalty < 9999) {
      occupy(lesson, bestSlot.day, bestSlot.hour, schedule, teacherBusy, classBusy);
    } else {

      // 💀 kluczowy moment: próbuj swap zamiast poddawać się
      const fixed = tryHardSwap(lesson, schedule, lessons, teacherBusy, classBusy, data);

      if (!fixed) {
        notPlaced.push(lesson);
      }
    }
  }

  // 🔧 napraw okienka
  for (let i = 0; i < 50; i++) {
    const improved = tryFixGaps(schedule, lessons, teacherBusy, classBusy, data);
    if (!improved) break;
  }

  return {
    schedule,
    notPlaced: notPlaced.length
  };
}

// 🧠 okienka
function countGaps(schedule) {

  let gaps = 0;

  for (let cls in schedule) {
    for (let day in schedule[cls]) {

      let started = false;

      for (let h = 1; h <= 8; h++) {
        if (schedule[cls][day][h]) {
          started = true;
        } else {
          if (started) gaps++;
        }
      }
    }
  }

  return gaps;
}

// 🎯 main
async function generateSchedule(data) {

  let best = null;

  for (let i = 0; i < 200; i++) {

    const attempt = tryGenerate(data);

    const gaps = countGaps(attempt.schedule);
    const score = attempt.notPlaced * 1000 + gaps;

    if (!best || score < best.score) {
      best = {
        ...attempt,
        score
      };
    }

    if (best.notPlaced === 0 && gaps === 0) break;
  }

  return {
    status: best.notPlaced === 0 ? "OK" : "PARTIAL",
    notPlaced: best.notPlaced,
    gaps: countGaps(best.schedule),
    schedule: best.schedule
  };
}

export { generateSchedule };
