/* ─── State ─── */
let voiceEnabled = true;
let recognition   = null;
let listening      = false;

/* ─── Module map ─── */
const modulePages = {
  portfolio: 'portfolio.html',
  todo:      'todo.html',
  quiz:      'quiz.html',
  ecommerce: 'ecommerce.html'
};

/* ─── Suggestions ─── */
const suggestionData = [
  { label: '👤 Portfolio',  value: 'portfolio' },
  { label: '📋 About',      value: 'about'     },
  { label: '🛠 Skills',     value: 'skills'    },
  { label: '📬 Contact',    value: 'contact'   },
  { label: '✅ To-Do',      value: 'todo'      },
  { label: '📝 Quiz',       value: 'quiz'      },
  { label: '🛒 Shop',       value: 'shop'      },
  { label: '📦 Products',   value: 'product'   },
  { label: '🗂 Tasks',      value: 'task'      }
];

/* ─── Router ─── */
function getModule(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (q.includes('portfolio') || q.includes('about') || q.includes('contact') || q.includes('skills') || q.includes('profile')) return 'portfolio';
  if (q.includes('todo') || q.includes('to-do') || q.includes('to do') || q.includes('task') || q.includes('list')) return 'todo';
  if (q.includes('quiz') || q.includes('mcq') || q.includes('question') || q.includes('score')) return 'quiz';
  if (q.includes('shop') || q.includes('product') || q.includes('store') || q.includes('ecommerce')) return 'ecommerce';
  return 'none';
}

/* ─── Theme ─── */
function applyTheme(dark) {
  document.body.classList.toggle('theme-dark', dark);
  localStorage.setItem('themeMode', dark ? 'dark' : 'light');
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = dark ? '🌙' : '☀️';
}

function initTheme() {
  const saved = localStorage.getItem('themeMode');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ? saved === 'dark' : prefersDark);
}

/* ─── TTS ─── */
function speak(text, onEnd) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95; u.pitch = 1; u.lang = 'en-US';
  if (typeof onEnd === 'function') u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

/* ─── Mic: fresh instance every attempt — fixes Electron pipe errors ─── */
function buildRecognition() {
  const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechAPI) return null;

  const r = new SpeechAPI();
  r.lang = 'en-US';
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 1;

  r.onresult = e => {
    const t = e.results[0][0].transcript.trim();
    const searchInput = document.getElementById('searchInput');
    const micStatus   = document.getElementById('micStatus');
    if (searchInput) searchInput.value = t;
    if (micStatus)   micStatus.textContent = `Heard: "${t}"`;
    renderSuggestions(t);
    openModule(t);
  };

  r.onend = () => {
    if (listening) {
      /* Still in listening mode — recreate and restart after a short pause */
      setTimeout(() => {
        if (listening) {
          recognition = buildRecognition();
          if (recognition) {
            try { recognition.start(); }
            catch (_) { setTimeout(() => { recognition = buildRecognition(); if (recognition) recognition.start(); }, 400); }
          }
        }
      }, 350);
    } else {
      const micBtn = document.getElementById('micBtn');
      const micStatus = document.getElementById('micStatus');
      if (micBtn) micBtn.classList.remove('listening');
      if (micStatus) micStatus.textContent = 'Microphone is off';
    }
  };

  r.onerror = e => {
    /* no-speech: normal silence — restart */
    if (e.error === 'no-speech') {
      if (listening) {
        setTimeout(() => {
          recognition = buildRecognition();
          if (recognition) try { recognition.start(); } catch (_) {}
        }, 350);
      }
      return;
    }
    /* aborted: we called stop() — ignore */
    if (e.error === 'aborted') return;

    /* network error: retry up to 3 times */
    if (e.error === 'network') {
      const micStatus = document.getElementById('micStatus');
      if (micStatus) micStatus.textContent = '⟳ Network issue, retrying…';
      if (listening) {
        setTimeout(() => {
          recognition = buildRecognition();
          if (recognition) try { recognition.start(); } catch (_) {}
        }, 1200);
      }
      return;
    }

    /* real error — stop */
    listening = false;
    const micBtn    = document.getElementById('micBtn');
    const micStatus = document.getElementById('micStatus');
    if (micBtn)    micBtn.classList.remove('listening');
    if (micStatus) micStatus.textContent = `Mic error: ${e.error}`;
  };

  return r;
}

