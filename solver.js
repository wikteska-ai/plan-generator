function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function tryGenerate(data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  let lessons = [];

  data.lessons.forEach((l, index) => {
    for (let i = 0; i < l.hours; i++) {
      lessons.push({
        id: index + "_" + i,
        class: l.class,
        subject: l.subject,
        teacher: l.teacher
      });
    }
  });

  let schedule = {};
  let teacherBusy = {};
  let classBusy = {};

  function isFree(lesson, day, hour) {
    const tKey = lesson.teacher + "_" + day + "_" + hour;
    const cKey = lesson.class + "_" + day + "_" + hour;

    const teacher = data.teachers.find(t => t.id === lesson.teacher);
    if (!teacher || !teacher.availability) return false;

    const slot = day + "_" + hour;

    return (
      !teacherBusy[tKey] &&
      !classBusy[cKey] &&
      teacher.availability.includes(slot)
    );
  }

  function occupy(lesson, day, hour) {
    const tKey = lesson.teacher + "_" + day + "_" + hour;
    const cKey = lesson.class + "_" + day + "_" + hour;

    teacherBusy[tKey] = true;
    classBusy[cKey] = true;

    if (!schedule[lesson.class]) schedule[lesson.class] = {};
    if (!schedule[lesson.class][day]) schedule[lesson.class][day] = {};

    schedule[lesson.class][day][hour] = {
      subject: lesson.subject,
      teacher: lesson.teacher
    };
  }

  let notPlaced = 0;

  for (let lesson of shuffle(lessons)) {

    let placed = false;

    for (let day of shuffle(days)) {
      for (let hour of shuffle(hours)) {

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

  return {
    schedule,
    notPlaced
  };
}

export async function generateSchedule(data) {

  let best = null;

  for (let i = 0; i < 50; i++) {

    const attempt = tryGenerate(data);

    if (!best || attempt.notPlaced < best.notPlaced) {
      best = attempt;
    }

    if (best.notPlaced === 0) break;
  }

  if (best.notPlaced > 0) {
    return {
      status: "PARTIAL",
      message: `Nie ułożono ${best.notPlaced} lekcji`,
      schedule: best.schedule
    };
  }

  return {
    status: "OK",
    schedule: best.schedule
  };
}