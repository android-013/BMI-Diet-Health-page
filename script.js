const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const STORAGE_KEY = 'pulsefit-planner-v1';
const todayKey = () => new Date().toISOString().slice(0, 10);

const state = {
  unit: 'metric',
  profile: {},
  plan: null,
  today: {
    date: todayKey(),
    meals: [],
    workouts: [],
    habits: { water: 0, steps: 0, sleep: false, stretch: false },
  },
  history: [],
};

const activityLabels = {
  '1.2': 'Sedentary',
  '1.375': 'Light',
  '1.55': 'Moderate',
  '1.725': 'Very Active',
  '1.9': 'Athlete',
};

const routines = {
  balanced: [
    ['Full Body Strength', 'Goblet squats 3×12', 'Push-ups 3×10', 'Dumbbell rows 3×12', 'Plank 3×40 sec'],
    ['Cardio Engine', 'Brisk walk/jog 25 min', 'Jumping jacks 3×45 sec', 'Mountain climbers 3×30 sec', 'Cool-down stretch'],
    ['Mobility + Core', 'Hip openers 8 min', 'Dead bugs 3×12', 'Side plank 3×30 sec', 'Light walk 15 min'],
  ],
  'fat-loss': [
    ['HIIT Burn', 'Squat jumps 4×12', 'Burpees 4×8', 'High knees 4×40 sec', 'Slow walk 10 min'],
    ['Zone 2 Cardio', 'Cycling/walk 35 min', 'Incline walk 15 min', 'Core crunch 3×15', 'Stretch 8 min'],
    ['Metabolic Circuit', 'Lunges 3×12', 'Push-ups 3×10', 'Kettlebell swing 3×15', 'Plank jacks 3×25'],
  ],
  strength: [
    ['Lower Strength', 'Back squat 5×5', 'Romanian deadlift 4×6', 'Walking lunge 3×10', 'Calf raise 3×15'],
    ['Upper Strength', 'Bench press 5×5', 'Barbell row 4×6', 'Overhead press 4×6', 'Farmer carry 4×30m'],
    ['Pull + Core', 'Deadlift 4×5', 'Lat pulldown 4×8', 'Face pull 3×12', 'Weighted plank 3×35 sec'],
  ],
  muscle: [
    ['Push Hypertrophy', 'Incline press 4×10', 'Shoulder press 3×12', 'Chest fly 3×15', 'Triceps pushdown 3×15'],
    ['Pull Hypertrophy', 'Pull-down 4×10', 'Seated row 4×12', 'Rear delt raise 3×15', 'Biceps curl 3×12'],
    ['Leg Growth', 'Leg press 4×12', 'Bulgarian split squat 3×10', 'Leg curl 3×15', 'Leg extension 3×15'],
  ],
  mobility: [
    ['Recovery Flow', 'Cat-cow 2 min', 'World greatest stretch 3×side', 'Hamstring floss 3×12', 'Breathing 5 min'],
    ['Joint Control', 'Shoulder circles 3×12', 'Hip CARs 3×side', 'Ankle rocks 3×15', 'Deep squat hold 3×45 sec'],
    ['Low Impact Core', 'Bird dog 3×12', 'Glute bridge 3×15', 'Pallof press 3×12', 'Easy walk 20 min'],
  ],
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    Object.assign(state, saved);
    if (!state.today || state.today.date !== todayKey()) {
      const previousToday = state.today;
      if (previousToday && previousToday.date && !state.history.some((d) => d.date === previousToday.date)) {
        state.history.push(createDaySnapshot(previousToday));
      }
      state.today = {
        date: todayKey(),
        meals: [],
        workouts: [],
        habits: { water: 0, steps: 0, sleep: false, stretch: false },
      };
      saveState();
    }
  } catch (error) {
    console.warn('Could not load saved planner data', error);
  }
}

function toast(message) {
  const old = $('.toast');
  if (old) old.remove();
  const note = document.createElement('div');
  note.className = 'toast';
  note.textContent = message;
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 3200);
}

function kgToLb(kg) { return kg * 2.2046226218; }
function lbToKg(lb) { return lb / 2.2046226218; }
function cmToFtIn(cm) {
  const totalIn = cm / 2.54;
  const ft = Math.floor(totalIn / 12);
  const inch = Math.round(totalIn - ft * 12);
  return { ft, inch: inch === 12 ? 0 : inch };
}
function ftInToCm(ft, inch) { return ((Number(ft) || 0) * 12 + (Number(inch) || 0)) * 2.54; }
function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

