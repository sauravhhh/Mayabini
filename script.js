// =====================================================================
// SESSIONS — switchable playlists
// =====================================================================
const SESSIONS = {
  gold: {
    id: "PL3cTse0YhM79CcS9HP_BpzPkuJe94EYV7", // Zubeen Garg Golden years
    label: "Golden Hour",
    sub: "Golden Hour Sessions",
  },
  puja: {
    id: "PLBXc-iSV43NQ", // his own Durga Puja Songs playlist
    label: "Durga Puja",
    sub: "Durga Puja Sessions",
  },
};
let session = "gold";
try {
  const saved = localStorage.getItem("goldie-session");
  if (saved && SESSIONS[saved]) session = saved;
} catch {}
const PLAYLIST_ID = SESSIONS[session].id;

// =====================================================================
// CLOCK (top-left, live, local time)
// =====================================================================
function tickClock() {
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  document.getElementById("clock-time").textContent = time;
  document.getElementById("clock-date").textContent = date;
}
tickClock();
setInterval(tickClock, 1000);

// =====================================================================
// YOUTUBE OEMBED HELPER (title / channel / thumbnail, no API key needed)
// =====================================================================
const metaCache = new Map();

async function fetchTrackMeta(videoId) {
  if (metaCache.has(videoId)) return metaCache.get(videoId);

  const fallback = {
    videoId,
    title: "It's loading…",
    author: "",
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`
    );
    if (!res.ok) return fallback;
    const data = await res.json();
    const meta = {
      videoId,
      title: data.title || fallback.title,
      author: data.author_name || "",
      thumbnail: data.thumbnail_url || fallback.thumbnail,
    };
    metaCache.set(videoId, meta);
    return meta;
  } catch {
    return fallback;
  }
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// =====================================================================
// PLAYER STATE
// =====================================================================
let player = null;
let isPlaying = false;
let duration = 0;
let currentTime = 0;
let playlistIds = [];
let currentIndex = 0;
let currentVideoId = null;
let dragging = false;
let sheetBuilt = false;

// persisted prefs
let shuffleOn = false;
let repeatMode = 0; // 0 = off, 1 = repeat all, 2 = repeat one
let volume = 100;
try {
  shuffleOn = localStorage.getItem("goldie-shuffle") === "1";
  repeatMode = Number(localStorage.getItem("goldie-repeat") || 0) || 0;
  const v = Number(localStorage.getItem("goldie-volume"));
  if (Number.isFinite(v) && v >= 0 && v <= 100) volume = v;
} catch {}

const els = {
  tapToStart: document.getElementById("tap-to-start"),
  progressBar: document.getElementById("progress-bar"),
  progressFill: document.getElementById("progress-fill"),
  progressHandle: document.getElementById("progress-handle"),
  timeCurrent: document.getElementById("time-current"),
  timeDuration: document.getElementById("time-duration"),
  trackThumb: document.getElementById("track-thumb"),
  trackTitle: document.getElementById("track-title"),
  trackArtist: document.getElementById("track-artist"),
  eq: document.getElementById("eq"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnPlay: document.getElementById("btn-play"),
  iconPlay: document.getElementById("icon-play"),
  iconPause: document.getElementById("icon-pause"),
  btnShuffle: document.getElementById("btn-shuffle"),
  btnRepeat: document.getElementById("btn-repeat"),
  repeatOne: document.getElementById("repeat-one"),
  btnPlaylist: document.getElementById("btn-playlist"),
  sheetBackdrop: document.getElementById("sheet-backdrop"),
  playlistSheet: document.getElementById("playlist-sheet"),
  btnCloseSheet: document.getElementById("btn-close-sheet"),
  sheetList: document.getElementById("sheet-list"),
  sheetCount: document.getElementById("sheet-count"),
  volumeBtn: document.getElementById("volume-btn"),
  volumePop: document.getElementById("volume-pop"),
  volumeSlider: document.getElementById("volume-slider"),
  iconVol: document.getElementById("icon-vol"),
  iconMute: document.getElementById("icon-mute"),
  btnTimer: document.getElementById("btn-timer"),
  timerMenu: document.getElementById("timer-menu"),
  timerStatus: document.getElementById("timer-status"),
  timerDot: document.getElementById("timer-dot"),
  sessionSub: document.getElementById("session-sub"),
  ytMusicBtn: document.getElementById("yt-music-btn"),
};

// =====================================================================
// YOUTUBE IFRAME PLAYER API BOOTSTRAP
// =====================================================================
// The IFrame API requires this exact global callback name.
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("yt-player", {
    height: "1",
    width: "1",
    playerVars: {
      listType: "playlist",
      list: PLAYLIST_ID,
      playsinline: 1,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
    },
  });
};

(function loadYouTubeIframeAPI() {
  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
})();

function applyPrefsToPlayer() {
  if (!player) return;
  try {
    if (player.setShuffle) player.setShuffle(shuffleOn);
    if (player.setLoop) player.setLoop(repeatMode === 1);
    if (player.setVolume) player.setVolume(volume);
  } catch {}
}

function onPlayerReady(e) {
  applyPrefsToPlayer();
  try {
    e.target.playVideo();
  } catch {}
  // If autoplay was blocked by the browser, prompt for a tap.
  setTimeout(() => {
    try {
      if (e.target.getPlayerState() !== YT.PlayerState.PLAYING) {
        els.tapToStart.classList.remove("hidden");
      }
    } catch {}
  }, 900);
}

function onPlayerStateChange(e) {
  const state = e.data;
  isPlaying = state === YT.PlayerState.PLAYING;
  updatePlayIcon();
  if (isPlaying) els.tapToStart.classList.add("hidden");

  // repeat-one: restart the same track instead of advancing
  if (state === YT.PlayerState.ENDED && repeatMode === 2) {
    try {
      e.target.seekTo(0, true);
      e.target.playVideo();
    } catch {}
    return;
  }

  if (
    state === YT.PlayerState.PLAYING ||
    state === YT.PlayerState.PAUSED ||
    state === YT.PlayerState.CUED
  ) {
    try {
      const ids = e.target.getPlaylist();
      if (ids && ids.length) {
        const firstLoad = !playlistIds.length;
        playlistIds = ids;
        if (firstLoad) {
          els.sheetCount.textContent = ids.length + " tracks";
          if (sheetBuilt || els.playlistSheet.classList.contains("open")) {
            sheetBuilt = true;
            buildSheetItems();
          }
        }
      }

      const idx = e.target.getPlaylistIndex();
      if (typeof idx === "number" && idx >= 0) currentIndex = idx;

      const data = e.target.getVideoData();
      if (data && data.video_id && data.video_id !== currentVideoId) {
        currentVideoId = data.video_id;
        loadCurrentTrackMeta();
      }

      duration = e.target.getDuration() || 0;
      els.timeDuration.textContent = formatTime(duration);
    } catch {}
  }
}

async function loadCurrentTrackMeta() {
  const meta = await fetchTrackMeta(currentVideoId);
  // guard against a track change while we were fetching
  if (meta.videoId !== currentVideoId) return;
  els.trackTitle.textContent = meta.title;
  els.trackArtist.textContent = meta.author;
  els.trackThumb.src = meta.thumbnail;
  highlightActiveSheetItem();
}

// progress polling
setInterval(() => {
  if (!player || dragging || !player.getCurrentTime) return;
  try {
    currentTime = player.getCurrentTime();
    renderProgress();
  } catch {}
}, 500);

function renderProgress() {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  els.progressFill.style.width = pct + "%";
  els.progressHandle.style.left = pct + "%";
  els.timeCurrent.textContent = formatTime(currentTime);
}

function updatePlayIcon() {
  els.iconPlay.classList.toggle("hidden", isPlaying);
  els.iconPause.classList.toggle("hidden", !isPlaying);
  els.btnPlay.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  els.eq.classList.toggle("hidden", !isPlaying);
  els.eq.classList.toggle("paused", !isPlaying);
  highlightActiveSheetItem();
}

// =====================================================================
// CONTROLS
// =====================================================================
function togglePlay() {
  if (!player) return;
  if (!els.tapToStart.classList.contains("hidden")) {
    try {
      player.playVideo();
    } catch {}
    els.tapToStart.classList.add("hidden");
    return;
  }
  if (isPlaying) player.pauseVideo();
  else player.playVideo();
}

els.btnPlay.addEventListener("click", togglePlay);
els.tapToStart.addEventListener("click", togglePlay);

function goToOffset(offset) {
  if (!player || !playlistIds.length) return;
  const target = (currentIndex + offset + playlistIds.length) % playlistIds.length;
  player.playVideoAt(target);
}
els.btnNext.addEventListener("click", () => goToOffset(1));
els.btnPrev.addEventListener("click", () => goToOffset(-1));

// --- shuffle ---
function renderShuffle() {
  els.btnShuffle.classList.toggle("on", shuffleOn);
  els.btnShuffle.setAttribute("aria-pressed", String(shuffleOn));
}
els.btnShuffle.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  try {
    localStorage.setItem("goldie-shuffle", shuffleOn ? "1" : "0");
  } catch {}
  try {
    if (player && player.setShuffle) player.setShuffle(shuffleOn);
  } catch {}
  renderShuffle();
});

// --- repeat: off -> all -> one -> off ---
const REPEAT_LABELS = ["Repeat: off", "Repeat: all", "Repeat: one"];
function renderRepeat() {
  els.btnRepeat.classList.toggle("on", repeatMode !== 0);
  els.btnRepeat.setAttribute("aria-pressed", String(repeatMode !== 0));
  els.btnRepeat.setAttribute("aria-label", REPEAT_LABELS[repeatMode]);
  els.repeatOne.classList.toggle("hidden", repeatMode !== 2);
}
els.btnRepeat.addEventListener("click", () => {
  repeatMode = (repeatMode + 1) % 3;
  try {
    localStorage.setItem("goldie-repeat", String(repeatMode));
  } catch {}
  try {
    if (player && player.setLoop) player.setLoop(repeatMode === 1);
  } catch {}
  renderRepeat();
});
renderShuffle();
renderRepeat();

// --- seeking (click + drag on the progress bar) ---
function ratioFromEvent(clientX) {
  const rect = els.progressBar.getBoundingClientRect();
  return (clientX - rect.left) / rect.width;
}

function seekToRatio(ratio) {
  const clamped = Math.min(1, Math.max(0, ratio));
  const target = clamped * (duration || 0);
  currentTime = target;
  renderProgress();
  if (player && player.seekTo) player.seekTo(target, true);
}

els.progressBar.addEventListener("pointerdown", (e) => {
  dragging = true;
  els.progressBar.setPointerCapture(e.pointerId);
  const ratio = ratioFromEvent(e.clientX);
  currentTime = Math.min(1, Math.max(0, ratio)) * (duration || 0);
  renderProgress();
});
els.progressBar.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const ratio = ratioFromEvent(e.clientX);
  currentTime = Math.min(1, Math.max(0, ratio)) * (duration || 0);
  renderProgress();
});
els.progressBar.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  seekToRatio(ratioFromEvent(e.clientX));
});

// =====================================================================
// SESSION SWITCHER (Golden Hour <-> Durga Puja)
// =====================================================================
function renderSession() {
  document.querySelectorAll(".sheet-tabs button").forEach((b) => {
    const active = b.dataset.session === session;
    b.classList.toggle("on", active);
    b.setAttribute("aria-selected", String(active));
  });
  els.sessionSub.textContent = SESSIONS[session].sub;
  els.ytMusicBtn.href =
    "https://youtube.com/playlist?list=" + SESSIONS[session].id;
}

function switchSession(key) {
  if (!SESSIONS[key] || key === session || !player) return;
  session = key;
  try {
    localStorage.setItem("goldie-session", key);
  } catch {}
  // reset track state; the new playlist reports itself via onPlayerStateChange
  playlistIds = [];
  currentIndex = 0;
  currentVideoId = null;
  duration = 0;
  currentTime = 0;
  sheetBuilt = false;
  if (metaObserver) metaObserver.disconnect();
  els.sheetList.innerHTML = "";
  els.sheetCount.textContent = "";
  els.trackTitle.textContent = "It's loading…";
  els.trackArtist.textContent = "";
  els.trackThumb.removeAttribute("src");
  renderProgress();
  renderSession();
  try {
    player.loadPlaylist({ listType: "playlist", list: SESSIONS[key].id });
  } catch {}
}

document.querySelectorAll(".sheet-tabs button").forEach((b) => {
  b.addEventListener("click", () => switchSession(b.dataset.session));
});
renderSession();

// =====================================================================
// VOLUME
// =====================================================================
function renderVolume() {
  els.volumeSlider.value = volume;
  const muted = volume === 0;
  els.iconVol.classList.toggle("hidden", muted);
  els.iconMute.classList.toggle("hidden", !muted);
}
els.volumeSlider.addEventListener("input", () => {
  volume = Number(els.volumeSlider.value) || 0;
  try {
    localStorage.setItem("goldie-volume", String(volume));
  } catch {}
  try {
    if (player && player.setVolume) player.setVolume(volume);
  } catch {}
  renderVolume();
});
function toggleVolumePop(force) {
  const show = typeof force === "boolean" ? force : els.volumePop.classList.contains("hidden");
  els.volumePop.classList.toggle("hidden", !show);
  els.volumeBtn.setAttribute("aria-expanded", String(show));
  if (show) closeTimerMenu();
}
els.volumeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleVolumePop();
});
document.addEventListener("click", (e) => {
  if (!els.volumePop.classList.contains("hidden") && !els.volumePop.contains(e.target)) {
    toggleVolumePop(false);
  }
});
renderVolume();

// =====================================================================
// SLEEP TIMER
// =====================================================================
let timerId = null;
let timerEnd = 0;
let timerMins = 0;

function timerRemainingMin() {
  return Math.max(0, Math.ceil((timerEnd - Date.now()) / 60000));
}
function renderTimer() {
  const active = timerId !== null;
  els.timerDot.classList.toggle("hidden", !active);
  els.btnTimer.classList.toggle("on", active);
  els.timerStatus.textContent = active ? `Ends in ${timerRemainingMin()} min` : "Off";
  els.timerMenu.querySelectorAll(".menu-options button").forEach((b) => {
    b.classList.toggle("on", Number(b.dataset.min) === timerMins);
  });
}
function clearSleepTimer() {
  if (timerId) clearTimeout(timerId);
  timerId = null;
  timerEnd = 0;
  timerMins = 0;
  renderTimer();
}
function setSleepTimer(mins) {
  clearSleepTimer();
  timerMins = mins;
  if (mins > 0) {
    timerEnd = Date.now() + mins * 60000;
    timerId = setTimeout(() => {
      try {
        if (player) player.pauseVideo();
      } catch {}
      clearSleepTimer();
    }, mins * 60000);
  }
  renderTimer();
}
els.timerMenu.querySelectorAll(".menu-options button").forEach((b) => {
  b.addEventListener("click", () => {
    setSleepTimer(Number(b.dataset.min));
    closeTimerMenu();
  });
});
function closeTimerMenu() {
  els.timerMenu.classList.add("hidden");
  els.btnTimer.setAttribute("aria-expanded", "false");
}
els.btnTimer.addEventListener("click", (e) => {
  e.stopPropagation();
  const show = els.timerMenu.classList.contains("hidden");
  els.timerMenu.classList.toggle("hidden", !show);
  els.btnTimer.setAttribute("aria-expanded", String(show));
  if (show) {
    renderTimer();
    toggleVolumePop(false);
  }
});
document.addEventListener("click", (e) => {
  if (!els.timerMenu.classList.contains("hidden") && !els.timerMenu.contains(e.target)) {
    closeTimerMenu();
  }
});
// keep the countdown text fresh while the menu is open
setInterval(() => {
  if (timerId !== null && !els.timerMenu.classList.contains("hidden")) renderTimer();
}, 15000);

// =====================================================================
// PLAYLIST BOTTOM SHEET (metadata lazy-loads as rows scroll into view)
// =====================================================================
let metaObserver = null;

function openSheet() {
  els.sheetBackdrop.classList.add("open");
  els.playlistSheet.classList.add("open");
  if (!sheetBuilt && playlistIds.length) {
    sheetBuilt = true;
    buildSheetItems();
  } else {
    highlightActiveSheetItem();
  }
}
function closeSheet() {
  els.sheetBackdrop.classList.remove("open");
  els.playlistSheet.classList.remove("open");
}
els.btnPlaylist.addEventListener("click", openSheet);
els.btnCloseSheet.addEventListener("click", closeSheet);
els.sheetBackdrop.addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSheet();
    closeTimerMenu();
    toggleVolumePop(false);
  }
});

function buildSheetItems() {
  els.sheetList.innerHTML = "";
  if (metaObserver) metaObserver.disconnect();
  metaObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const item = entry.target;
        metaObserver.unobserve(item);
        fillSheetItem(item);
      });
    },
    { root: els.sheetList, rootMargin: "300px" }
  );
  playlistIds.forEach((id, i) => {
    const item = document.createElement("button");
    item.className = "sheet-item";
    item.dataset.index = i;
    item.dataset.videoId = id;
    item.innerHTML = `
      <span class="item-num">${String(i + 1).padStart(2, "0")}</span>
      <div class="item-thumb"><img alt="" loading="lazy" /></div>
      <div class="item-info">
        <p class="item-title">It's loading…</p>
        <p class="item-artist"></p>
      </div>
      <div class="item-eq" aria-hidden="true"><span></span><span></span><span></span></div>
    `;
    item.addEventListener("click", () => {
      if (player) player.playVideoAt(i);
      closeSheet();
    });
    els.sheetList.appendChild(item);
    metaObserver.observe(item);
  });
  highlightActiveSheetItem();
}

async function fillSheetItem(item) {
  const id = item.dataset.videoId;
  const meta = await fetchTrackMeta(id);
  // item may have been rebuilt while fetching
  if (!item.isConnected || item.dataset.videoId !== id) return;
  item.querySelector(".item-title").textContent = meta.title;
  item.querySelector(".item-artist").textContent = meta.author;
  item.querySelector(".item-thumb img").src = meta.thumbnail;
}

function highlightActiveSheetItem() {
  const items = els.sheetList.querySelectorAll(".sheet-item");
  items.forEach((item) => {
    const active = Number(item.dataset.index) === currentIndex;
    item.classList.toggle("active", active);
    item.classList.toggle("playing", active && isPlaying);
  });
}

// =====================================================================
// SERVICE WORKER (offline shell for the installable PWA)
// =====================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
