# American Iron - Live AI Engineer Desk

## Overview
A full-screen, video-first live front desk experience for heavy equipment diagnostics. Visitors "walk in" and interact face-to-face with AI-powered avatars — a Registration Admin for intake and 6 specialist divisions for diagnostics and parts assistance. Includes a full Customer Portal and AI Virtual Mechanic Portal requiring registration.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (single-page, full-screen video UI)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: OpenAI (GPT-4o) via Replit AI Integrations
- **Video Avatars**: D-ID Agents Streams API with clip-type presenters (primary, WebRTC, Full-HD body gestures) → HeyGen LiveAvatar (auto-fallback on 402, LiveKit) → browser TTS (last resort)
- **Voice**: D-ID Microsoft Multilingual Neural voices (120+ languages) / HeyGen LiveKit audio tracks + browser SpeechSynthesis fallback
- **Avatar Expressions**: Context-aware expression system analyzes text for greeting/positive/concern/question/explain/empathy patterns (Unicode-safe Arabic regex) and applies D-ID driver_expressions + dynamic motion_factor
- **D-ID Plan**: Build plan (64 credits/month), clip-type presenters with Full-HD 1080p, auto credit check before session creation
- **Auth**: Token-based auth with bcryptjs password hashing

## Key Files
- `shared/schema.ts` - Database schema (sessions, messages, files, reports, customers, equipment, serviceRequests, workOrders, maintenanceSchedules, supportTickets, documents, invoices, verificationCodes, visitLogs)
- `server/routes.ts` - All API endpoints with session token auth + portal auth + admin portal auth + verification endpoints
- `server/services/ai-engine.ts` - OpenAI conversation engine (Admin + 6 Specialist system prompts, with verification step integration)
- `server/services/avatar.ts` - HeyGen LiveAvatar API integration (session creation with H264/high quality, start, stop)
- `server/services/did-avatar.ts` - D-ID Agents Streams API (agent creation with cached agents, WebRTC streams, speak, ICE/SDP relay, per-session stream cleanup)
- `server/storage.ts` - Database CRUD operations for all tables including verification codes and visit logs
- `server/db.ts` - Drizzle database connection
- `client/src/pages/live-desk.tsx` - Full-screen video-first experience with LiveKit client, verification modal, text chunking for lip-sync
- `client/src/pages/auth.tsx` - Login/Register page with AMERICAN IRON branding
- `client/src/pages/portal.tsx` - Full Customer Portal + AI Virtual Mechanic Portal (20 sections)
- `client/src/pages/admin-portal.tsx` - Admin Portal with dashboard, visit logs, customer management, email/WhatsApp communication
- `client/src/lib/auth.tsx` - AuthProvider context with login/register/logout
- `client/src/App.tsx` - Router with routes for /, /live-desk, /login, /register, /portal, /admin

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

## Avatar Integration (Dual Provider: D-ID Primary + HeyGen Fallback)
- **Primary**: D-ID Agents Streams API (`https://api.d-id.com`) using DID_API_KEY
  - WebRTC-based: Server creates D-ID agent → creates stream → returns SDP offer + ICE servers → client does WebRTC handshake (RTCPeerConnection) → receives video/audio tracks
  - Speak via REST: `POST /agents/{agentId}/streams/{streamId}` with `script.type=text`
  - D-ID presenters mapped per role/language with Microsoft Neural voices (EN + AR)
  - Agent caching: agents created once per role/language combination, reused across sessions
  - New endpoints: `/api/avatar/session/sdp` (SDP answer), `/api/avatar/session/ice` (ICE candidates)
  - Service file: `server/services/did-avatar.ts`
- **Fallback**: HeyGen LiveAvatar API (`https://api.liveavatar.com`) using HEYGEN_API_KEY
  - LiveKit-based: FULL mode, server creates session → returns LiveKit URL + token → client connects to LiveKit Room
  - Speak via LiveKit data channel: `avatar.speak_text` on `agent-control` topic
  - Service file: `server/services/avatar.ts`
- **Fallback Chain**: D-ID → HeyGen → Browser TTS (speechSynthesis)
- **Provider Detection**: Server tries D-ID first; on failure, falls back to HeyGen. Response includes `provider: "did"` or `provider: "heygen"`. Client reads provider to determine connection method.
- **Speak Routing**: `sendAvatarSpeakCommand` checks `avatarProviderRef` → D-ID uses `/api/avatar/speak` REST call, HeyGen uses LiveKit data channel, fallback uses browser TTS
- **Voice Input**: Client-side MediaRecorder captures user mic audio with VAD (silence detection) → sends to `/api/transcribe` endpoint → OpenAI Whisper STT → transcribed text fed to `handleUserMessage` → GPT-4o response → avatar speak command
- **English Avatars**: Sarah (admin), Bryan (heavy equip), Elenora (power gen), Pedro (marine), Thaddeus (hydraulics), Anastasia (electrical), Marcus (parts)
- **Arabic Avatars**: سارة (admin), خالد (heavy equip), ليلى (power gen), عمر (marine), حسن (hydraulics), نور (electrical), طارق (parts)
- **Body Gestures**: All avatar personas include natural body language instructions
- **Speaking Style**: Strict no-filler instructions — no verbal fillers; direct substantive responses only
- **Idle Timeout**: 2-minute warning, 3-minute auto-disconnect with avatar goodbye message (English/Arabic)

## Report Generation
- **Endpoint**: `POST /api/sessions/:id/report` — returns existing report if already generated, creates new via OpenAI
- **Quick Advice Report**: Comprehensive JSON with equipment info, problem summary, likely causes with explanations, safe checks, immediate actions, safety warnings, when to call tech, additional notes
- **Pro Diagnostic Report**: Detailed JSON with root cause matrix (evidence + test methods), diagnostic tree, tools required, safety checklist, labor estimate with skill level, parts list with alternatives, procedure steps, calibration steps, preventive maintenance, recommendations, urgency level
- **SVG Diagram**: Auto-generated technical diagram for Pro reports
- **Report Modal**: Cinematic dark-theme with section headers, confidence badges, print-optimized layout
- **Print**: Professional print stylesheet with AMERICAN IRON branding, proper typography, page-break-inside:avoid
- **Share**: Public share via token URL, email report, copy link

## Visual Theme
- **Caterpillar-inspired**: CAT yellow (#FFCD11) as primary, near-black backgrounds (#111111, #1a1a1a, #222)
- **Dark theme**: Near-black with warm undertone, bright CAT yellow accents
- **"AMERICAN IRON" always in ALL CAPS**

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI via Replit
- `DID_API_KEY` - D-ID Agents Streams API key (primary avatar provider)
- `HEYGEN_API_KEY` - HeyGen LiveAvatar API key (fallback avatar provider)
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
- `POST /api/avatar/session` - Create avatar session (tries D-ID first, falls back to HeyGen)
- `POST /api/avatar/speak` - Send speak command (routes to D-ID or HeyGen based on provider param)
- `POST /api/avatar/session/sdp` - Send SDP answer (D-ID WebRTC)
- `POST /api/avatar/session/ice` - Send ICE candidate (D-ID WebRTC)
- `POST /api/avatar/session/stop` - Stop avatar session (handles both D-ID and HeyGen)
