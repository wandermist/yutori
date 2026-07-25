# yutori
A modern web-based music player with a minimalist aesthetic, local playback, album art, and smooth animations. An elegant browser music player inspired by modern desktop media apps, built with HTML, CSS, and JavaScript.
# yutori 🌇

*Your sound, your hour.*

A single-page, no-framework music player that turns your local audio files into a warm, ambient listening room — right in the browser. No backend, no build step, no account. Drop in your songs and go.

![vibe](https://img.shields.io/badge/vanilla-JS-f7df1e?style=flat-square) ![no build](https://img.shields.io/badge/build%20step-none-success?style=flat-square) ![license](https://img.shields.io/badge/license-MIT-ffb9ad?style=flat-square)

---

## ✨ Features

- **Circular drag carousel** — album art fans out in a real 3D arc. Grab it with your mouse or finger and spin through your library like a rolodex; it snaps to the nearest track when you let go.
- **Live audio-reactive visualizer** — a Web Audio `AnalyserNode` reads real frequency data from whatever's playing and drives the little EQ bars in the pill, no fake animation.
- **Art-matched ambient background** — the whole page glows with a blurred, darkened version of the current album art, and the accent color is *sampled from the actual artwork* (canvas pixel averaging), not just guessed from the filename.
- **ID3 tag reading** — drop in raw `.mp3`/`.flac`/etc. files and `yutori` pulls the title, artist, album, and embedded cover art automatically via `jsmediatags`.
- **Random fallback art** — no embedded cover? No problem. Drop `image.png`, `image1.png`, `image2.png`, … next to `index.html` and tracks without art get a random one assigned (and cached, so it won't reshuffle on you) — with the same art-matched background/accent treatment as real covers.
- **Scrollable playlist widget** — a proper queue view under the player: thumbnails, titles, durations, a live "now playing" indicator, and per-track remove, all synced with the carousel.
- **The usual, done right** — shuffle, repeat (off / all / one), like, seek with keyboard arrows, volume, previous/next with smart "restart vs. skip back," and a menu for add/remove.
- **Zero dependencies to build** — just `jsmediatags` loaded from a CDN. No npm install, no bundler. Open `index.html` and you're in.

## 🚀 Getting started

```bash
git clone https://github.com/wandermist/yutori.git
cd yutori
```

Then just open `index.html` in a browser — or, better, serve it locally so file probing behaves consistently:

```bash
npx serve .
# or
python3 -m http.server
```

Click **Add music**, pick some audio files, and start dragging.

right next to `index.html`. `yutori` auto-detects however many you have (up to 60 by default — bump `FALLBACK_ART_PROBE_MAX` in `script.js` if you've got more) and assigns one at random to each art-less track.

## 🗂 Project structure

```
.
├── index.html    # markup + dock/stage/playlist skeleton
├── style.css     # theme, fan/arc layout, playlist, ambient bg
└── script.js     # playback, tagging, drag carousel, visualizer, playlist
```

No build tooling, no framework — just three files you can read top to bottom.

## ⌨️ Controls

| Action | How |
|---|---|
| Play / pause | Click the play button, or tap `Space` |
| Switch tracks | Drag the carousel, click a card, click a playlist row, or `←` / `→` |
| Seek | Click/drag the seek bar, or `←` / `→` while it's focused |
| Shuffle / repeat / like | Buttons in the pill |
| Remove a track | Menu → *Remove from playlist*, or the × on a playlist row |

## 🛠 Built with

Plain HTML/CSS/JS, the Web Audio API, and [jsmediatags](https://github.com/aadsm/JsMediaTags) for ID3 parsing. That's it.

## 📄 License

MIT — do whatever you want with it.
