#!/usr/bin/env node
// Dev-only: write a localStorage seed (JSON, key → string) with ten weeks of
// logs so the consistency tracker shows plenty of stones. Most days are
// complete (food + sleep + workout, or food + sleep on a weekend); about a
// third of those have steps too.
//
//   node dev/seed-tracker.mjs > seed.json
//   node dev/shoot.mjs --url http://localhost:5173/ --seed seed.json …
const DAY = 86400000
const now = new Date()
now.setHours(12, 0, 0, 0)
// start on a Monday ten weeks back
const start = new Date(now.getTime() - 70 * DAY)
start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
let n = 0
const uid = () => `seed-${(n++).toString(36)}`
const iso = (d, h, m = 0) => {
  const x = new Date(d)
  x.setHours(h, m, 0, 0)
  return x.toISOString()
}
const key = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`
}
// deterministic pseudo-random so shots are repeatable
let s = 12345
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)

const foodLog = [], sleepLog = [], workoutLog = [], cardioLog = []
for (let d = new Date(start); d <= now; d = new Date(d.getTime() + DAY)) {
  const weekend = d.getDay() === 0 || d.getDay() === 6
  const r = rnd()
  const food = r < 0.9
  const sleep = rnd() < 0.85
  const workout = !weekend && rnd() < 0.7
  const steps = rnd() < 0.35
  if (food) {
    foodLog.push({ id: uid(), datetime: iso(d, 8), mealId: null, name: "Oatmeal", serving: "1 cup", quantity: 1, calories: 300, protein: 10, carbs: 54, fat: 5 })
    foodLog.push({ id: uid(), datetime: iso(d, 13), mealId: null, name: "Chicken & rice", serving: "1 plate", quantity: 1, calories: 650, protein: 45, carbs: 70, fat: 14 })
  }
  if (sleep) sleepLog.push({ id: uid(), datetime: iso(d, 0, 30), kind: "sleep", durationSec: 7 * 3600 })
  if (workout) workoutLog.push({ id: uid(), datetime: iso(d, 18), routineId: null, exercises: [], durationSec: 3600 })
  if (steps) cardioLog.push({ id: uid(), datetime: iso(d, 21), activity: "Steps", durationSec: 0, steps: 9000 + Math.floor(rnd() * 4000) })
}
const seed = {
  wt_food_log: JSON.stringify(foodLog),
  wt_sleep_log: JSON.stringify(sleepLog),
  wt_workout_log: JSON.stringify(workoutLog),
  wt_cardio_log: JSON.stringify(cardioLog),
  wt_settings: JSON.stringify({ trackingStartDate: key(start) }),
  wt_user: JSON.stringify({ theme: process.argv.includes("--dark") ? "dark" : "light" }),
  wt_nav: JSON.stringify({ section: "home", logTab: "food" }),
}
process.stdout.write(JSON.stringify(seed))
