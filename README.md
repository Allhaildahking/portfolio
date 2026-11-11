# ALLHAILDAHKING — Personal site

A social-first personal website for **Destiny Growrich** (@allhaildahking). The layout takes its cues from X: a left navigation rail, a central timeline, and a right discovery column on desktop, with a focused mobile feed.

## Pages
- **Home:** the feed. Build logs, thoughts, and project updates.
- **Explore:** AI, tech, and finance news.
- **About:** the profile page, including the cover, avatar, bio, and background.
- **Projects:** visual project cards with repository links.
- **Contact:** ways to reach me online.

## Tech
HTML, CSS, and vanilla JavaScript. No frontend build step is required. The optional anonymous interaction layer uses Supabase Edge Functions and PostgreSQL.

## Anonymous interactions

The homepage interaction layer is prepared for:
- Likes tied to an anonymous browser ID.
- Guest comments using a display name.
- Public view counts.
- A recent activity panel showing approved comments.

There are no visitor accounts, passwords, reposts, bookmarks, or visitor notifications. Comments are inserted as **pending** and must be approved in the Supabase dashboard before appearing publicly.

### Supabase setup

1. Create a Supabase project on the Free plan.
2. Open the SQL Editor and run `supabase/migrations/202611110001_portfolio_interactions.sql`.
3. Deploy the Edge Function:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy portfolio-interactions
   ```
4. Set a strong random `IP_HASH_SECRET` function secret. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically:
   ```bash
   supabase secrets set IP_HASH_SECRET="replace-with-a-long-random-secret"
   ```
5. Add the project's Project URL and anon/public key to `assets/js/supabase-config.js`. Never add the service-role key to the website.
6. Approve comments from the `portfolio_comments` table in the Supabase dashboard.

The database tables have Row Level Security enabled and no public table policies. All interaction reads and writes go through the Edge Function. IP addresses are hashed server-side and are not stored in raw form. Rate limits are best-effort abuse controls, not proof of a visitor's identity.

The frontend stays inactive until the Supabase URL and anon key are configured, so the live site won't show non-working controls while setup is incomplete.

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
