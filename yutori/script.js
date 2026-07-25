/*====================================
  STATE
====================================*/
let tracks = [];          // { file, url, title, artist, album, picture, accent, duration }
let currentIndex = -1;
let playing = false;
let shuffle = false;
let repeat = 0;            // 0 off, 1 all, 2 one
let liked = new Set();
let vizTargets = new Array(7).fill(0);
let vizNextRoll = 0;
let rafId = null;
let dragOffset = 0;       // fractional index shift while the stage is being dragged
let isDragging = false;
let dragStartX = 0;
let dragBaseOffset = 0;
let dragMoved = false;
let suppressCardClick = false;

/*====================================
  DOM REFS
====================================*/
const stage        = document.getElementById('stage');
const bgWash        = document.getElementById('bgWash');
const seek          = document.getElementById('seek');
const seekFill       = document.getElementById('seekFill');
const seekThumb      = document.getElementById('seekThumb');
const curTimeEl       = document.getElementById('curTime');
const durTimeEl       = document.getElementById('durTime');
const pillThumb      = document.getElementById('pillThumb');
const pillTitle      = document.getElementById('pillTitle');
const pillArtist     = document.getElementById('pillArtist');
const vizEl           = document.getElementById('viz');
const prevBtn        = document.getElementById('prevBtn');
const nextBtn        = document.getElementById('nextBtn');
const playBtn        = document.getElementById('playBtn');
const playIcon       = document.getElementById('playIcon');
const likeBtn        = document.getElementById('likeBtn');
const shuffleBtn     = document.getElementById('shuffleBtn');
const repeatBtn      = document.getElementById('repeatBtn');
const volumeSlider   = document.getElementById('volumeSlider');
const menuBtn        = document.getElementById('menuBtn');
const menu           = document.getElementById('menu');
const fileInput      = document.getElementById('fileInput');
const addBtn         = document.getElementById('addBtn');
const dock           = document.getElementById('dock');
const audio          = document.getElementById('audio');
const toast          = document.getElementById('toast');
const playlistWrap   = document.getElementById('playlistWrap');
const playlistEl     = document.getElementById('playlist');
const playlistCount  = document.getElementById('playlistCount');

/*====================================
  AUDIO ELEMENT + WEB AUDIO ANALYSER
  (createMediaElementSource can only be bound once per
   element, so we reuse the same <audio> for every track
   and just swap its src)
====================================*/
let audioCtx = null;
let analyser = null;
let freqData = null;

function ensureAudioGraph(){
  if(audioCtx) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContext();
  const src = audioCtx.createMediaElementSource(audio);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 64;
  src.connect(analyser);
  analyser.connect(audioCtx.destination);
  freqData = new Uint8Array(analyser.frequencyBinCount);
}

