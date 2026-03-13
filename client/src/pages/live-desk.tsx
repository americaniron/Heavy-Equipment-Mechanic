import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import {
  Mic, MicOff, Send, Upload, FileText, Phone, Shield,
  Loader2, Wrench, Zap, Anchor, Droplets, Cpu, User,
  ChevronRight, X, Download, Share2, AlertTriangle, Volume2, Keyboard,
  HardHat, Cog, ArrowRight, CheckCircle2, Star, Play, MessageCircle,
  Search, ChevronDown, ChevronUp, Package
} from "lucide-react";
import shopBackgroundPath from "@assets/shop_background.png";
import logoPath from "@assets/american-iron-logo_1772935008934.png";
import heroFacilityPath from "@assets/hero_facility.png";
import workshopVideoPath from "@assets/generated_videos/workshop_bg_compressed.mp4";
import aboutShopVideoPath from "@assets/generated_videos/about_shop_compressed.mp4";
import aboutNarrationPath from "@assets/generated_videos/about_narration.mp3";
import serviceHeavyEquipPath from "@assets/service_heavyequip.png";
import servicePowerGenPath from "@assets/service_powergen.png";
import serviceMarinePath from "@assets/service_marine.png";
import serviceHydraulicsPath from "@assets/service_hydraulics.png";
import serviceElectricalPath from "@assets/service_electrical.png";
import servicePartsPath from "@assets/service_parts.png";

interface SessionData {
  id: number;
  status: string;
  tier: string;
  visitType: string | null;
  mechanicType: string | null;
  paymentStatus: string | null;
  shareToken: string | null;
  customerName: string | null;
  equipmentType: string | null;
  make: string | null;
  model: string | null;
  accessToken?: string;
}

interface ReportData {
  id: number;
  reportType: string;
  content: any;
  svgDiagram: string | null;
  shareToken: string | null;
}

const MECHANIC_INFO: Record<string, Record<string, { name: string; title: string; icon: any }>> = {
  en: {
    heavy_equipment: { name: "Mike Torres", title: "Heavy Equipment Mechanic", icon: Wrench },
    power_gen: { name: "Sarah Chen", title: "Power Generation Engineer", icon: Zap },
    marine: { name: "James Coastal", title: "Marine Engine Mechanic", icon: Anchor },
    hydraulics: { name: "David Pressure", title: "Hydraulics Specialist", icon: Droplets },
    electrical: { name: "Elena Circuit", title: "Electrical Controls Specialist", icon: Cpu },
    parts: { name: "Marcus", title: "Parts Assistance Specialist", icon: Package },
  },
  ar: {
    heavy_equipment: { name: "خالد المهندس", title: "ميكانيكي معدات ثقيلة", icon: Wrench },
    power_gen: { name: "ليلى", title: "مهندسة توليد الطاقة", icon: Zap },
    marine: { name: "عمر البحري", title: "ميكانيكي محركات بحرية", icon: Anchor },
    hydraulics: { name: "حسن", title: "أخصائي هيدروليك", icon: Droplets },
    electrical: { name: "نور", title: "أخصائية كهرباء وتحكم", icon: Cpu },
    parts: { name: "طارق", title: "أخصائي قطع الغيار", icon: Package },
  },
};

