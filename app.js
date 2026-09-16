'use strict';

const DB_NAME = 'watercheck';
const DB_VERSION = 1;
const STORE_NAME = 'days';
const START_DATE = '2026-09-15';
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

function setTodayDate() {
  const text = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  document.querySelector('#today-date').textContent = text;
}

function renderGlass(logs) {
  const segments = [...document.querySelectorAll('.fill-segment')];
  const visibleCount = logs.length ? ((logs.length - 1) % 4) + 1 : 0;
  const visibleLogs = logs.slice(-visibleCount);
  segments.forEach((segment, index) => {
    const log = visibleLogs[index];
    segment.classList.toggle('filled', Boolean(log));
    segment.style.fill = log ? CATEGORY[log.category].color : 'transparent';
  });
}

function renderToday(record) {
  const logs = Array.isArray(record.logs) ? record.logs : [];
  const totals = totalsFor(logs);
  renderGlass(logs);
  document.querySelector('#category-totals').innerHTML = Object.entries(CATEGORY).map(([key, category]) =>
    `<span class="total-${key}">${category.label} ${totals[key]}ml</span>`
  ).join('');
  const goal = totals.water + totals.tea;
  document.querySelector('#goal-total').textContent = `${goal}ml / 2000ml`;
  document.querySelector('#goal-progress').style.width = `${Math.min(100, goal / 20)}%`;
  document.querySelector('#undo-button').disabled = logs.length === 0;
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
  logs.push({ category, ml: 125, ts: new Date().toISOString() });
  await saveDay({ date, logs });
  renderToday({ date, logs });
}

async function undoLast() {
  const button = document.querySelector('#undo-button');
  button.disabled = true;
  const date = todayKey();
  const record = await getDay(date);
  const logs = Array.isArray(record.logs) ? [...record.logs] : [];
  if (!logs.length) return;
  logs.pop();
  await saveDay({ date, logs });
  renderToday({ date, logs });
}

function showScreen(name) {
  document.querySelector('#today-screen').hidden = name !== 'today';
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
  detail.innerHTML = `<strong>${year}년 ${month}월 ${day}일</strong><br>물 ${totals.water}ml · 커피 ${totals.coffee}ml · 차 ${totals.tea}ml${count ? '' : '<br>아직 기록이 없어요.'}`;
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
    // 백업 서버가 꺼져 있는 일은 정상이며 앱 동작에는 영향을 주지 않습니다.
  }
}

async function init() {
  setTodayDate();
  try {
    await openDatabase();
    await refreshToday();
  } catch (error) {
    console.error('저장소를 열 수 없습니다.', error);
  }

  document.querySelectorAll('.drink-button').forEach(button => button.addEventListener('click', () => addDrink(button.dataset.category, button)));
  document.querySelector('#undo-button').addEventListener('click', undoLast);
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
