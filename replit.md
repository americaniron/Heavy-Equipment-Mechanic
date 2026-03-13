# American Iron - Live AI Engineer Desk

## Overview
A full-screen, video-first live front desk experience for heavy equipment diagnostics. Visitors "walk in" and interact face-to-face with AI-powered avatars — a Registration Admin for intake and 6 specialist divisions for diagnostics and parts assistance. Includes a full Customer Portal and AI Virtual Mechanic Portal requiring registration.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (single-page, full-screen video UI)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: OpenAI (GPT-4o) via Replit AI Integrations
- **Video Avatars**: LiveAvatar (HeyGen) FULL mode API with LiveKit transport + browser TTS fallback
- **Voice**: LiveKit audio tracks via LiveAvatar + browser SpeechSynthesis fallback
- **Auth**: Token-based auth with bcryptjs password hashing

## Key Files
- `shared/schema.ts` - Database schema (sessions, messages, files, reports, customers, equipment, serviceRequests, workOrders, maintenanceSchedules, supportTickets, documents, invoices)
- `server/routes.ts` - All API endpoints with session token auth + portal auth
- `server/services/ai-engine.ts` - OpenAI conversation engine (Admin + 6 Specialist system prompts)
- `server/services/avatar.ts` - LiveAvatar API integration (session creation, start, stop)
- `server/storage.ts` - Database CRUD operations for all tables
- `server/db.ts` - Drizzle database connection
- `client/src/pages/live-desk.tsx` - Full-screen video-first experience with LiveKit client
- `client/src/pages/auth.tsx` - Login/Register page with AMERICAN IRON branding
- `client/src/pages/portal.tsx` - Full Customer Portal + AI Virtual Mechanic Portal (20 sections)
- `client/src/lib/auth.tsx` - AuthProvider context with login/register/logout
- `client/src/App.tsx` - Router with routes for /, /live-desk, /login, /register, /portal

## Customer Portal & AI Mechanic Portal
- **Auth**: Token-based (x-auth-token header), bcryptjs password hashing, shared registration
- **Customer Portal Sections**: Dashboard, My Equipment, Parts, Service, Maintenance, Orders & Shipping, Documents, Billing & Account, Support Center, Admin
- **AI Virtual Mechanic Sections**: AI Intake/Triage, Diagnosis Engine, Guided Troubleshooting, Fault Code Center, Recommended Parts, Repair Planning, Predictive Maintenance, Case History, Live AI Mechanic, Escalation to Human Expert
- **Sidebar Navigation**: Collapsible dark sidebar with two section groups, mobile-responsive with hamburger toggle
- **Ownership checks**: All CRUD operations verify customer ownership before update/delete

## Portal API Endpoints
- `POST /api/auth/register` - Create customer account
- `POST /api/auth/login` - Verify credentials, return auth token
- `GET /api/auth/me` - Get current customer (requires x-auth-token)
- `POST /api/auth/logout` - Clear session
- `GET /api/portal/dashboard` - Aggregated stats (equipment, cases, invoices, tickets)
- `GET/POST/PATCH/DELETE /api/portal/equipment` - Equipment CRUD
- `GET/POST/PATCH /api/portal/service-requests` - Service request CRUD
- `GET /api/portal/work-orders` - Work orders
- `GET/POST /api/portal/maintenance` - Maintenance schedules
- `GET/POST /api/portal/support-tickets` - Support tickets
- `GET /api/portal/documents` - Documents
- `GET /api/portal/invoices` - Invoices
- `PATCH /api/portal/profile` - Update customer profile
- `POST /api/portal/escalation` - Escalation to human expert (creates support ticket)
- `GET /api/portal/cases` - AI session history

## LiveAvatar Integration
- **API**: `https://api.liveavatar.com` using HEYGEN_API_KEY
- **Mode**: FULL mode (server-side LLM, avatar speaks text sent via LiveKit data channel)
- **Flow**: Server creates session token → starts session → returns LiveKit URL + client token → client connects to LiveKit Room → subscribes to video/audio tracks → sends speak commands on `agent-control` topic
- **Events**: `avatar.speak_text` command → `avatar.speak_started`/`avatar.speak_ended` server events → `avatar.transcription` for subtitle text
- **Voice Input**: Client-side MediaRecorder captures user mic audio with VAD (silence detection) → sends to `/api/transcribe` endpoint → OpenAI Whisper STT → transcribed text fed to `handleUserMessage` → GPT-4o response → `avatar.speak_text` command
- **English Avatars**: Sarah (admin, random pool), Bryan (heavy equip), Elenora (power gen), Pedro (marine), Thaddeus (hydraulics), Anastasia (electrical), Marcus/Silas (parts)
- **Arabic Avatars**: سارة/Sarah (admin), خالد/Khalid-Dexter (heavy equip), ليلى/Layla-Anastasia (power gen), عمر/Omar-Shawn (marine), حسن/Hassan-Dexter (hydraulics), نور/Nour-Elenora (electrical), طارق/Tariq-Bryan (parts) — gender-correct mapping, Arabic script names
- **Body Gestures**: All avatar personas include natural body language instructions (nodding, hand gestures, leaning, posture changes)
- **Handoff Bug Fix**: Client strips `<INTAKE_JSON>` tags from GPT response before sending text to avatar to prevent reading code/punctuation aloud
- **Speaking Style**: All GPT prompts include natural conversational speaking instructions (filler words, varied sentence length, no robotic phrasing)

## Report Popup
- **Cinematic Full-Screen Modal**: Dark overlay with blur, golden accent border, animated entrance
- **Actions**: Print/Save PDF (opens print dialog), Email Report (mailto: with summary), Copy Share Link
- **CinematicReportContent**: Premium dark-theme cards with golden section headers, color-coded confidence badges, numbered diagnostic steps
- **ReportContent**: Legacy light-theme version kept for shared report page

## Visual Theme
- **Caterpillar-inspired**: CAT yellow (#FFCD11) as primary, near-black backgrounds (#111111, #1a1a1a, #222)
- **Dark theme**: Near-black with warm undertone, bright CAT yellow accents
- **"AMERICAN IRON" always in ALL CAPS**

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI via Replit
- `HEYGEN_API_KEY` - LiveAvatar API key (from app.liveavatar.com)
- `DID_API_KEY` - D-ID API (legacy, kept for reference)
- `SESSION_SECRET` - For session management

## Session API Endpoints
- `POST /api/sessions` - Create session (returns accessToken)
- `GET /api/sessions/:id` - Get session (requires x-session-token header)
- `POST /api/sessions/:id/message` - Send message (SSE streaming)
- `POST /api/sessions/:id/handoff` - Admin→Mechanic handoff
- `POST /api/sessions/:id/upload` - File upload (requires auth)
- `GET /api/sessions/:id/files/:fileId` - Download file (requires auth)
- `POST /api/sessions/:id/report` - Generate report
- `GET /api/sessions/:id/report` - Get report (requires auth)
- `GET /api/shared/:token` - Access shared report (public)
- `POST /api/avatar/session` - Create LiveAvatar session
- `POST /api/avatar/session/stop` - Stop LiveAvatar session
