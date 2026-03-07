# American Iron US - Live AI Engineer Desk

## Overview
A single-page live video front desk experience for heavy equipment diagnostics. Visitors connect with AI-powered Registration Admin and specialist Mechanic avatars for real-time equipment troubleshooting.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (single-page app)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: OpenAI (GPT-4o) via Replit AI Integrations for conversation
- **Video Avatars**: HeyGen Interactive Avatar API + D-ID Talks Streams API
- **Billing**: Stripe (via Replit connector)
- **Voice**: OpenAI speech-to-text for voice input

## Key Files
- `shared/schema.ts` - Database schema (sessions, messages, files, reports)
- `server/routes.ts` - All API endpoints
- `server/services/ai-engine.ts` - OpenAI conversation engine with Admin/Mechanic system prompts
- `server/services/avatar.ts` - HeyGen + D-ID streaming session management
- `server/services/stripe-client.ts` - Stripe client via Replit connector
- `server/storage.ts` - Database CRUD operations
- `server/db.ts` - Drizzle database connection
- `client/src/pages/live-desk.tsx` - Main single-page experience
- `client/src/App.tsx` - Router (/ and /live-desk both go to LiveDesk)

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI via Replit
- `HEYGEN_API_KEY` - HeyGen Interactive Avatar API
- `DID_API_KEY` - D-ID Talks Streams API
- Stripe credentials via Replit connector

## Features
1. **Registration Admin Agent** - Collects intake info, classifies visit type, assigns mechanic
2. **5 Specialist Mechanic Agents** - Heavy Equipment, Power Gen, Marine, Hydraulics, Electrical
3. **Real-time Video Avatars** - HeyGen/D-ID WebRTC streaming
4. **Voice Input** - Microphone recording with STT transcription
5. **File Uploads** - Photos and PDFs attached to sessions
6. **Report Generation** - Quick Advice (free) and Pro Diagnostic (paid)
7. **Stripe Billing** - $149 one-time fee for Pro reports
8. **Share Links** - Token-based report sharing

## API Endpoints
- `POST /api/sessions` - Create session
- `GET /api/sessions/:id` - Get session with messages
- `POST /api/sessions/:id/message` - Send message (SSE streaming)
- `POST /api/sessions/:id/handoff` - Admin→Mechanic handoff
- `POST /api/sessions/:id/upload` - File upload
- `POST /api/sessions/:id/report` - Generate report
- `POST /api/sessions/:id/checkout` - Stripe checkout
- `GET /api/sessions/:id/payment-status` - Check payment
- `GET /api/shared/:token` - Access shared report
- `POST /api/avatar/session` - Create avatar session
- `POST /api/avatar/speak` - Make avatar speak
- `DELETE /api/avatar/session/:id` - Close avatar session
