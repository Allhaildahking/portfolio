# ALLHAILDAHKING — Personal site

A social-first personal website for **Destiny Growrich** (@allhaildahking). The layout takes its cues from X: a left navigation rail, a central timeline, and a right discovery column on desktop, with a focused mobile feed.

## Pages
- **Home:** the feed. Build logs, thoughts, and project updates.
- **About:** the profile page, including the cover, avatar, bio, and background.
- **Projects:** visual project cards with repository links.
- **Contact:** ways to reach me online.

The profile is deliberately not the homepage. The homepage opens directly into the timeline.

## Later idea: direct client chat
A proper on-site inbox can be added later. It will need a backend, persistent message storage, spam protection, and a private admin view or notifications. The current Contact page is intentionally just the public contact links; there is no fake chat widget pretending to deliver messages.

## Tech
HTML, CSS, and vanilla JavaScript. No build step is required.

## Run locally
```bash
git clone https://github.com/Allhaildahking/portfolio.git
cd portfolio
python -m http.server 8000
```
Open http://localhost:8000.

## Links
- Live site: https://allhaildahking.github.io/portfolio/
- GitHub: https://github.com/Allhaildahking
- Instagram: https://instagram.com/allhaildahking.py
- X: https://x.com/allhaildahking
