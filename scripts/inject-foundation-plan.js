/*
 * Foundation Program — routine + exercise injector for Adonis.
 *
 * WHAT IT DOES
 *   Adds 9 custom exercises and 6 routines (Mon-Fri lifting/engine days plus a
 *   daily foot routine) to the app's localStorage. Non-destructive and
 *   idempotent: existing exercises are matched by id, and the 6 routines are
 *   replaced by name on re-run so you never get duplicates.
 *
 * HOW TO USE (works on ANY instance: localhost, hosted, phone PWA)
 *   1. Open your Adonis app in the browser.
 *   2. Open DevTools console (Cmd+Opt+J on Mac Chrome).
 *   3. Paste this whole file and press Enter. The page reloads with the plan in
 *      Settings -> Routines. If auto-sync is on, it pushes to your sync code and
 *      reaches your other devices.
 *
 * Re-run any time (e.g. after a data clear) to restore the routines.
 */
;(function injectFoundationPlan() {
  const customEx = [
    { id: "ex_single-leg-calf-raise-left", name: "Single-Leg Calf Raise (Left)", muscleGroup: "Legs", equipment: "Bodyweight", builtIn: false },
    { id: "ex_assisted-pull-up-machine", name: "Assisted Pull-Up (Machine)", muscleGroup: "Back", equipment: "Machine", builtIn: false },
    { id: "ex_angled-squat-machine", name: "Angled Squat Machine", muscleGroup: "Legs", equipment: "Machine", builtIn: false },
    { id: "ex_pallof-press", name: "Pallof Press", muscleGroup: "Core", equipment: "Cable", builtIn: false },
    { id: "ex_tibialis-raise", name: "Tibialis Raise", muscleGroup: "Legs", equipment: "Bodyweight", builtIn: false },
    { id: "ex_short-foot-hold", name: "Short-Foot Hold", muscleGroup: "Legs", equipment: "Bodyweight", builtIn: false },
    { id: "ex_single-leg-balance", name: "Single-Leg Balance", muscleGroup: "Core", equipment: "Bodyweight", builtIn: false },
    { id: "ex_big-toe-press", name: "Big-Toe Press", muscleGroup: "Legs", equipment: "Bodyweight", builtIn: false },
    { id: "ex_standing-calf-stretch", name: "Standing Calf Stretch", muscleGroup: "Legs", equipment: "Bodyweight", builtIn: false },
  ]

  const routines = [
    { id: "rt_foundation_upper_a", name: "Upper A - Horizontal Push/Pull (Mon)", exercises: [
      { exerciseId: "ex_bench-press-flat", targetSets: 3, notes: "Flat DUMBBELL bench press. 8-10 reps, rest 2 min. Feet planted, slight arch, DBs to chest level. Warm-up first (5 min): arm circles, band pull-aparts x15, push-ups x8, then 2 light ramp sets." },
      { exerciseId: "ex_seated-cable-row", targetSets: 3, notes: "10-12 reps, rest 90s. Squeeze shoulder blades together 1 sec each rep." },
      { exerciseId: "ex_seated-dumbbell-press", targetSets: 3, notes: "Seated DB shoulder press. 8-10 reps, rest 90s." },
      { exerciseId: "ex_lat-pulldown-wide", targetSets: 3, notes: "10-12 reps, rest 90s. Pull to upper chest, elbows down and back." },
      { exerciseId: "ex_dumbbell-curl-both", targetSets: 2, notes: "Superset A with rope pushdowns. 12-15 reps, back-to-back, no rest between the pair." },
      { exerciseId: "ex_tricep-pushdown-rope", targetSets: 2, notes: "Superset B with DB curls. 12-15 reps, rest 60s after the pair." },
    ] },
    { id: "rt_foundation_lower_a", name: "Lower A - Squat + Calves/Foot (Tue)", exercises: [
      { exerciseId: "ex_goblet-squat", targetSets: 3, notes: "8-10 reps, rest 90s. Heels down, big toe pressing the floor. Tripod foot: heel + big-toe knuckle + pinky side. Warm-up: ankle circles x10/side, glute bridges x15, BW squats x15, leg swings x10/side, short-foot holds left x5. UPGRADE GATE: goblet 3x10 @ 60 lb DB clean -> switch to barbell back squat 3x6-8 (start bar + 10s)." },
      { exerciseId: "ex_leg-press", targetSets: 3, notes: "10-12 reps, rest 2 min. Feet mid-platform, hip width. Foot-stable, load heavy safely." },
      { exerciseId: "ex_leg-curl-seated", targetSets: 3, notes: "10-12 reps, rest 90s. Control the lowering." },
      { exerciseId: "ex_calf-raise-standing", targetSets: 3, notes: "10-15 reps, rest 60s. 3s down, 2s pause at the bottom stretch, drive up through the big toe. Full range or do not count it." },
      { exerciseId: "ex_single-leg-calf-raise-left", targetSets: 2, notes: "LEFT ONLY, bodyweight, hold rail. Max clean reps, log the count. Catch-up work and your RUNNING GATE (20 clean reps = earn walk-jog intervals). Cool-down: calf stretch 45s/side, deep squat hold 30s, big-toe pull-back stretch left 30s." },
    ] },
    { id: "rt_foundation_engine", name: "Engine Day - Cardio + Core + Foot (Wed)", exercises: [
      { exerciseId: "ex_stationary-bike", targetSets: 1, notes: "Zone-2, 25-30 min. Conversational pace, lightly sweating (can speak full sentences). Rotate bike/elliptical/incline-treadmill to spare the foot. Log the details in the Cardio tab." },
      { exerciseId: "ex_dead-bug", targetSets: 3, notes: "Core circuit x2-3 rounds, minimal rest. 8 per side." },
      { exerciseId: "ex_plank", targetSets: 3, notes: "Core circuit. 30-45 sec hold." },
      { exerciseId: "ex_pallof-press", targetSets: 3, notes: "Core circuit. Cable anti-rotation hold, 10 per side." },
      { exerciseId: "ex_tibialis-raise", targetSets: 2, notes: "Foot circuit x2 rounds. Back against wall, lift toes, 15 reps." },
      { exerciseId: "ex_short-foot-hold", targetSets: 2, notes: "Foot circuit. Towel scrunches or short-foot, 10 reps. LEFT does both rounds, right does one." },
      { exerciseId: "ex_single-leg-balance", targetSets: 2, notes: "Foot circuit. 30 sec per side, eyes forward, barefoot if the gym allows." },
    ] },
    { id: "rt_foundation_upper_b", name: "Upper B - Vertical Push/Pull + Carries (Thu)", exercises: [
      { exerciseId: "ex_bench-press-incline", targetSets: 3, notes: "Incline DUMBBELL press, bench at 30 deg. 8-12 reps, rest 2 min. Warm-up (5 min): arm circles, band pull-aparts x15, push-ups x8, 2 ramp sets." },
      { exerciseId: "ex_assisted-pull-up-machine", targetSets: 3, notes: "6-10 reps, rest 2 min. Set the assist so 6-10 reps is hard. Milestone: first unassisted pull-up." },
      { exerciseId: "ex_single-arm-dumbbell-row", targetSets: 3, notes: "10-12 per side, rest 60-75s." },
      { exerciseId: "ex_lateral-raise-dumbbell", targetSets: 3, notes: "Superset A with face pulls. 12-15 reps, light weight, strict form." },
      { exerciseId: "ex_face-pull", targetSets: 3, notes: "Superset B with lateral raises. 12-15 reps, rest 60s after the pair." },
      { exerciseId: "ex_farmer-s-carry", targetSets: 3, notes: "30-40 m per set, rest 90s. Heaviest DBs you can hold with tall posture." },
    ] },
    { id: "rt_foundation_lower_b", name: "Lower B - Hinge + Single-Leg (Fri)", exercises: [
      { exerciseId: "ex_romanian-deadlift", targetSets: 3, notes: "DUMBBELL RDL. 8-10 reps, rest 2 min. Soft knees, hips back, DBs slide down thighs, stop when hamstrings pull hard. Do NOT round the back. UPGRADE GATE: DB RDL 3x10 @ 50 lb/hand -> barbell RDL. Warm-up: Monday pattern + 10 practice hip hinges." },
      { exerciseId: "ex_angled-squat-machine", targetSets: 3, notes: "10-12 reps, rest 90s. The Precor angled squat machine (or leg press)." },
      { exerciseId: "ex_step-ups", targetSets: 3, notes: "8-10 per leg, rest 90s. LEFT FIRST, right only matches the left. Drive through the whole foot, control the way down. Knee-height box max." },
      { exerciseId: "ex_calf-raise-seated", targetSets: 3, notes: "12-15 reps, rest 60s. Same tempo (3s down, 2s pause). LEFT gets +1 set." },
      { exerciseId: "ex_cable-crunch", targetSets: 2, notes: "10-15 reps, rest 60s. Or hanging knee raise." },
    ] },
    { id: "rt_foundation_foot", name: "Daily Foot Routine (home, 5 min)", exercises: [
      { exerciseId: "ex_short-foot-hold", targetSets: 5, notes: "LEFT. 5 x 5 sec. Grip the floor with your arch without curling the toes." },
      { exerciseId: "ex_big-toe-press", targetSets: 1, notes: "LEFT. Press the big toe down while the other four lift, then reverse. x15." },
      { exerciseId: "ex_standing-calf-stretch", targetSets: 1, notes: "45 sec per side. If the sensation ever turns to sharp pain (especially first steps in the morning), book a podiatrist and ask about an insole." },
    ] },
  ]

  const ex = JSON.parse(localStorage.getItem("wt_exercises") || "[]")
  const exIds = new Set(ex.map((e) => e.id))
  let added = 0
  for (const c of customEx) {
    if (!exIds.has(c.id)) {
      ex.push(c)
      exIds.add(c.id)
      added++
    }
  }
  localStorage.setItem("wt_exercises", JSON.stringify(ex))

  let rt = JSON.parse(localStorage.getItem("wt_routines") || "[]")
  const names = new Set(routines.map((r) => r.name))
  rt = rt.filter((r) => !names.has(r.name)).concat(routines)
  localStorage.setItem("wt_routines", JSON.stringify(rt))

  const allIds = new Set(ex.map((e) => e.id))
  const unresolved = routines
    .flatMap((r) => r.exercises.map((re) => re.exerciseId))
    .filter((id) => !allIds.has(id))

  console.log("[Foundation] exercises added:", added, "| routines now:", rt.length, "| unresolved refs:", unresolved)
  location.reload()
})()