function getProfileValues() {
  const age = Number($('#age').value);
  const gender = $('#gender').value;
  const name = $('#name').value.trim() || 'Fitness friend';
  const activity = Number($('#activity').value);
  const goal = $('#goal').value;
  const focus = $('#focus').value;
  let heightCm, weightKg, targetWeightKg;

  if (state.unit === 'metric') {
    heightCm = Number($('#heightCm').value);
    weightKg = Number($('#weightKg').value);
    targetWeightKg = Number($('#targetWeight').value || weightKg);
  } else {
    heightCm = ftInToCm($('#heightFt').value, $('#heightIn').value);
    weightKg = lbToKg(Number($('#weightLb').value));
    targetWeightKg = lbToKg(Number($('#targetWeight').value || $('#weightLb').value));
  }

  return { name, age, gender, heightCm, weightKg, targetWeightKg, activity, goal, focus };
}

function validateProfile(profile) {
  const errors = [];
  if (!profile.age || profile.age < 13 || profile.age > 100) errors.push('Enter a realistic age.');
  if (!profile.heightCm || profile.heightCm < 90 || profile.heightCm > 250) errors.push('Enter a realistic height.');
  if (!profile.weightKg || profile.weightKg < 25 || profile.weightKg > 300) errors.push('Enter a realistic weight.');
  return errors;
}

function calculatePlan(profile) {
  const heightM = profile.heightCm / 100;
  const bmi = profile.weightKg / (heightM * heightM);
  const bmr = profile.gender === 'male'
    ? 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + 5
    : 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age - 161;
  const tdee = bmr * profile.activity;

  let calorieGoal = tdee;
  let goalLabel = 'Maintenance target';
  if (profile.goal === 'lose') {
    calorieGoal = tdee - 500;
    goalLabel = 'Fat-loss target';
  }
  if (profile.goal === 'gain') {
    calorieGoal = tdee + 300;
    goalLabel = 'Muscle-gain target';
  }
  calorieGoal = Math.max(1200, calorieGoal);

  const proteinRatio = profile.goal === 'gain' ? 0.32 : profile.goal === 'lose' ? 0.34 : 0.28;
  const carbRatio = profile.goal === 'gain' ? 0.43 : profile.goal === 'lose' ? 0.36 : 0.42;
  const fatRatio = 1 - proteinRatio - carbRatio;

  const macros = {
    protein: Math.round((calorieGoal * proteinRatio) / 4),
    carbs: Math.round((calorieGoal * carbRatio) / 4),
    fat: Math.round((calorieGoal * fatRatio) / 9),
  };

  const weightDiff = profile.targetWeightKg - profile.weightKg;
  const weeklyKg = profile.goal === 'gain' ? 0.25 : profile.goal === 'lose' ? -0.45 : 0;
  const estimatedWeeks = weeklyKg === 0 ? 0 : Math.ceil(Math.abs(weightDiff / weeklyKg));

  return {
    bmi,
    category: getBmiCategory(bmi),
    bmr,
    tdee,
    calorieGoal,
    goalLabel,
    macros,
    estimatedWeeks: Number.isFinite(estimatedWeeks) ? estimatedWeeks : 0,
  };
}

function getBmiCategory(bmi) {
  if (bmi < 18.5) return { label: 'Underweight', tone: 'warning', message: 'Focus on balanced nutrition and strength training.' };
  if (bmi < 25) return { label: 'Healthy weight', tone: 'success', message: 'Great range. Maintain consistency and performance.' };
  if (bmi < 30) return { label: 'Overweight', tone: 'warning', message: 'Small calorie control and regular training can help.' };
  if (bmi < 35) return { label: 'Obesity class 1', tone: 'danger', message: 'Consider a careful, sustainable fat-loss plan.' };
  if (bmi < 40) return { label: 'Obesity class 2', tone: 'danger', message: 'Professional guidance is recommended for safety.' };
  return { label: 'Obesity class 3', tone: 'danger', message: 'Please seek professional health guidance.' };
}

