export async function generateSchedule(data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  // 📦 rozbij lekcje na pojedyncze godziny
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

  // 🎯 plan wynikowy
  let schedule = {};

  // pomocnicze
  let teacherBusy = {};
  let classBusy = {};

function isFree(lesson, day, hour) {

  const tKey = lesson.teacher + "_" + day + "_" + hour;
  const cKey = lesson.class + "_" + day + "_" + hour;

  // 🔍 znajdź nauczyciela
  const teacher = data.teachers.find(t => t.id === lesson.teacher);

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

  // 🔁 prosty algorytm
  for (let lesson of lessons) {

    let placed = false;

    for (let day of days) {
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
      return {
        status: "ERROR",
        message: "Nie udało się ułożyć planu 😢"
      };
    }
  }

  return {
    status: "OK",
    schedule: schedule
  };
}