export default function LiveDesk() {
  const { toast } = useToast();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<"en" | "ar">("en");
  const [isConnecting, setIsConnecting] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [inputText, setInputText] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<"admin" | "mechanic">("admin");
  const [mechanicType, setMechanicType] = useState<string | null>(null);
  const [handoffInProgress, setHandoffInProgress] = useState(false);
  const [introPlaying, setIntroPlaying] = useState(false);
  const [subtitleText, setSubtitleText] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sharedReport, setSharedReport] = useState<{ report: ReportData; session: any } | null>(null);
  const [showAboutVideo, setShowAboutVideo] = useState(false);
  const [aboutNarrating, setAboutNarrating] = useState(false);
  const [activeView, setActiveView] = useState<"home" | "services">("home");
  const [expandedService, setExpandedService] = useState<number | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState("");
  const [verifyType, setVerifyType] = useState<"email" | "phone">("email");
  const [verifyCode, setVerifyCode] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "verified" | "failed" | null>(null);
  const aboutVideoRef = useRef<HTMLVideoElement>(null);
  const aboutAudioRef = useRef<HTMLAudioElement | null>(null);

  const startAboutNarration = useCallback(() => {
    if (aboutAudioRef.current) {
      aboutAudioRef.current.pause();
      aboutAudioRef.current = null;
    }
    const audio = new Audio(aboutNarrationPath);
    audio.volume = 1.0;
    audio.onplay = () => setAboutNarrating(true);
    audio.onended = () => setAboutNarrating(false);
    audio.onerror = () => setAboutNarrating(false);
    audio.onpause = () => setAboutNarrating(false);
    aboutAudioRef.current = audio;
    audio.play().catch(() => setAboutNarrating(false));
  }, []);

  const stopAboutNarration = useCallback(() => {
    if (aboutAudioRef.current) {
      aboutAudioRef.current.pause();
      aboutAudioRef.current.currentTime = 0;
      aboutAudioRef.current = null;
    }
    setAboutNarrating(false);
  }, []);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const avatarSessionTokenRef = useRef<string | null>(null);
  const avatarSessionIdRef = useRef<string | null>(null);
  const avatarProviderRef = useRef<"did" | "heygen" | null>(null);
  const didPeerRef = useRef<RTCPeerConnection | null>(null);
  const didAgentIdRef = useRef<string | null>(null);
  const didStreamIdRef = useRef<string | null>(null);
  const didSessionIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<Array<{ role: string; content: string }>>([]);
  const pendingHandoffRef = useRef<any>(null);
  const speakEndedResolveRef = useRef<(() => void) | null>(null);
  const introPlayingRef = useRef(false);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRecordingRef = useRef(false);
  const recordingChunksRef = useRef<Blob[]>([]);
  const vadFrameRef = useRef<number>(0);
  const manualStopRef = useRef(false);
  const sessionDataRef = useRef<SessionData | null>(null);
  const isProcessingRef = useRef(false);
  const handleUserMessageRef = useRef<(msg: string) => Promise<void>>(() => Promise.resolve());
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleWarningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_WARNING_MS = 120000;
  const IDLE_DISCONNECT_MS = 180000;

  const cleanupAudioNodes = useCallback(() => {
    if (vadFrameRef.current) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = 0;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (analyserSourceRef.current) {
      try { analyserSourceRef.current.disconnect(); } catch {}
      analyserSourceRef.current = null;
    }
  }, []);

  const stopVoiceCapture = useCallback(() => {
    manualStopRef.current = true;
    isRecordingRef.current = false;
    cleanupAudioNodes();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    mediaRecorderRef.current = null;
    recordingChunksRef.current = [];
    setIsListening(false);
  }, [cleanupAudioNodes]);

  const startVoiceCapture = useCallback(async () => {
    if (isRecordingRef.current) return;
    manualStopRef.current = false;

    try {
      if (!audioStreamRef.current || audioStreamRef.current.getTracks().every(t => t.readyState === "ended")) {
        audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      }

      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
      }

      cleanupAudioNodes();

      const source = audioContextRef.current.createMediaStreamSource(audioStreamRef.current);
      analyserSourceRef.current = source;
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(audioStreamRef.current, { mimeType });
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onerror = () => {
        isRecordingRef.current = false;
        cleanupAudioNodes();
        setIsListening(false);
      };

      recorder.onstop = async () => {
        isRecordingRef.current = false;
        cleanupAudioNodes();

        if (manualStopRef.current) {
          recordingChunksRef.current = [];
          return;
        }

        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        recordingChunksRef.current = [];

        if (blob.size < 1000) {
          setTimeout(() => startVoiceCapture(), 200);
          return;
        }

        try {
          setIsListening(false);

          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");
          const res = await fetch("/api/transcribe", { method: "POST", body: formData });
          if (!res.ok) throw new Error("Transcription failed");
          const { text } = await res.json();

          if (text && text.trim().length > 1) {
            console.log("Transcribed:", text);
            await handleUserMessageRef.current(text.trim());
          } else {
            setTimeout(() => startVoiceCapture(), 200);
          }
        } catch (err) {
          console.error("Transcription error:", err);
          setTimeout(() => startVoiceCapture(), 500);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      isRecordingRef.current = true;
      setIsListening(true);

      let speechDetected = false;
      let silenceStart = 0;
      const SILENCE_THRESHOLD = 15;
      const SPEECH_THRESHOLD = 25;
      const SILENCE_DURATION = 1500;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkAudio = () => {
        if (!isRecordingRef.current || manualStopRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        if (avg > SPEECH_THRESHOLD) {
          speechDetected = true;
          silenceStart = 0;
        } else if (speechDetected && avg < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now();
          if (Date.now() - silenceStart > SILENCE_DURATION) {
            if (recorder.state === "recording") {
              recorder.stop();
            }
            return;
          }
        }

        vadFrameRef.current = requestAnimationFrame(checkAudio);
      };
      vadFrameRef.current = requestAnimationFrame(checkAudio);

    } catch (err) {
      console.error("Voice capture error:", err);
      isRecordingRef.current = false;
      toast({ title: "Microphone error", description: "Could not access microphone.", variant: "destructive" });
    }
  }, [cleanupAudioNodes, toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared");
    if (shared) {
      loadSharedReport(shared);
      window.history.replaceState({}, "", "/");
    }

    if (heroVideoRef.current) {
      heroVideoRef.current.muted = true;
      heroVideoRef.current.play().catch(() => {});
    }

    return () => {
      cleanupAvatarSession();
    };
  }, []);

  const cleanupAvatarSession = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (idleWarningTimerRef.current) { clearTimeout(idleWarningTimerRef.current); idleWarningTimerRef.current = null; }
    stopVoiceCapture();
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (didPeerRef.current) {
      try { didPeerRef.current.close(); } catch (e) { console.error("D-ID peer close error:", e); }
      didPeerRef.current = null;
    }
    const container = videoContainerRef.current;
    if (container) {
      container.querySelectorAll("video").forEach(v => v.remove());
    }
    document.querySelectorAll("audio[style*='display: none']").forEach(a => {
      (a as HTMLAudioElement).pause();
      a.remove();
    });
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (e) {
        console.error("Room disconnect error:", e);
      }
      roomRef.current = null;
    }
    const provider = avatarProviderRef.current;
    if (provider === "did" && didAgentIdRef.current && didStreamIdRef.current && didSessionIdRef.current) {
      fetch("/api/avatar/session/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "did",
          agentId: didAgentIdRef.current,
          streamId: didStreamIdRef.current,
          sessionId: didSessionIdRef.current,
        }),
      }).catch(() => {});
      didAgentIdRef.current = null;
      didStreamIdRef.current = null;
      didSessionIdRef.current = null;
    } else if (avatarSessionTokenRef.current) {
      fetch("/api/avatar/session/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: avatarSessionTokenRef.current }),
      }).catch(() => {});
    }
    avatarSessionTokenRef.current = null;
    avatarSessionIdRef.current = null;
    avatarProviderRef.current = null;
  }, []);

  const speakWithBrowser = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsTalking(true);
      utterance.onend = () => {
        setIsTalking(false);
        setTimeout(() => setSubtitleText(""), 2000);
        if (speakEndedResolveRef.current) {
          speakEndedResolveRef.current();
          speakEndedResolveRef.current = null;
        }
      };
      const voices = window.speechSynthesis.getVoices();
      const langPrefix = selectedLanguage === "ar" ? "ar" : "en";
      const preferred = voices.find(v => v.name.includes("Google") && v.lang.startsWith(langPrefix)) || voices.find(v => v.lang.startsWith(langPrefix));
      if (preferred) utterance.voice = preferred;
      if (selectedLanguage === "ar") utterance.lang = "ar";
      window.speechSynthesis.speak(utterance);
    }
  }, [selectedLanguage]);

  const waitForSpeakEnd = useCallback((timeoutMs: number = 30000): Promise<void> => {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        speakEndedResolveRef.current = null;
        resolve();
      }, timeoutMs);

      speakEndedResolveRef.current = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }, []);

  const sendAvatarSpeakCommand = useCallback(async (text: string) => {
    const provider = avatarProviderRef.current;

    if (provider === "did") {
      if (!didAgentIdRef.current || !didStreamIdRef.current || !didSessionIdRef.current) {
        speakWithBrowser(text);
        return;
      }
      try {
        const sentenceMatches = text.match(/[^.!?؟]+[.!?؟]+\s*/g) || [];
        const matched = sentenceMatches.join("");
        const remainder = text.slice(matched.length).trim();
        const sentences = [...sentenceMatches];
        if (remainder) sentences.push(remainder);

        const chunks: string[] = [];
        let current = "";
        for (const s of sentences) {
          if ((current + s).length > 100 && current) {
            chunks.push(current.trim());
            current = s;
          } else {
            current += s;
          }
        }
        if (current.trim()) chunks.push(current.trim());
        if (chunks.length === 0) chunks.push(text);

        setIsTalking(true);

        for (let i = 0; i < chunks.length; i++) {
          const speakRes = await fetch("/api/avatar/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              provider: "did",
              agentId: didAgentIdRef.current,
              streamId: didStreamIdRef.current,
              sessionId: didSessionIdRef.current,
              text: chunks[i],
            }),
          });
          if (!speakRes.ok) throw new Error(`D-ID speak HTTP ${speakRes.status}`);
          if (i < chunks.length - 1) {
            const chunkDelay = Math.max(200, chunks[i].length * 55);
            await new Promise(r => setTimeout(r, chunkDelay));
          }
        }

        console.log("[D-ID] Speak sent", chunks.length, "chunks, total length:", text.length);

        const fallbackMs = Math.max(5000, text.length * 80);
        setTimeout(() => {
          if (speakEndedResolveRef.current) {
            console.log("[D-ID] Speak fallback timer fired");
            setIsTalking(false);
            setTimeout(() => setSubtitleText(""), 3000);
            speakEndedResolveRef.current();
            speakEndedResolveRef.current = null;
          }
        }, fallbackMs);
      } catch (err) {
        console.error("[D-ID] Speak failed:", err);
        setIsTalking(false);
        speakWithBrowser(text);
      }
      return;
    }

    const room = roomRef.current;
    if (!room || room.state !== "connected") {
      speakWithBrowser(text);
      return;
    }

    try {
      const encoder = new TextEncoder();

      const sentenceMatches = text.match(/[^.!?]+[.!?]+\s*/g) || [];
      const matched = sentenceMatches.join("");
      const remainder = text.slice(matched.length).trim();
      const sentences = [...sentenceMatches];
      if (remainder) sentences.push(remainder);

      const chunks: string[] = [];
      let current = "";
      for (const s of sentences) {
        if ((current + s).length > 180 && current) {
          chunks.push(current.trim());
          current = s;
        } else {
          current += s;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      if (chunks.length === 0) chunks.push(text);

      for (let i = 0; i < chunks.length; i++) {
        const payload = JSON.stringify({
          event_type: "avatar.speak_text",
          session_id: avatarSessionIdRef.current,
          text: chunks[i],
        });
        room.localParticipant.publishData(encoder.encode(payload), {
          reliable: true,
          topic: "agent-control",
        });
        if (i < chunks.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      setIsTalking(true);
      console.log("Avatar speak: sent", chunks.length, "chunks, total length:", text.length);
    } catch (err) {
      console.error("Failed to send speak command via LiveKit:", err);
      speakWithBrowser(text);
    }
  }, [speakWithBrowser]);

  const sendAvatarSpeakRef = useRef<(text: string) => Promise<void>>(async () => {});

  const clearIdleTimers = useCallback(() => {
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    if (idleWarningTimerRef.current) { clearTimeout(idleWarningTimerRef.current); idleWarningTimerRef.current = null; }
  }, []);

  const resetIdleTimer = useCallback(() => {
    clearIdleTimers();
    if (!sessionDataRef.current) return;

    idleWarningTimerRef.current = setTimeout(async () => {
      if (!sessionDataRef.current) return;
      const warningMsg = selectedLanguage === "ar"
        ? "يبدو أنك مشغول. هل لا تزال هناك؟ سأنهي المحادثة خلال دقيقة إذا لم أسمع منك."
        : "It seems like you may have stepped away. Are you still there? I'll end the session in about a minute if I don't hear back.";
      try {
        await sendAvatarSpeakRef.current(warningMsg);
      } catch {}
    }, IDLE_WARNING_MS);

    idleTimerRef.current = setTimeout(async () => {
      if (!sessionDataRef.current) return;
      const goodbyeMsg = selectedLanguage === "ar"
        ? "شكراً لتواصلك مع أمريكان أيرون. سأنهي الجلسة الآن. لا تتردد في العودة في أي وقت!"
        : "Thank you for reaching out to American Iron. I'm ending the session now due to inactivity. Feel free to come back anytime!";
      try {
        await sendAvatarSpeakRef.current(goodbyeMsg);
        await new Promise(r => setTimeout(r, 6000));
      } catch {}
      cleanupAvatarSession();
      setSessionData(null);
      sessionDataRef.current = null;
      toast({ title: selectedLanguage === "ar" ? "انتهت الجلسة بسبب عدم النشاط" : "Session ended due to inactivity" });
    }, IDLE_DISCONNECT_MS);
  }, [selectedLanguage, cleanupAvatarSession, clearIdleTimers, toast]);

  const loadSharedReport = async (token: string) => {
    try {
      const res = await fetch(`/api/shared/${token}`);
      if (!res.ok) {
        toast({ title: "Report not found", variant: "destructive" });
        return;
      }
      setSharedReport(await res.json());
    } catch {
      toast({ title: "Error loading report", variant: "destructive" });
    }
  };

  const connectAvatar = async (agentType: string = "admin", language: string = "en"): Promise<Room | null> => {
    const res = await apiRequest("POST", "/api/avatar/session", { agentType, language });
    const data = await res.json();

    if (data.provider === "did") {
      console.log("[D-ID] Setting up WebRTC connection");
      avatarProviderRef.current = "did";
      didAgentIdRef.current = data.agentId;
      didStreamIdRef.current = data.streamId;
      didSessionIdRef.current = data.sessionId;

      const pc = new RTCPeerConnection({
        iceServers: data.iceServers || [{ urls: "stun:stun.l.google.com:19302" }],
      });
      didPeerRef.current = pc;

      pc.ontrack = (event) => {
        console.log("[D-ID] Track received:", event.track.kind);
        const container = videoContainerRef.current;

        if (event.track.kind === "video" && container) {
          const existingVideos = container.querySelectorAll("video");
          existingVideos.forEach(v => v.remove());

          const videoEl = document.createElement("video");
          videoEl.srcObject = event.streams[0];
          videoEl.autoplay = true;
          videoEl.playsInline = true;
          videoEl.style.width = "100%";
          videoEl.style.height = "100%";
          videoEl.style.objectFit = "cover";
          videoEl.style.position = "absolute";
          videoEl.style.top = "0";
          videoEl.style.left = "0";
          videoEl.style.zIndex = "1";
          videoEl.setAttribute("data-testid", "video-avatar");
          container.appendChild(videoEl);
          console.log("[D-ID] Video element attached");
          setAvatarReady(true);
        }

        if (event.track.kind === "audio") {
          const audioEl = document.createElement("audio");
          audioEl.srcObject = event.streams[0];
          audioEl.autoplay = true;
          audioEl.style.display = "none";
          document.body.appendChild(audioEl);
          console.log("[D-ID] Audio element attached");
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
            await fetch("/api/avatar/session/ice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: data.agentId,
                streamId: data.streamId,
                sessionId: data.sessionId,
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
              }),
            });
          } catch (e) {
            console.warn("[D-ID] ICE candidate send failed:", e);
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[D-ID] ICE state:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          console.log("[D-ID] WebRTC connected successfully");
          setAvatarReady(true);
        } else if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          setAvatarReady(false);
        }
      };

      pc.ondatachannel = (event) => {
        const dc = event.channel;
        console.log("[D-ID] Data channel opened:", dc.label);
        dc.onmessage = (msgEvent) => {
          try {
            const msg = JSON.parse(msgEvent.data);
            const eventType = msg.type || msg.event || msg.state;
            console.log("[D-ID] Data channel:", eventType, JSON.stringify(msg).slice(0, 200));

            if (eventType === "speak_started" || eventType === "started" ||
                (msg.type === "chat/answer" && msg.state === "started")) {
              setIsTalking(true);
            } else if (eventType === "speak_ended" || eventType === "done" ||
                       (msg.type === "chat/answer" && msg.state === "done") ||
                       eventType === "stream/done") {
              setIsTalking(false);
              setTimeout(() => setSubtitleText(""), 3000);
              if (speakEndedResolveRef.current) {
                speakEndedResolveRef.current();
                speakEndedResolveRef.current = null;
              }
            }

            if (msg.type === "stream/ready" || eventType === "stream/ready") {
              console.log("[D-ID] Stream ready - avatar is live");
              setAvatarReady(true);
            }
          } catch {}
        };
      };

      await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: data.offer }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      const sdpRes = await fetch("/api/avatar/session/sdp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: data.agentId,
          streamId: data.streamId,
          sessionId: data.sessionId,
          answer: answer.sdp,
        }),
      });
      if (!sdpRes.ok) throw new Error(`D-ID SDP answer failed: ${sdpRes.status}`);

      console.log("[D-ID] SDP answer sent, waiting for connection...");
      return null;
    }

    avatarProviderRef.current = "heygen";
    avatarSessionTokenRef.current = data.sessionToken;
    avatarSessionIdRef.current = data.sessionId;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log("Track subscribed:", track.kind, "from:", participant.identity, "sid:", track.sid);

      if (track.kind === Track.Kind.Video) {
        const container = videoContainerRef.current;
        if (container) {
          const existingVideos = container.querySelectorAll("video");
          existingVideos.forEach(v => v.remove());

          const videoElement = track.attach();
          videoElement.style.width = "100%";
          videoElement.style.height = "100%";
          videoElement.style.objectFit = "cover";
          videoElement.style.position = "absolute";
          videoElement.style.top = "0";
          videoElement.style.left = "0";
          videoElement.style.zIndex = "1";
          videoElement.setAttribute("data-testid", "video-avatar");
          videoElement.setAttribute("autoplay", "true");
          videoElement.setAttribute("playsinline", "true");
          container.appendChild(videoElement);
          console.log("Video track attached to container");
        }
        setAvatarReady(true);
      }

      if (track.kind === Track.Kind.Audio) {
        const audioElement = track.attach();
        audioElement.style.display = "none";
        document.body.appendChild(audioElement);
        console.log("Audio track attached");
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      console.log("Track unsubscribed:", track.kind);
      track.detach().forEach((el) => el.remove());
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log("Participant connected:", participant.identity);
    });

    room.on(RoomEvent.Connected, () => {
      console.log("Room connected successfully");
    });

    room.on(RoomEvent.DataReceived, (rawData, participant, kind, topic) => {
      try {
        const decoded = new TextDecoder().decode(rawData);
        const message = JSON.parse(decoded);
        const eventType = message.event_type || message.type;
        console.log("LiveKit event:", eventType, "topic:", topic, JSON.stringify(message).slice(0, 200));

        if (eventType === "avatar.speak_started" || eventType === "avatar_start_talking") {
          setIsTalking(true);
        } else if (eventType === "avatar.speak_ended" || eventType === "avatar_stop_talking") {
          setIsTalking(false);
          setTimeout(() => setSubtitleText(""), 3000);

          if (speakEndedResolveRef.current) {
            speakEndedResolveRef.current();
            speakEndedResolveRef.current = null;
          }
        } else if (eventType === "avatar.transcription") {
          if (message.text) {
            setSubtitleText(message.text);
          }
        } else if (eventType === "user.transcription") {
          console.log("LiveAvatar user transcription (ignored, using local capture):", message.text);
        } else if (eventType === "session.stopped") {
          setAvatarReady(false);
        }
      } catch (e) {
        console.warn("Failed to parse LiveKit data message:", e);
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      setAvatarReady(false);
    });

    await room.connect(data.livekitUrl, data.livekitClientToken);
    roomRef.current = room;
    console.log("[Avatar] Connected via HeyGen LiveKit");

    return room;
  };

  const startSession = async () => {
    if (!consentGiven) {
      toast({ title: "Consent required", description: "Please accept the consent to begin.", variant: "destructive" });
      return;
    }

    setIsConnecting(true);
    try {
      const res = await apiRequest("POST", "/api/sessions", {
        consentGiven: true,
        provider: "heygen",
        language: selectedLanguage,
      });
      const session = await res.json();
      setAccessToken(session.accessToken);
      sessionStorage.setItem(`session_token_${session.id}`, session.accessToken);
      setSessionData(session);
      sessionDataRef.current = session;
      setCurrentAgent("admin");

      const introText = selectedLanguage === "ar"
        ? "مرحباً! أنا سارة، مديرة الاستقبال في أمريكان أيرون. أهلاً وسهلاً بك! " +
          "أنا هنا لمساعدتك. أخبرني عن المشكلة التي تواجهها مع معداتك وسأوصلك بالميكانيكي المتخصص المناسب. " +
          "ما الذي يمكنني مساعدتك فيه اليوم؟"
        : "Hi there! I'm Sarah, the front desk admin here at American Iron. Welcome! " +
          "I'm here to help get you started. Just tell me a bit about the issue you're having with your equipment, " +
          "and I'll connect you with the right specialist mechanic. What can I help you with today?";

      let avatarConnected = false;
      try {
        const room = await connectAvatar("admin", selectedLanguage);
        avatarConnected = true;

        setTimeout(async () => {
          setIntroPlaying(true);
          introPlayingRef.current = true;

          setSubtitleText(introText);
          await sendAvatarSpeakCommand(introText);
          const introEstimate = Math.max(5000, introText.length * 80);
          await waitForSpeakEnd(Math.min(introEstimate, 60000));

          if (introPlayingRef.current) {
            setIntroPlaying(false);
            introPlayingRef.current = false;
            setShowTextInput(true);
          }
          conversationRef.current.push({ role: "assistant", content: introText });

          startVoiceCapture();
          resetIdleTimer();
          console.log("Voice capture started after intro");

          await fetch(`/api/sessions/${session.id}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: "[Session started - Admin greeting and intro]" }),
          }).catch(() => {});
        }, 3000);
      } catch (avatarErr: any) {
        console.error("Avatar connection failed, using text mode:", avatarErr);
        toast({ title: "Video avatar unavailable", description: "Continuing in text mode with voice.", variant: "default" });

        setIntroPlaying(true);
        introPlayingRef.current = true;
        setSubtitleText(introText);
        speakWithBrowser(introText);
        await waitForSpeakEnd(90000);

        if (introPlayingRef.current) {
          setIntroPlaying(false);
          introPlayingRef.current = false;
          setShowTextInput(true);
        }
        conversationRef.current.push({ role: "assistant", content: introText });
        startVoiceCapture();
        resetIdleTimer();

        await fetch(`/api/sessions/${session.id}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "[Session started - Admin greeting (text mode)]" }),
        }).catch(() => {});
      }
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message || "Could not start session.", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const lastCueTimeRef = useRef<number>(0);

  const sendAvatarListeningCue = useCallback(() => {
    const provider = avatarProviderRef.current;
    const room = roomRef.current;
    const hasDID = provider === "did" && didAgentIdRef.current && didStreamIdRef.current && didSessionIdRef.current;
    const hasHeygen = room && room.state === "connected";
    if (!hasDID && !hasHeygen) return;
    const now = Date.now();
    if (now - lastCueTimeRef.current < 8000) return;
    lastCueTimeRef.current = now;
    const cues = selectedLanguage === "ar"
      ? ["حسناً", "فهمت", "تمام", "أفهم"]
      : ["Mm-hmm", "I see", "Got it", "Okay"];
    const cue = cues[Math.floor(Math.random() * cues.length)];
    try {
      if (hasDID) {
        fetch("/api/avatar/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "did",
            agentId: didAgentIdRef.current,
            streamId: didStreamIdRef.current,
            sessionId: didSessionIdRef.current,
            text: cue,
          }),
        }).catch(() => {});
      } else if (hasHeygen) {
        const encoder = new TextEncoder();
        const payload = JSON.stringify({
          event_type: "avatar.speak_text",
          session_id: avatarSessionIdRef.current,
          text: cue,
        });
        room!.localParticipant.publishData(encoder.encode(payload), {
          reliable: true,
          topic: "agent-control",
        });
      }
    } catch {}
  }, [selectedLanguage]);

  const handleUserMessage = async (userMsg: string) => {
    const currentSession = sessionDataRef.current;
    console.log("handleUserMessage called:", userMsg, "session:", !!currentSession, "processing:", isProcessingRef.current);
    if (!currentSession || isProcessingRef.current || !userMsg.trim()) return;

    resetIdleTimer();
    stopVoiceCapture();
    setIsProcessing(true);
    isProcessingRef.current = true;
    setIsListening(false);
    conversationRef.current.push({ role: "user", content: userMsg });

    sendAvatarListeningCue();

    try {
      const response = await fetch(`/api/sessions/${currentSession.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg }),
      });

      if (!response.ok) {
        toast({ title: "Error", description: "Failed to get response", variant: "destructive" });
        setIsProcessing(false);
        isProcessingRef.current = false;
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { setIsProcessing(false); isProcessingRef.current = false; return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      let handoffData: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              fullText += event.content;
            } else if (event.type === "handoff") {
              handoffData = event;
            } else if (event.type === "verify_request") {
              setVerifyTarget(event.target);
              setVerifyType(event.targetType);
              setShowVerifyModal(true);
            } else if (event.type === "verify_result") {
              if (event.verified) {
                setVerificationStatus("verified");
                toast({ title: selectedLanguage === "ar" ? "تم التحقق بنجاح!" : "Verified successfully!" });
              } else {
                setVerificationStatus("failed");
                toast({ title: selectedLanguage === "ar" ? "رمز التحقق غير صحيح" : "Invalid verification code", variant: "destructive" });
              }
            }
          } catch {}
        }
      }

      if (fullText) {
        const cleanedText = fullText
          .replace(/<INTAKE_JSON>[\s\S]*?<\/INTAKE_JSON>/g, "")
          .replace(/<VERIFY_REQUEST>[\s\S]*?<\/VERIFY_REQUEST>/g, "")
          .replace(/<VERIFY_CODE>[\s\S]*?<\/VERIFY_CODE>/g, "")
          .trim();
        setSubtitleText(cleanedText);
        conversationRef.current.push({ role: "assistant", content: cleanedText });
        if (cleanedText) await sendAvatarSpeakCommand(cleanedText);

        const estimatedMs = Math.max(3000, cleanedText.length * 80);
        await waitForSpeakEnd(Math.min(estimatedMs, 45000));

        if (handoffData) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (handoffData) {
        await performHandoff(handoffData);
      } else {
        startVoiceCapture();
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  handleUserMessageRef.current = handleUserMessage;
  sendAvatarSpeakRef.current = sendAvatarSpeakCommand;

  const performHandoff = async (handoffData: any) => {
    if (!sessionDataRef.current) return;
    setHandoffInProgress(true);

    const mechType = handoffData.mechanicType || "heavy_equipment";
    setMechanicType(mechType);
    const mechanicInfo = MECHANIC_INFO[selectedLanguage] || MECHANIC_INFO.en;
    const mechanic = mechanicInfo[mechType];

    const transferMsg = selectedLanguage === "ar"
      ? `سأقوم الآن بتحويلك إلى ${mechanic?.name || "المتخصص لدينا"}، ${mechanic?.title || "أخصائي التشخيص"}. سيعتنون بك جيداً. لحظة من فضلك.`
      : `I'm now transferring you to ${mechanic?.name || "our specialist"}, our ${mechanic?.title || "diagnostic specialist"}. They'll take great care of you. One moment please.`;
    setSubtitleText(transferMsg);
    await sendAvatarSpeakCommand(transferMsg);

    await waitForSpeakEnd(15000);
    await new Promise(r => setTimeout(r, 1500));

    try {
      cleanupAvatarSession();
      setAvatarReady(false);

      await apiRequest("POST", `/api/sessions/${sessionDataRef.current!.id}/handoff`);
      setCurrentAgent("mechanic");

      const room = await connectAvatar(mechType, selectedLanguage);

      setTimeout(async () => {
        const mechGreeting = selectedLanguage === "ar"
          ? `مرحباً! أنا ${mechanic?.name || "المتخصص"}. لقد راجعت معلومات القبول الخاصة بك وأنا مستعد لمساعدتك في تشخيص المشكلة. لنبدأ — هل يمكنك إخباري المزيد عما تواجهه؟`
          : `Hello! I'm ${mechanic?.name || "your specialist"}. I've reviewed your intake information and I'm ready to help diagnose the issue. Let's get started — can you tell me more about what you're experiencing?`;
        setSubtitleText(mechGreeting);
        conversationRef.current.push({ role: "assistant", content: mechGreeting });
        await sendAvatarSpeakCommand(mechGreeting);
        setHandoffInProgress(false);

        const mechEstimate = Math.max(5000, mechGreeting.length * 80);
        await waitForSpeakEnd(Math.min(mechEstimate, 30000));
        startVoiceCapture();
        resetIdleTimer();
        console.log("Voice capture started after mechanic greeting");
      }, 3000);
    } catch (err) {
      console.error("Handoff error:", err);
      setHandoffInProgress(false);
      toast({ title: "Transfer failed", variant: "destructive" });
    }
  };

  const sendTextMessage = async () => {
    if (!inputText.trim() || isProcessing) return;
    const msg = inputText.trim();
    setInputText("");
    await handleUserMessage(msg);
  };

  const toggleMicrophone = async () => {
    try {
      if (isListening || isRecordingRef.current) {
        stopVoiceCapture();
      } else {
        await startVoiceCapture();
      }
    } catch (err) {
      console.error("Mic toggle error:", err);
      toast({ title: "Microphone error", description: "Could not access microphone.", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sessionDataRef.current || !e.target.files) return;
    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => formData.append("files", file));

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["x-session-token"] = accessToken;
      const res = await fetch(`/api/sessions/${sessionDataRef.current.id}/upload`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (res.ok) {
        toast({ title: "Files uploaded", description: "Attached to your session." });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", variant: "destructive" });
    }
    e.target.value = "";
  };

  const generateReport = async () => {
    if (!sessionData) return;
    setIsGeneratingReport(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["x-session-token"] = accessToken;
      const res = await fetch(`/api/sessions/${sessionData.id}/report`, {
        method: "POST",
        headers,
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        if (res.status === 402) {
          toast({ title: selectedLanguage === "ar" ? "الدفع مطلوب للتقرير الاحترافي" : "Payment required for Pro report", variant: "destructive" });
        } else {
          toast({ title: selectedLanguage === "ar" ? "خطأ في إنشاء التقرير" : `Report error: ${errorData.error || "Please try again"}`, variant: "destructive" });
        }
        return;
      }
      const data = await res.json();
      setReport(data);
      setShowReport(true);
      toast({ title: selectedLanguage === "ar" ? "تم إنشاء التقرير بنجاح" : "Report generated successfully" });
    } catch (err: any) {
      console.error("Report generation error:", err);
      toast({ title: selectedLanguage === "ar" ? "خطأ في إنشاء التقرير" : "Error generating report. Please try again.", variant: "destructive" });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const copyShareLink = async () => {
    if (!report?.shareToken) return;
    const url = `${window.location.origin}/?shared=${report.shareToken}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  const currentMechanicInfo = MECHANIC_INFO[selectedLanguage] || MECHANIC_INFO.en;
  const currentMechanic = mechanicType ? currentMechanicInfo[mechanicType] : null;

  if (sharedReport) {
    const sr = sharedReport.report;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <title>Shared Report | AMERICAN IRON</title>
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">AMERICAN IRON</h1>
              <p className="text-xs text-muted-foreground">Diagnostic Report</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setSharedReport(null)} data-testid="button-back-home">
            Start New Session
          </Button>
        </header>
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <div className="space-y-4">
            <Badge variant={sr.reportType === "pro" ? "default" : "secondary"}>
              {sr.reportType === "pro" ? "Pro Diagnostic" : "Quick Advice"}
            </Badge>
            {sr.content && typeof sr.content === "object" && (
              <ReportContent content={sr.content} />
            )}
            {sr.svgDiagram && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Technical Diagram</h4>
                <div className="bg-card rounded-md border border-card-border p-2 overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: sr.svgDiagram }} />
              </div>
            )}
          </div>
        </div>
        <footer className="border-t border-border/50 p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
          <Shield className="w-3 h-3" />
          AI guidance is informational only. Not a substitute for certified inspection.
        </footer>
      </div>
    );
  }

  if (!sessionData) {
    const services = [
      { icon: Wrench, title: "HEAVY EQUIPMENT", desc: "Excavators, bulldozers, loaders, and earthmoving machinery diagnostics", image: serviceHeavyEquipPath },
      { icon: Zap, title: "POWER GENERATION", desc: "Generators, turbines, and power distribution system analysis", image: servicePowerGenPath },
      { icon: Anchor, title: "MARINE ENGINES", desc: "Marine diesel, propulsion systems, and marine electrical diagnostics", image: serviceMarinePath },
      { icon: Droplets, title: "HYDRAULIC SYSTEMS", desc: "Pumps, cylinders, valves, and complete hydraulic circuit analysis", image: serviceHydraulicsPath },
      { icon: Cpu, title: "ELECTRICAL CONTROLS", desc: "PLCs, wiring, sensors, and control system troubleshooting", image: serviceElectricalPath },
      { icon: Package, title: "PARTS ASSISTANCE", desc: "Part identification, cross-referencing, and compatibility verification", image: servicePartsPath },
    ];

    const serviceDetails = [
      {
        icon: Wrench, title: "HEAVY EQUIPMENT", image: serviceHeavyEquipPath,
        desc: "Complete diagnostics and repair guidance for all types of heavy machinery and earthmoving equipment.",
        items: [
          "Excavator hydraulic system diagnostics & troubleshooting",
          "Bulldozer undercarriage inspection & track tension analysis",
          "Wheel loader transmission & drivetrain fault diagnosis",
          "Backhoe swing motor & boom cylinder repair guidance",
          "Grader blade control system calibration & adjustment",
          "Skid steer hydraulic flow testing & valve diagnosis",
          "Crane boom inspection & load capacity verification",
          "Compactor vibration system analysis & bearing inspection",
          "Engine overheating & cooling system diagnostics",
          "Fuel injection system testing & injector diagnosis",
          "Turbocharger boost pressure analysis & wastegate check",
          "Exhaust aftertreatment (DPF/SCR) regeneration troubleshooting",
        ]
      },
      {
        icon: Zap, title: "POWER GENERATION", image: servicePowerGenPath,
        desc: "Expert diagnostics for generators, turbines, and complete power distribution systems.",
        items: [
          "Diesel generator starting & cranking system diagnosis",
          "Alternator voltage regulation & AVR troubleshooting",
          "Transfer switch operation testing & ATS diagnostics",
          "Paralleling generator synchronization & load sharing",
          "Coolant system inspection & radiator flow analysis",
          "Fuel system priming, filtering & injector testing",
          "Governor speed control calibration & hunting fix",
          "Battery charger & starting battery load testing",
          "Exhaust manifold & turbo inspection for gen-sets",
          "Control panel fault code reading & ECU diagnostics",
          "Load bank testing & performance verification",
          "Preventive maintenance scheduling & oil analysis",
        ]
      },
      {
        icon: Anchor, title: "MARINE ENGINES", image: serviceMarinePath,
        desc: "Specialized marine diesel and propulsion system diagnostics for vessels of all sizes.",
        items: [
          "Marine diesel engine overhaul & top-end rebuild guidance",
          "Raw water cooling system & heat exchanger inspection",
          "Marine transmission & reduction gear diagnosis",
          "Propeller shaft alignment & stern tube seal check",
          "Marine fuel system water separation & filter service",
          "Exhaust elbow & wet exhaust system corrosion inspection",
          "Marine starter motor & charging system diagnostics",
          "Zincs & cathodic protection system assessment",
          "Bilge pump system testing & float switch diagnosis",
          "Marine electrical panel & shore power connection check",
          "Engine mount inspection & vibration isolation analysis",
          "Winterization procedures & long-term storage prep",
        ]
      },
      {
        icon: Droplets, title: "HYDRAULIC SYSTEMS", image: serviceHydraulicsPath,
        desc: "Full hydraulic circuit analysis including pumps, cylinders, valves, and fluid power systems.",
        items: [
          "Hydraulic pump flow testing & pressure diagnostics",
          "Cylinder seal replacement & rod inspection guidance",
          "Directional control valve spool & solenoid testing",
          "Hydraulic hose routing, sizing & pressure rating",
          "Relief valve pressure setting & adjustment",
          "Hydraulic oil contamination analysis & flushing",
          "Accumulator pre-charge pressure verification",
          "Proportional valve calibration & current testing",
          "Hydraulic motor case drain flow measurement",
          "Pilot pressure system diagnosis & orifice check",
          "Cooler & heat exchanger efficiency testing",
          "Complete hydraulic schematic reading & circuit tracing",
        ]
      },
      {
        icon: Cpu, title: "ELECTRICAL CONTROLS", image: serviceElectricalPath,
        desc: "PLC programming, sensor calibration, wiring diagnostics, and control system troubleshooting.",
        items: [
          "PLC fault code reading & ladder logic troubleshooting",
          "Sensor calibration — pressure, temperature, position",
          "Wiring harness continuity testing & connector diagnosis",
          "CAN bus communication diagnostics & network analysis",
          "Relay & contactor testing, coil resistance measurement",
          "Variable frequency drive (VFD) parameter setup & faults",
          "Motor starter overload setting & thermal protection",
          "Grounding & bonding inspection for safety compliance",
          "Instrument panel gauge calibration & sender testing",
          "Telematics & GPS module setup and diagnostics",
          "Battery isolator & disconnect switch inspection",
          "24V/12V system voltage drop testing & parasitic draw",
        ]
      },
      {
        icon: Package, title: "PARTS ASSISTANCE", image: servicePartsPath,
        desc: "Expert parts identification and cross-referencing for all heavy equipment manufacturers using part numbers or machine serial numbers.",
        items: [
          "OEM part identification from part numbers — all manufacturers",
          "Machine serial number lookup & configuration breakdown",
          "Cross-reference OEM to aftermarket part numbers",
          "Parts compatibility verification across models & years",
          "Superseded & discontinued part number tracking",
          "Filter, belt & fluid specification lookup by machine serial",
          "Undercarriage component identification & measurement specs",
          "Engine rebuild kit & gasket set part matching",
          "Hydraulic seal kit & O-ring specification lookup",
          "Service kit & maintenance parts group identification",
          "Parts group breakdown by machine system (engine, hydraulic, electrical)",
          "Safety-critical parts identification & OEM recommendations",
        ]
      },
    ];

    const features = [
      { icon: User, text: "Face-to-face AI-powered video consultations" },
      { icon: HardHat, text: "Decades of combined specialist experience" },
      { icon: FileText, text: "Detailed diagnostic reports for your service team" },
      { icon: Shield, text: "Encrypted and secure — your data stays private" },
    ];

    if (activeView === "services") {
      return (
        <div className="min-h-screen bg-[#111111] text-white overflow-x-hidden" data-testid="services-page">
          <title>AMERICAN IRON | Our Services</title>
          <nav className="fixed top-0 left-0 right-0 z-50 bg-[#111111]/90 backdrop-blur-md border-b border-[#FFCD11]/10" data-testid="nav-bar-services">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
              <button onClick={() => setActiveView("home")} className="flex items-center gap-3 hover:opacity-80 transition-opacity" data-testid="button-back-home-services">
                <ChevronRight className="w-4 h-4 text-gray-400 rotate-180" />
                <img src={logoPath} alt="AMERICAN IRON" className="h-10 w-auto" />
              </button>
              <div className="flex items-center gap-3">
                <a href="/portal" className="text-sm text-gray-400 hover:text-[#FFCD11] transition-colors font-medium" data-testid="link-portal-services">Customer Portal</a>
                <Button
                  size="sm"
                  className="bg-[#FFCD11] text-black font-bold hover:bg-[#e6b800]"
                  onClick={() => { setActiveView("home"); setTimeout(() => document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" }), 100); }}
                  data-testid="button-services-nav-admin"
                >
                  <MessageCircle className="w-4 h-4 mr-1" />
                  SPEAK WITH ADMIN
                </Button>
              </div>
            </div>
          </nav>

          <div className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <p className="text-[#FFCD11] text-sm font-bold tracking-[0.2em] uppercase mb-3">COMPLETE SERVICE CATALOG</p>
              <h1 className="text-3xl sm:text-4xl font-black text-white mb-4" data-testid="text-services-title">
                EVERY REPAIR. EVERY SYSTEM.<br />
                <span className="text-[#FFCD11]">WE COVER IT ALL.</span>
              </h1>
              <p className="text-gray-400 max-w-2xl mx-auto">
                Our five expert divisions cover virtually every repair and diagnostic need for heavy industrial equipment. Click any section to see the full breakdown.
              </p>
            </div>

            <div className="space-y-4">
              {serviceDetails.map((svc, i) => (
                <div
                  key={i}
                  className={`rounded-xl border transition-all duration-300 overflow-hidden ${expandedService === i ? "border-[#FFCD11]/40 bg-[#1a1a1a]" : "border-white/10 bg-[#161616] hover:border-[#FFCD11]/20"}`}
                  data-testid={`service-detail-${i}`}
                >
                  <button
                    className="w-full flex items-center gap-4 p-5 text-left"
                    onClick={() => setExpandedService(expandedService === i ? null : i)}
                    data-testid={`button-expand-service-${i}`}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                      <img src={svc.image} alt={svc.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="w-10 h-10 rounded-md bg-[#FFCD11]/10 flex items-center justify-center flex-shrink-0">
                      <svc.icon className="w-5 h-5 text-[#FFCD11]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-black text-white">{svc.title}</h3>
                      <p className="text-gray-400 text-sm truncate">{svc.desc}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {expandedService === i ? (
                        <ChevronUp className="w-5 h-5 text-[#FFCD11]" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </button>

                  {expandedService === i && (
                    <div className="px-5 pb-5 border-t border-white/5">
                      <p className="text-gray-300 text-sm mb-4 pt-4">{svc.desc}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {svc.items.map((item, j) => (
                          <div key={j} className="flex items-start gap-2 text-sm" data-testid={`service-item-${i}-${j}`}>
                            <CheckCircle2 className="w-4 h-4 text-[#FFCD11] flex-shrink-0 mt-0.5" />
                            <span className="text-gray-300">{item}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6">
                        <Button
                          className="bg-[#FFCD11] text-black font-bold hover:bg-[#e6b800]"
                          onClick={() => { setActiveView("home"); setTimeout(() => document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" }), 100); }}
                          data-testid={`button-speak-admin-${i}`}
                        >
                          <Search className="w-4 h-4 mr-2" />
                          EXPLORE NOW
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <p className="text-gray-500 text-sm mb-4">Don't see your specific issue? Our admin will route you to the right specialist.</p>
              <Button
                size="lg"
                className="h-14 px-10 text-lg font-black bg-[#FFCD11] text-black hover:bg-[#e6b800] rounded-lg shadow-lg shadow-[#FFCD11]/20"
                onClick={() => { setActiveView("home"); setTimeout(() => document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" }), 100); }}
                data-testid="button-services-speak-admin"
              >
                <MessageCircle className="w-5 h-5 mr-2" />
                SPEAK WITH ADMIN
              </Button>
            </div>
          </div>

          <footer className="relative border-t border-white/5 bg-[#0d0d0d] py-10">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <img src={logoPath} alt="AMERICAN IRON" className="h-10 w-auto" />
                  <div className="text-xs text-gray-500">
                    <p>AI-Powered Heavy Equipment Diagnostics</p>
                    <p className="mt-0.5">americanironus.com</p>
                  </div>
                </div>
                <div className="text-xs text-gray-600">
                  &copy; {new Date().getFullYear()} AMERICAN IRON. All rights reserved.
                </div>
              </div>
            </div>
          </footer>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#111111] text-white overflow-x-hidden" data-testid="landing-page">
        <title>AMERICAN IRON | Live AI Engineer Desk</title>
        <meta name="description" content="Walk into AMERICAN IRON — AI-powered heavy equipment diagnostics with live video specialists." />
        <meta property="og:title" content="AMERICAN IRON | Live AI Engineer Desk" />
        <meta property="og:description" content="Real-time AI-powered heavy equipment diagnostics with live video avatars." />

        {showAboutVideo && (
          <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" data-testid="about-video-modal">
            <div className="relative w-full max-w-4xl">
              <div className="absolute -top-12 right-0 flex items-center gap-4">
                <button
                  onClick={() => { if (aboutNarrating) stopAboutNarration(); else startAboutNarration(); }}
                  className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
                  data-testid="button-toggle-narration"
                >
                  <Volume2 className={`w-4 h-4 ${aboutNarrating ? "text-[#FFCD11]" : ""}`} />
                  {aboutNarrating ? "Mute" : "Listen"}
                </button>
                <button
                  onClick={() => { setShowAboutVideo(false); stopAboutNarration(); if (aboutVideoRef.current) aboutVideoRef.current.pause(); }}
                  className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5 text-sm"
                  data-testid="button-close-about-video"
                >
                  Close <X className="w-5 h-5" />
                </button>
              </div>
              <div className="rounded-xl overflow-hidden border border-[#FFCD11]/20 shadow-2xl shadow-[#FFCD11]/10 relative">
                <video
                  ref={aboutVideoRef}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-auto"
                  src={aboutShopVideoPath}
                  data-testid="video-about-shop"
                  onPlay={() => { setTimeout(() => startAboutNarration(), 500); }}
                />
                {aboutNarrating && (
                  <div className="absolute bottom-4 left-4 right-4 flex items-center gap-2 bg-black/60 rounded-lg px-3 py-2">
                    <Volume2 className="w-4 h-4 text-[#FFCD11] flex-shrink-0 animate-pulse" />
                    <span className="text-white/80 text-xs">Narrating...</span>
                  </div>
                )}
              </div>
              <div className="mt-6 text-center space-y-3">
                <h3 className="text-xl font-black text-white">ABOUT AMERICAN IRON</h3>
                <p className="text-gray-300 text-sm max-w-2xl mx-auto leading-relaxed">
                  AMERICAN IRON is a full-service AI-powered diagnostic facility specializing in heavy equipment, power generation, marine engines, hydraulic systems, and electrical controls. Our virtual shop floor brings decades of real-world mechanical expertise directly to you through face-to-face AI video consultations — no appointment needed.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <Button
                    className="bg-[#FFCD11] text-black font-bold hover:bg-[#e6b800]"
                    onClick={() => { setShowAboutVideo(false); stopAboutNarration(); setTimeout(() => document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" }), 100); }}
                    data-testid="button-about-speak-admin"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    SPEAK WITH ADMIN
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                    onClick={() => { setShowAboutVideo(false); stopAboutNarration(); setActiveView("services"); }}
                    data-testid="button-about-explore"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    EXPLORE SERVICES
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#111111]/90 backdrop-blur-md border-b border-[#FFCD11]/10" data-testid="nav-bar">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logoPath} alt="AMERICAN IRON" className="h-12 w-auto" data-testid="img-logo-nav" />
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
              <button onClick={() => setShowAboutVideo(true)} className="hover:text-[#FFCD11] transition-colors" data-testid="link-about">About the Shop</button>
              <button onClick={() => setActiveView("services")} className="hover:text-[#FFCD11] transition-colors" data-testid="link-services">Services</button>
              <a href="#why" className="hover:text-[#FFCD11] transition-colors" data-testid="link-why">Why AMERICAN IRON</a>
              <a href="/portal" className="hover:text-[#FFCD11] transition-colors font-medium" data-testid="link-portal">Customer Portal</a>
              <Button
                size="sm"
                className="bg-[#FFCD11] text-black hover:bg-[#e6b800] font-bold"
                onClick={() => document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-nav-speak-admin"
              >
                SPEAK WITH ADMIN
              </Button>
            </div>
          </div>
        </nav>

        <section className="relative min-h-screen flex items-center justify-center pt-16" data-testid="hero-section">
          <div className="absolute inset-0 overflow-hidden">
            <video
              ref={heroVideoRef}
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
              className="w-full h-full object-cover opacity-60"
              data-testid="video-hero-bg"
              poster={heroFacilityPath}
              src={workshopVideoPath}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#111111]/80 via-[#111111]/30 to-[#111111]/80" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#111111]/60 via-transparent to-[#111111]/60" />
          </div>

          <div className="absolute top-0 left-0 right-0 h-1 bg-[#FFCD11]" />

          <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-8">
            <img
              src={logoPath}
              alt="AMERICAN IRON"
              className="h-40 sm:h-56 w-auto mx-auto drop-shadow-2xl"
              data-testid="img-logo-hero"
            />

            <div className="space-y-4">
              <p className="text-[#FFCD11] text-sm sm:text-base font-bold tracking-[0.3em] uppercase" data-testid="text-tagline">
                LIVE AI ENGINEER DESK
              </p>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white leading-tight" data-testid="text-brand-name">
                YOUR EQUIPMENT.<br />OUR EXPERTISE.<br />
                <span className="text-[#FFCD11]">REAL-TIME DIAGNOSTICS.</span>
              </h1>
              <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed" data-testid="text-page-title">
                Walk into our virtual repair facility and speak face-to-face with AI-powered specialist mechanics.
                Get expert diagnostics for heavy equipment, power generation, marine, hydraulic, and electrical systems.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto">
              <Button
                size="lg"
                className="h-14 text-xs sm:text-sm font-black bg-[#FFCD11] text-black hover:bg-[#e6b800] rounded-lg shadow-lg shadow-[#FFCD11]/20"
                onClick={() => setShowAboutVideo(true)}
                data-testid="button-hero-about"
              >
                <Play className="w-4 h-4 mr-1.5" />
                ABOUT THE SHOP
              </Button>
              <Button
                size="lg"
                className="h-14 text-xs sm:text-sm font-black bg-[#FFCD11] text-black hover:bg-[#e6b800] rounded-lg shadow-lg shadow-[#FFCD11]/20"
                onClick={() => document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-hero-speak-admin"
              >
                <MessageCircle className="w-4 h-4 mr-1.5" />
                SPEAK WITH ADMIN
              </Button>
              <Button
                size="lg"
                className="h-14 text-xs sm:text-sm font-black bg-[#FFCD11] text-black hover:bg-[#e6b800] rounded-lg shadow-lg shadow-[#FFCD11]/20"
                onClick={() => setActiveView("services")}
                data-testid="button-hero-explore"
              >
                <Search className="w-4 h-4 mr-1.5" />
                EXPLORE SERVICES
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-xs sm:text-sm font-black border-[#FFCD11]/40 text-[#FFCD11] hover:bg-[#FFCD11]/10 rounded-lg"
                onClick={() => document.getElementById("walk-in-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-hero-walkin"
              >
                <ArrowRight className="w-4 h-4 mr-1.5" />
                WALK IN NOW
              </Button>
            </div>

            <div className="flex items-center justify-center gap-6 pt-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FFCD11]" />
                <span>No Appointment Needed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FFCD11]" />
                <span>Instant AI Diagnosis</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#FFCD11]" />
                <span>Expert Report Included</span>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#111111] to-transparent" />
        </section>

        <section id="services" className="relative py-20 bg-[#111111]" data-testid="services-section">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <p className="text-[#FFCD11] text-sm font-bold tracking-[0.2em] uppercase mb-3">OUR SPECIALTIES</p>
              <h2 className="text-3xl sm:text-4xl font-black text-white" data-testid="text-services-heading">
                SIX EXPERT DIVISIONS.<br />ONE POWERFUL FACILITY.
              </h2>
              <p className="text-gray-400 mt-4 max-w-xl mx-auto">
                Each specialist brings decades of real-world experience to diagnose your equipment issues in real time.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((svc, i) => (
                <div
                  key={i}
                  className="group relative rounded-xl overflow-hidden border border-white/5 bg-[#1a1a1a] hover:border-[#FFCD11]/30 transition-all duration-300 cursor-pointer"
                  onClick={() => { setExpandedService(i); setActiveView("services"); }}
                  data-testid={`card-service-${i}`}
                >
                  <div className="h-44 overflow-hidden">
                    <img
                      src={svc.image}
                      alt={svc.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-70 group-hover:opacity-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/50 to-transparent" />
                  </div>
                  <div className="relative p-5 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-md bg-[#FFCD11]/10 flex items-center justify-center">
                        <svc.icon className="w-4 h-4 text-[#FFCD11]" />
                      </div>
                      <h3 className="text-sm font-black text-white tracking-wide">{svc.title}</h3>
                    </div>
                    <p className="text-gray-400 text-sm leading-relaxed">{svc.desc}</p>
                    <div className="flex items-center gap-1 text-[#FFCD11] text-xs font-bold pt-1">
                      <span>View Details</span>
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              ))}

              <button
                className="relative rounded-xl overflow-hidden border border-[#FFCD11]/20 bg-gradient-to-br from-[#FFCD11]/10 to-[#1a1a1a] flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:border-[#FFCD11]/40 transition-all duration-300"
                onClick={() => document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="card-service-speak-admin"
              >
                <div className="w-14 h-14 rounded-full bg-[#FFCD11]/20 flex items-center justify-center mb-4">
                  <MessageCircle className="w-7 h-7 text-[#FFCD11]" />
                </div>
                <h3 className="text-lg font-black text-[#FFCD11] mb-2">SPEAK WITH ADMIN</h3>
                <p className="text-gray-400 text-sm">Our front desk admin will connect you with the right specialist</p>
              </button>
            </div>
          </div>
        </section>

        <section className="relative py-20 overflow-hidden" data-testid="how-it-works-section">
          <div className="absolute inset-0 bg-gradient-to-b from-[#111111] via-[#1a1a1a] to-[#111111]" />
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-96 h-96 bg-[#FFCD11]/3 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-16">
              <p className="text-[#FFCD11] text-sm font-bold tracking-[0.2em] uppercase mb-3">HOW IT WORKS</p>
              <h2 className="text-3xl sm:text-4xl font-black text-white" data-testid="text-how-heading">
                THREE STEPS TO A DIAGNOSIS
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { step: "01", title: "SPEAK WITH ADMIN", desc: "Click the button and you're instantly connected to our friendly AI front desk admin — she'll welcome you and guide you through the process." },
                { step: "02", title: "DESCRIBE THE ISSUE", desc: "Tell our admin about your equipment and the problem you're experiencing. She'll route you to the right specialist." },
                { step: "03", title: "GET YOUR DIAGNOSIS", desc: "Your specialist walks you through a real-time diagnosis and delivers a detailed report for your service team." },
              ].map((item, i) => (
                <div key={i} className="text-center space-y-4" data-testid={`step-${i}`}>
                  <div className="text-5xl font-black text-[#FFCD11]/20">{item.step}</div>
                  <h3 className="text-lg font-black text-white">{item.title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="why" className="relative py-20 bg-[#111111]" data-testid="why-section">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div>
                  <p className="text-[#FFCD11] text-sm font-bold tracking-[0.2em] uppercase mb-3">WHY AMERICAN IRON</p>
                  <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight" data-testid="text-why-heading">
                    BUILT FOR THE PEOPLE WHO BUILD THE WORLD
                  </h2>
                </div>

                <div className="space-y-5">
                  {features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-4" data-testid={`feature-${i}`}>
                      <div className="w-10 h-10 rounded-lg bg-[#FFCD11]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <feat.icon className="w-5 h-5 text-[#FFCD11]" />
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed pt-2">{feat.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative">
                <div className="rounded-xl overflow-hidden border border-white/10">
                  <img src={heroFacilityPath} alt="AMERICAN IRON Facility" className="w-full h-auto" />
                </div>
                <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-[#FFCD11]/10 rounded-full blur-2xl" />
              </div>
            </div>
          </div>
        </section>

        <section id="speak-admin-section" className="relative py-24 overflow-hidden" data-testid="speak-admin-section">
          <div className="absolute inset-0 bg-gradient-to-b from-[#111111] via-[#0d0d0d] to-[#111111]" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjA1LDE3LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZ3JpZCkiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-50" />

          <div className="relative z-10 max-w-lg mx-auto px-4 sm:px-6 text-center space-y-8">
            <div className="w-20 h-20 rounded-full bg-[#FFCD11]/10 border-2 border-[#FFCD11]/30 flex items-center justify-center mx-auto">
              <User className="w-10 h-10 text-[#FFCD11]" />
            </div>

            <div className="space-y-3">
              <h2 className="text-2xl sm:text-3xl font-black text-white" data-testid="text-speak-admin-heading">
                SPEAK WITH OUR ADMIN
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
                Meet our friendly front desk admin — she'll welcome you, learn about your equipment, and connect you with the right specialist. Cheerful, professional, and ready to help.
              </p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-[#FFCD11]/15 p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider">Select Language</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSelectedLanguage("en")}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-bold transition-all ${selectedLanguage === "en" ? "border-[#FFCD11] bg-[#FFCD11]/10 text-[#FFCD11]" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"}`}
                    data-testid="button-lang-en"
                  >
                    English
                  </button>
                  <button
                    onClick={() => setSelectedLanguage("ar")}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-bold transition-all ${selectedLanguage === "ar" ? "border-[#FFCD11] bg-[#FFCD11]/10 text-[#FFCD11]" : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"}`}
                    data-testid="button-lang-ar"
                  >
                    العربية (Arabic)
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent"
                  checked={consentGiven}
                  onCheckedChange={(c) => setConsentGiven(c as boolean)}
                  data-testid="checkbox-consent"
                  className="mt-0.5 border-[#FFCD11]/40 data-[state=checked]:bg-[#FFCD11] data-[state=checked]:border-[#FFCD11] data-[state=checked]:text-black"
                />
                <label htmlFor="consent" className="text-xs text-gray-400 leading-relaxed cursor-pointer text-left">
                  {selectedLanguage === "ar"
                    ? "أوافق على تسجيل محادثتي لإنشاء التقرير وأفهم أن إرشادات الذكاء الاصطناعي معلوماتية وليست بديلاً عن الفحص المعتمد."
                    : "I consent to having my conversation transcribed for report generation and understand that AI guidance is informational, not a substitute for certified inspection."}
                </label>
              </div>

              <Button
                className="w-full h-14 text-lg font-black bg-[#FFCD11] text-black hover:bg-[#e6b800] rounded-lg shadow-lg shadow-[#FFCD11]/20"
                onClick={startSession}
                disabled={!consentGiven || isConnecting}
                data-testid="button-start-session"
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    {selectedLanguage === "ar" ? "جاري الاتصال بالاستقبال..." : "CONNECTING TO ADMIN..."}
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-5 h-5 mr-2" />
                    {selectedLanguage === "ar" ? "تحدث مع الإدارة" : "SPEAK WITH ADMIN"}
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#FFCD11]/60" />
                <span>Encrypted</span>
              </div>
              <span className="text-gray-700">|</span>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#FFCD11]/60" />
                <span>Secure</span>
              </div>
              <span className="text-gray-700">|</span>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#FFCD11]/60" />
                <span>AI-Powered</span>
              </div>
            </div>
          </div>
        </section>

        <section id="walk-in-section" className="relative py-16 overflow-hidden" data-testid="walkin-section">
          <div className="absolute inset-0 bg-[#111111]" />
          <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 text-center space-y-6">
            <div className="flex items-center justify-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[#FFCD11]/20" />
              <span className="text-[#FFCD11] text-xs font-bold tracking-[0.2em]">OR</span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[#FFCD11]/20" />
            </div>
            <h3 className="text-xl font-black text-white">JUST WANT TO WALK IN?</h3>
            <p className="text-gray-400 text-sm max-w-md mx-auto">
              Skip the intro and jump straight into a session. Our admin will greet you and get started right away.
            </p>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-8 font-black border-[#FFCD11]/30 text-[#FFCD11] hover:bg-[#FFCD11]/10 rounded-lg"
              onClick={() => {
                if (!consentGiven) {
                  document.getElementById("speak-admin-section")?.scrollIntoView({ behavior: "smooth" });
                  toast({ title: "Please check the consent box first", variant: "destructive" });
                  return;
                }
                startSession();
              }}
              disabled={isConnecting}
              data-testid="button-quick-walkin"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  CONNECTING...
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4 mr-2" />
                  WALK IN NOW
                </>
              )}
            </Button>
          </div>
        </section>

        <footer className="relative border-t border-white/5 bg-[#0d0d0d] py-10" data-testid="footer">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <img src={logoPath} alt="AMERICAN IRON" className="h-10 w-auto" data-testid="img-logo-footer" />
                <div className="text-xs text-gray-500">
                  <p>AI-Powered Heavy Equipment Diagnostics</p>
                  <p className="mt-0.5">americanironus.com</p>
                </div>
              </div>
              <div className="text-xs text-gray-600">
                &copy; {new Date().getFullYear()} AMERICAN IRON. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  const avatarListening = !isTalking && !introPlaying && avatarReady && (isListening || isProcessing);

  return (
    <div className="h-screen w-screen bg-[#1a1a1a] flex flex-col relative overflow-hidden" data-testid="live-desk-active">
      <title>Live Session | AMERICAN IRON</title>

      <div
        className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat opacity-[0.06]"
        style={{ backgroundImage: `url(${shopBackgroundPath})` }}
        data-testid="shop-background"
      />

      <div className="absolute inset-0 flex items-center justify-center z-[1]" style={{ paddingTop: "56px", paddingBottom: "160px" }}>
        <div
          className={`relative w-full max-w-3xl mx-4 rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 ${avatarListening ? "ring-2 ring-[#FFCD11]/50 shadow-[0_0_40px_rgba(255,205,17,0.15)]" : "ring-1 ring-white/10"}`}
          style={{ aspectRatio: "16/9" }}
          data-testid="video-call-frame"
        >
          <div
            ref={videoContainerRef}
            className="absolute inset-0 w-full h-full"
            data-testid="video-avatar-container"
          />

          {avatarReady && (
            <div
              className="absolute bottom-3 left-3 z-10 pointer-events-none"
              data-testid="avatar-name-tag"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-white text-sm font-medium" data-testid="text-name-tag-name">
                  {currentAgent === "admin"
                    ? "Sarah"
                    : currentMechanic?.name || "Specialist"}
                </span>
                <span className="text-white/50 text-xs">
                  {currentAgent === "admin"
                    ? "Front Desk"
                    : currentMechanic?.title || "Mechanic"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {avatarListening && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none" data-testid="listening-indicator">
          <div className="flex items-center gap-2.5 px-5 py-2.5 bg-black/60 backdrop-blur-md rounded-full border border-[#FFCD11]/30">
            <div className="flex items-end gap-[3px] h-4">
              {[0.6, 0.9, 0.5, 1.0, 0.7].map((h, i) => (
                <div
                  key={`l-${i}`}
                  className="w-[3px] bg-[#FFCD11] rounded-full waveform-bar origin-bottom"
                  style={{
                    height: "16px",
                    animationDuration: `${0.5 + i * 0.1}s`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-[#FFCD11]/90 text-xs font-semibold tracking-wider uppercase">
              {isProcessing
                ? (selectedLanguage === "ar" ? "يفكر..." : "Thinking...")
                : (selectedLanguage === "ar" ? "يستمع..." : "Listening...")}
            </span>
            <div className="flex items-end gap-[3px] h-4">
              {[0.7, 1.0, 0.5, 0.9, 0.6].map((h, i) => (
                <div
                  key={`r-${i}`}
                  className="w-[3px] bg-[#FFCD11] rounded-full waveform-bar origin-bottom"
                  style={{
                    height: "16px",
                    animationDuration: `${0.5 + i * 0.1}s`,
                    animationDelay: `${i * 0.1 + 0.05}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {!avatarReady && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center space-y-4 bg-[#222]/80 backdrop-blur-md rounded-2xl p-10 border border-white/10 shadow-2xl max-w-sm mx-4">
            <div className="w-20 h-20 rounded-full bg-[#FFCD11]/10 border-2 border-[#FFCD11]/30 flex items-center justify-center mx-auto animate-pulse">
              {currentAgent === "admin" ? (
                <User className="w-10 h-10 text-[#FFCD11]/60" />
              ) : (
                currentMechanic ? <currentMechanic.icon className="w-10 h-10 text-[#FFCD11]/60" /> : <Wrench className="w-10 h-10 text-[#FFCD11]/60" />
              )}
            </div>
            <div>
              <p className="text-white text-lg font-medium">
                {handoffInProgress
                  ? `Connecting to ${currentMechanic?.name || "Specialist"}...`
                  : "Connecting to Front Desk..."}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {handoffInProgress
                  ? currentMechanic?.title || "Diagnostic Specialist"
                  : "Registration Admin"}
              </p>
            </div>
            <Loader2 className="w-6 h-6 animate-spin text-[#FFCD11] mx-auto" />
          </div>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="bg-[#1a1a1a] border-b border-white/10 p-3 px-4">
          <div className="flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#FFCD11]/15 backdrop-blur-sm flex items-center justify-center border border-[#FFCD11]/30">
                <Wrench className="w-4 h-4 text-[#FFCD11]" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">AMERICAN IRON</p>
                <p className="text-white/60 text-xs" data-testid="text-current-agent">
                  {currentAgent === "admin"
                    ? "Registration Admin"
                    : currentMechanic?.name || "Specialist"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2" data-testid="status-bar">
              {avatarReady && (
                <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 mr-1.5 animate-pulse" />
                  Live
                </Badge>
              )}
              <Badge
                variant={sessionData.tier === "pro" ? "default" : "secondary"}
                className="text-xs"
                data-testid="badge-tier"
              >
                {sessionData.tier === "pro" ? "Pro" : "Free"}
              </Badge>
              {isTalking && (
                <div className="flex items-center gap-1 px-2 py-1 bg-white/10 rounded-md backdrop-blur-sm">
                  <Volume2 className="w-3 h-3 text-white animate-pulse" />
                  <span className="text-white/80 text-xs">Speaking</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {subtitleText && (
        <div
          className="absolute left-0 right-0 z-20 flex justify-center px-6"
          style={{
            pointerEvents: "none",
            bottom: introPlaying ? "16px" : "90px",
            transition: "bottom 0.3s ease",
          }}
        >
          <div className="max-w-2xl w-full">
            {introPlaying && (
              <div className="flex items-center justify-end mb-3" style={{ pointerEvents: "auto" }}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/70 hover:text-white text-xs h-7 px-4 bg-black/50 backdrop-blur-md rounded-full border border-white/10 hover:border-[#FFCD11]/40 transition-all"
                  data-testid="button-skip-intro"
                  onClick={() => {
                    setIntroPlaying(false);
                    introPlayingRef.current = false;
                    setShowTextInput(true);
                    setSubtitleText(selectedLanguage === "ar" ? "كيف يمكنني مساعدتك اليوم؟" : "What can I help you with today?");
                    if (speakEndedResolveRef.current) {
                      speakEndedResolveRef.current();
                      speakEndedResolveRef.current = null;
                    }
                  }}
                >
                  {selectedLanguage === "ar" ? "تخطي المقدمة" : "Skip Intro"} <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            )}
            <div
              className="rounded-lg px-5 py-3"
              style={{
                background: "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.85) 100%)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <p
                className="text-white text-center leading-relaxed"
                data-testid="text-subtitle"
                dir={selectedLanguage === "ar" ? "rtl" : "ltr"}
                style={{
                  fontSize: "0.9375rem",
                  fontWeight: 400,
                  letterSpacing: "0.02em",
                  lineHeight: 1.65,
                  maxHeight: "4.95em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical" as any,
                }}
              >
                {subtitleText}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-500 ${introPlaying ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <div className="bg-[#1a1a1a] border-t border-white/10 pt-4 pb-5 px-4">
          <div className="max-w-xl mx-auto space-y-3">
            {showTextInput && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder={selectedLanguage === "ar" ? "اكتب رسالتك..." : "Type your message..."}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTextMessage()}
                  disabled={isProcessing}
                  dir={selectedLanguage === "ar" ? "rtl" : "ltr"}
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40 h-11"
                  data-testid="input-message"
                />
                <Button
                  size="icon"
                  onClick={sendTextMessage}
                  disabled={!inputText.trim() || isProcessing}
                  className="h-11 w-11 shrink-0"
                  data-testid="button-send"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <Button
                size="icon"
                variant={isListening ? "default" : "secondary"}
                className={`h-14 w-14 rounded-full ${isListening ? "bg-[#FFCD11] text-black ring-4 ring-[#FFCD11]/30" : "bg-white/10 hover:bg-white/20 border border-white/20"}`}
                onClick={toggleMicrophone}
                disabled={!avatarReady}
                data-testid="button-microphone"
              >
                {isListening ? <Mic className="w-6 h-6 text-white" /> : <MicOff className="w-6 h-6 text-white" />}
              </Button>

              <Button
                size="icon"
                variant="secondary"
                className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
                onClick={() => setShowTextInput(!showTextInput)}
                data-testid="button-toggle-keyboard"
              >
                <Keyboard className="w-4 h-4 text-white" />
              </Button>

              <Button
                size="icon"
                variant="secondary"
                className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20"
                onClick={() => setShowActions(!showActions)}
                data-testid="button-actions"
              >
                <FileText className="w-4 h-4 text-white" />
              </Button>

              <Button
                size="icon"
                variant="destructive"
                className="h-10 w-10 rounded-full"
                onClick={() => {
                  cleanupAvatarSession();
                  setSessionData(null);
                  sessionDataRef.current = null;
                  setAvatarReady(false);
                  setIsListening(false);
                  setShowTextInput(false);
                  setCurrentAgent("admin");
                  setMechanicType(null);
                  conversationRef.current = [];
                }}
                data-testid="button-end-session"
              >
                <Phone className="w-4 h-4 text-white rotate-[135deg]" />
              </Button>
            </div>

            {isListening && (
              <p className="text-center text-white/50 text-xs" data-testid="text-listening-hint">
                {selectedLanguage === "ar" ? "يستمع... تحدث بشكل طبيعي" : "Listening... speak naturally"}
              </p>
            )}
          </div>
        </div>
      </div>

      {showActions && (
        <div className="absolute bottom-36 right-4 z-30 bg-card/95 backdrop-blur-sm rounded-xl border border-card-border shadow-xl p-3 w-56 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</span>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowActions(false)}>
              <X className="w-3 h-3" />
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileUpload}
            className="hidden"
            data-testid="input-file-upload"
          />

          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-start"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-upload"
          >
            <Upload className="w-3.5 h-3.5 mr-2" />
            Upload Photos / PDFs
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-start"
            onClick={generateReport}
            disabled={isGeneratingReport}
            data-testid="button-generate-report"
          >
            {isGeneratingReport ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <FileText className="w-3.5 h-3.5 mr-2" />
            )}
            Generate Report
          </Button>

          {report && (
            <>
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => setShowReport(true)} data-testid="button-view-report">
                <Download className="w-3.5 h-3.5 mr-2" />
                View Report
              </Button>
              <Button variant="secondary" size="sm" className="w-full justify-start" onClick={copyShareLink} data-testid="button-share">
                <Share2 className="w-3.5 h-3.5 mr-2" />
                Share Report
              </Button>
            </>
          )}
        </div>
      )}

      {showVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="modal-verify">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-sm mx-4 bg-[#1a1a1a] border border-[#FFCD11]/30 rounded-2xl p-6 animate-in zoom-in-95 fade-in duration-300">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#FFCD11]/10 flex items-center justify-center">
                <Shield className="w-7 h-7 text-[#FFCD11]" />
              </div>
              <h3 className="text-white text-lg font-semibold" data-testid="text-verify-title">
                {selectedLanguage === "ar" ? "التحقق من الهوية" : "Verify Your Identity"}
              </h3>
              <p className="text-gray-400 text-sm mt-1" dir={selectedLanguage === "ar" ? "rtl" : "ltr"}>
                {selectedLanguage === "ar"
                  ? `تم إرسال رمز مكون من 4 أرقام إلى ${verifyType === "email" ? "بريدك الإلكتروني" : "هاتفك"}`
                  : `A 4-digit code has been sent to your ${verifyType}`}
              </p>
              <p className="text-[#FFCD11] text-xs mt-1 font-mono" data-testid="text-verify-target">{verifyTarget}</p>
            </div>

            <div className="flex justify-center gap-2 mb-4">
              {[0, 1, 2, 3].map(i => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  data-testid={`input-verify-digit-${i}`}
                  className="w-12 h-14 text-center text-2xl font-bold bg-[#111] border border-white/20 rounded-lg text-white focus:border-[#FFCD11] focus:ring-1 focus:ring-[#FFCD11] outline-none transition-all"
                  value={verifyCode[i] || ""}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val) {
                      const newCode = verifyCode.split("");
                      newCode[i] = val;
                      setVerifyCode(newCode.join(""));
                      const next = e.target.nextElementSibling as HTMLInputElement;
                      if (next) next.focus();
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Backspace" && !verifyCode[i]) {
                      const prev = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                      if (prev) prev.focus();
                    }
                  }}
                />
              ))}
            </div>

            {verificationStatus === "verified" && (
              <div className="text-center text-green-400 text-sm mb-3 flex items-center justify-center gap-1" data-testid="text-verify-success">
                <CheckCircle2 className="w-4 h-4" /> {selectedLanguage === "ar" ? "تم التحقق بنجاح!" : "Verified!"}
              </div>
            )}
            {verificationStatus === "failed" && (
              <div className="text-center text-red-400 text-sm mb-3" data-testid="text-verify-failed">
                {selectedLanguage === "ar" ? "رمز غير صحيح، حاول مرة أخرى" : "Invalid code, please try again"}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-white/20 text-gray-300 hover:text-white"
                data-testid="button-verify-skip"
                onClick={() => {
                  setShowVerifyModal(false);
                  setVerifyCode("");
                  setVerificationStatus(null);
                }}
              >
                {selectedLanguage === "ar" ? "تخطي" : "Skip"}
              </Button>
              <Button
                className="flex-1 bg-[#FFCD11] hover:bg-[#e6b800] text-black font-semibold"
                data-testid="button-verify-submit"
                disabled={verifyCode.length < 4}
                onClick={async () => {
                  try {
                    const res = await fetch("/api/verify/check", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ target: verifyTarget, code: verifyCode }),
                    });
                    const data = await res.json();
                    if (data.verified) {
                      setVerificationStatus("verified");
                      setTimeout(() => {
                        setShowVerifyModal(false);
                        setVerifyCode("");
                        setVerificationStatus(null);
                        const msg = selectedLanguage === "ar" ? "تم التحقق، شكراً" : "Verified, thank you";
                        handleUserMessageRef.current(msg);
                      }, 1500);
                    } else {
                      setVerificationStatus("failed");
                      setVerifyCode("");
                    }
                  } catch {
                    setVerificationStatus("failed");
                  }
                }}
              >
                {selectedLanguage === "ar" ? "تحقق" : "Verify"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showReport && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="modal-report">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setShowReport(false)} />

          <div className="relative z-10 w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col animate-in zoom-in-95 fade-in duration-500">
            <div className="relative overflow-hidden rounded-2xl border border-[#FFCD11]/20 bg-gradient-to-b from-[#1a1a1a] to-[#111111] shadow-2xl shadow-[#FFCD11]/5">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FFCD11] to-transparent" />

              <div className="p-6 pb-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#FFCD11]/15 flex items-center justify-center border border-[#FFCD11]/30">
                      <FileText className="w-6 h-6 text-[#FFCD11]" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight">
                        {report.reportType === "pro" ? "Pro Diagnostic Report" : "Quick Advice Report"}
                      </h2>
                      <p className="text-sm text-white/50 mt-0.5">
                        AMERICAN IRON | {sessionData.equipmentType || "Equipment"} {sessionData.make ? `- ${sessionData.make}` : ""} {sessionData.model || ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-10 w-10 rounded-full text-white/50 hover:text-white hover:bg-white/10"
                    onClick={() => setShowReport(false)}
                    data-testid="button-close-report"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                <div className="flex items-center gap-2 mt-4 flex-wrap">
                  <Button
                    size="sm"
                    className="bg-[#FFCD11] text-black hover:bg-[#FFCD11]/90 font-medium"
                    onClick={() => {
                      const printContent = document.getElementById("report-print-area");
                      if (printContent) {
                        const win = window.open("", "_blank");
                        if (win) {
                          const reportTitle = report.reportType === "pro" ? "Pro Diagnostic Report" : "Quick Advice Report";
                          const equipInfo = `${sessionData.equipmentType || ""} ${sessionData.make || ""} ${sessionData.model || ""}`.trim();
                          win.document.write(`<html><head><title>AMERICAN IRON - ${reportTitle}</title>
                            <style>
                            *{box-sizing:border-box;margin:0;padding:0}
                            body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;padding:0;color:#1a1a1a;background:#fff;line-height:1.6}
                            .print-wrapper{max-width:800px;margin:0 auto;padding:40px}
                            .print-header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #FFCD11;margin-bottom:30px}
                            .print-header h1{font-size:22px;font-weight:700;color:#111;letter-spacing:0.5px}
                            .print-header .subtitle{font-size:12px;color:#666;margin-top:4px}
                            .print-header .logo{font-weight:800;font-size:16px;color:#111;letter-spacing:3px;text-align:right}
                            .print-header .logo-sub{font-size:9px;color:#666;letter-spacing:1px;text-align:right}
                            .report-body{font-size:13px}
                            .report-body>div{margin-bottom:20px;page-break-inside:avoid}
                            .report-body h4,.report-body [class*="tracking"]{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#111;border-left:3px solid #FFCD11;padding-left:10px;margin-bottom:10px}
                            .report-body p{margin:4px 0;line-height:1.7;color:#333}
                            .report-body [class*="rounded"]{border:1px solid #e5e5e5;border-radius:8px;padding:12px;margin:6px 0;background:#fafafa}
                            .report-body [class*="bg-red"],[class*="bg-orange"]{background:#fff8f0;border-color:#ffcba4}
                            .report-body [class*="grid"]{display:grid;grid-template-columns:1fr 1fr;gap:8px}
                            .report-body [class*="font-mono"]{font-family:'Courier New',monospace;font-size:12px}
                            .report-body [class*="text-white"]{color:#333 !important}
                            .report-body [class*="text-red"]{color:#c53030 !important}
                            .report-body [class*="text-orange"]{color:#c05621 !important}
                            .report-body [class*="text-green"]{color:#276749 !important}
                            .report-body [class*="text-blue"]{color:#2b6cb0 !important}
                            .report-body [class*="text-yellow"],[class*="text-\\[\\#FFCD11\\]"]{color:#111 !important}
                            .report-body svg{display:none}
                            .report-body span[class*="rounded-full"]{display:inline-block;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:600;border:1px solid #ddd;background:#f5f5f5;color:#333}
                            .report-body [style*="backgroundColor"]{background:#f8f8f8 !important;border:1px solid #e0e0e0 !important}
                            .print-footer{margin-top:30px;padding-top:16px;border-top:2px solid #FFCD11;font-size:10px;color:#999;text-align:center}
                            @media print{body{padding:0}.print-wrapper{padding:20px}.report-body>div{page-break-inside:avoid}}
                            </style></head>
                            <body><div class='print-wrapper'>
                            <div class='print-header'>
                              <div><h1>${reportTitle}</h1><div class='subtitle'>${equipInfo ? `Equipment: ${equipInfo}` : ""}${report.content?.generatedDate ? ` | ${report.content.generatedDate}` : ""}${report.content?.reportId ? ` | ${report.content.reportId}` : ""}</div></div>
                              <div><div class='logo'>AMERICAN IRON</div><div class='logo-sub'>LIVE AI ENGINEER DESK</div></div>
                            </div>
                            <div class='report-body'>${printContent.innerHTML}</div>
                            <div class='print-footer'>Generated by AMERICAN IRON Live AI Engineer Desk | This report is AI-generated guidance only. Not a substitute for certified inspection.</div>
                            </div></body></html>`);
                          win.document.close();
                          setTimeout(() => win.print(), 300);
                        }
                      }
                    }}
                    data-testid="button-print-report"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Print / Save PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/10 text-white hover:bg-white/20 border-0"
                    onClick={() => {
                      const subject = encodeURIComponent(`AMERICAN IRON - ${report.reportType === "pro" ? "Pro Diagnostic" : "Quick Advice"} Report`);
                      const shareUrl = report.shareToken ? `${window.location.origin}/?shared=${report.shareToken}` : "";
                      const body = encodeURIComponent(
                        `Here is your diagnostic report from AMERICAN IRON:\n\n` +
                        `Equipment: ${sessionData.equipmentType || "N/A"} ${sessionData.make || ""} ${sessionData.model || ""}\n` +
                        (report.content?.problemSummary ? `Problem: ${report.content.problemSummary}\n\n` : "\n") +
                        (shareUrl ? `View full report: ${shareUrl}\n\n` : "") +
                        `---\nGenerated by AMERICAN IRON Live AI Engineer Desk`
                      );
                      window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
                    }}
                    data-testid="button-email-report"
                  >
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    Email Report
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="bg-white/10 text-white hover:bg-white/20 border-0"
                    onClick={copyShareLink}
                    data-testid="button-share-report"
                  >
                    <Share2 className="w-3.5 h-3.5 mr-1.5" />
                    Copy Link
                  </Button>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[calc(90vh-220px)] p-6" id="report-print-area">
                {report.content && <CinematicReportContent content={report.content} />}
                {report.svgDiagram && (
                  <div className="mt-6">
                    <h4 className="text-sm font-bold text-[#FFCD11] uppercase tracking-wider mb-3">Technical Diagram</h4>
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4 overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: report.svgDiagram }} />
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-white/10 flex items-center justify-center gap-2 text-xs text-white/30">
                <Shield className="w-3.5 h-3.5" />
                <span>AI guidance is informational only. Not a substitute for certified inspection.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CinematicReportContent({ content }: { content: any }) {
  const confidenceBadge = (level: string) => {
    const l = (level || "").toLowerCase();
    return l === "high" ? "bg-red-500/20 text-red-400 border-red-500/30" :
           l === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
           "bg-blue-500/20 text-blue-400 border-blue-500/30";
  };

  const SectionHeader = ({ icon, title, color = "#FFCD11" }: { icon: any; title: string; color?: string }) => (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
        {icon}
      </div>
      <h4 className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color }}>{title}</h4>
    </div>
  );

  return (
    <div className="space-y-6 text-sm report-content">
      {(content.generatedDate || content.reportId || content.equipment || content.customerInfo || content.customerName) && (
        <div className="bg-[#FFCD11]/5 rounded-xl border border-[#FFCD11]/20 p-5">
          <div className="grid grid-cols-2 gap-4 text-xs">
            {content.generatedDate && (
              <div><span className="text-white/40 uppercase tracking-wider">Date</span><p className="text-white/80 mt-0.5 font-medium">{content.generatedDate}</p></div>
            )}
            {content.reportId && (
              <div><span className="text-white/40 uppercase tracking-wider">Report ID</span><p className="text-white/80 mt-0.5 font-mono">{content.reportId}</p></div>
            )}
            {(content.customerName || content.customerInfo?.name) && (
              <div><span className="text-white/40 uppercase tracking-wider">Customer</span><p className="text-white/80 mt-0.5 font-medium">{content.customerName || content.customerInfo?.name}</p></div>
            )}
            {(content.company || content.customerInfo?.company) && (
              <div><span className="text-white/40 uppercase tracking-wider">Company</span><p className="text-white/80 mt-0.5">{content.company || content.customerInfo?.company}</p></div>
            )}
            {typeof content.equipment === "string" ? (
              <div className="col-span-2"><span className="text-white/40 uppercase tracking-wider">Equipment</span><p className="text-white/80 mt-0.5 font-medium">{content.equipment}</p></div>
            ) : content.equipment && (
              <>
                <div><span className="text-white/40 uppercase tracking-wider">Equipment</span><p className="text-white/80 mt-0.5 font-medium">{content.equipment.make} {content.equipment.model} {content.equipment.year}</p></div>
                {content.equipment.serialNumber && <div><span className="text-white/40 uppercase tracking-wider">Serial Number</span><p className="text-white/80 mt-0.5 font-mono">{content.equipment.serialNumber}</p></div>}
                {content.equipment.smuHours && <div><span className="text-white/40 uppercase tracking-wider">SMU/Hours</span><p className="text-white/80 mt-0.5">{content.equipment.smuHours}</p></div>}
              </>
            )}
            {content.serialNumber && typeof content.equipment === "string" && (
              <div><span className="text-white/40 uppercase tracking-wider">Serial Number</span><p className="text-white/80 mt-0.5 font-mono">{content.serialNumber}</p></div>
            )}
            {content.smuHours && typeof content.equipment === "string" && (
              <div><span className="text-white/40 uppercase tracking-wider">SMU/Hours</span><p className="text-white/80 mt-0.5">{content.smuHours}</p></div>
            )}
            {content.urgencyLevel && (
              <div><span className="text-white/40 uppercase tracking-wider">Urgency</span>
                <span className={`inline-block mt-1 text-xs font-bold px-2.5 py-1 rounded-full border ${
                  content.urgencyLevel.toLowerCase() === "critical" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                  content.urgencyLevel.toLowerCase() === "high" ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                  content.urgencyLevel.toLowerCase() === "medium" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                  "bg-green-500/20 text-green-400 border-green-500/30"
                }`}>{content.urgencyLevel}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {content.problemSummary && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <SectionHeader icon={<Search className="w-4 h-4 text-[#FFCD11]" />} title="Problem Summary" />
          <p className="text-white/80 leading-relaxed text-base">{content.problemSummary}</p>
        </div>
      )}

      {content.immediateActions && Array.isArray(content.immediateActions) && content.immediateActions.length > 0 && (
        <div className="bg-orange-500/10 rounded-xl border border-orange-500/20 p-5">
          <SectionHeader icon={<Zap className="w-4 h-4 text-orange-400" />} title="Immediate Actions Required" color="#fb923c" />
          <div className="space-y-2">
            {(content.immediateActions as string[]).map((action: string, i: number) => (
              <div key={i} className="flex items-start gap-3 text-orange-200/80">
                <ArrowRight className="w-4 h-4 shrink-0 mt-0.5 text-orange-400" />
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.likelyCauses && Array.isArray(content.likelyCauses) && (
        <div>
          <SectionHeader icon={<Search className="w-4 h-4 text-[#FFCD11]" />} title="Likely Causes" />
          <div className="space-y-2">
            {(content.likelyCauses as any[]).map((cause: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-white/30 font-mono text-xs">#{cause.rank || i + 1}</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${confidenceBadge(cause.confidence)}`}>{cause.confidence || "Medium"}</span>
                  <span className="text-white/90 font-medium">{cause.cause}</span>
                </div>
                {cause.explanation && <p className="text-white/50 text-xs leading-relaxed mt-2 pl-1">{cause.explanation}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {content.rootCauseMatrix && Array.isArray(content.rootCauseMatrix) && (
        <div>
          <SectionHeader icon={<Cog className="w-4 h-4 text-[#FFCD11]" />} title="Root Cause Analysis" />
          <div className="space-y-3">
            {(content.rootCauseMatrix as any[]).map((item: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${confidenceBadge(item.probability)}`}>{item.probability}</span>
                  <span className="font-semibold text-white">{item.cause}</span>
                  {item.estimatedRepairDifficulty && <span className="text-xs text-white/40 ml-auto">{item.estimatedRepairDifficulty}</span>}
                </div>
                {item.evidence && <p className="text-white/50 text-xs leading-relaxed pl-1 mb-1"><span className="text-white/30">Evidence:</span> {item.evidence}</p>}
                {item.testMethod && <p className="text-white/50 text-xs leading-relaxed pl-1"><span className="text-white/30">Test Method:</span> {item.testMethod}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {content.safeChecks && Array.isArray(content.safeChecks) && (
        <div>
          <SectionHeader icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} title="Safe Checks" color="#4ade80" />
          <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-3">
            {(content.safeChecks as string[]).map((check: string, i: number) => (
              <div key={i} className="flex items-start gap-3 text-white/70">
                <span className="w-6 h-6 rounded-full bg-green-500/15 text-green-400 flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                <span className="pt-0.5">{check}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.diagnosticTree && Array.isArray(content.diagnosticTree) && (
        <div>
          <SectionHeader icon={<ArrowRight className="w-4 h-4 text-[#FFCD11]" />} title="Diagnostic Steps" />
          <div className="space-y-2">
            {(content.diagnosticTree as any[]).map((step: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-[#FFCD11]/15 text-[#FFCD11] flex items-center justify-center text-xs font-bold shrink-0">{step.step}</span>
                  <div className="pt-1 flex-1">
                    <p className="text-white/90 font-medium">{step.action}</p>
                    {step.expectedResult && <p className="text-white/40 text-xs mt-1.5"><span className="text-white/30">Expected:</span> {step.expectedResult}</p>}
                    {step.ifFail && <p className="text-red-400/70 text-xs mt-1"><span className="text-red-400/50">If fails:</span> {step.ifFail}</p>}
                    {step.toolRequired && <p className="text-blue-400/60 text-xs mt-1"><span className="text-blue-400/50">Tool:</span> {step.toolRequired}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.toolsRequired && Array.isArray(content.toolsRequired) && content.toolsRequired.length > 0 && (
        <div>
          <SectionHeader icon={<Wrench className="w-4 h-4 text-[#FFCD11]" />} title="Tools Required" />
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {(content.toolsRequired as any[]).map((tool: any, i: number) => (
              <div key={i} className={`px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                {typeof tool === "string" ? (
                  <span className="text-white/80">{tool}</span>
                ) : (
                  <div>
                    <span className="text-white/90 font-medium">{tool.tool}</span>
                    {tool.purpose && <span className="text-white/40 text-xs ml-2">— {tool.purpose}</span>}
                    {tool.specification && <p className="text-white/30 text-xs mt-0.5">{tool.specification}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {content.safetyChecklist && Array.isArray(content.safetyChecklist) && (
        <div>
          <SectionHeader icon={<Shield className="w-4 h-4 text-orange-400" />} title="Safety Checklist" color="#fb923c" />
          <div className="bg-orange-500/5 rounded-xl border border-orange-500/15 p-4 space-y-2">
            {(content.safetyChecklist as any[]).map((item: any, i: number) => (
              <div key={i} className="flex items-start gap-3 text-white/70">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-orange-400" />
                <div>
                  <span>{typeof item === "string" ? item : item.item}</span>
                  {item.priority && <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${item.priority === "Critical" ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/40"}`}>{item.priority}</span>}
                  {item.details && <p className="text-white/40 text-xs mt-0.5">{item.details}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.laborEstimate && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <SectionHeader icon={<User className="w-4 h-4 text-[#FFCD11]" />} title="Labor Estimate" />
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="bg-white/5 rounded-lg p-3 text-center">
              <p className="text-white/40 uppercase tracking-wider mb-1">Estimated Hours</p>
              <p className="text-2xl font-bold text-[#FFCD11]">{content.laborEstimate.minHours} - {content.laborEstimate.maxHours}</p>
            </div>
            {content.laborEstimate.skillLevel && (
              <div className="bg-white/5 rounded-lg p-3 text-center">
                <p className="text-white/40 uppercase tracking-wider mb-1">Skill Level</p>
                <p className="text-lg font-semibold text-white/80">{content.laborEstimate.skillLevel}</p>
              </div>
            )}
          </div>
          {content.laborEstimate.note && <p className="text-white/40 text-xs italic mt-3">{content.laborEstimate.note}</p>}
        </div>
      )}

      {content.partsList && Array.isArray(content.partsList) && content.partsList.length > 0 && (
        <div>
          <SectionHeader icon={<Package className="w-4 h-4 text-[#FFCD11]" />} title="Parts List" />
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 bg-white/5 text-xs text-white/40 uppercase tracking-wider font-medium">
              <span>Part Name</span>
              <span>Part Number</span>
              <span>Qty</span>
            </div>
            {(content.partsList as any[]).map((part: any, i: number) => (
              <div key={i} className={`grid grid-cols-[1fr_auto_auto] gap-2 items-center px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div>
                  <span className="text-white/80">{part.partName}</span>
                  {part.notes && <p className="text-white/30 text-xs mt-0.5">{part.notes}</p>}
                  {part.alternatives && Array.isArray(part.alternatives) && part.alternatives.length > 0 && part.alternatives[0] && (
                    <p className="text-blue-400/50 text-xs mt-0.5">Alt: {part.alternatives.join(", ")}</p>
                  )}
                </div>
                {part.partNumber ? <span className="text-white/40 font-mono text-xs bg-white/5 px-2 py-1 rounded">{part.partNumber}</span> : <span />}
                <span className="text-white/60 text-xs text-center">{part.quantity || 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.procedureSteps && Array.isArray(content.procedureSteps) && content.procedureSteps.length > 0 && (
        <div>
          <SectionHeader icon={<Cog className="w-4 h-4 text-[#FFCD11]" />} title="Repair Procedure" />
          <div className="space-y-2">
            {(content.procedureSteps as any[]).map((step: any, i: number) => (
              <div key={i} className="bg-white/5 rounded-lg border border-white/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-white/10 text-white/70 flex items-center justify-center text-xs font-bold shrink-0">{step.step}</span>
                  <div className="flex-1">
                    <p className="text-white/80">{step.description}</p>
                    {step.safetyNote && <p className="text-orange-400/70 text-xs mt-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {step.safetyNote}</p>}
                    {step.estimatedTime && <p className="text-white/30 text-xs mt-1">{step.estimatedTime}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.calibrationSteps && Array.isArray(content.calibrationSteps) && content.calibrationSteps.length > 0 && (
        <div>
          <SectionHeader icon={<Cpu className="w-4 h-4 text-[#FFCD11]" />} title="Calibration Steps" />
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            {(content.calibrationSteps as any[]).map((step: any, i: number) => (
              <div key={i} className={`px-4 py-3 ${i > 0 ? "border-t border-white/5" : ""}`}>
                <div className="flex items-center gap-2">
                  <span className="text-white/30 font-mono text-xs">{step.step || i + 1}.</span>
                  <span className="text-white/80">{step.parameter}</span>
                </div>
                {step.specification && <p className="text-white/50 text-xs mt-1 pl-6">Spec: {step.specification}</p>}
                {step.method && <p className="text-white/40 text-xs mt-0.5 pl-6">Method: {step.method}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {content.preventiveMaintenance && Array.isArray(content.preventiveMaintenance) && content.preventiveMaintenance.length > 0 && (
        <div>
          <SectionHeader icon={<Star className="w-4 h-4 text-[#FFCD11]" />} title="Preventive Maintenance" />
          <div className="bg-white/5 rounded-xl border border-white/10 p-4 space-y-2">
            {(content.preventiveMaintenance as string[]).map((item: string, i: number) => (
              <div key={i} className="flex items-start gap-3 text-white/70">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#FFCD11]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {content.safetyWarnings && Array.isArray(content.safetyWarnings) && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/20 p-5">
          <SectionHeader icon={<AlertTriangle className="w-4 h-4 text-red-400" />} title="Safety Warnings" color="#f87171" />
          <ul className="space-y-2 text-sm text-red-300/80">
            {(content.safetyWarnings as string[]).map((w: string, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-red-400 mt-1 text-xs">&#9679;</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.whenToCallTech && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <SectionHeader icon={<Phone className="w-4 h-4 text-[#FFCD11]" />} title="When to Call a Technician" />
          <p className="text-white/70 leading-relaxed">{content.whenToCallTech}</p>
        </div>
      )}

      {content.recommendations && (
        <div className="bg-[#FFCD11]/5 rounded-xl border border-[#FFCD11]/20 p-5">
          <SectionHeader icon={<Star className="w-4 h-4 text-[#FFCD11]" />} title="Recommendations" />
          <p className="text-white/80 leading-relaxed">{content.recommendations}</p>
        </div>
      )}

      {content.additionalNotes && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <SectionHeader icon={<FileText className="w-4 h-4 text-[#FFCD11]" />} title="Additional Notes" />
          <p className="text-white/70 leading-relaxed">{content.additionalNotes}</p>
        </div>
      )}

      {content.disclaimer && (
        <div className="border-t border-white/10 pt-4 mt-6">
          <p className="text-xs text-white/30 italic leading-relaxed">
            {content.disclaimer}
          </p>
        </div>
      )}
    </div>
  );
}

function ReportContent({ content }: { content: any }) {
  return (
    <div className="space-y-4 text-sm">
      {(content.generatedDate || content.equipment || content.customerName) && (
        <div className="bg-muted/30 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {content.generatedDate && <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{content.generatedDate}</span></div>}
            {content.customerName && <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{content.customerName}</span></div>}
            {typeof content.equipment === "string" && <div className="col-span-2"><span className="text-muted-foreground">Equipment:</span> <span className="font-medium">{content.equipment}</span></div>}
          </div>
        </div>
      )}
      {content.problemSummary && (
        <div>
          <h4 className="font-semibold mb-1">Problem Summary</h4>
          <p className="text-muted-foreground leading-relaxed">{content.problemSummary}</p>
        </div>
      )}
      {content.likelyCauses && (
        <div>
          <h4 className="font-semibold mb-2">Likely Causes</h4>
          <div className="space-y-2">
            {(content.likelyCauses as any[]).map((cause: any, i: number) => (
              <div key={i} className="bg-card/50 border rounded-md p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">{cause.confidence || "Medium"}</Badge>
                  <span className="font-medium">{cause.cause}</span>
                </div>
                {cause.explanation && <p className="text-xs text-muted-foreground mt-1">{cause.explanation}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {content.rootCauseMatrix && (
        <div>
          <h4 className="font-semibold mb-2">Root Cause Analysis</h4>
          <div className="space-y-2">
            {(content.rootCauseMatrix as any[]).map((item: any, i: number) => (
              <div key={i} className="bg-card/50 border rounded-md p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">{item.probability}</Badge>
                  <span className="font-medium text-sm">{item.cause}</span>
                </div>
                {item.evidence && <p className="text-xs text-muted-foreground">{item.evidence}</p>}
                {item.testMethod && <p className="text-xs text-muted-foreground mt-0.5">Test: {item.testMethod}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {content.safeChecks && (
        <div>
          <h4 className="font-semibold mb-2">Safe Checks</h4>
          <ul className="space-y-1.5">
            {(content.safeChecks as string[]).map((check: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-muted-foreground">
                <ChevronRight className="w-3 h-3 shrink-0 mt-1 text-primary" />
                {check}
              </li>
            ))}
          </ul>
        </div>
      )}
      {content.diagnosticTree && (
        <div>
          <h4 className="font-semibold mb-2">Diagnostic Steps</h4>
          <div className="space-y-1.5">
            {(content.diagnosticTree as any[]).map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-muted-foreground text-xs bg-card/50 border rounded-md p-2.5">
                <span className="font-mono text-primary font-semibold">{step.step}.</span>
                <div>
                  <p>{step.action}</p>
                  {step.expectedResult && <p className="opacity-75 mt-0.5">Expected: {step.expectedResult}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {content.partsList && (
        <div>
          <h4 className="font-semibold mb-2">Parts List</h4>
          <div className="space-y-1">
            {(content.partsList as any[]).map((part: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs bg-card/50 border rounded-md px-3 py-2">
                <span>{part.partName}</span>
                {part.partNumber && <span className="text-muted-foreground font-mono">{part.partNumber}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {content.safetyWarnings && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-md p-4">
          <h4 className="font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            Safety Warnings
          </h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {(content.safetyWarnings as string[]).map((w: string, i: number) => (
              <li key={i}>&#9679; {w}</li>
            ))}
          </ul>
        </div>
      )}
      {content.whenToCallTech && (
        <div>
          <h4 className="font-semibold mb-1">When to Call a Technician</h4>
          <p className="text-muted-foreground leading-relaxed">{content.whenToCallTech}</p>
        </div>
      )}
      {content.recommendations && (
        <div>
          <h4 className="font-semibold mb-1">Recommendations</h4>
          <p className="text-muted-foreground leading-relaxed">{content.recommendations}</p>
        </div>
      )}
      {content.disclaimer && (
        <p className="text-xs text-muted-foreground italic border-t pt-3 mt-3 leading-relaxed">
          {content.disclaimer}
        </p>
      )}
    </div>
  );
}
