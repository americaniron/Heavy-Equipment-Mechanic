# American Iron - Live AI Engineer Desk

## Overview
A full-screen, video-first live front desk experience for heavy equipment diagnostics. Visitors "walk in" and interact face-to-face with AI-powered avatars — a Registration Admin for intake and 5 specialist Mechanics for diagnostics. No traditional chat UI — the avatar is the experience.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (single-page, full-screen video UI)
- **Backend**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **AI Engine**: OpenAI (GPT-4o) via Replit AI Integrations
- **Video Avatars**: LiveAvatar (HeyGen) FULL mode API with LiveKit transport + browser TTS fallback
- **Voice**: LiveKit audio tracks via LiveAvatar + browser SpeechSynthesis fallback

## Key Files
- `shared/schema.ts` - Database schema (sessions, messages, files, reports)
- `server/routes.ts` - All API endpoints with session token auth
- `server/services/ai-engine.ts` - OpenAI conversation engine (Admin + 5 Mechanic system prompts)
- `server/services/avatar.ts` - LiveAvatar API integration (session creation, start, stop)
- `server/storage.ts` - Database CRUD operations
- `server/db.ts` - Drizzle database connection
- `client/src/pages/live-desk.tsx` - Full-screen video-first experience with LiveKit client
- `client/src/App.tsx` - Router (/ and /live-desk both go to LiveDesk)

## LiveAvatar Integration
- **API**: `https://api.liveavatar.com` using HEYGEN_API_KEY
- **Mode**: FULL mode (server-side LLM, avatar speaks text sent via LiveKit data channel)
- **Flow**: Server creates session token → starts session → returns LiveKit URL + client token → client connects to LiveKit Room → subscribes to video/audio tracks → sends speak commands on `agent-control` topic
- **Events**: `avatar.speak_text` command → `avatar.speak_started`/`avatar.speak_ended` server events → `avatar.transcription` for subtitle text
- **English Avatars**: Silas (admin), Bryan (heavy equip), Elenora (power gen), Pedro (marine), Thaddeus (hydraulics), Anastasia (electrical)
- **Arabic Avatars**: Fatima (admin), Khalid (heavy equip), Layla (power gen), Omar (marine), Hassan (hydraulics), Nour (electrical)
- **Language Selection**: Customer chooses English or Arabic on landing page; language flows through session → avatar → AI prompts
- **Background**: Mechanic shop background image (attached_assets/shop_background.png) served at /static/shop_background.png, passed to LiveAvatar API as custom background, and used as CSS fallback behind the video
- **Fallback**: Browser SpeechSynthesis when LiveKit room is disconnected

## Visual Theme
- **Caterpillar-inspired**: CAT yellow (#FFCD11) as primary, near-black backgrounds, warm industrial tones
- **Light mode**: Warm off-white backgrounds (hue 45), CAT yellow primary with dark foreground text
- **Dark mode**: Near-black with warm undertone (hue 40), bright CAT yellow accents
- **Landing page**: Deep black (#1a1a1a) with CAT yellow glow effects and accent stripe

## Intro Sequence
- Admin avatar delivers full welcome monologue as ONE speak command (no sentence-by-sentence pauses)
- "Introduction" badge + "Skip Intro" button shown during playback
- Controls hidden until intro finishes or is skipped
- 90-second timeout on waitForSpeakEnd for full intro

## UI Design
- **Landing**: Grand entrance landing page with multiple sections:
  - Fixed nav bar with AMERICAN IRON logo, service links, "WALK IN NOW" CTA
  - Full-screen hero with facility background, large logo, tagline, walk-in button
  - Services grid: 5 specialist cards with images + walk-in CTA card
  - How It Works: 3-step process (Walk In → Describe → Diagnose)
  - Why AMERICAN IRON: feature list + facility image
  - Walk In section: consent checkbox + walk-in button
  - Footer with logo + copyright
- **Branding**: "AMERICAN IRON" always in ALL CAPS in all text/titles
- **Logo**: attached_assets/american-iron-logo_1772935008934.png used in nav, hero, walk-in, footer
- **Service images**: Generated facility/service images in attached_assets/
- **Active Session**: Full-screen video of avatar, floating controls at bottom
  - Large mic button for voice input via LiveKit
  - Keyboard toggle for text input
  - Actions menu (upload files, generate report, share)
  - End session (hang up) button
- **Subtitles**: Avatar speech appears as subtitle overlay on video
- **No chat bubbles**: Responses are spoken by avatar + shown as subtitles
- **Listening/Attention Mode**: When customer speaks or AI processes:
  - Animated waveform bars + "Listening.../Thinking..." indicator at top of video
  - Golden pulsing glow border around the video container
  - Avatar speaks brief acknowledgment cues ("Mm-hmm", "I see") with 8s throttle
  - Enhanced persona prompts request expressive facial expressions, attentive eye contact, nodding

## Environment Variables
- `DATABASE_URL` - PostgreSQL connection
- `AI_INTEGRATIONS_OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI via Replit
- `HEYGEN_API_KEY` - LiveAvatar API key (from app.liveavatar.com)
- `DID_API_KEY` - D-ID API (legacy, kept for reference)

## Features
1. **Full-Screen Video Avatars** - LiveAvatar FULL mode with LiveKit video/audio streaming
2. **Registration Admin** - AI agent that collects intake info, classifies visit, assigns specialist
3. **5 Specialist Mechanics** - Heavy Equipment, Power Gen, Marine, Hydraulics, Electrical
4. **Voice Conversation** - Real-time voice via LiveKit audio tracks
5. **Text Input** - Toggle keyboard for typing instead of speaking
6. **File Uploads** - Photos and PDFs attached to sessions
7. **Report Generation** - Diagnostic reports for equipment issues
8. **Share Links** - Token-based report sharing
10. **Session Security** - Access tokens protect all session endpoints
11. **Browser TTS Fallback** - SpeechSynthesis when LiveKit is unavailable
12. **Multi-Language Support** - English and Arabic with separate avatar characters and localized AI prompts

## API Endpoints
- `POST /api/sessions` - Create session (returns accessToken)
- `GET /api/sessions/:id` - Get session (requires x-session-token header)
- `POST /api/sessions/:id/message` - Send message (SSE streaming)
- `POST /api/sessions/:id/handoff` - Admin→Mechanic handoff
- `POST /api/sessions/:id/upload` - File upload (requires auth)
- `GET /api/sessions/:id/files/:fileId` - Download file (requires auth)
- `POST /api/sessions/:id/report` - Generate report
- `GET /api/sessions/:id/report` - Get report (requires auth)
- `GET /api/shared/:token` - Access shared report (public)
- `POST /api/avatar/session` - Create LiveAvatar session (returns LiveKit connection info)
- `POST /api/avatar/session/stop` - Stop LiveAvatar session
