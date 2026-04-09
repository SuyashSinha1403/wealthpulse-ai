# WealthPulse AI

WealthPulse AI is a personal finance dashboard for tracking cash flow, investments, liabilities, and AI-assisted financial insights in one place.

Live app: [https://wealthpulse-ai.lovable.app/](https://wealthpulse-ai.lovable.app/)

## What it does

- Tracks income, expenses, assets, and liabilities
- Imports demo and user financial data
- Shows portfolio, debt, and cash flow views
- Uses Supabase for auth, data storage, and edge functions
- Includes AI-powered financial insights and helper workflows

## Tech stack

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Supabase

## Local development

Requirements:

- Node.js 18+
- npm

Start the app locally:

```sh
npm install
npm run dev
```

Build for production:

```sh
npm run build
```

Run tests:

```sh
npm test
```

## Environment variables

Create a local `.env` file using `.env.example` as a reference.

Typical variables used by this project:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not commit real secrets or local Supabase metadata to the repository.

## Project structure

- `src/` app UI, hooks, pages, and utilities
- `supabase/functions/` edge functions
- `supabase/migrations/` database migrations
- `demo-data/` sample import files
- `scripts/` local utility scripts

## Deployment

The production app is published through Lovable and available at:

[https://wealthpulse-ai.lovable.app/](https://wealthpulse-ai.lovable.app/)
