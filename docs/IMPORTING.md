# Import images and videos from a link

In **Upload New Art → From a link**, paste an individual X post, Midjourney job, or Grok Imagine post/share URL. **Import to DreamStation** downloads and validates the original files, adds them to the local gallery, and places them in the selected group. Automatic source groups are X Favorites, Midjourney Discoveries, and Grok Imagine. Check a group's box under the display's **Groups to play** to include it in playback.

**Preview and choose files** lets you review images or play videos first, select a subset, and download individual files. Repeated imports reuse an existing local asset rather than creating another gallery copy. Provenance is retained privately with the source URL and file hash.

## CLI

Run from the DreamStation checkout:

```sh
npm run grab -- 'https://x.com/artist/status/1234567890123456789'
npm run grab -- 'https://www.midjourney.com/jobs/JOB-UUID?index=0' --collection 'My collection'
npm run grab -- 'https://grok.com/imagine/post/POST-UUID'
```

Importing into DreamStation is the default. `--collection NAME` selects or creates a group. `--output /path/to/copies` also exports copies and their source record. `--download-only --output /path/to/downloads` downloads without adding media to the gallery. Preview unfamiliar artwork in the web UI before importing it.

## Source browser

Importing uses a local Chromium session to open the original post, inspect its full media URI, and download through the site's normal browser connection. Sign in there for private or login-required posts. The importer never exports cookies or passwords and never publishes, likes, or generates content.

On Linux, close Chromium and start it with:

```sh
chromium --remote-debugging-address=127.0.0.1 --remote-debugging-port=9222 --restore-last-session
```

Keep this browser open. Routine browsing and sign-in remain under your control. Complete any site verification manually before retrying. A shared post that was deleted or is unavailable to your account cannot be imported. Public gallery, subscription and account-home URLs are not individual artwork links.

`DREAMSTATION_BROWSER_URL` defaults to `http://127.0.0.1:9222`; only loopback connections are accepted. `DREAMSTATION_STATE_DIR` optionally sets the private metadata directory; its default is `.release/state` in the checkout. Back up this directory with the database and uploaded media. It contains source records, temporary import drafts, and optional `curation-preferences.json` with an `excludedThemes` array. Matching excluded demonic/occult terms in source descriptions and previously excluded file hashes are rejected when that preference is configured. This is not visual image classification: preview artwork to review its appearance.

Files use the normal upload validators and limits: supported JPG, PNG, WebP, MP4 and WebM formats, 50 MiB each, 100 MiB per post and at most 20 files. Uncommitted previews expire after 24 hours and are cleaned on a subsequent import. Committed gallery files are preserved.
