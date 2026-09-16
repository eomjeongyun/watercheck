'use strict';

const DB_NAME = 'watercheck';
const DB_VERSION = 1;
const STORE_NAME = 'days';
const START_DATE = '2026-09-15';
const CUP_CAPACITY = 2000;
const SERVING_ML = 500;
const CATEGORY = {
  water: { label: '물', color: '#1e90ff' },
  coffee: { label: '커피', color: '#8b5a2b' },
  tea: { label: '차', color: '#2fae60' }
};

let dbPromise;
let calendarCursor = new Date();
calendarCursor = new Date(Math.max(calendarCursor.getFullYear(), 2026), calendarCursor.getFullYear() < 2026 ? 8 : calendarCursor.getMonth(), 1);
if (calendarCursor < new Date(2026, 8, 1)) calendarCursor = new Date(2026, 8, 1);

const pad = value => String(value).padStart(2, '0');
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayKey = () => localDateKey(new Date());

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'date' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function getDay(date) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(date);
    request.onsuccess = () => resolve(request.result || { date, logs: [] });
    request.onerror = () => reject(request.error);
  });
}

async function saveDay(record) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getAllDays() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function totalsFor(logs) {
  return logs.reduce((totals, log) => {
    if (CATEGORY[log.category]) totals[log.category] += Number(log.ml) || 0;
    return totals;
  }, { water: 0, coffee: 0, tea: 0 });
}

function categoryScreen(category) {
  const info = CATEGORY[category];
  return `<section id="${category}-screen" class="screen category-screen ${category}" aria-labelledby="${category}-title"${category === 'water' ? '' : ' hidden'}>
    <header class="top-header">
      <div><h1 id="${category}-title">WaterCheck</h1><p class="today-date"></p></div>
    </header>
    <div class="category-heading"><strong>${info.label}</strong><span>한 컵 2000ml · 500ml씩 기록</span></div>
    <section class="cups-area" aria-label="${info.label} 섭취량">
      <div id="${category}-cups" class="cups"></div>
      <p id="${category}-total" class="category-total" aria-live="polite">0ml</p>
    </section>
    <button class="drink-button ${category}" data-category="${category}" type="button"><span>${info.label} 500ml 마셨어요</span><small>텀블러 한 번</small></button>
    <button class="undo-button" data-category="${category}" type="button" disabled>실수로 눌렀어요</button>
  </section>`;
}

function makeCup(category, amount, cupNumber) {
  const clipId = `${category}-cup-${cupNumber}-clip`;
  const segmentGeometry = [
    { y: 192, height: 70 },
    { y: 137, height: 55 },
    { y: 82, height: 55 },
    { y: 27, height: 55 }
  ];
  const fills = segmentGeometry.map((geometry, index) => {
    const fraction = Math.max(0, Math.min(1, (amount - index * SERVING_ML) / SERVING_ML));
    const height = geometry.height * fraction;
    const y = geometry.y + geometry.height - height;
    return `<rect data-segment="${index}" class="fill-segment${fraction ? ' filled' : ''}" x="30" y="${y}" width="120" height="${height}"/>`;
  }).join('');
  return `<div class="cup-item">
    <svg class="glass" viewBox="0 0 180 276" role="img" aria-label="${cupNumber + 1}번째 컵 ${amount}ml">
      <defs><clipPath id="${clipId}"><path d="M30 27 L42 247 Q44 260 58 262 H122 Q136 260 138 247 L150 27 Z"/></clipPath></defs>
      <g class="fill-segments" clip-path="url(#${clipId})" style="color:${CATEGORY[category].color}">${fills}</g>
      <path class="glass-body" d="M30 27 L42 247 Q44 260 58 262 H122 Q136 260 138 247 L150 27"/>
      <path class="glass-rim" d="M25 27 Q25 17 37 17 H143 Q155 17 155 27 Q155 37 143 37 H37 Q25 37 25 27 Z"/>
      <path class="glass-shine" d="M48 52 L57 219"/>
      <path class="glass-base" d="M53 262 H127"/>
    </svg>
    <span>${amount} / 2000ml</span>
  </div>`;
}

function renderCategory(category, logs) {
  const categoryLogs = logs.filter(log => log.category === category);
  const total = categoryLogs.reduce((sum, log) => sum + (Number(log.ml) || 0), 0);
  const cupCount = Math.max(1, Math.ceil(total / CUP_CAPACITY));
  const cups = Array.from({ length: cupCount }, (_, index) => {
    const amount = Math.max(0, Math.min(CUP_CAPACITY, total - index * CUP_CAPACITY));
    return makeCup(category, amount, index);
  });
  document.querySelector(`#${category}-cups`).innerHTML = cups.join('');
  document.querySelector(`#${category}-total`).textContent = `오늘 총 ${total}ml`;
  document.querySelector(`.undo-button[data-category="${category}"]`).disabled = categoryLogs.length === 0;
}