/*====================================
  COLOR HELPERS — used when a file has
  no embedded album art, so every track
  still gets a distinct original cover
====================================*/
function hashColor(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = str.charCodeAt(i) + ((h<<5)-h); }
  const hue = Math.abs(h) % 360;
  return hslToHex((hue % 60) + 15, 62, 54); // keep it inside the warm family
}
function hslToHex(h,s,l){
  s/=100; l/=100;
  const k = n => (n + h/30) % 12;
  const a = s * Math.min(l, 1-l);
  const f = n => l - a*Math.max(-1, Math.min(k(n)-3, Math.min(9-k(n),1)));
  const toHex = x => Math.round(255*x).toString(16).padStart(2,'0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
function shade(hex, amt){
  const n = hex.replace('#','');
  const r = Math.max(0,Math.min(255, parseInt(n.substring(0,2),16)+amt));
  const g = Math.max(0,Math.min(255, parseInt(n.substring(2,4),16)+amt));
  const b = Math.max(0,Math.min(255, parseInt(n.substring(4,6),16)+amt));
  return `rgb(${r},${g},${b})`;
}

/*====================================
  FALLBACK ART POOL — for tracks with no
  embedded cover, pick at random from any
  image.png / image1.png / image2.png ...
  files sitting next to index.html. We
  probe for them once on load (an <img>
  either loads or 404s) rather than assume
  a fixed count.
====================================*/
const FALLBACK_ART_PROBE_MAX = 60; // raise this if you have more than 60 images
let fallbackArtPool = [];

function probeFallbackArt(){
  const candidates = [];
  for(let i = 0; i <= FALLBACK_ART_PROBE_MAX; i++){
    candidates.push(i === 0 ? 'image.png' : `image${i}.png`);
  }
  return Promise.all(candidates.map(src => new Promise(resolve=>{
    const img = new Image();
    img.onload = ()=> resolve(src);
    img.onerror = ()=> resolve(null);
    img.src = src;
  }))).then(results=>{
    fallbackArtPool = results.filter(Boolean);
    if(fallbackArtPool.length){
      buildStage();
      if(currentIndex > -1) renderMeta();
    }
  });
}

function getFallbackArt(track){
  if(track.fallbackArt) return track.fallbackArt;
  if(fallbackArtPool.length === 0) return null;
  const src = fallbackArtPool[Math.floor(Math.random() * fallbackArtPool.length)];
  track.fallbackArt = src;
  extractAverageColor(src, hex=>{
    track.accent = hex;
    if(tracks[currentIndex] === track) renderMeta();
  });
  return src;
}

/*====================================
  ART — embedded cover if present, else a
  random fallback image, else an original
  generated "horizon"
====================================*/
function artHTML(track){
  if(track.picture){
    return `<img src="${track.picture}" alt="" draggable="false">`;
  }
  const fallback = getFallbackArt(track);
  if(fallback){
    return `<img src="${fallback}" alt="" draggable="false">`;
  }
  const c = track.accent;
  const sunY = 50 + (Math.abs(hashInt(track.title)) % 20);
  const sunR = 22 + (Math.abs(hashInt(track.artist)) % 16);
  return `
  <div class="art__sky" style="background:
      radial-gradient(120% 90% at 50% 100%, ${c}55, transparent 60%),
      linear-gradient(180deg, #1a120d 0%, ${shade(c,-60)} 55%, ${shade(c,-25)} 100%);">
  </div>
  <svg class="art__spin" viewBox="0 0 172 172" width="100%" height="100%">
    <circle cx="86" cy="${sunY}" r="${sunR}" fill="${c}"/>
    <circle cx="86" cy="${sunY}" r="${sunR+14}" fill="${c}" opacity=".18"/>
  </svg>
  <svg class="art__sky" viewBox="0 0 172 172" width="100%" height="100%" preserveAspectRatio="none">
    <path d="M0,120 Q43,104 86,116 T172,110 V172 H0 Z" fill="${shade(c,-70)}" opacity=".92"/>
  </svg>
  <svg class="art__grain" width="100%" height="100%">
    <filter id="ng${Math.abs(hashInt(track.title+track.artist))}"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter>
    <rect width="100%" height="100%" filter="url(#ng${Math.abs(hashInt(track.title+track.artist))})"/>
  </svg>`;
}
function hashInt(str){
  let h = 0;
  for(let i=0;i<str.length;i++){ h = str.charCodeAt(i) + ((h<<5)-h); }
  return h;
}

/*====================================
  AVERAGE COLOUR FROM ALBUM ART —
  samples a shrunk copy of the cover on
  a canvas so the ambient background /
  accent can be pulled from the actual
  artwork instead of a generated hue
====================================*/
function extractAverageColor(url, cb){
  const img = new Image();
  img.onload = ()=>{
    try{
      const size = 24;
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      let r=0, g=0, b=0, count=0;
      for(let i=0; i<data.length; i+=4){
        r += data[i]; g += data[i+1]; b += data[i+2]; count++;
      }
      r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
      const toHex = x => Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0');
      cb(`#${toHex(r)}${toHex(g)}${toHex(b)}`);
    } catch(err){
      console.error('Could not sample album art colour:', err);
    }
  };
  img.onerror = ()=>{};
  img.src = url;
}

/*====================================
  FILE HANDLING + TAG / ART EXTRACTION
====================================*/
addBtn.addEventListener('click', ()=> fileInput.click());
document.getElementById('emptyAddBtn')?.addEventListener('click', ()=> fileInput.click());

fileInput.addEventListener('change', e=>{
  const files = [...e.target.files].filter(f => f.type.startsWith('audio/'));
  if(!files.length) return;
  files.forEach(addFile);
  fileInput.value = '';
});

function addFile(file){
  const track = {
    file,
    url: URL.createObjectURL(file),
    title: file.name.replace(/\.[^/.]+$/,''),
    artist: 'Unknown artist',
    album: '',
    picture: null,
    accent: hashColor(file.name),
    duration: 0
  };
  const wasEmpty = tracks.length === 0;
  tracks.push(track);
  const index = tracks.length - 1;

  buildStage();
  renderDockState();
  if(wasEmpty){ selectTrack(0); }

  readTags(track, index);
}

function readTags(track, index) {
  if (typeof jsmediatags === 'undefined') {
    console.error("The jsmediatags library didn't load. Check your internet connection or the script tag in your HTML.");
    return;
  }
  
  console.log(`Scanning metadata for: ${track.file.name}...`);

  jsmediatags.read(track.file, {
    onSuccess: function(tag) {
      console.log(`Success! Data found for ${track.file.name}:`, tag.tags);
      
      const t = tag.tags || {};
      if (t.title) track.title = t.title;
      if (t.artist) track.artist = t.artist;
      if (t.album) track.album = t.album;
      
      if (t.picture) {
        try {
          const { data, format } = t.picture;
          // Fallback to 'image/jpeg' if format is missing (common in some FLACs)
          const imageFormat = format || 'image/jpeg'; 
          const blob = new Blob([new Uint8Array(data)], { type: imageFormat });
          track.picture = URL.createObjectURL(blob);
          console.log("Album art successfully processed!");
        } catch (err) {
          console.error("Failed to process the album art image:", err);
        }
      }
      
      buildStage();
      if (index === currentIndex) renderMeta();

      if (track.picture) {
        extractAverageColor(track.picture, hex => {
          track.accent = hex;
          if (index === currentIndex) renderMeta();
        });
      }
    },
    onError: function(error) {
      console.error(`Metadata read error for ${track.file.name}:`, error.type, error.info);
    }
  });
}
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add('is-visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toast.classList.remove('is-visible'), 2200);
}

/*====================================
  RENDER: FAN STAGE
====================================*/
function buildStage(){
  stage.innerHTML = '';

  if(tracks.length === 0){
    stage.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="var(--cream-dim)" stroke-width="1.4"/><circle cx="6" cy="18" r="3" stroke="var(--cream-dim)" stroke-width="1.4"/><circle cx="18" cy="16" r="3" stroke="var(--cream-dim)" stroke-width="1.4"/></svg>
        </div>
        <h2>No music yet</h2>
        <p>Add tracks from your device.</p>
        <button id="emptyAddBtn" type="button">Add music</button>
      </div>`;
    document.getElementById('emptyAddBtn').addEventListener('click', ()=> fileInput.click());
    renderPlaylist();
    return;
  }

  tracks.forEach((t,i)=>{
    const card = document.createElement('div');
    card.className = 'card';
    card.tabIndex = 0;
    card.setAttribute('role','option');
    card.dataset.index = i;
    card.innerHTML = `<div class="art">${artHTML(t)}</div>`;
    card.addEventListener('click', ()=>{ if(suppressCardClick) return; selectTrack(i); });
    card.addEventListener('keydown', e=>{
      if(e.key==='Enter' || e.key===' '){ e.preventDefault(); selectTrack(i); }
    });
    stage.appendChild(card);
  });
  layoutFan();
  renderPlaylist();
}

function layoutFan(){
  const n = tracks.length;
  if(n === 0) return;
  const mobile = window.innerWidth < 420;

  const angleStep = mobile ? 26 : 30;   // degrees of arc per index step
  const R         = mobile ? 200 : 340; // arc radius
  const maxSteps  = 3;                  // cards further than this settle at the rim instead of swinging further round

  [...stage.children].forEach((card,i)=>{
    let offset = i - currentIndex - dragOffset;
    if(offset > n/2) offset -= n;
    if(offset < -n/2) offset += n;

    const dir     = offset === 0 ? 0 : Math.sign(offset);
    const raw     = Math.abs(offset);
    const settled = Math.min(raw, maxSteps);       // how far out along the arc, capped so far cards rest at the rim
    const angle   = dir * settled * angleStep;
    const rad     = angle * Math.PI / 180;

    const dx    = Math.sin(rad) * R;
    const dy    = R * (1 - Math.cos(rad)) * 0.5;
    const rotZ  = angle * 0.28;
    const rotY  = -angle * 0;
    const scale = Math.max(0.58, 1 - settled * 0.16);
    const blurPx = settled * 0.35;
    const shadowAlpha = settled < 0.5 ? 0 : Math.max(0.16, 0.34 - settled * 0.05);

    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotZ}deg) rotateY(${rotY}deg) scale(${scale})`;
    card.style.opacity = 1;
    card.style.filter = blurPx > 0.05 ? `blur(${blurPx.toFixed(2)}px)` : 'none';
    card.style.boxShadow = shadowAlpha ? `0 14px 28px -25px rgba(0,0,0,${shadowAlpha.toFixed(2)})` : '';
    card.style.zIndex = Math.round(100 - settled * 10);
    card.classList.toggle('card--active', raw < 0.5);
    card.classList.toggle('is-playing', raw < 0.5 && playing);
  });
}

/*====================================
  DRAG-TO-SCRUB THE STAGE
  Pointer events unify mouse + touch. While
  dragging we track a fractional index offset
  so the arc follows the pointer in real time;
  on release it snaps to the nearest card.
====================================*/
stage.addEventListener('pointerdown', e=>{
  if(tracks.length === 0) return;
  isDragging = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragBaseOffset = dragOffset;
  stage.classList.add('is-dragging');
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('dragstart', e=> e.preventDefault());

stage.addEventListener('pointermove', e=>{
  if(!isDragging) return;
  const dx = e.clientX - dragStartX;
  if(Math.abs(dx) > 4) dragMoved = true;
  const sensitivity = window.innerWidth < 420 ? 90 : 140; // px of drag per one card step
  dragOffset = dragBaseOffset + (-dx / sensitivity);
  layoutFan();
});

function endStageDrag(){
  if(!isDragging) return;
  isDragging = false;
  stage.classList.remove('is-dragging');
  const steps = Math.round(dragOffset);
  dragOffset = 0;

  if(dragMoved){
    suppressCardClick = true;
    setTimeout(()=> suppressCardClick = false, 50);
  }

  if(steps !== 0){
    loadSong(currentIndex + steps, playing);
  } else {
    layoutFan();
  }
}
stage.addEventListener('pointerup', endStageDrag);
stage.addEventListener('pointercancel', endStageDrag);
stage.addEventListener('pointerleave', e=>{ if(isDragging && e.buttons === 0) endStageDrag(); });

/*====================================
  RENDER: PILL / META
====================================*/
function renderMeta(){
  if(currentIndex === -1) return;
  const t = tracks[currentIndex];
  pillTitle.textContent = t.title;
  pillArtist.textContent = t.album ? `${t.artist} · ${t.album}` : t.artist;
  pillThumb.innerHTML = `<div class="art" style="width:100%;height:100%;">${artHTML(t)}</div>`;
  document.documentElement.style.setProperty('--accent', t.accent);

  const artSrc = t.picture || t.fallbackArt;
  if (artSrc) {
    bgWash.style.backgroundImage =
      `radial-gradient(60% 50% at 50% 8%, ${t.accent}66, transparent 70%),
       linear-gradient(180deg, rgba(10,7,5,.55), rgba(10,7,5,.88) 75%),
       url("${artSrc}")`;
  } else {
    bgWash.style.backgroundImage =
      `radial-gradient(60% 50% at 50% 8%, ${t.accent}55, transparent 70%),
       radial-gradient(80% 60% at 50% 100%, var(--deep-2), var(--deep) 70%)`;
  }

  likeBtn.classList.toggle('is-liked', liked.has(currentIndex));
  updatePlaylistActiveState();
}

function renderDockState(){
  dock.classList.toggle('is-disabled', tracks.length === 0);
  playlistWrap.classList.toggle('is-disabled', tracks.length === 0);
}

/*====================================
  RENDER: PLAYLIST WIDGET
====================================*/
function escapeHTML(str){
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function renderPlaylist(){
  playlistCount.textContent = tracks.length + (tracks.length === 1 ? ' track' : ' tracks');
  playlistEl.innerHTML = '';

  if(tracks.length === 0){
    playlistEl.innerHTML = `<div class="playlist__empty">Nothing queued yet — add some music.</div>`;
    return;
  }

  tracks.forEach((t,i)=>{
    const row = document.createElement('div');
    row.className = 'playlist__item';
    row.dataset.index = i;
    row.tabIndex = 0;
    row.setAttribute('role','option');
    row.classList.toggle('is-active', i === currentIndex);
    row.classList.toggle('is-playing', i === currentIndex && playing);
    row.innerHTML = `
      <div class="playlist__thumb">${artHTML(t)}</div>
      <div class="playlist__meta">
        <div class="playlist__title">${escapeHTML(t.title)}</div>
        <div class="playlist__artist">${escapeHTML(t.artist)}</div>
      </div>
      <div class="playlist__dur">${formatTime(t.duration)}</div>
      <div class="playlist__playing"><i></i><i></i><i></i></div>
      <button class="playlist__remove" type="button" aria-label="Remove ${escapeHTML(t.title)} from playlist">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7h12M9 7V5h6v2M7 7l1 13h8l1-13" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>`;
    row.addEventListener('click', e=>{
      if(e.target.closest('.playlist__remove')) return;
      selectTrack(i);
    });
    row.addEventListener('keydown', e=>{
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); selectTrack(i); }
    });
    row.querySelector('.playlist__remove').addEventListener('click', e=>{
      e.stopPropagation();
      removeTrackByIndex(i);
    });
    playlistEl.appendChild(row);
  });
}

function updatePlaylistActiveState(){
  [...playlistEl.children].forEach(row=>{
    if(row.dataset.index === undefined) return;
    const i = +row.dataset.index;
    row.classList.toggle('is-active', i === currentIndex);
    row.classList.toggle('is-playing', i === currentIndex && playing);
  });
}

function removeTrackByIndex(i){
  if(i < 0 || i >= tracks.length) return;
  const wasCurrent = i === currentIndex;
  URL.revokeObjectURL(tracks[i].url);
  tracks.splice(i, 1);

  if(tracks.length === 0){
    pauseSong();
    currentIndex = -1;
    audio.removeAttribute('src');
    buildStage();
    renderDockState();
    return;
  }

  if(wasCurrent){
    pauseSong();
    loadSong(Math.min(i, tracks.length - 1), false);
  } else if(i < currentIndex){
    currentIndex -= 1;
  }
  buildStage();
}

/*====================================
  VISUALIZER — real FFT data from the
  playing <audio> element via AnalyserNode
====================================*/
function buildViz(){
  vizEl.innerHTML = '';
  for(let i=0;i<7;i++) vizEl.appendChild(document.createElement('i'));
}
function resetVisualizer(){
  [...vizEl.children].forEach(bar=> bar.style.height = '6px');
}
function stepVisualizer(){
  if(!analyser) return;
  analyser.getByteFrequencyData(freqData);
  const bars = [...vizEl.children];
  const bucket = Math.floor(freqData.length / bars.length);
  bars.forEach((bar,i)=>{
    let sum = 0;
    for(let j=0;j<bucket;j++) sum += freqData[i*bucket+j];
    const avg = sum / bucket;
    const h = 6 + (avg/255)*26;
    bar.style.height = h.toFixed(1) + 'px';
  });
}

/*====================================
  RAF LOOP — drives the visualizer while playing
====================================*/
function loop(){
  if(playing) stepVisualizer();
  rafId = requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/*====================================
  TIME / SEEK UI
====================================*/
function formatTime(s){
  if(!isFinite(s)) return '0:00';
  const m = Math.floor(s/60);
  const sec = Math.floor(s%60);
  return m + ':' + String(sec).padStart(2,'0');
}
audio.addEventListener('timeupdate', ()=>{
  if(!audio.duration) return;
  const pct = (audio.currentTime/audio.duration)*100;
  seekFill.style.width = pct + '%';
  seekThumb.style.left = pct + '%';
  curTimeEl.textContent = formatTime(audio.currentTime);
});
audio.addEventListener('loadedmetadata', ()=>{
  durTimeEl.textContent = formatTime(audio.duration);
  if(currentIndex > -1){
    tracks[currentIndex].duration = audio.duration;
    const row = playlistEl.querySelector(`.playlist__item[data-index="${currentIndex}"] .playlist__dur`);
    if(row) row.textContent = formatTime(audio.duration);
  }
});

/*====================================
  TRANSPORT
====================================*/
function playSong(){
  if(currentIndex < 0) return;
  ensureAudioGraph();
  audioCtx.resume();
  audio.play();
  playing = true;
  playIcon.innerHTML = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';
  playBtn.setAttribute('aria-label','Pause');
  document.querySelector('.card--active')?.classList.add('is-playing');
  updatePlaylistActiveState();
}
function pauseSong(){
  audio.pause();
  playing = false;
  playIcon.innerHTML = '<path d="M8 5v14l12-7z"/>';
  playBtn.setAttribute('aria-label','Play');
  document.querySelector('.card--active')?.classList.remove('is-playing');
  resetVisualizer();
  updatePlaylistActiveState();
}
function togglePlay(){
  if(currentIndex < 0) return;
  audio.paused ? playSong() : pauseSong();
}

function loadSong(index, autoplay){
  if(tracks.length === 0) return;
  currentIndex = ((index % tracks.length) + tracks.length) % tracks.length;
  const t = tracks[currentIndex];
  audio.src = t.url;
  renderMeta();
  layoutFan();
  durTimeEl.textContent = formatTime(t.duration);
  curTimeEl.textContent = '0:00';
  seekFill.style.width = '0%';
  seekThumb.style.left = '0%';
  autoplay ? playSong() : pauseSong();
}

function previousSong(){
  if(tracks.length === 0) return;
  if(audio.currentTime > 3){ audio.currentTime = 0; return; }
  let i;
  if(shuffle){ i = Math.floor(Math.random()*tracks.length); }
  else { i = currentIndex - 1; if(i < 0) i = tracks.length - 1; }
  loadSong(i, playing);
}
function nextSong(){
  if(tracks.length === 0) return;
  let i;
  if(shuffle){ i = Math.floor(Math.random()*tracks.length); }
  else { i = currentIndex + 1; if(i >= tracks.length) i = 0; }
  loadSong(i, playing);
}
audio.addEventListener('ended', ()=>{
  if(repeat === 2){ audio.currentTime = 0; playSong(); return; }
  if(currentIndex === tracks.length - 1 && repeat === 0){ pauseSong(); return; }
  nextSong();
});

function selectTrack(i){
  if(i === currentIndex){ togglePlay(); return; }
  loadSong(i, true);
}

/*====================================
  SEEK
====================================*/
function seekTo(e){
  if(!audio.duration) return;
  const rect = seek.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const pct = Math.min(1, Math.max(0, x / rect.width));
  audio.currentTime = pct * audio.duration;
}
seek.addEventListener('click', seekTo);
seek.addEventListener('keydown', e=>{
  if(!audio.duration) return;
  if(e.key === 'ArrowRight'){ audio.currentTime = Math.min(audio.duration, audio.currentTime+5); }
  if(e.key === 'ArrowLeft'){ audio.currentTime = Math.max(0, audio.currentTime-5); }
});

/*====================================
  VOLUME
====================================*/
audio.volume = 1;
volumeSlider.addEventListener('input', ()=>{
  audio.volume = volumeSlider.value/100;
});

/*====================================
  SHUFFLE / REPEAT / LIKE
====================================*/
shuffleBtn.addEventListener('click', ()=>{
  shuffle = !shuffle;
  shuffleBtn.classList.toggle('icon-btn--on', shuffle);
});
repeatBtn.addEventListener('click', ()=>{
  repeat = (repeat + 1) % 3;
  repeatBtn.classList.toggle('icon-btn--on', repeat !== 0);
  repeatBtn.classList.toggle('icon-btn--repeat-one', repeat === 2);
  repeatBtn.innerHTML = repeat === 2
    ? '1'
    : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg>';
});
likeBtn.addEventListener('click', ()=>{
  if(currentIndex < 0) return;
  liked.has(currentIndex) ? liked.delete(currentIndex) : liked.add(currentIndex);
  likeBtn.classList.toggle('is-liked', liked.has(currentIndex));
});

/*====================================
  MENU
====================================*/
menuBtn.addEventListener('click', e=>{
  e.stopPropagation();
  menu.classList.toggle('is-open');
});
document.addEventListener('click', ()=> menu.classList.remove('is-open'));
menu.querySelector('[data-action="add"]').addEventListener('click', ()=> fileInput.click());
menu.querySelector('[data-action="remove"]').addEventListener('click', removeCurrentTrack);

function removeCurrentTrack(){
  if(currentIndex < 0) return;
  const removedIndex = currentIndex;
  URL.revokeObjectURL(tracks[removedIndex].url);
  tracks.splice(removedIndex, 1);
  pauseSong();
  if(tracks.length === 0){
    currentIndex = -1;
    audio.removeAttribute('src');
    buildStage();
    renderDockState();
    return;
  }
  buildStage();
  loadSong(Math.min(removedIndex, tracks.length - 1), false);
}

/*====================================
  TRANSPORT BUTTON WIRING
====================================*/
prevBtn.addEventListener('click', previousSong);
nextBtn.addEventListener('click', nextSong);
playBtn.addEventListener('click', togglePlay);

/*====================================
  KEYBOARD
====================================*/
document.addEventListener('keydown', e=>{
  if(e.target.tagName === 'INPUT') return;
  switch(e.code){
    case 'Space': e.preventDefault(); togglePlay(); break;
    case 'ArrowRight': if(e.target === seek) break; nextSong(); break;
    case 'ArrowLeft': if(e.target === seek) break; previousSong(); break;
  }
});

/*====================================
  RESIZE
====================================*/
window.addEventListener('resize', layoutFan);

/*====================================
  INIT
====================================*/
buildStage();
buildViz();
renderDockState();
probeFallbackArt();