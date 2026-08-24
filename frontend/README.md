# Brown Bell & Next Up - Frontend

Read-only view of every team's current Main Award and Next Up Award duo,
pulled live from the same Supabase project the automation writes to.

**This phase is view-only on purpose.** Setting/editing duos comes with the
next phase (passcode + device-claim), so there's no write path exposed here
yet - nothing sits open on the internet in the meantime.

Deployed at the same URL used last season:
**https://hof-codez.github.io/brownbell/**

## Local setup

1. Install dependencies:
   ```
   npm install
   ```

2. Run the read-policy migration once, in your Supabase project's SQL Editor:
   `supabase/002-public-read-policies.sql`
   (This adds public SELECT access for `seasons`, `teams`, and `duos` only -
   nothing else, and no write access.)

3. Copy the env template and fill in your real values (Supabase dashboard ->
   Settings -> API - use the **anon** key here, never the service_role key):
   ```
   cp .env.example .env
   ```

4. Run it locally:
   ```
   npm run dev
   ```

## Deploying (GitHub Pages)

This lives inside the `brownbell` repo as a `frontend/` subfolder, deployed
by `.github/workflows/deploy-frontend.yml` on every push to `main` that
touches `frontend/**`.

One-time setup, done once in the GitHub repo settings (not something you run
locally):

1. Repo **Settings -> Pages -> Source** -> select **GitHub Actions**
   (this replaces the old branch-based Pages deploy from last season)
2. Repo **Settings -> Secrets and variables -> Actions -> Variables** tab ->
   add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   (safe as plain variables - both end up embedded in the public built JS
   bundle regardless, unlike the automation's service role key)

After that, every push to `main` touching `frontend/` rebuilds and redeploys
automatically - no manual steps.

## What's next

Once the passcode/device-claim system is built, duo editing gets added here
behind that auth - the read-only view stays as the fallback/public-facing
side, and an authenticated "my team" view sits on top of it.