function dailyTotals() {
  const meals = state.today.meals.reduce((sum, meal) => ({
    calories: sum.calories + Number(meal.calories || 0),
    protein: sum.protein + Number(meal.protein || 0),
    carbs: sum.carbs + Number(meal.carbs || 0),
    fat: sum.fat + Number(meal.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const workouts = state.today.workouts.reduce((sum, workout) => ({
    minutes: sum.minutes + Number(workout.minutes || 0),
    calories: sum.calories + Number(workout.calories || 0),
  }), { minutes: 0, calories: 0 });
  return { meals, workouts };
}

function createDaySnapshot(day = state.today) {
  const meals = day.meals.reduce((sum, meal) => sum + Number(meal.calories || 0), 0);
  const burned = day.workouts.reduce((sum, workout) => sum + Number(workout.calories || 0), 0);
  const minutes = day.workouts.reduce((sum, workout) => sum + Number(workout.minutes || 0), 0);
  return {
    date: day.date,
    caloriesIn: meals,
    caloriesBurned: burned,
    workoutMinutes: minutes,
    water: Number(day.habits?.water || 0),
    steps: Number(day.habits?.steps || 0),
    complete: true,
  };
}

function saveTodayToHistory() {
  const snapshot = createDaySnapshot();
  const index = state.history.findIndex((item) => item.date === snapshot.date);
  if (index >= 0) state.history[index] = snapshot;
  else state.history.push(snapshot);
  state.history = state.history.slice(-30);
  saveState();
  render();
  toast('Today saved to progress history.');
}

function renderProfileForm() {
  $('#name').value = state.profile.name || '';
  $('#age').value = state.profile.age || '';
  $('#gender').value = state.profile.gender || 'male';
  $('#activity').value = String(state.profile.activity || 1.55);
  $('#goal').value = state.profile.goal || 'maintain';
  $('#focus').value = state.profile.focus || 'balanced';

  if (state.profile.heightCm) {
    $('#heightCm').value = Math.round(state.profile.heightCm);
    const ftin = cmToFtIn(state.profile.heightCm);
    $('#heightFt').value = ftin.ft;
    $('#heightIn').value = ftin.inch;
  }
  if (state.profile.weightKg) {
    $('#weightKg').value = round(state.profile.weightKg, 1);
    $('#weightLb').value = round(kgToLb(state.profile.weightKg), 1);
  }
  if (state.profile.targetWeightKg) {
    $('#targetWeight').value = state.unit === 'metric' ? round(state.profile.targetWeightKg, 1) : round(kgToLb(state.profile.targetWeightKg), 1);
  }
}

function renderUnitFields() {
  $$('.unit-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.unit === state.unit));
  $('.metric-fields').classList.toggle('hidden', state.unit !== 'metric');
  $('.imperial-fields').classList.toggle('hidden', state.unit !== 'imperial');
  $('#targetUnit').textContent = state.unit === 'metric' ? 'kg' : 'lb';
  if (state.profile.targetWeightKg) {
    $('#targetWeight').value = state.unit === 'metric' ? round(state.profile.targetWeightKg, 1) : round(kgToLb(state.profile.targetWeightKg), 1);
  }
}

function renderMetrics() {
  const plan = state.plan;
  if (!plan) {
    ['#bmiValue', '#bmrValue', '#tdeeValue', '#calorieGoalValue', '#heroBMI'].forEach((id) => $(id).textContent = '--');
    $('#bmiCategory').textContent = 'Add your profile';
    $('#goalLabel').textContent = 'Calories target';
    $('#heroCalories').textContent = '-- kcal';
    return;
  }

  $('#bmiValue').textContent = round(plan.bmi, 1);
  $('#bmiCategory').textContent = `${plan.category.label} — ${plan.category.message}`;
  $('#bmrValue').textContent = `${Math.round(plan.bmr)}`;
  $('#tdeeValue').textContent = `${Math.round(plan.tdee)}`;
  $('#calorieGoalValue').textContent = `${Math.round(plan.calorieGoal)}`;
  $('#goalLabel').textContent = plan.goalLabel;
  $('#heroBMI').textContent = round(plan.bmi, 1);
  $('#heroCalories').textContent = `${Math.round(plan.calorieGoal)} kcal`;
}

function renderDashboard() {
  const plan = state.plan;
  const totals = dailyTotals();
  const today = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  $('#todayDate').textContent = today;
  $('#welcomeTitle').textContent = state.profile.name ? `${state.profile.name}'s daily dashboard` : 'Your daily dashboard';
  $('#heroStreak').textContent = `${calculateStreak()} days`;

  if (!plan) {
    $('#calorieRing').style.setProperty('--progress', 0);
    $('#calorieLeft').textContent = '--';
    $('#dailySummary').textContent = 'Complete profile to unlock calorie and workout tracking.';
    ['#proteinTarget', '#carbTarget', '#fatTarget'].forEach((id) => $(id).textContent = '--g');
    ['#proteinBar', '#carbBar', '#fatBar'].forEach((id) => $(id).style.width = '0%');
    return;
  }

  const target = Math.round(plan.calorieGoal);
  const net = totals.meals.calories - totals.workouts.calories;
  const left = target - net;
  const progress = clamp((net / target) * 100, 0, 130);
  $('#calorieRing').style.setProperty('--progress', Math.min(progress, 100));
  $('#calorieLeft').textContent = `${Math.abs(Math.round(left))}`;
  $('#calorieRing small').textContent = left >= 0 ? 'kcal left' : 'kcal over';
  $('#dailySummary').textContent = `${Math.round(totals.meals.calories)} kcal eaten • ${Math.round(totals.workouts.calories)} kcal burned • ${state.today.habits.water || 0} glasses water • ${Number(state.today.habits.steps || 0).toLocaleString()} steps.`;

  $('#proteinTarget').textContent = `${Math.round(totals.meals.protein)}/${plan.macros.protein}g`;
  $('#carbTarget').textContent = `${Math.round(totals.meals.carbs)}/${plan.macros.carbs}g`;
  $('#fatTarget').textContent = `${Math.round(totals.meals.fat)}/${plan.macros.fat}g`;
  $('#proteinBar').style.width = `${clamp((totals.meals.protein / plan.macros.protein) * 100, 0, 100)}%`;
  $('#carbBar').style.width = `${clamp((totals.meals.carbs / plan.macros.carbs) * 100, 0, 100)}%`;
  $('#fatBar').style.width = `${clamp((totals.meals.fat / plan.macros.fat) * 100, 0, 100)}%`;
}

function renderLogs() {
  const mealList = $('#mealList');
  const workoutList = $('#workoutList');
  mealList.innerHTML = '';
  workoutList.innerHTML = '';

  if (!state.today.meals.length) {
    mealList.classList.add('empty-list');
    mealList.innerHTML = '<li>No meals added yet.</li>';
  } else {
    mealList.classList.remove('empty-list');
    state.today.meals.forEach((meal, index) => mealList.appendChild(makeEntry({
      title: meal.name,
      detail: `${meal.calories} kcal • P ${meal.protein || 0}g • C ${meal.carbs || 0}g • F ${meal.fat || 0}g`,
      onDelete: () => {
        state.today.meals.splice(index, 1);
        saveState();
        render();
      },
    })));
  }

  if (!state.today.workouts.length) {
    workoutList.classList.add('empty-list');
    workoutList.innerHTML = '<li>No workouts added yet.</li>';
  } else {
    workoutList.classList.remove('empty-list');
    state.today.workouts.forEach((workout, index) => workoutList.appendChild(makeEntry({
      title: workout.name,
      detail: `${workout.minutes} min • ${workout.calories || 0} kcal burned`,
      onDelete: () => {
        state.today.workouts.splice(index, 1);
        saveState();
        render();
      },
    })));
  }

  $('#water').value = state.today.habits.water || '';
  $('#steps').value = state.today.habits.steps || '';
  $('#sleepCheck').checked = Boolean(state.today.habits.sleep);
  $('#stretchCheck').checked = Boolean(state.today.habits.stretch);
}

function makeEntry({ title, detail, onDelete }) {
  const template = $('#entryTemplate').content.cloneNode(true);
  template.querySelector('strong').textContent = title;
  template.querySelector('small').textContent = detail;
  template.querySelector('button').addEventListener('click', onDelete);
  return template;
}

function renderRoutine() {
  const focus = state.profile.focus || $('#focus').value || 'balanced';
  const set = routines[focus] || routines.balanced;
  const grid = $('#routineGrid');
  grid.innerHTML = '';
  set.forEach((day, index) => {
    const card = document.createElement('article');
    card.className = 'routine-day';
    card.style.animationDelay = `${index * 60}ms`;
    const [title, ...items] = day;
    card.innerHTML = `
      <span class="routine-tag">Day ${index + 1}</span>
      <h4>${title}</h4>
      <ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>
    `;
    grid.appendChild(card);
  });
}

function calculateStreak() {
  const completedDates = new Set(state.history.filter((day) => day.workoutMinutes > 0 || day.caloriesBurned > 0).map((day) => day.date));
  if (state.today.workouts.length) completedDates.add(state.today.date);
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 60; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (completedDates.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderChart() {
  const canvas = $('#progressChart');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const days = getLastSevenDays();
  const maxValue = Math.max(1000, ...days.map((d) => Math.max(d.caloriesIn, d.caloriesBurned, state.plan?.calorieGoal || 0)));
  const padding = { top: 30, right: 24, bottom: 52, left: 54 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = '700 15px Inter, sans-serif';
  ctx.fillText('Calories eaten vs burned', padding.left, 22);

  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    const labelValue = Math.round(maxValue - (maxValue / 4) * i);
    ctx.fillStyle = 'rgba(167,181,216,.75)';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillText(labelValue, 8, y + 4);
  }

  const groupW = chartW / days.length;
  days.forEach((day, index) => {
    const x = padding.left + index * groupW + groupW * .22;
    const eatH = (day.caloriesIn / maxValue) * chartH;
    const burnH = (day.caloriesBurned / maxValue) * chartH;
    const barW = groupW * .22;
    drawBar(ctx, x, padding.top + chartH - eatH, barW, eatH, ['#6366f1', '#22d3ee']);
    drawBar(ctx, x + barW + 6, padding.top + chartH - burnH, barW, burnH, ['#0ea5e9', '#34d399']);

    ctx.fillStyle = 'rgba(215,228,255,.82)';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    const label = new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
    ctx.fillText(label, x + barW, height - 24);
    ctx.textAlign = 'left';
  });

  if (state.plan) {
    const targetY = padding.top + chartH - (state.plan.calorieGoal / maxValue) * chartH;
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(251,191,36,.8)';
    ctx.beginPath();
    ctx.moveTo(padding.left, targetY);
    ctx.lineTo(width - padding.right, targetY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(251,191,36,.95)';
    ctx.font = '800 11px Inter, sans-serif';
    ctx.fillText('goal', width - padding.right - 34, targetY - 8);
  }

  renderInsights(days);
}

function drawBar(ctx, x, y, w, h, colors) {
  const radius = 8;
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, colors[1]);
  gradient.addColorStop(1, colors[0]);
  ctx.fillStyle = gradient;
  const top = Math.max(y, y + h - h);
  ctx.beginPath();
  ctx.roundRect(x, top, w, Math.max(h, 2), radius);
  ctx.fill();
}

function getLastSevenDays() {
  const map = new Map(state.history.map((item) => [item.date, item]));
  map.set(state.today.date, createDaySnapshot(state.today));
  const days = [];
  const date = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(date);
    d.setDate(date.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(map.get(key) || { date: key, caloriesIn: 0, caloriesBurned: 0, workoutMinutes: 0, water: 0, steps: 0 });
  }
  return days;
}

function renderInsights(days) {
  const meaningful = days.filter((d) => d.caloriesIn || d.caloriesBurned || d.workoutMinutes || d.steps);
  if (!meaningful.length) {
    $('#insightBox').textContent = 'Save a few days to see trend insights here.';
    return;
  }
  const avgCalories = meaningful.reduce((sum, d) => sum + d.caloriesIn, 0) / meaningful.length;
  const totalWorkout = meaningful.reduce((sum, d) => sum + d.workoutMinutes, 0);
  const avgSteps = meaningful.reduce((sum, d) => sum + (Number(d.steps) || 0), 0) / meaningful.length;
  const target = state.plan?.calorieGoal || 0;
  const calorieMessage = target
    ? avgCalories > target + 150
      ? 'Average intake is above target; tighten portions or add walking.'
      : avgCalories < target - 350
        ? 'Average intake is far below target; avoid overly aggressive restriction.'
        : 'Average intake is close to target; consistency looks strong.'
    : 'Complete profile to compare calories against your target.';
  $('#insightBox').textContent = `${calorieMessage} This 7-day view has ${Math.round(totalWorkout)} workout minutes and an average of ${Math.round(avgSteps).toLocaleString()} steps on logged days.`;
}

function loadDemoData() {
  const date = new Date();
  state.history = [];
  for (let i = 6; i >= 1; i -= 1) {
    const d = new Date(date);
    d.setDate(date.getDate() - i);
    const base = state.plan?.calorieGoal || 2200;
    state.history.push({
      date: d.toISOString().slice(0, 10),
      caloriesIn: Math.round(base + (Math.random() * 360 - 160)),
      caloriesBurned: Math.round(160 + Math.random() * 260),
      workoutMinutes: Math.round(25 + Math.random() * 40),
      water: Math.round(5 + Math.random() * 5),
      steps: Math.round(4200 + Math.random() * 7600),
      complete: true,
    });
  }
  saveState();
  render();
  toast('Demo progress loaded. You can reset anytime.');
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pulsefit-data-${todayKey()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast('JSON export created.');
}

function resetData() {
  const confirmReset = confirm('Reset all PulseFit Planner data from this browser?');
  if (!confirmReset) return;
  localStorage.removeItem(STORAGE_KEY);
  state.unit = 'metric';
  state.profile = {};
  state.plan = null;
  state.today = { date: todayKey(), meals: [], workouts: [], habits: { water: 0, steps: 0, sleep: false, stretch: false } };
  state.history = [];
  $$('#profileForm input').forEach((input) => {
    if (input.type !== 'checkbox') input.value = '';
  });
  render();
  toast('Planner reset complete.');
}

function bindEvents() {
  $$('.unit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.unit = btn.dataset.unit;
      if (state.profile.weightKg) renderProfileForm();
      renderUnitFields();
      saveState();
    });
  });

  $('#profileForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const profile = getProfileValues();
    const errors = validateProfile(profile);
    if (errors.length) {
      toast(errors[0]);
      return;
    }
    state.profile = profile;
    state.plan = calculatePlan(profile);
    saveState();
    render();
    toast('Plan calculated and saved locally.');
  });

  $('#mealForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#mealName').value.trim() || 'Meal';
    const calories = Number($('#mealCalories').value || 0);
    if (!calories) return toast('Add meal calories first.');
    state.today.meals.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      calories,
      protein: Number($('#mealProtein').value || 0),
      carbs: Number($('#mealCarbs').value || 0),
      fat: Number($('#mealFat').value || 0),
    });
    event.target.reset();
    saveState();
    render();
  });

  $('#workoutForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const name = $('#workoutName').value.trim() || 'Workout';
    const minutes = Number($('#workoutMinutes').value || 0);
    const calories = Number($('#workoutCalories').value || 0);
    if (!minutes && !calories) return toast('Add workout minutes or burned calories first.');
    state.today.workouts.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      minutes,
      calories,
    });
    event.target.reset();
    saveState();
    render();
  });

  $('#habitForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.today.habits = {
      water: Number($('#water').value || 0),
      steps: Number($('#steps').value || 0),
      sleep: $('#sleepCheck').checked,
      stretch: $('#stretchCheck').checked,
    };
    saveState();
    render();
    toast('Habits updated.');
  });

  $('#saveDayBtn').addEventListener('click', saveTodayToHistory);
  $('#generateRoutineBtn').addEventListener('click', () => {
    if (!state.profile.focus) state.profile.focus = $('#focus').value || 'balanced';
    renderRoutine();
    toast('Routine refreshed.');
  });
  $('#demoDataBtn').addEventListener('click', loadDemoData);
  $('#exportBtn').addEventListener('click', exportData);
  $('#resetBtn').addEventListener('click', resetData);

  window.addEventListener('resize', () => {
    clearTimeout(window.__chartResize);
    window.__chartResize = setTimeout(renderChart, 180);
  });
}

function render() {
  renderUnitFields();
  renderMetrics();
  renderDashboard();
  renderLogs();
  renderRoutine();
  renderChart();
}

function seedDefaults() {
  if (state.profile && Object.keys(state.profile).length) return;
  $('#age').value = 24;
  $('#heightCm').value = 170;
  $('#weightKg').value = 70;
  $('#targetWeight').value = 68;
}

function init() {
  loadState();
  renderProfileForm();
  renderUnitFields();
  seedDefaults();
  bindEvents();
  render();
}

document.addEventListener('DOMContentLoaded', init);
