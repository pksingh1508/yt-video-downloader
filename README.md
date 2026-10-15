# PostReady

A local website that downloads a selected section of a YouTube video and prepares a verified MP4 for uploading to X. Built with React, TypeScript, Vite, Express, yt-dlp, and FFmpeg.

## Run it

Requires **Node.js 22.12 or newer** and npm. macOS, Linux x64/ARM64, and Windows are supported by the installer. No Python installation or API keys are needed on those platforms.

```sh
npm install
npm run setup
npm run dev
```

Open **http://localhost:5173**. The API runs on `127.0.0.1:3001`. Setup downloads the official yt-dlp executable, verifies its SHA-256 against the release manifest, and installs it inside `.tools/`. FFmpeg and FFprobe are supplied by the npm dependencies.

1. Paste a public YouTube video, Shorts, or `youtu.be` link and click **Get video**.
2. Choose your clip with start and end times (`m:ss` or `h:mm:ss`). For longer sources, the first 2:20 is selected by default.
3. Choose an upload preset, resolution, and frame shape. **Original** preserves the source aspect ratio; the other shapes fit the entire video with padding.
4. Click **Prepare for X**. When verification finishes, preview the final video and click **Download MP4**.
5. Attach the downloaded file to a post on X.

## Appearance

Use the sun, moon, and monitor buttons in the header to choose **Light**, **Dark**, or **System** appearance. Your choice is saved locally; System follows changes to your computer’s appearance. The saved theme is applied before the page paints, including in the production build.

The interface uses locally bundled Geist, Manrope, and Geist Mono variable fonts. Framer Motion provides subtle navigation, button, preview, progress, and notification transitions. Animations respect the operating system’s reduced-motion setting. Layouts adapt from mobile screens to wide desktops.

Design references: [Linear](https://linear.app/), [Vercel typography](https://vercel.com/geist/typography), and [Motion accessibility](https://motion.dev/docs/react-accessibility).

## What the export does

- Downloads the selected time range with yt-dlp and FFmpeg. Requests accurate cuts at the clip boundaries.
- Encodes MP4 with H.264 High Profile, progressive 30 fps video, YUV 4:2:0, square pixels, closed GOP, and stereo AAC-LC audio at 128 kbps.
- Adds a silent AAC track when the source has no audio.
- Moves MP4 playback metadata to the start of the file for streaming.
- Bounds bitrate and frame dimensions, then checks the actual file's size, duration, codecs, pixel format, frame rate, dimensions, pixel aspect ratio, and audio profile.
- Decodes the entire exported file to detect playback errors before allowing download.

### Upload presets

| Preset               | Clip limit    | File limit | Intended upload                 |
| -------------------- | ------------- | ---------- | ------------------------------- |
| X Standard (default) | 140 seconds   | 512 MB     | All X accounts                  |
| X Premium            | Under 4 hours | 16 GB      | Premium accounts on x.com / iOS |

These are conservative presets based on [X's consumer web upload guide](https://help.x.com/en/using-x/x-videos) and [Premium video guide](https://help.x.com/en/using-x/premium-longer-videos), checked October 14, 2026. Premium clips longer than 2 hours automatically use 720p. Premium Android has a shorter duration limit, so use x.com or iOS for longer exports. Encoding choices also follow [X's media recommendations](https://docs.x.com/x-api/media/quickstart/best-practices). API upload entitlements can differ from consumer upload limits; this app prepares files for manual upload.

File compatibility cannot guarantee X will accept a post: account eligibility, platform changes, content policies, and source availability still apply. There is no X login or automatic posting in this app. Only download and repost content you own or have permission to use.

## Local storage and privacy

This is a **single-user application for your computer**. The API binds to loopback and rejects external clients, foreign origins, and unexpected Host headers. YouTube URLs are validated and normalized to a single video; arbitrary URLs and playlists are rejected. Tools run with argument arrays without shell interpolation. The app does not read browser cookies automatically.

Jobs and completed files live in `.data/<job-id>/`. Job manifests persist across restarts; interrupted exports become failed jobs you can retry. Source files and failed output files are removed after processing. Export history and completed files expire after 24 hours, with cleanup at startup and every 10 minutes. You can remove exports sooner in **My downloads**. Up to two jobs run concurrently, with a bounded queue. Cancelling terminates the downloader / FFmpeg process group.

YouTube and yt-dlp's official JavaScript challenge component service are contacted for downloads. Thumbnails come directly from YouTube. Fonts are bundled locally. No analytics are included.

## Configuration

Copy `.env.example` to `.env` if you need overrides. Development and production scripts load this file. It is ignored by Git.

| Variable             | Default            | Purpose                                                            |
| -------------------- | ------------------ | ------------------------------------------------------------------ |
| `PORT`               | `3001`             | API / production server port                                       |
| `WEB_PORT`           | `5173`             | Vite development port                                              |
| `DATA_DIR`           | `.data`            | Export storage directory                                           |
| `YTDLP_PATH`         | `.tools/yt-dlp`    | Custom downloader executable                                       |
| `FFMPEG_PATH`        | npm FFmpeg binary  | Custom FFmpeg executable                                           |
| `FFPROBE_PATH`       | npm FFprobe binary | Custom FFprobe executable                                          |
| `YTDLP_COOKIES_FILE` | unset              | Optional Netscape-format cookies file for your own YouTube session |

When overriding FFmpeg, put an executable named `ffmpeg` alongside the specified binary so yt-dlp can find it. Keep cookies files outside the repository and do not share them. They are authentication credentials. Use cookies only for videos your account is authorized to access.

## Troubleshooting

- **Setup required:** run `npm run setup`, then restart `npm run dev`. Check the health endpoint at `/api/health`.
- **YouTube sign-in / bot verification:** YouTube may block automated access or certain server IPs. Try another public video. If needed, supply your own exported cookies file through `YTDLP_COOKIES_FILE`. This does not guarantee access to all videos.
- **Unavailable video:** private, age-restricted, paid, region-blocked, removed, upcoming, and currently live videos may be unavailable. Completed videos up to 24 hours long are supported as sources.
- **Download stopped working:** rerun `npm run setup` to update yt-dlp. YouTube changes regularly. Dependencies can also be updated with npm.
- **Slow export:** longer videos take more time and disk space. 720p is the default. Start with a short clip; progress indicates downloading, conversion, and verification stages. Some YouTube segment downloads don't expose a percentage, so that stage can remain at its initial value while the download continues.
- **Original looks lower resolution:** original shape avoids upscaling smaller source videos; choosing 1080p cannot recover detail missing from the source.

## Checks and production build

```sh
npm test
npm run build
npm start
```

After building, **http://localhost:3001** serves the UI and API together. Run commands from the project root. The tests exercise timestamp and URL validation, upload bounds, extreme aspect ratios, real FFmpeg conversion (including portrait and silent inputs), output verification, API download and Range responses, saved job restoration, and cancellation. They use generated local video fixtures and do not depend on YouTube being online.

Public deployment requires a host that supports native subprocesses and enough persistent disk space, plus authentication, per-user job isolation, quotas, and a secure reverse proxy. The loopback restrictions are intentional; this repository is ready for local use rather than unauthenticated public hosting.