function renderToday(record) {
  const logs = Array.isArray(record.logs) ? record.logs : [];
  Object.keys(CATEGORY).forEach(category => renderCategory(category, logs));
}

async function refreshToday() {
  renderToday(await getDay(todayKey()));
}

async function addDrink(category, button) {
  if (!CATEGORY[category]) return;
  button.classList.add('popping');
  setTimeout(() => button.classList.remove('popping'), 180);
  const date = todayKey();
  const record = await getDay(date);
  const logs = Array.isArray(record.logs) ? [...record.logs] : [];
  logs.push({ category, ml: SERVING_ML, ts: new Date().toISOString() });
  await saveDay({ date, logs });
  renderToday({ date, logs });
}

async function undoLast(category) {
  const button = document.querySelector(`.undo-button[data-category="${category}"]`);
  button.disabled = true;
  const date = todayKey();
  const record = await getDay(date);
  const logs = Array.isArray(record.logs) ? [...record.logs] : [];
  let index = -1;
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].category === category) {
      index = i;
      break;
    }
  }
  if (index < 0) return renderToday({ date, logs });
  logs.splice(index, 1);
  await saveDay({ date, logs });
  renderToday({ date, logs });
}

function showScreen(name) {
  Object.keys(CATEGORY).forEach(category => {
    document.querySelector(`#${category}-screen`).hidden = name !== category;
  });
  document.querySelector('#calendar-screen').hidden = name !== 'calendar';
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.screen === name));
  if (name === 'calendar') renderCalendar();
}

async function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  document.querySelector('#month-label').textContent = `${year}년 ${month + 1}월`;
  document.querySelector('#prev-month').disabled = year === 2026 && month === 8;
  document.querySelector('#day-detail').hidden = true;
  const records = await getAllDays();
  const byDate = new Map(records.map(record => [record.date, record]));
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = document.querySelector('#calendar-grid');
  grid.replaceChildren();
  for (let i = 0; i < firstWeekday; i += 1) {
    const blank = document.createElement('span');
    blank.className = 'calendar-day blank';
    grid.append(blank);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    const record = byDate.get(key);
    const logs = Array.isArray(record?.logs) ? record.logs : [];
    const totals = totalsFor(logs);
    const goalTotal = totals.water + totals.tea;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    button.textContent = day;
    button.setAttribute('role', 'gridcell');
    button.setAttribute('aria-label', `${month + 1}월 ${day}일${goalTotal >= 2000 ? ', 2리터 달성' : logs.length ? ', 기록 있음' : ''}`);
    if (key < START_DATE) {
      button.classList.add('disabled');
      button.disabled = true;
    } else {
      if (key === todayKey()) button.classList.add('today');
      if (goalTotal >= 2000) button.classList.add('achieved');
      else if (logs.length) button.classList.add('has-log');
      button.addEventListener('click', () => showDayDetail(key, totals, logs.length));
    }
    grid.append(button);
  }
}

function showDayDetail(date, totals, count) {
  const detail = document.querySelector('#day-detail');
  const [year, month, day] = date.split('-').map(Number);
  detail.innerHTML = `<strong>${year}년 ${month}월 ${day}일</strong><br>물 ${totals.water}ml · 커피 ${totals.coffee}ml · 차 ${totals.tea}ml${count ? '' : '<br>아직 기록이 없어요'}`;
  detail.hidden = false;
}

async function dailyBackup() {
  const flag = 'watercheck-backup-date';
  const date = todayKey();
  if (localStorage.getItem(flag) === date) return;
  try {
    const exportedArray = await getAllDays();
    const response = await fetch('https://appointee-unnoticed-donated.ngrok-free.dev/api/app-backup/watercheck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exportedArray)
    });
    if (response.ok) localStorage.setItem(flag, date);
  } catch (_) {
    // 백업 실패는 앱 사용에 영향을 주지 않습니다.
  }
}

async function init() {
  document.querySelector('#category-screens').innerHTML = Object.keys(CATEGORY).map(categoryScreen).join('');
  const dateText = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  document.querySelectorAll('.today-date').forEach(element => { element.textContent = dateText; });
  try {
    await openDatabase();
    await refreshToday();
  } catch (error) {
    console.error('저장소를 열 수 없습니다.', error);
  }
  document.querySelectorAll('.drink-button').forEach(button => button.addEventListener('click', () => addDrink(button.dataset.category, button)));
  document.querySelectorAll('.undo-button').forEach(button => button.addEventListener('click', () => undoLast(button.dataset.category)));
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showScreen(tab.dataset.screen)));
  document.querySelector('#prev-month').addEventListener('click', () => {
    if (calendarCursor.getFullYear() === 2026 && calendarCursor.getMonth() === 8) return;
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    renderCalendar();
  });
  document.querySelector('#next-month').addEventListener('click', () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    renderCalendar();
  });
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  setTimeout(dailyBackup, 4000);
}

document.addEventListener('DOMContentLoaded', init);
