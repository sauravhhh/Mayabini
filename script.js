// =====================================================================
// CONFIG
// =====================================================================
// Playlist ID pulled from:
// https://youtube.com/playlist?list=PL3cTse0YhM79CcS9HP_BpzPkuJe94EYV7
const PLAYLIST_ID = "PL3cTse0YhM79CcS9HP_BpzPkuJe94EYV7";

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
    title: "लोड हो रहा है…",
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
let sheetMetaLoaded = false;

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
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnPlay: document.getElementById("btn-play"),
  iconPlay: document.getElementById("icon-play"),
  iconPause: document.getElementById("icon-pause"),
  btnPlaylist: document.getElementById("btn-playlist"),
  sheetBackdrop: document.getElementById("sheet-backdrop"),
  playlistSheet: document.getElementById("playlist-sheet"),
  btnCloseSheet: document.getElementById("btn-close-sheet"),
  sheetList: document.getElementById("sheet-list"),
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

function onPlayerReady(e) {
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

  if (
    state === YT.PlayerState.PLAYING ||
    state === YT.PlayerState.PAUSED ||
    state === YT.PlayerState.CUED
  ) {
    try {
      const ids = e.target.getPlaylist();
      if (ids && ids.length) playlistIds = ids;

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
// PLAYLIST BOTTOM SHEET
// =====================================================================
function openSheet() {
  els.sheetBackdrop.classList.add("open");
  els.playlistSheet.classList.add("open");
  if (!sheetMetaLoaded) {
    sheetMetaLoaded = true;
    renderSheetSkeleton();
    loadAllTrackMeta();
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

function renderSheetSkeleton() {
  els.sheetList.innerHTML = "";
  playlistIds.forEach((id, i) => {
    const item = document.createElement("button");
    item.className = "sheet-item";
    item.dataset.index = i;
    item.dataset.videoId = id;
    item.innerHTML = `
      <div class="item-thumb"><img alt="" /></div>
      <div class="item-info">
        <p class="item-title">लोड हो रहा है…</p>
        <p class="item-artist"></p>
      </div>
    `;
    item.addEventListener("click", () => {
      if (player) player.playVideoAt(i);
      closeSheet();
    });
    els.sheetList.appendChild(item);
  });
  highlightActiveSheetItem();
}

async function loadAllTrackMeta() {
  const chunkSize = 4;
  for (let i = 0; i < playlistIds.length; i += chunkSize) {
    const chunk = playlistIds.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (id, offset) => {
        const meta = await fetchTrackMeta(id);
        const item = els.sheetList.querySelector(`[data-video-id="${id}"]`);
        if (!item) return;
        item.querySelector(".item-title").textContent = meta.title;
        item.querySelector(".item-artist").textContent = meta.author;
        item.querySelector(".item-thumb img").src = meta.thumbnail;
      })
    );
  }
}

function highlightActiveSheetItem() {
  const items = els.sheetList.querySelectorAll(".sheet-item");
  items.forEach((item) => {
    item.classList.toggle(
      "active",
      Number(item.dataset.index) === currentIndex
    );
  });
      }
