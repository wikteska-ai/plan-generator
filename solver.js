function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// 🔁 jedna próba generowania
function tryGenerate(data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  // 🧠 GRUPOWANIE LEKCJI
  let grouped = {};

  data.lessons.forEach((l) => {

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

  // 📦 rozwijamy na pojedyncze godziny
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

  let schedule = {};
  let teacherBusy = {};
  let classBusy = {};

  function isFree(lesson, day, hour) {

    const tKey = lesson.teacher + "_" + day + "_" + hour;

    const teacher = data.teachers.find(t => t.id === lesson.teacher);
    if (!teacher || !teacher.availability) return false;

    const slot = day + "_" + hour;

    if (!teacher.availability.includes(slot)) return false;
    if (teacherBusy[tKey]) return false;

    for (let cls of lesson.classes) {
      const cKey = cls + "_" + day + "_" + hour;
      if (classBusy[cKey]) return false;
    }

    return true;
  }

  function occupy(lesson, day, hour) {

    const tKey = lesson.teacher + "_" + day + "_" + hour;
    teacherBusy[tKey] = true;

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

  let notPlaced = 0;

  // 🔥 sortowanie (trudni nauczyciele najpierw)
  lessons.sort((a, b) => {

    const teacherA = data.teachers.find(t => t.id === a.teacher);
    const teacherB = data.teachers.find(t => t.id === b.teacher);

    const availA = teacherA ? teacherA.availability.length : 999;
    const availB = teacherB ? teacherB.availability.length : 999;

    return availA - availB;
  });

  lessons = shuffle(lessons);

  for (let lesson of lessons) {

    let placed = false;

    const shuffledDays = shuffle(days);

    for (let day of shuffledDays) {
      for (let hour of hours) {

        if (isFree(lesson, day, hour)) {
          occupy(lesson, day, hour);
          placed = true;
          break;
        }

      }
      if (placed) break;
    }

    if (!placed) {
      notPlaced++;
    }
  }

  // 🔥 druga próba + swap
  for (let lesson of lessons) {

    let found = false;

    for (let cls of lesson.classes) {
      if (schedule[cls]) {
        for (let day in schedule[cls]) {
          for (let hour in schedule[cls][day]) {
            const entry = schedule[cls][day][hour];
            if (entry.teacher === lesson.teacher && entry.subject === lesson.subject) {
              found = true;
            }
          }
        }
      }
    }

    if (found) continue;

    for (let day of days) {
      for (let hour of hours) {

        if (isFree(lesson, day, hour)) {
          occupy(lesson, day, hour);
          notPlaced--;
          break;
        }
      }
    }
  }

  return {
    schedule,
    notPlaced
  };
}

// 🧠 liczenie okienek
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

// 🎯 główna funkcja
async function generateSchedule(data) {

  let best = null;

  for (let i = 0; i < 50; i++) {

    const attempt = tryGenerate(data);

    const gaps = countGaps(attempt.schedule);

    const score = attempt.notPlaced * 100 + gaps;

    if (!best || score < best.score) {
      best = {
        ...attempt,
        score
      };
    }

    if (best.notPlaced === 0 && gaps === 0) break;
  }

  if (best.notPlaced > 0) {
    return {
      status: "PARTIAL",
      message: `Nie ułożono ${best.notPlaced} lekcji`,
      gaps: countGaps(best.schedule),
      schedule: best.schedule
    };
  }

  return {
    status: "OK",
    gaps: countGaps(best.schedule),
    schedule: best.schedule
  };
}

export { generateSchedule };
