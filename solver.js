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

  // 🔥 max godzin nauczyciela
  if ((teacherCount[lesson.teacher] || 0) >= teacher.maxHours) return false;

  for (let cls of lesson.classes) {

    if (classBusy[cls + "_" + day + "_" + hour]) return false;

    const daySchedule = schedule[cls]?.[day];

    // limit dzienny klasy
    const MAX = 7;
    if (daySchedule && Object.keys(daySchedule).length >= MAX) return false;
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

// 🔥 brak okienek
function isDayContinuous(daySchedule) {

  if (!daySchedule) return true;

  const hours = Object.keys(daySchedule).map(Number).sort((a,b)=>a-b);

  for (let i = 1; i < hours.length; i++) {
    if (hours[i] !== hours[i-1] + 1) return false;
  }

  return true;
}

// 💀 BACKTRACKING
function solve(lessons, schedule, teacherBusy, classBusy, teacherCount, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  if (lessons.length === 0) {

    if (!noEmptyDays(schedule)) return false;

    for (let cls in schedule) {
      for (let day in schedule[cls]) {
        if (!isDayContinuous(schedule[cls][day])) return false;
      }
    }

    return true;
  }

  // 🔥 wybierz NAJTRUDNIEJSZĄ lekcję (dynamicznie)
  let bestLesson = null;
  let bestOptions = 9999;

  for (let lesson of lessons) {

    let options = 0;

    for (let day of days) {
      for (let hour of hours) {
        if (canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data)) {
          options++;
        }
      }
    }

    if (options === 0) return false;

    if (options < bestOptions) {
      bestOptions = options;
      bestLesson = lesson;
    }
  }

  // usuń ją z listy
  const remaining = lessons.filter(l => l !== bestLesson);

  // 🔥 próbuj tylko sensowne sloty
  for (let day of days) {
    for (let hour of hours) {

      if (canPlace(bestLesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data)) {

        place(bestLesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);

        if (solve(remaining, schedule, teacherBusy, classBusy, teacherCount, data)) {
          return true;
        }

        remove(bestLesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);
      }
    }
  }

  return false;
}

  const lesson = lessons[index];

  for (let day of days) {
    for (let hour of hours) {

      if (canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data)) {

        place(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);

        if (solve(index + 1, lessons, schedule, teacherBusy, classBusy, teacherCount, data)) {
          return true;
        }

        remove(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);
      }
    }
  }

  return false;
}

// 🎯 MAIN
async function generateSchedule(data) {

  const lessons = getAllLessons(data);

  // 🔥 KLUCZOWE SORTOWANIE (naprawione)
  lessons.sort((a, b) => {

    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const availA = ta?.availability.length || 999;
    const availB = tb?.availability.length || 999;

    const scoreA = availA / (a.classes.length || 1);
    const scoreB = availB / (b.classes.length || 1);

    return scoreA - scoreB;
  });

  let schedule = {};
  let teacherBusy = {};
  let classBusy = {};
  let teacherCount = {};

const success = solve(lessons, schedule, teacherBusy, classBusy, teacherCount, data);
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
