/**
 * TodoTab.jsx
 * ─────────────────────────────────────────────────────────────
 * Category-first task management + notes tab for Spidey.
 *
 * Navigation flow:
 *   Main view  →  click category card  →  Category detail view
 *
 * Main view shows:
 *   Header (Add Task + Add Notes) · Today progress · 4 category cards
 *
 * Category detail view shows:
 *   CommonHeader · category tasks · category notes
 *   (Health only: Meals · Medicines · Water)
 *
 * All features preserved:
 *   CRUD tasks · CRUD notes · priority colours · due date/time · repeat
 *   Meal / Medicine / Water reminders · Browser + in-app notifications
 *   localStorage persistence · daily resets · Snooze / Dismiss popup
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/todo.css';

/* ═══════════════════════════════════════════════
   HOOK
   ═══════════════════════════════════════════════ */
function useLocalStorage(key, defaultValue) {
  const [state, setState] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? JSON.parse(s) : defaultValue;
    } catch { return defaultValue; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch {}
  }, [key, state]);
  return [state, setState];
}

/* ═══════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════ */
const PRIORITY_CFG = {
  low:    { label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.13)'  },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.13)' },
  high:   { label: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.13)'  },
};

const CATEGORIES = [
  { id: 'personal', label: 'Personal', icon: '🧑', color: '#a78bfa', desc: 'Your personal tasks' },
  { id: 'work',     label: 'Work',     icon: '💼', color: '#38bdf8', desc: 'Professional tasks'  },
  { id: 'health',   label: 'Health',   icon: '🏃', color: '#4ade80', desc: 'Health & wellness'   },
  { id: 'social',   label: 'Social',   icon: '👥', color: '#fb923c', desc: 'Social activities'   },
];

const REPEAT_OPTIONS = [
  { value: 'none',    label: 'Do not repeat' },
  { value: 'daily',   label: 'Every day'     },
  { value: 'weekly',  label: 'Every week'    },
  { value: 'monthly', label: 'Every month'   },
];

const BLANK_TASK = (cat = 'personal') => ({
  title: '', desc: '', category: cat, priority: 'medium',
  dueDate: '', dueTime: '', repeat: 'none', reminder: false,
});

/* Returns a blank note with today + current time pre-filled */
const BLANK_NOTE = (cat = 'personal') => {
  const now  = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  return { title: '', content: '', category: cat, date, time };
};

const DEFAULT_MEALS = {
  _lastReset: '',
  morning:   { time: '07:00', enabled: false, completed: false },
  afternoon: { time: '13:00', enabled: false, completed: false },
  night:     { time: '19:00', enabled: false, completed: false },
};

const DEFAULT_WATER = {
  goal: 8, consumed: 0, reminderEnabled: false, reminderInterval: 60, lastReset: '',
};

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */
const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDue(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    const d   = new Date(`${dateStr}T${timeStr || '00:00'}`);
    const opt = { month: 'short', day: 'numeric' };
    if (timeStr) { opt.hour = '2-digit'; opt.minute = '2-digit'; }
    return d.toLocaleString('en-US', opt);
  } catch { return dateStr; }
}

function fmtNoteDate(dateStr, timeStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return dateStr; }
}

/* ═══════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════ */

