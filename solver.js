export async function generateSchedule(data) {
  return {
    status: "OK",
    message: "Solver działa 🎯",
    liczba_lekcji: data.lessons ? data.lessons.length : 0
  };
}