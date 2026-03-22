function shuffle(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

// 🔁 jedna próba generowania
function tryGenerate(data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  // 🧠 GRUPOWANIE LEKCJI (KLUCZ!)
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

    // 🔥 sprawdzamy WSZYSTKIE klasy
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

lessons.sort((a, b) => {
  return b.classes.length - a.classes.length;
});

for (let lesson of lessons) {
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

// 🎯 główna funkcja
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