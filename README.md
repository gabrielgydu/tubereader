# tubeReader

Paste a YouTube, Instagram or SoundCloud link; get back a transcript, a
summary, key takeaways and timestamps you can search across. Next.js 16 +
SQLite (better-sqlite3 + Drizzle), transcription via AssemblyAI, summarizing
and transcript formatting via the local `claude` CLI.

Everything runs on this machine — the database, the audio, the pipeline. It is
reachable from the phone over Tailscale, not the public internet.

## Running it

Two modes, both on `127.0.0.1:3700`, so only one can run at a time.

```bash
tubereader start      # dev server (next dev), background, hot reload
tubereader stop
tubereader status     # says which of the two, if either, is up
tubereader logs
```

```bash
./install.sh          # or: tubereader install
```

`install.sh` is the production path and is idempotent — **re-run it after every
code change**. It stops the dev server, builds, writes the
`tubereader.service` systemd **user** unit (so it survives reboots), restarts
it, and publishes it with `tailscale serve`. Then:

```bash
tubereader service {status,start,stop,restart}
tubereader url        # https://p16s.tail7f988e.ts.net:10001/
journalctl --user -u tubereader -f
```

Port 10001 because 443, 8443 and 10000 on this host already belong to
claude-launcher, another app, and Recall respectively.

## Installing it on the phone

1. Connect the phone to the tailnet.
2. Open the `tubereader url` output in **Safari** (not Chrome — only Safari can
   install a PWA on iOS).
3. **Share → Add to Home Screen.**

It launches standalone: no browser chrome, a bottom tab bar, and the dark theme
painted into the status bar. HTTPS comes from Tailscale's certificate, which is
what makes it installable at all.

### Sharing links into it from iOS

iOS does not implement Web Share Target, so the share sheet needs a Shortcut:

1. Shortcuts → **+** → Add Action → **Open URLs**.
2. Set the URL to `https://p16s.tail7f988e.ts.net:10001/share?url=` followed by
   the **Shortcut Input** variable.
3. Shortcut Details → enable **Show in Share Sheet**, accept URLs and text.
4. Name it something like *Add to tubeReader*.

Now: YouTube app → Share → *Add to tubeReader*. The link is queued and the
pipeline starts on this machine. Android and desktop Chrome skip the Shortcut —
the manifest's `share_target` points at the same `/share` route.

`/share` also works typed by hand, and accepts a link buried in prose
(`?text=check+this+out+https://youtu.be/…`).

## Markdown mirrors

Every video that finishes the pipeline is also written out as a standalone
markdown file in `~/recordings/tubereader/` (override with `TUBEREADER_MD_DIR`),
so transcripts can be read, grepped and handed to other tools without going
through this app. The database stays the source of truth — the files are a
mirror and can be deleted and regenerated at will.

One file per video, named `<upload-date>-<title-slug>-<id>.md`: YAML
frontmatter, then the verdict, summary and key takeaways, then the transcript —
the formatted reading view when one exists, speaker-labeled dialogue for
multi-speaker videos, otherwise the raw text broken into paragraphs.

```bash
npm run export-md              # (re)write every video that has a transcript
npm run export-md -- --dry-run # list the filenames without writing
npm run export-md -- --dir /tmp/out
```

Backfill and rewrites are idempotent: a video always maps to the same filename,
and a retitled video's old file is removed when the new one is written.

**Open in Notas**, next to the transcript on a video's page, hands the mirror to
[notas](http://notas/) — the local markdown reader — instead of reading it here.

The link goes through `/api/videos/<id>/notas`, which rewrites the mirror before
redirecting, so the tab always shows what the database holds now.

`notas` is an `/etc/hosts` alias on the machine that runs it, so the link only
resolves there — the phone gets a dead tab unless notas is published somewhere
it can reach and `TUBEREADER_NOTAS_URL` points at that address.

## Layout

- `src/app/` — routes. `api/` holds the REST + SSE endpoints; `manifest.ts` is
  the PWA manifest; `share/` is the share-sheet ingest.
- `src/components/layout/` — `sidebar` (desktop, `md` and up), `mobile-header` +
  `bottom-nav` (below `md`), `reading-controls` shared by both, `nav.ts` the
  single source of truth for nav entries.
- `src/lib/pipeline/` — `orchestrator` runs the queue (3 concurrent) through
  metadata → download → transcribe → summarize → format. It shells out to
  `yt-dlp`, `gallery-dl` and `claude`, which is why the systemd unit sets an
  explicit `PATH` and `DBUS_SESSION_BUS_ADDRESS` (the latter for
  `--cookies-from-browser`).
- `src/lib/db/` — schema and migrations, applied on first connection.
- `public/icons/` — `mark.svg` is the source of truth; `npm run icons`
  rasterizes the PNGs the manifest and iOS reference.
- `data/` — the SQLite database and downloaded audio. **Not** in git, and not
  disposable.
- `scripts/export-md.mjs` — backfills the markdown mirrors. It runs the app's
  TypeScript directly through a resolver hook that teaches Node the `@/` alias
  and extensionless imports.

## Verifying a change

```bash
npm run typecheck     # tsc --noEmit
npm run lint
npm run build
```

`src/lib/hooks.ts`, `src/app/channels/page.tsx` and
`src/components/layout/reading-settings.tsx` carry 5 pre-existing
`react-hooks/*` errors from the React Compiler lint rules. Don't add to them.
