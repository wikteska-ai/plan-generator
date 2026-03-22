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

function canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, data) {

  const teacher = data.teachers.find(t => t.id === lesson.teacher);
  if (!teacher || !teacher.availability.includes(day + "_" + hour)) return false;

  if (teacherBusy[lesson.teacher + "_" + day + "_" + hour]) return false;

  for (let cls of lesson.classes) {

    if (classBusy[cls + "_" + day + "_" + hour]) return false;

    const daySchedule = schedule[cls]?.[day];

    // 🔥 tylko twarde ograniczenia

    // limit dzienny
    const MAX = 7;
    if (daySchedule && Object.keys(daySchedule).length >= MAX) return false;
  }

  return true;
}
function place(lesson, day, hour, schedule, teacherBusy, classBusy) {

  teacherBusy[lesson.teacher + "_" + day + "_" + hour] = true;

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

function remove(lesson, day, hour, schedule, teacherBusy, classBusy) {

  delete teacherBusy[lesson.teacher + "_" + day + "_" + hour];

  for (let cls of lesson.classes) {
    delete classBusy[cls + "_" + day + "_" + hour];
    delete schedule[cls][day][hour];
  }
}

// 🔥 brak pustych dni
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

// 🔥 ciągłość dnia
function isDayContinuous(daySchedule) {

  if (!daySchedule) return true;

  const hours = Object.keys(daySchedule).map(Number).sort((a,b)=>a-b);

  for (let i = 1; i < hours.length; i++) {
    if (hours[i] !== hours[i-1] + 1) return false;
  }

  return true;
}

// 💀 BACKTRACKING
function solve(index, lessons, schedule, teacherBusy, classBusy, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  if (index === lessons.length) {

    if (!noEmptyDays(schedule)) return false;

    for (let cls in schedule) {
      for (let day in schedule[cls]) {
        if (!isDayContinuous(schedule[cls][day])) return false;
      }
    }

    return true;
  }

  const lesson = lessons[index];

  for (let day of days) {
    for (let hour of hours) {

      if (canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, data)) {

        place(lesson, day, hour, schedule, teacherBusy, classBusy);

        if (solve(index + 1, lessons, schedule, teacherBusy, classBusy, data)) {
          return true;
        }

        remove(lesson, day, hour, schedule, teacherBusy, classBusy);
      }
    }
  }

  return false;
}

// 🎯 MAIN
async function generateSchedule(data) {

  const lessons = getAllLessons(data);

  // 🔥 trudne najpierw
  lessons.sort((a, b) => {

    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const availA = ta?.availability.length || 999;
    const availB = tb?.availability.length || 999;

    return (availA + a.classes.length * 10) - (availB + b.classes.length * 10);
  });

  let schedule = {};
  let teacherBusy = {};
  let classBusy = {};

  const success = solve(0, lessons, schedule, teacherBusy, classBusy, data);

  if (!success) {
    return {
      status: "FAIL",
      message: "Brak rozwiązania dla danych ograniczeń"
    };
  }

  return {
    status: "OK",
    notPlaced: 0,
    gaps: 0,
    schedule
  };
}

export { generateSchedule };
