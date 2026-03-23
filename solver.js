import fs from "fs";

const TIME_LIMIT = 180000;

let lastUpdate = 0;

// 📡 zapis progresu
function saveProgress(state) {
  try {
    fs.writeFileSync("progress.json", JSON.stringify(state));
  } catch (e) {}
}

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

// 🧠 HARD CONSTRAINTS
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

// 🎯 SCORING
function evaluatePlacement(lesson, day, hour, schedule) {

  let score = 0;

  for (let cls of lesson.classes) {

    const daySchedule = schedule[cls]?.[day] || {};
    const hours = Object.keys(daySchedule).map(Number);

    if (hours.length > 0) {

      const min = Math.min(...hours);
      const max = Math.max(...hours);

      if (hour > min && hour < max) score -= 80;

      if (hours.includes(hour - 1) || hours.includes(hour + 1)) score += 25;
    }

    if (hours.length === 0) score -= 60;

    if (hours.length >= 6) score -= 40;

    if (hour >= 2 && hour <= 6) score += 10;
  }

  if (lesson.classes.length > 1) score += 30;

  return score;
}

// 📌 PLACE
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

// ❌ REMOVE
function remove(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount) {

  delete teacherBusy[lesson.teacher + "_" + day + "_" + hour];
  teacherCount[lesson.teacher]--;

  for (let cls of lesson.classes) {
    delete classBusy[cls + "_" + day + "_" + hour];
    delete schedule[cls][day][hour];
  }
}

// 🧠 OPCJE
function getAllOptions(lesson, schedule, teacherBusy, classBusy, teacherCount, data) {

  const days = ["Mon","Tue","Wed","Thu","Fri"];
  const hours = [1,2,3,4,5,6,7,8];

  let options = [];

  for (let day of days) {
    for (let hour of hours) {

      if (!canPlace(lesson, day, hour, schedule, teacherBusy, classBusy, teacherCount, data)) continue;

      const score = evaluatePlacement(lesson, day, hour, schedule);

      options.push({ day, hour, score });
    }
  }

  options.sort((a,b)=>b.score - a.score);

  return options;
}

// 🔥 SORT
function sortLessons(lessons, data) {

  return lessons.sort((a, b) => {

    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const scoreA =
      (a.classes.length * 100) +
      (200 - (ta?.availability.length || 200));

    const scoreB =
      (b.classes.length * 100) +
      (200 - (tb?.availability.length || 200));

    return scoreB - scoreA;
  });
}

// 🧠 SOLVER
function solve(index, lessons, schedule, teacherBusy, classBusy, teacherCount, data, startTime, bestState) {

  if (Date.now() - startTime > TIME_LIMIT) return false;

  if (index > bestState.bestPlaced) {

    bestState.bestPlaced = index;
    bestState.snapshot = JSON.parse(JSON.stringify(schedule));

    const now = Date.now();

    if (now - lastUpdate > 200) {

      saveProgress({
        progress: index,
        total: lessons.length,
        percent: Math.floor((index / lessons.length) * 100),
        bestPlaced: bestState.bestPlaced,
        elapsed: Math.floor((now - startTime) / 1000),
        status: "working"
      });

      lastUpdate = now;
    }
  }

  if (index === lessons.length) return true;

  const lesson = lessons[index];

  const options = getAllOptions(lesson, schedule, teacherBusy, classBusy, teacherCount, data);

  for (let opt of options) {

    place(lesson, opt.day, opt.hour, schedule, teacherBusy, classBusy, teacherCount);

    if (solve(index + 1, lessons, schedule, teacherBusy, classBusy, teacherCount, data, startTime, bestState)) {
      return true;
    }

    remove(lesson, opt.day, opt.hour, schedule, teacherBusy, classBusy, teacherCount);
  }

  return false;
}

// 🎯 MAIN
async function generateSchedule(data) {

  let lessons = getAllLessons(data);
  lessons = sortLessons(lessons, data);

  let bestState = {
    bestPlaced: 0,
    snapshot: null
  };

  const startTime = Date.now();

  let schedule = {};
  let teacherBusy = {};
  let classBusy = {};
  let teacherCount = {};

  const success = solve(
    0,
    lessons,
    schedule,
    teacherBusy,
    classBusy,
    teacherCount,
    data,
    startTime,
    bestState
  );

  const elapsed = Math.floor((Date.now() - startTime) / 1000);

  if (success) {

    saveProgress({
      progress: lessons.length,
      total: lessons.length,
      percent: 100,
      bestPlaced: lessons.length,
      elapsed,
      status: "done"
    });

    return {
      status: "OK",
      schedule
    };
  }

  saveProgress({
    progress: bestState.bestPlaced,
    total: lessons.length,
    percent: Math.floor((bestState.bestPlaced / lessons.length) * 100),
    bestPlaced: bestState.bestPlaced,
    elapsed,
    status: "partial"
  });

  return {
    status: "PARTIAL",
    placed: bestState.bestPlaced,
    schedule: bestState.snapshot
  };
}

export { generateSchedule };
