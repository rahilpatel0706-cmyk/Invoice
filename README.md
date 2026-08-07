# Jigar Enterprise Invoice System

This project preserves the existing frontend and migrates the backend from Google Sheets / Apps Script to Supabase through Vercel API routes.

## Current Step

Step 8: project structure created. The original frontend is copied to `index.html` and has not been visually modified.

## Planned structure

- `index.html` - existing frontend
- `api/` - Vercel server-side API routes
- `migration/` - one-time Google Sheets to Supabase migration tools
- `package.json` - Supabase server dependency

## Security

Never commit Supabase `service_role` keys or passwords. They will be added later as Vercel environment variables.
