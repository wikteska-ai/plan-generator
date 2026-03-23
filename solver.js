const TIME_LIMIT = 40000;

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

// 🧠 HARD CHECK
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

// 🎯 SCORING (KLUCZ)
function evaluatePlacement(lesson, day, hour, schedule) {

  let score = 0;

  for (let cls of lesson.classes) {

    const daySchedule = schedule[cls]?.[day] || {};
    const hours = Object.keys(daySchedule).map(Number);

    if (hours.length > 0) {

      const min = Math.min(...hours);
      const max = Math.max(...hours);

      // ❌ dziura
      if (hour > min && hour < max) score -= 50;

      // ✅ ciągłość
      if (hours.includes(hour - 1) || hours.includes(hour + 1)) score += 15;
    }

    // ❌ wolny dzień
    if (hours.length === 0) score -= 25;

    // ❌ za dużo lekcji
    if (hours.length >= 6) score -= 20;

    // ✅ preferuj środek dnia
    if (hour >= 2 && hour <= 6) score += 5;
  }

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

// 🧠 GENERATE OPTIONS (BEST-FIRST)
function getBestOptions(lesson, schedule, teacherBusy, classBusy, teacherCount, data) {

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

  // 🔥 najlepsze najpierw
  options.sort((a,b)=>b.score - a.score);

  return options;
}

// 🔥 BACKTRACKING SOLVER
function solve(index, lessons, schedule, teacherBusy, classBusy, teacherCount, data, startTime, bestState) {

  if (Date.now() - startTime > TIME_LIMIT) return false;

  if (index > bestState.bestPlaced) {
    bestState.bestPlaced = index;
    bestState.snapshot = JSON.parse(JSON.stringify(schedule));
  }

  if (index === lessons.length) return true;

  const lesson = lessons[index];

  const options = getBestOptions(lesson, schedule, teacherBusy, classBusy, teacherCount, data);

  for (let opt of options) {

    place(lesson, opt.day, opt.hour, schedule, teacherBusy, classBusy, teacherCount);

    if (solve(index + 1, lessons, schedule, teacherBusy, classBusy, teacherCount, data, startTime, bestState)) {
      return true;
    }

    remove(lesson, opt.day, opt.hour, schedule, teacherBusy, classBusy, teacherCount);
  }

  return false;
}

// 🧠 SORT LEKCJI (NAJTRUDNIEJSZE PIERWSZE)
function sortLessons(lessons, data) {

  return lessons.sort((a, b) => {

    const ta = data.teachers.find(t => t.id === a.teacher);
    const tb = data.teachers.find(t => t.id === b.teacher);

    const scoreA =
      (a.classes.length * 20) +
      (100 - (ta?.availability.length || 100));

    const scoreB =
      (b.classes.length * 20) +
      (100 - (tb?.availability.length || 100));

    return scoreB - scoreA;
  });
}

// 🎯 MAIN
async function generateSchedule(data) {

  let lessons = getAllLessons(data);
  lessons = sortLessons(lessons, data);

  let bestState = {
    bestPlaced: 0,
    snapshot: null
  };

  for (let attempt = 0; attempt < 5; attempt++) {

    console.log("🔥 Próba:", attempt);

    lessons = lessons.sort(() => Math.random() - 0.5);

    let schedule = {};
    let teacherBusy = {};
    let classBusy = {};
    let teacherCount = {};

    const startTime = Date.now();

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

    if (success) {
      console.log("✅ IDEALNY PLAN");
      return {
        status: "OK",
        notPlaced: 0,
        schedule
      };
    }
  }

  console.log("⚠️ NIE IDEALNY, ALE NAJLEPSZY ZNALEZIONY");

  return {
    status: "PARTIAL",
    placed: bestState.bestPlaced,
    schedule: bestState.snapshot
  };
}

export { generateSchedule };