/** iOS-style toggle */
function Toggle({ on, onChange }) {
  return (
    <button
      className={`td-toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      role="switch" aria-checked={on} type="button"
    >
      <span className="td-toggle-knob" />
    </button>
  );
}

/** SVG circular progress ring */
function Ring({ pct, color, size = 48 }) {
  const r    = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="td-ring">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={dash}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  );
}

/** Single task card (reused in all detail views) */
function TaskCard({ task, onToggle, onEdit, onDelete }) {
  const pri = PRIORITY_CFG[task.priority] || PRIORITY_CFG.medium;
  const due = fmtDue(task.dueDate, task.dueTime);
  return (
    <div
      className={`td-task-card ${task.completed ? 'done' : ''}`}
      style={{ borderLeft: `3px solid ${pri.color}` }}
    >
      <div className="td-task-row">
        <button
          className={`td-check ${task.completed ? 'checked' : ''}`}
          onClick={() => onToggle(task.id)}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed
            ? <span className="td-check-icon">✓</span>
            : <span className="td-check-circle" style={{ borderColor: pri.color }} />
          }
        </button>

        <div className="td-task-info">
          <p className={`td-task-title ${task.completed ? 'strikethrough' : ''}`}>{task.title}</p>
          {task.desc && <p className="td-task-desc">{task.desc}</p>}
          <div className="td-task-meta">
            <span className="td-badge" style={{ background: pri.bg, color: pri.color }}>● {pri.label}</span>
            {due && <span className="td-badge td-badge--date">📅 {due}</span>}
            {task.repeat && task.repeat !== 'none' && (
              <span className="td-badge td-badge--repeat">🔁 {task.repeat}</span>
            )}
            {task.reminder && <span className="td-badge td-badge--reminder">🔔</span>}
          </div>
        </div>

        <div className="td-task-btns">
          <button className="td-icon-btn" onClick={() => onEdit(task)} aria-label="Edit">✏️</button>
          <button className="td-icon-btn td-icon-btn--del" onClick={() => onDelete(task.id)} aria-label="Delete">🗑️</button>
        </div>
      </div>
    </div>
  );
}

/** Note list card – shows title, date, time only; click to view full */
function NoteCard({ note, onView, onEdit, onDelete, catColor }) {
  return (
    <div
      className="td-note-card"
      style={{ borderLeft: `3px solid ${catColor || '#a78bfa'}` }}
      onClick={() => onView(note)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onView(note)}
      aria-label={`View note: ${note.title}`}
    >
      <div className="td-note-card-body">
        <span className="td-note-icon">📝</span>
        <div className="td-note-info">
          <p className="td-note-title">{note.title}</p>
          <p className="td-note-meta">
            {fmtNoteDate(note.date, note.time)}
          </p>
        </div>
      </div>
      <div className="td-task-btns" onClick={e => e.stopPropagation()}>
        <button
          className="td-icon-btn"
          onClick={e => { e.stopPropagation(); onEdit(note); }}
          aria-label="Edit note"
        >✏️</button>
        <button
          className="td-icon-btn td-icon-btn--del"
          onClick={e => { e.stopPropagation(); onDelete(note.id); }}
          aria-label="Delete note"
        >🗑️</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════ */
export default function TodoTab() {

  /* ── Persistent state ── */
  const [tasks,     setTasks]     = useLocalStorage('spidey_todos', []);
  const [notes,     setNotes]     = useLocalStorage('spidey_todo_notes', []);
  const [meals,     setMeals]     = useLocalStorage('spidey_meal_reminders', DEFAULT_MEALS);
  const [medicines, setMedicines] = useLocalStorage('spidey_medicine_reminders', []);
  const [water,     setWater]     = useLocalStorage('spidey_water_tracker', DEFAULT_WATER);

  /* ── Navigation: null = main, string = category detail ── */
  const [activeCategory, setActiveCategory] = useState(null);

  /* ── Task modal ── */
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask,   setEditingTask]   = useState(null);
  const [taskForm,      setTaskForm]      = useState(BLANK_TASK());

  /* ── Note modals ── */
  const [showNoteModal,  setShowNoteModal]  = useState(false);
  const [editingNote,    setEditingNote]    = useState(null);
  const [noteForm,       setNoteForm]       = useState(BLANK_NOTE());
  const [viewingNote,    setViewingNote]    = useState(null); // note detail view

  /* ── Health modals ── */
  const [showMealModal,  setShowMealModal]  = useState(false);
  const [mealForm,       setMealForm]       = useState(null);
  const [showMedModal,   setShowMedModal]   = useState(false);
  const [editingMed,     setEditingMed]     = useState(null);
  const [medForm,        setMedForm]        = useState({ name: '', time: '08:00', enabled: true });
  const [showWaterModal, setShowWaterModal] = useState(false);
  const [waterForm,      setWaterForm]      = useState(null);

  /* ── Notifications ── */
  const [notifPerm,   setNotifPerm]   = useState(() =>
    ('Notification' in window ? Notification.permission : 'unsupported')
  );
  const [activePopup, setActivePopup] = useState(null);
  const shownToday  = useRef(new Set());
  const snoozeUntil = useRef({});

  /* ── Daily resets (once on mount) ── */
  useEffect(() => {
    const today = todayStr();
    if (water.lastReset !== today)
      setWater(w => ({ ...w, consumed: 0, lastReset: today }));
    if (meals._lastReset !== today)
      setMeals(m => ({
        ...m, _lastReset: today,
        morning:   { ...m.morning,   completed: false },
        afternoon: { ...m.afternoon, completed: false },
        night:     { ...m.night,     completed: false },
      }));
    setMedicines(meds =>
      meds.map(m => m._lastTaken === today ? m : { ...m, taken: false, _lastTaken: today })
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Notification fire helper ── */
  const firePopup = useCallback(async (key, title, body) => {
    const now = Date.now();
    const today = todayStr();
    
    // Read from localStorage directly
    const snoozeData = JSON.parse(localStorage.getItem('spidey_reminder_snooze') || '{}');
    if (snoozeData[key] && snoozeData[key] > now) return;

    const shownData = JSON.parse(localStorage.getItem('spidey_reminder_shown') || '{}');
    const dayKey = `${key}__${today}`;
    if (shownData[dayKey]) return;

    // Mark as shown
    shownData[dayKey] = true;
    localStorage.setItem('spidey_reminder_shown', JSON.stringify(shownData));

    console.log(`[Reminder] triggered task/meal/medicine/water: ${key} - ${title}`);
    setActivePopup({ key, title, body });
    console.log(`[Reminder] in-app popup shown`);

    if (notifPerm === 'granted') {
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && 'showNotification' in reg) {
            await reg.showNotification(title, { body, icon: '/icons/icon-192.png', tag: key });
            console.log(`[Reminder] browser notification shown via SW`);
            return;
          }
        }
        new Notification(title, { body, icon: '/icons/icon-192.png' });
        console.log(`[Reminder] browser notification shown natively`);
      } catch (err) {
        console.error('[Reminder] notify error:', err);
      }
    }
  }, [notifPerm]);

  /* ── Scheduler (every 30 s) ── */
  useEffect(() => {
    console.log('[Reminder] scheduler running');
    const tick = () => {
      const now   = new Date();
      const hhmm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const today = todayStr();
      
      // Tasks
      tasks.forEach(t => {
        if (!t.reminder || t.completed) return;
        
        let shouldTrigger = false;
        if (t.repeat === 'daily') {
          shouldTrigger = (t.dueTime === hhmm && t.dueDate <= today);
        } else if (t.repeat === 'weekly') {
          try {
             const dueD = new Date(t.dueDate);
             shouldTrigger = (t.dueTime === hhmm && t.dueDate <= today && dueD.getDay() === now.getDay());
          } catch {}
        } else if (t.repeat === 'monthly') {
          try {
             const dueD = new Date(t.dueDate);
             shouldTrigger = (t.dueTime === hhmm && t.dueDate <= today && dueD.getDate() === now.getDate());
          } catch {}
        } else {
          shouldTrigger = (t.dueDate === today && t.dueTime === hhmm);
        }

        if (shouldTrigger) {
          firePopup(`task_${t.id}`, '📋 Task Reminder', t.title);
        }
      });
      
      // Meals
      ['morning','afternoon','night'].forEach(slot => {
        const m = meals[slot];
        if (!m?.enabled || m.completed) return;
        if (m.time === hhmm)
          firePopup(`meal_${slot}`, '🍽️ Meal Reminder', `Time for your ${slot} meal!`);
      });
      
      // Medicines
      medicines.forEach(med => {
        if (!med.enabled || med.taken) return;
        if (med.time === hhmm)
          firePopup(`med_${med.id}`, '💊 Medicine Reminder', `Time to take ${med.name}`);
      });
      
      // Water
      if (water.reminderEnabled && water.consumed < water.goal) {
        const mins     = now.getHours() * 60 + now.getMinutes();
        const interval = water.reminderInterval || 60;
        if (mins > 0 && mins % interval === 0)
          firePopup(`water_${Math.floor(mins/interval)}`, '💧 Water Reminder',
            `Drink some water! (${water.consumed}/${water.goal} glasses)`);
      }
    };
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [tasks, meals, medicines, water, firePopup]);

  /* ── Notification permission ── */
  const requestNotif = async () => {
    if (!('Notification' in window)) {
      setNotifPerm('unsupported');
      console.log(`[Reminder] permission status: unsupported`);
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
    console.log(`[Reminder] permission status: ${perm}`);
  };

  const handleSnooze = () => {
    if (!activePopup) return;
    const key = activePopup.key;
    const snoozeData = JSON.parse(localStorage.getItem('spidey_reminder_snooze') || '{}');
    snoozeData[key] = Date.now() + 10 * 60_000;
    localStorage.setItem('spidey_reminder_snooze', JSON.stringify(snoozeData));
    
    const shownData = JSON.parse(localStorage.getItem('spidey_reminder_shown') || '{}');
    delete shownData[`${key}__${todayStr()}`];
    localStorage.setItem('spidey_reminder_shown', JSON.stringify(shownData));
    
    console.log(`[Reminder] snoozed: ${key}`);
    setActivePopup(null);
  };
  
  const handleDismiss = () => {
     console.log(`[Reminder] closed: ${activePopup?.key}`);
     setActivePopup(null);
  };

  /* ── Task CRUD ── */
  const openAdd = (cat) => {
    setEditingTask(null);
    setTaskForm(BLANK_TASK(cat || activeCategory || 'personal'));
    setShowTaskModal(true);
  };
  const openEdit = (t) => {
    setEditingTask(t);
    setTaskForm({
      title: t.title, desc: t.desc||'', category: t.category, priority: t.priority,
      dueDate: t.dueDate||'', dueTime: t.dueTime||'', repeat: t.repeat||'none', reminder: !!t.reminder,
    });
    setShowTaskModal(true);
  };
  const saveTask = () => {
    if (!taskForm.title.trim()) return;
    if (editingTask) {
      setTasks(p => p.map(t => t.id === editingTask.id
        ? { ...t, ...taskForm, title: taskForm.title.trim() } : t));
    } else {
      setTasks(p => [...p, {
        id: crypto.randomUUID(), ...taskForm,
        title: taskForm.title.trim(), completed: false, createdAt: new Date().toISOString(),
      }]);
    }
    setShowTaskModal(false);
  };
  const delTask    = id => setTasks(p => p.filter(t => t.id !== id));
  const toggleTask = id => setTasks(p => p.map(t => t.id === id ? { ...t, completed: !t.completed } : t));

  /* ── Note CRUD ── */
  const openAddNote = (cat) => {
    setEditingNote(null);
    setNoteForm(BLANK_NOTE(cat || activeCategory || 'personal'));
    setShowNoteModal(true);
  };
  const openEditNote = (note) => {
    setEditingNote(note);
    setNoteForm({
      title:    note.title,
      content:  note.content,
      category: note.category,
      date:     note.date || todayStr(),
      time:     note.time || '',
    });
    setViewingNote(null); // close view modal if open
    setShowNoteModal(true);
  };
  const saveNote = () => {
    if (!noteForm.title.trim() || !noteForm.content.trim()) return;
    const now = new Date().toISOString();
    if (editingNote) {
      setNotes(p => p.map(n => n.id === editingNote.id
        ? { ...n, ...noteForm, title: noteForm.title.trim(), content: noteForm.content.trim(), updatedAt: now }
        : n
      ));
      // refresh viewing note if it was open
      if (viewingNote?.id === editingNote.id) {
        setViewingNote(prev => ({ ...prev, ...noteForm, title: noteForm.title.trim(), content: noteForm.content.trim(), updatedAt: now }));
      }
    } else {
      setNotes(p => [...p, {
        id: crypto.randomUUID(),
        ...noteForm,
        title:     noteForm.title.trim(),
        content:   noteForm.content.trim(),
        createdAt: now,
        updatedAt: now,
      }]);
    }
    setShowNoteModal(false);
    setEditingNote(null);
  };
  const delNote = (id) => {
    setNotes(p => p.filter(n => n.id !== id));
    if (viewingNote?.id === id) setViewingNote(null);
  };

  /* ── Medicine CRUD ── */
  const saveMed = () => {
    if (!medForm.name.trim()) return;
    if (editingMed) {
      setMedicines(p => p.map(m => m.id === editingMed.id
        ? { ...m, ...medForm, name: medForm.name.trim() } : m));
    } else {
      setMedicines(p => [...p, {
        id: crypto.randomUUID(), ...medForm, name: medForm.name.trim(), taken: false, _lastTaken: '',
      }]);
    }
    setShowMedModal(false); setEditingMed(null); setMedForm({ name:'', time:'08:00', enabled:true });
  };
  const delMed      = id => setMedicines(p => p.filter(m => m.id !== id));
  const toggleTaken = id => setMedicines(p => p.map(m => m.id === id
    ? { ...m, taken: !m.taken, _lastTaken: todayStr() } : m));

  /* ── Meal ── */
  const openMealModal = () => { setMealForm({ ...meals }); setShowMealModal(true); };
  const saveMeals     = () => { setMeals({ ...mealForm }); setShowMealModal(false); };

  /* ── Water ── */
  const openWaterModal = () => { setWaterForm({ ...water }); setShowWaterModal(true); };
  const saveWater      = () => { setWater({ ...waterForm }); setShowWaterModal(false); };
  const addGlass       = () => setWater(w => ({ ...w, consumed: Math.min(w.consumed+1, (w.goal||8)*2) }));
  const removeGlass    = () => setWater(w => ({ ...w, consumed: Math.max(w.consumed-1, 0) }));
  const waterPct       = Math.min(100, Math.round((water.consumed / (water.goal||8)) * 100));

  /* ── Derived stats ── */
  const todayTasks     = tasks.filter(t => t.dueDate === todayStr());
  const completedToday = todayTasks.filter(t => t.completed).length;
  const pendingToday   = todayTasks.filter(t => !t.completed).length;
  const highPending    = tasks.filter(t => t.priority === 'high' && !t.completed).length;
  const catCount      = id => tasks.filter(t => t.category === id).length;
  const catDone       = id => tasks.filter(t => t.category === id && t.completed).length;
  const catNoteCount  = id => notes.filter(n => n.category === id).length;

  /* ── Current category config ── */
  const catCfg = CATEGORIES.find(c => c.id === activeCategory);

  /* ══════════════════════════════════════════
     RENDER HELPERS
     ══════════════════════════════════════════ */

  /* Reusable notification popup */
  const NotifPopup = activePopup && (
    <div className="td-notif-overlay">
      <div className="td-notif-card">
        <div className="td-notif-hdr">
          <span className="td-notif-icon">🔔</span>
          <p className="td-notif-title">{activePopup.title}</p>
        </div>
        <p className="td-notif-body">{activePopup.body}</p>
        <p className="td-notif-time">{new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
        <div className="td-notif-actions">
          <button className="td-notif-snooze" onClick={handleSnooze}>😴 Snooze 10 min</button>
          <button className="td-notif-dismiss" onClick={handleDismiss}>✕ Close</button>
        </div>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════
     COMMON HEADER (shown in both views)
     ══════════════════════════════════════════ */
  const CommonHeader = (
    <div className="td-header">
      <div className="td-header-text">
        {activeCategory ? (
          <button className="td-back-btn-inline" onClick={() => setActiveCategory(null)} aria-label="Back">
            ‹ Back
          </button>
        ) : (
          <h1 className="td-title">✅ Todo</h1>
        )}
        {!activeCategory && <p className="td-subtitle">Tap a category to see your tasks</p>}
      </div>
      <div className="td-header-actions">
        <button
          className="td-add-note-btn"
          id="todo-add-note-btn"
          onClick={() => openAddNote(activeCategory || 'personal')}
        >
          <span>📝</span> Add Notes
        </button>
        <button
          className="td-add-task-btn"
          id="todo-add-task-btn"
          onClick={() => openAdd(activeCategory || 'personal')}
        >
          <span>+</span> Add Task
        </button>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════
     VIEW A: MAIN PAGE
     ══════════════════════════════════════════ */
  const MainView = (
    <div className="tab-pane active td-page" aria-labelledby="tab-todo">
      {NotifPopup}

      {CommonHeader}

      {/* Notification Status Card */}
      <section className="td-section">
        <div className="td-notif-status-card">
          <div className="td-notif-status-info">
            <span className="td-notif-status-icon">🔔</span>
            <div className="td-notif-status-text">
              <p className="td-notif-status-title">Notifications</p>
              <p className="td-notif-status-desc">
                {notifPerm === 'granted' ? 'Enabled' : 
                 notifPerm === 'denied' ? 'Blocked' : 
                 notifPerm === 'unsupported' ? 'Not Supported' : 'Disabled'}
              </p>
            </div>
          </div>
          {notifPerm !== 'granted' && notifPerm !== 'unsupported' && (
            <button className="td-notif-status-btn" onClick={requestNotif}>Enable</button>
          )}
        </div>
        
        {/* iPhone instructions hint if unsupported or not installed properly */}
        {notifPerm === 'unsupported' && (
           <p className="td-notif-iphone-hint">
             📱 On iPhone, install Spidey from Safari → Share → Add to Home Screen, then enable notifications.
           </p>
        )}
      </section>

      {/* Today's Progress */}
      <section className="td-section">
        <h2 className="td-section-title">Today's Progress</h2>
        <div className="td-progress-row">
          <div className="td-prog-card td-prog-card--green">
            <span className="td-prog-num">{completedToday}</span>
            <span className="td-prog-lbl">Completed</span>
          </div>
          <div className="td-prog-card td-prog-card--orange">
            <span className="td-prog-num">{pendingToday}</span>
            <span className="td-prog-lbl">Pending</span>
          </div>
          <div className="td-prog-card td-prog-card--red">
            <span className="td-prog-num">{highPending}</span>
            <span className="td-prog-lbl">High Priority</span>
          </div>
        </div>
      </section>

      {/* Category Cards */}
      <section className="td-section">
        <h2 className="td-section-title">Categories</h2>
        <div className="td-cat-grid">
          {CATEGORIES.map(cat => {
            const total     = catCount(cat.id);
            const done      = catDone(cat.id);
            const noteCount = catNoteCount(cat.id);
            const pct       = total ? Math.round((done / total) * 100) : 0;
            return (
              <button
                key={cat.id}
                className="td-cat-card"
                style={{ '--cat-clr': cat.color }}
                onClick={() => setActiveCategory(cat.id)}
                aria-label={`Open ${cat.label}`}
              >
                <div className="td-cat-top">
                  <Ring pct={pct} color={cat.color} />
                  <span className="td-cat-pct" style={{ color: cat.color }}>{pct}%</span>
                </div>
                <p className="td-cat-name">{cat.icon} {cat.label}</p>
                <p className="td-cat-count">{total} task{total !== 1 ? 's' : ''}</p>
                <div className="td-cat-badges">
                  <span className="td-badge" style={{ background: `${cat.color}22`, color: cat.color }}>{done} done</span>
                  <span className="td-badge td-badge--muted">{total - done} left</span>
                  {noteCount > 0 && (
                    <span className="td-badge td-badge--note">📝 {noteCount} note{noteCount !== 1 ? 's' : ''}</span>
                  )}
                </div>
                <div className="td-cat-arrow">›</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );

  /* ══════════════════════════════════════════
     VIEW B: CATEGORY DETAIL
     ══════════════════════════════════════════ */
  const catTasks = tasks.filter(t => t.category === activeCategory);
  const catNotes = notes.filter(n => n.category === activeCategory);

  const DetailView = catCfg && (
    <div className="tab-pane active td-page td-detail-page" aria-labelledby="tab-todo">
      {NotifPopup}

      {CommonHeader}

      {/* Category Title Row */}
      <div className="td-detail-title-row">
        <span className="td-detail-icon" style={{ color: catCfg.color }}>{catCfg.icon}</span>
        <h1 className="td-detail-title" style={{ color: catCfg.color }}>{catCfg.label}</h1>
      </div>

      {/* Category task stats */}
      <div className="td-detail-stats">
        <span className="td-detail-stat">
          <span className="td-detail-stat-num" style={{ color: catCfg.color }}>{catTasks.length}</span>
          <span className="td-detail-stat-lbl">Tasks</span>
        </span>
        <span className="td-detail-divider" />
        <span className="td-detail-stat">
          <span className="td-detail-stat-num" style={{ color: '#4ade80' }}>{catDone(activeCategory)}</span>
          <span className="td-detail-stat-lbl">Done</span>
        </span>
        <span className="td-detail-divider" />
        <span className="td-detail-stat">
          <span className="td-detail-stat-num" style={{ color: '#f59e0b' }}>{catTasks.filter(t => !t.completed).length}</span>
          <span className="td-detail-stat-lbl">Pending</span>
        </span>
        <span className="td-detail-divider" />
        <span className="td-detail-stat">
          <span className="td-detail-stat-num" style={{ color: '#a78bfa' }}>{catNotes.length}</span>
          <span className="td-detail-stat-lbl">Notes</span>
        </span>
      </div>

      {/* Task List */}
      <section className="td-section">
        <h2 className="td-section-title">{catCfg.icon} {catCfg.label} Tasks</h2>
        {catTasks.length === 0 ? (
          <div className="td-empty">
            <span className="td-empty-icon">{catCfg.icon}</span>
            <p>No {catCfg.label.toLowerCase()} tasks yet.</p>
          </div>
        ) : (
          <div className="td-task-list">
            {catTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={toggleTask}
                onEdit={openEdit}
                onDelete={delTask}
              />
            ))}
          </div>
        )}
      </section>

      {/* Notes List */}
      <section className="td-section">
        <h2 className="td-section-title">📝 {catCfg.label} Notes</h2>
        {catNotes.length === 0 ? (
          <div className="td-empty">
            <span className="td-empty-icon">📝</span>
            <p>No {catCfg.label.toLowerCase()} notes yet.</p>
          </div>
        ) : (
          <div className="td-note-list">
            {catNotes
              .slice()
              .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
              .map(note => (
                <NoteCard
                  key={note.id}
                  note={note}
                  catColor={catCfg.color}
                  onView={setViewingNote}
                  onEdit={openEditNote}
                  onDelete={delNote}
                />
              ))}
          </div>
        )}
      </section>

      {/* ── Health-only sections ── */}
      {activeCategory === 'health' && (
        <section className="td-section td-health-section">
          <h2 className="td-section-title">🏥 Health Reminders</h2>

          {/* Meal Intake */}
          <div className="td-health-card">
            <div className="td-health-card-hdr">
              <div>
                <p className="td-health-card-title">🍽️ Meal Intake</p>
                <p className="td-health-card-sub">Track your daily meals</p>
              </div>
              <button className="td-health-edit-btn" onClick={openMealModal}>Edit</button>
            </div>
            <div className="td-meal-list">
              {[
                { slot: 'morning',   icon: '🌅', label: 'Morning'   },
                { slot: 'afternoon', icon: '☀️', label: 'Afternoon' },
                { slot: 'night',     icon: '🌙', label: 'Night'     },
              ].map(({ slot, icon, label }) => {
                const m = meals[slot] || {};
                return (
                  <div key={slot} className={`td-meal-row ${m.completed ? 'done' : ''}`}>
                    <span className="td-meal-icon">{icon}</span>
                    <div className="td-meal-info">
                      <p className="td-meal-name">{label}</p>
                      <p className="td-meal-time">{m.time || '--:--'}</p>
                    </div>
                    <div className="td-meal-right">
                      {m.enabled && <span className="td-pill td-pill--on">🔔 On</span>}
                      <button
                        className={`td-meal-check ${m.completed ? 'checked' : ''}`}
                        onClick={() => setMeals(prev => ({
                          ...prev, [slot]: { ...prev[slot], completed: !prev[slot].completed }
                        }))}
                        aria-label={`Toggle ${label} meal`}
                      >
                        {m.completed ? '✅' : <span className="td-circle-btn">○</span>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Medicine */}
          <div className="td-health-card">
            <div className="td-health-card-hdr">
              <div>
                <p className="td-health-card-title">💊 Medicine</p>
                <p className="td-health-card-sub">{medicines.length} scheduled</p>
              </div>
              <button
                className="td-health-edit-btn"
                onClick={() => { setEditingMed(null); setMedForm({ name:'', time:'08:00', enabled:true }); setShowMedModal(true); }}
              >
                + Add
              </button>
            </div>
            {medicines.length === 0 ? (
              <p className="td-health-empty">No medicines added. Tap + Add to schedule.</p>
            ) : (
              <div className="td-med-list">
                {medicines.map(med => (
                  <div key={med.id} className={`td-med-row ${med.taken ? 'done' : ''}`}>
                    <span className="td-med-icon">💊</span>
                    <div className="td-med-info">
                      <p className="td-med-name">{med.name}</p>
                      <p className="td-med-time">{med.time}</p>
                    </div>
                    <div className="td-med-right">
                      {med.enabled && <span className="td-pill td-pill--on">🔔</span>}
                      <button
                        className={`td-meal-check ${med.taken ? 'checked' : ''}`}
                        onClick={() => toggleTaken(med.id)}
                      >
                        {med.taken ? '✅' : <span className="td-circle-btn">○</span>}
                      </button>
                      <button className="td-icon-btn" onClick={() => {
                        setEditingMed(med);
                        setMedForm({ name: med.name, time: med.time, enabled: med.enabled });
                        setShowMedModal(true);
                      }}>✏️</button>
                      <button className="td-icon-btn td-icon-btn--del" onClick={() => delMed(med.id)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Water Tracker */}
          <div className="td-health-card">
            <div className="td-health-card-hdr">
              <div>
                <p className="td-health-card-title">💧 Water Tracker</p>
                <p className="td-health-card-sub">Daily goal: {water.goal} glasses</p>
              </div>
              <button className="td-health-edit-btn" onClick={openWaterModal}>Setup</button>
            </div>
            <div className="td-water-body">
              <div className="td-water-controls">
                <button className="td-water-btn td-water-btn--minus" onClick={removeGlass} aria-label="Remove glass">−</button>
                <div className="td-water-display">
                  <span className="td-water-num">💧 {water.consumed}</span>
                  <span className="td-water-of">/ {water.goal} glasses</span>
                </div>
                <button className="td-water-btn td-water-btn--plus" onClick={addGlass} aria-label="Add glass">+</button>
              </div>
              <div className="td-water-bar-track">
                <div className="td-water-bar-fill" style={{ width: `${waterPct}%` }} />
              </div>
              <div className="td-water-meta">
                <span>{waterPct}% of daily goal</span>
                {water.reminderEnabled && <span>🔔 every {water.reminderInterval} min</span>}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );

  /* ══════════════════════════════════════════
     MODALS (rendered regardless of view)
     ══════════════════════════════════════════ */
  const Modals = (
    <>
      {/* Task Modal */}
      {showTaskModal && (
        <div className="td-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-hdr">
              <h3 className="td-modal-title">{editingTask ? '✏️ Edit Task' : '✨ New Task'}</h3>
              <button className="td-modal-close" onClick={() => setShowTaskModal(false)}>✕</button>
            </div>
            <div className="td-modal-body">
              <label className="td-label">Task Title *</label>
              <input
                className="td-field"
                placeholder="What needs to be done?"
                value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />

              <label className="td-label">Description</label>
              <textarea
                className="td-field td-textarea"
                placeholder="Add details (optional)..."
                value={taskForm.desc}
                onChange={e => setTaskForm(f => ({ ...f, desc: e.target.value }))}
                rows={2}
              />

              <div className="td-row2">
                <div>
                  <label className="td-label">Category</label>
                  <select
                    className="td-field"
                    value={taskForm.category}
                    onChange={e => setTaskForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="td-label">Priority</label>
                  <select
                    className="td-field"
                    value={taskForm.priority}
                    onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
                  >
                    <option value="low">🟢 Low</option>
                    <option value="medium">🟡 Medium</option>
                    <option value="high">🔴 High</option>
                  </select>
                </div>
              </div>

              <div className="td-row2">
                <div>
                  <label className="td-label">📅 Due Date</label>
                  <input
                    type="date" className="td-field"
                    value={taskForm.dueDate}
                    onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="td-label">⏰ Due Time</label>
                  <input
                    type="time" className="td-field"
                    value={taskForm.dueTime}
                    onChange={e => setTaskForm(f => ({ ...f, dueTime: e.target.value }))}
                  />
                </div>
              </div>

              <label className="td-label">🔁 Repeat</label>
              <div className="td-repeat-grid">
                {REPEAT_OPTIONS.map(r => (
                  <button
                    key={r.value} type="button"
                    className={`td-repeat-btn ${taskForm.repeat === r.value ? 'active' : ''}`}
                    onClick={() => setTaskForm(f => ({ ...f, repeat: r.value }))}
                  >{r.label}</button>
                ))}
              </div>

              <div className="td-toggle-row">
                <span className="td-label" style={{ margin: 0 }}>🔔 Reminder</span>
                <Toggle on={taskForm.reminder} onChange={v => setTaskForm(f => ({ ...f, reminder: v }))} />
              </div>
            </div>
            <div className="td-modal-ftr">
              <button className="td-btn-cancel" onClick={() => setShowTaskModal(false)}>Cancel</button>
              <button className="td-btn-save" onClick={saveTask} disabled={!taskForm.title.trim()}>
                {editingTask ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note Add/Edit Modal ── */}
      {showNoteModal && (
        <div className="td-overlay" onClick={() => setShowNoteModal(false)}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-hdr">
              <h3 className="td-modal-title">{editingNote ? '✏️ Edit Note' : '📝 New Note'}</h3>
              <button className="td-modal-close" onClick={() => setShowNoteModal(false)}>✕</button>
            </div>
            <div className="td-modal-body">
              <label className="td-label">Note Title *</label>
              <input
                className="td-field"
                placeholder="Give your note a title..."
                value={noteForm.title}
                onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />

              <label className="td-label">Content *</label>
              <textarea
                className="td-field td-textarea td-textarea--tall"
                placeholder="Write your note here..."
                value={noteForm.content}
                onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))}
                rows={5}
              />

              <div className="td-row2">
                <div>
                  <label className="td-label">Category</label>
                  <select
                    className="td-field"
                    value={noteForm.category}
                    onChange={e => setNoteForm(f => ({ ...f, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="td-label">📅 Date</label>
                  <input
                    type="date" className="td-field"
                    value={noteForm.date}
                    onChange={e => setNoteForm(f => ({ ...f, date: e.target.value }))}
                  />
                </div>
              </div>

              <label className="td-label">⏰ Time</label>
              <input
                type="time" className="td-field"
                value={noteForm.time}
                onChange={e => setNoteForm(f => ({ ...f, time: e.target.value }))}
              />
            </div>
            <div className="td-modal-ftr">
              <button className="td-btn-cancel" onClick={() => setShowNoteModal(false)}>Cancel</button>
              <button
                className="td-btn-save"
                onClick={saveNote}
                disabled={!noteForm.title.trim() || !noteForm.content.trim()}
              >
                {editingNote ? 'Save Changes' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Note View Modal (full content) ── */}
      {viewingNote && (
        <div className="td-overlay" onClick={() => setViewingNote(null)}>
          <div className="td-modal td-note-view-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-hdr">
              <h3 className="td-modal-title td-note-view-title">📝 Note</h3>
              <button className="td-modal-close" onClick={() => setViewingNote(null)}>✕</button>
            </div>
            <div className="td-modal-body">
              {/* Title */}
              <p className="td-note-view-heading">{viewingNote.title}</p>

              {/* Meta badges */}
              <div className="td-note-view-meta">
                {(() => {
                  const cat = CATEGORIES.find(c => c.id === viewingNote.category);
                  return cat ? (
                    <span className="td-badge" style={{ background: `${cat.color}22`, color: cat.color }}>
                      {cat.icon} {cat.label}
                    </span>
                  ) : null;
                })()}
                <span className="td-badge td-badge--date">
                  📅 {fmtNoteDate(viewingNote.date, viewingNote.time)}
                </span>
              </div>

              {/* Content */}
              <div className="td-note-view-content">
                {viewingNote.content.split('\n').map((line, i) => (
                  <p key={i} style={{ margin: '0 0 4px' }}>{line || <br />}</p>
                ))}
              </div>

              {viewingNote.updatedAt && viewingNote.updatedAt !== viewingNote.createdAt && (
                <p className="td-note-view-updated">
                  ✏️ Edited {new Date(viewingNote.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <div className="td-modal-ftr">
              <button className="td-btn-cancel" onClick={() => setViewingNote(null)}>Close</button>
              <button
                className="td-btn-save"
                style={{ background: 'rgba(167,139,250,0.25)', border: '1px solid rgba(167,139,250,0.5)', color: '#c4b5fd' }}
                onClick={() => openEditNote(viewingNote)}
              >
                ✏️ Edit Note
              </button>
              <button
                className="td-btn-save"
                style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', flex: 1 }}
                onClick={() => { delNote(viewingNote.id); }}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meal Setup Modal */}
      {showMealModal && mealForm && (
        <div className="td-overlay" onClick={() => setShowMealModal(false)}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-hdr">
              <h3 className="td-modal-title">🍽️ Meal Setup</h3>
              <button className="td-modal-close" onClick={() => setShowMealModal(false)}>✕</button>
            </div>
            <div className="td-modal-body">
              {[
                { slot:'morning',   icon:'🌅', label:'Morning Meal'   },
                { slot:'afternoon', icon:'☀️', label:'Afternoon Meal' },
                { slot:'night',     icon:'🌙', label:'Night Meal'     },
              ].map(({ slot, icon, label }) => (
                <div key={slot} className="td-meal-setup-block">
                  <p className="td-label">{icon} {label}</p>
                  <div className="td-row2">
                    <input
                      type="time" className="td-field"
                      value={mealForm[slot]?.time || ''}
                      onChange={e => setMealForm(f => ({ ...f, [slot]: { ...f[slot], time: e.target.value } }))}
                    />
                    <div className="td-toggle-row" style={{ justifyContent: 'flex-end', gap: '0.6rem' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Reminder</span>
                      <Toggle
                        on={!!mealForm[slot]?.enabled}
                        onChange={v => setMealForm(f => ({ ...f, [slot]: { ...f[slot], enabled: v } }))}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="td-modal-ftr">
              <button className="td-btn-cancel" onClick={() => setShowMealModal(false)}>Cancel</button>
              <button className="td-btn-save" onClick={saveMeals}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Medicine Modal */}
      {showMedModal && (
        <div className="td-overlay" onClick={() => setShowMedModal(false)}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-hdr">
              <h3 className="td-modal-title">💊 {editingMed ? 'Edit Medicine' : 'Add Medicine'}</h3>
              <button className="td-modal-close" onClick={() => setShowMedModal(false)}>✕</button>
            </div>
            <div className="td-modal-body">
              <label className="td-label">Medicine Name *</label>
              <input
                className="td-field" placeholder="e.g. Vitamin D"
                value={medForm.name}
                onChange={e => setMedForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
              <label className="td-label">⏰ Time</label>
              <input
                type="time" className="td-field"
                value={medForm.time}
                onChange={e => setMedForm(f => ({ ...f, time: e.target.value }))}
              />
              <div className="td-toggle-row" style={{ marginTop: '0.75rem' }}>
                <span className="td-label" style={{ margin:0 }}>🔔 Reminder</span>
                <Toggle on={medForm.enabled} onChange={v => setMedForm(f => ({ ...f, enabled: v }))} />
              </div>
            </div>
            <div className="td-modal-ftr">
              <button className="td-btn-cancel" onClick={() => setShowMedModal(false)}>Cancel</button>
              <button className="td-btn-save" onClick={saveMed} disabled={!medForm.name.trim()}>
                {editingMed ? 'Save Changes' : 'Add Medicine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Water Setup Modal */}
      {showWaterModal && waterForm && (
        <div className="td-overlay" onClick={() => setShowWaterModal(false)}>
          <div className="td-modal" onClick={e => e.stopPropagation()}>
            <div className="td-modal-hdr">
              <h3 className="td-modal-title">💧 Water Tracker Setup</h3>
              <button className="td-modal-close" onClick={() => setShowWaterModal(false)}>✕</button>
            </div>
            <div className="td-modal-body">
              <label className="td-label">Daily Goal (glasses)</label>
              <input
                type="number" className="td-field" min="1" max="20"
                value={waterForm.goal}
                onChange={e => setWaterForm(f => ({ ...f, goal: parseInt(e.target.value) || 8 }))}
              />
              <div className="td-toggle-row" style={{ marginTop: '1rem' }}>
                <span className="td-label" style={{ margin:0 }}>🔔 Reminder</span>
                <Toggle on={waterForm.reminderEnabled} onChange={v => setWaterForm(f => ({ ...f, reminderEnabled: v }))} />
              </div>
              {waterForm.reminderEnabled && (
                <>
                  <label className="td-label" style={{ marginTop: '1rem' }}>Reminder Interval</label>
                  <select
                    className="td-field"
                    value={waterForm.reminderInterval}
                    onChange={e => setWaterForm(f => ({ ...f, reminderInterval: parseInt(e.target.value) }))}
                  >
                    <option value={30}>Every 30 minutes</option>
                    <option value={60}>Every 1 hour</option>
                    <option value={90}>Every 1.5 hours</option>
                    <option value={120}>Every 2 hours</option>
                    <option value={180}>Every 3 hours</option>
                  </select>
                </>
              )}
            </div>
            <div className="td-modal-ftr">
              <button className="td-btn-cancel" onClick={() => setShowWaterModal(false)}>Cancel</button>
              <button className="td-btn-save" onClick={saveWater}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  /* ══════════════════════════════════════════
     ROOT RENDER
     ══════════════════════════════════════════ */
  return (
    <>
      {activeCategory ? DetailView : MainView}
      {Modals}
    </>
  );
}
