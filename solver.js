const TIME_LIMIT = 240000; // 25s na próbę

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

// 🔥 trudne najpierw
function sortLessons(data, lessons) {
  return lessons.sort((a, b) => {

    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const availA = ta?.availability.length || 999;
    const availB = tb?.availability.length || 999;

    return availA - availB;
  });
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

function remove(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount) {

  delete teacherBusy[lesson.teacher + "_" + day + "_" + hour];
  teacherCount[lesson.teacher]--;

  for (let cls of lesson.classes) {
    delete classBusy[cls + "_" + day + "_" + hour];
    delete schedule[cls][day][hour];
  }
}

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

// 💀 SMART SOLVER + timeout
function solve(lessons, schedule, teacherBusy, classBusy, teacherCount, data, startTime) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  if (Date.now() - startTime > TIME_LIMIT) return false;

  if (lessons.length === 0) {

    if (!noEmptyDays(schedule)) return false;

    for (let cls in schedule) {
      for (let day in schedule[cls]) {
        if (!isDayContinuous(schedule[cls][day])) return false;
      }
    }

    return true;
  }

  // 🔥 MRV - najtrudniejsza lekcja
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

  const remaining = lessons.filter(l => l !== bestLesson);

  let possibleSlots = [];

  for (let day of days) {
    for (let hour of hours) {
      if (canPlace(bestLesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data)) {
        possibleSlots.push({ day, hour });
      }
    }
  }

  for (let { day, hour } of possibleSlots) {

    place(bestLesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);

    if (solve(remaining, schedule, teacherBusy, classBusy, teacherCount, data, startTime)) {
      return true;
    }

    remove(bestLesson, day, hour, schedule, teacherBusy, classBusy, teacherCount);
  }

  return false;
}

// 🎯 MAIN
async function generateSchedule(data) {

  let lessons = getAllLessons(data);
  lessons = sortLessons(data, lessons);

  for (let attempt = 0; attempt < 15; attempt++) {

    let schedule = {};
    let teacherBusy = {};
    let classBusy = {};
    let teacherCount = {};

    const startTime = Date.now();

    const success = solve(lessons, schedule, teacherBusy, classBusy, teacherCount, data, startTime);

    if (success) {
      return {
        status: "OK",
        notPlaced: 0,
        gaps: 0,
        schedule
      };
    }
  }

  return {
    status: "FAIL",
    message: "Nie znaleziono w czasie limitu"
  };
}

export { generateSchedule };
