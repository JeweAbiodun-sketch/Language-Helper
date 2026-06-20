# Language Helper

Starter scaffold for a German-learning mobile app with personalized lessons, spaced repetition, and progress tracking.

## What is in place

- Expo React Native app shell
- A first dashboard-style home screen
- Mock lesson flow and skill progress UI
- Project config for TypeScript and Expo
- Supabase client scaffold and starter schema

## Why this stack

- It gives us a fast mobile-first start without needing Flutter installed locally.
- It keeps the app flexible for later offline storage, analytics, and audio features.
- It fits the MVP from `Project-guide.md`: onboarding, lesson loop, SRS, and progress tracking.

## Supabase setup

1. Copy [.env.example](./.env.example) to `.env`.
2. Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Run the SQL in [supabase/schema.sql](./supabase/schema.sql) in your Supabase project.
4. Run [supabase/seed.sql](./supabase/seed.sql) to populate a few starter lessons.
5. Install the new dependencies with `npm install` once you are ready to run the app.

When a new user completes onboarding, the app also creates a small starter SRS queue for that account so the review screen has immediate content.

## Next build steps

1. Add onboarding and placement-test screens.
2. Split the lesson data into reusable content files.
3. Add auth and profile creation against Supabase.
4. Add local persistence for offline lessons and SRS queues.
5. Wire in navigation between dashboard, lesson, and review flows.

## Run locally

After installing dependencies, start the app with:

```bash
npm install
npm run start
```