function startMic() {
  const micBtn    = document.getElementById('micBtn');
  const micStatus = document.getElementById('micStatus');

  if (micStatus) micStatus.textContent = '⟳ Requesting microphone…';

  // Pre-warm mic with getUserMedia first — this is what actually
  // triggers the real browser-level permission in Electron.
  // Without this, Web Speech API silently fails even with handlers set.
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(stream => {
      // Permission granted — stop the raw stream (recognition manages its own)
      stream.getTracks().forEach(t => t.stop());

      recognition = buildRecognition();
      if (!recognition) {
        if (micStatus) micStatus.textContent = 'Speech recognition not supported';
        return;
      }
      listening = true;
      if (micBtn)    micBtn.classList.add('listening');
      if (micStatus) micStatus.textContent = '🎙 Listening…';
      try { recognition.start(); } catch (_) {}
    })
    .catch(err => {
      listening = false;
      if (micBtn)    micBtn.classList.remove('listening');
      if (micStatus) micStatus.textContent = `Mic blocked: ${err.message}`;
    });
}

function stopMic() {
  listening = false;
  if (recognition) { try { recognition.stop(); } catch (_) {} recognition = null; }
  const micBtn    = document.getElementById('micBtn');
  const micStatus = document.getElementById('micStatus');
  if (micBtn)    micBtn.classList.remove('listening');
  if (micStatus) micStatus.textContent = 'Microphone is off';
}

/* ─── Render suggestions ─── */
function renderSuggestions(query) {
  const box = document.getElementById('suggestionsBox');
  if (!box) return;
  const q = query.trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; box.classList.remove('visible'); return; }

  const filtered = suggestionData
    .filter(d => d.label.toLowerCase().includes(q) || d.value.toLowerCase().includes(q))
    .slice(0, 6);

  box.innerHTML = '';
  if (!filtered.length) { box.classList.remove('visible'); return; }

  filtered.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggestion-item';
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      const inp = document.getElementById('searchInput');
      if (inp) inp.value = item.value;
      box.classList.remove('visible');
      openModule(item.value);
    });
    box.appendChild(btn);
  });

  box.classList.add('visible');
}

/* ─── Open module ─── */
function openModule(query) {
  const name = getModule(query);
  const content = document.getElementById('content');
  if (!name) { if (content) content.innerHTML = ''; return; }
  if (name === 'none') {
    if (content) content.innerHTML = `<div class="no-results">No module matched "<strong>${query}</strong>".<br>Try: portfolio · todo · quiz · shop</div>`;
    return;
  }
  const page = modulePages[name];
  if (window.electronAPI && typeof window.electronAPI.openModule === 'function') {
    window.electronAPI.openModule(page);
  } else {
    window.location.href = page;
  }
}

/* ─── Init ─── */
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('searchInput');
  const micBtn      = document.getElementById('micBtn');
  const voiceBtn    = document.getElementById('voiceBtn');
  const toggleVoice = document.getElementById('toggleVoice');
  const themeBtn    = document.getElementById('themeBtn');
  const greetingEl  = document.getElementById('greetingText');

  initTheme();
  if (themeBtn) themeBtn.addEventListener('click', () => applyTheme(!document.body.classList.contains('theme-dark')));

  /* Greeting */
  if (greetingEl) {
    const h = new Date().getHours();
    const g = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
    greetingEl.textContent = `${g} — Welcome to this Portfolio`;
  }

  /* Voice toggle */
  if (toggleVoice) {
    toggleVoice.addEventListener('click', () => {
      voiceEnabled = !voiceEnabled;
      toggleVoice.textContent = voiceEnabled ? 'Voice ON' : 'Voice OFF';
      toggleVoice.classList.toggle('off', !voiceEnabled);
      if (!voiceEnabled) window.speechSynthesis.cancel();
    });
  }

  /* Voice help button */
  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
      speak('Welcome to this student portfolio. Type portfolio to see the about page. Type todo to manage tasks. Type quiz to take a quiz. Type shop to browse products.');
    });
  }

  /* Auto-speak on load */
  setTimeout(() => {
    speak('Welcome. Type a keyword in the search bar to explore the portfolio modules.');
  }, 600);

  /* Auto-focus search */
  if (searchInput) {
    searchInput.focus();

    searchInput.addEventListener('input', () => renderSuggestions(searchInput.value));
    searchInput.addEventListener('focus', () => renderSuggestions(searchInput.value));
    searchInput.addEventListener('blur', () => {
      setTimeout(() => {
        const box = document.getElementById('suggestionsBox');
        if (box) box.classList.remove('visible');
      }, 180);
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); openModule(searchInput.value); }
      if (e.key === 'Escape') { stopMic(); document.getElementById('suggestionsBox').classList.remove('visible'); }
    });
  }

  /* Mic button */
  if (micBtn) {
    micBtn.addEventListener('click', () => { if (listening) stopMic(); else startMic(); });
  }

  /* Keyboard shortcuts */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 'm') { e.preventDefault(); if (listening) stopMic(); else startMic(); }
    if (e.key === 'Escape') stopMic();
  });
});
