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
  ChevronRight, X, Download, Share2, AlertTriangle, Volume2, Keyboard
} from "lucide-react";
import shopBackgroundPath from "@assets/shop_background.png";

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

const MECHANIC_INFO: Record<string, { name: string; title: string; icon: any }> = {
  heavy_equipment: { name: "Mike Torres", title: "Heavy Equipment Mechanic", icon: Wrench },
  power_gen: { name: "Sarah Chen", title: "Power Generation Engineer", icon: Zap },
  marine: { name: "James Coastal", title: "Marine Engine Mechanic", icon: Anchor },
  hydraulics: { name: "David Pressure", title: "Hydraulics Specialist", icon: Droplets },
  electrical: { name: "Elena Circuit", title: "Electrical Controls Specialist", icon: Cpu },
};

export default function LiveDesk() {
  const { toast } = useToast();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
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
  const [subtitleText, setSubtitleText] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sharedReport, setSharedReport] = useState<{ report: ReportData; session: any } | null>(null);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const avatarSessionTokenRef = useRef<string | null>(null);
  const avatarSessionIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<Array<{ role: string; content: string }>>([]);
  const pendingHandoffRef = useRef<any>(null);
  const speakEndedResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shared = params.get("shared");
    const sessionId = params.get("session");
    const payment = params.get("payment");

    if (shared) {
      loadSharedReport(shared);
      window.history.replaceState({}, "", "/");
    } else if (sessionId && payment === "success") {
      const storedToken = sessionStorage.getItem(`session_token_${sessionId}`);
      if (storedToken) setAccessToken(storedToken);
      toast({ title: "Payment successful", description: "Your Pro Diagnostic Report is ready to generate." });
      window.history.replaceState({}, "", "/");
    }

    return () => {
      cleanupAvatarSession();
    };
  }, []);

  const cleanupAvatarSession = useCallback(() => {
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (e) {
        console.error("Room disconnect error:", e);
      }
      roomRef.current = null;
    }
    if (avatarSessionTokenRef.current) {
      fetch("/api/avatar/session/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: avatarSessionTokenRef.current }),
      }).catch(() => {});
      avatarSessionTokenRef.current = null;
      avatarSessionIdRef.current = null;
    }
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
      };
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) || voices.find(v => v.lang.startsWith("en"));
      if (preferred) utterance.voice = preferred;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

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

  const sendAvatarSpeakCommand = useCallback((text: string) => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") {
      speakWithBrowser(text);
      return;
    }

    try {
      const encoder = new TextEncoder();
      const payload = JSON.stringify({
        event_type: "avatar.speak_text",
        session_id: avatarSessionIdRef.current,
        text: text,
      });
      room.localParticipant.publishData(encoder.encode(payload), {
        reliable: true,
        topic: "agent-control",
      });
      setIsTalking(true);
    } catch (err) {
      console.error("Failed to send speak command:", err);
      speakWithBrowser(text);
    }
  }, [speakWithBrowser]);

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

  const connectAvatar = async (agentType: string = "admin"): Promise<Room> => {
    const res = await apiRequest("POST", "/api/avatar/session", { agentType });
    const { sessionId, sessionToken, livekitUrl, livekitClientToken } = await res.json();

    avatarSessionTokenRef.current = sessionToken;
    avatarSessionIdRef.current = sessionId;

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

    room.on(RoomEvent.DataReceived, (data, participant, kind, topic) => {
      try {
        const decoded = new TextDecoder().decode(data);
        const message = JSON.parse(decoded);
        const eventType = message.event_type || message.type;

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
          if (message.text) {
            handleUserMessage(message.text);
          }
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

    await room.connect(livekitUrl, livekitClientToken);
    roomRef.current = room;

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
      });
      const session = await res.json();
      setAccessToken(session.accessToken);
      sessionStorage.setItem(`session_token_${session.id}`, session.accessToken);
      setSessionData(session);
      setCurrentAgent("admin");

      try {
        const room = await connectAvatar("admin");
        setShowTextInput(true);

        setTimeout(async () => {
          const welcomeText = "Welcome to American Iron! I'm here to help you with your equipment. What can I help you with today?";
          setSubtitleText(welcomeText);
          conversationRef.current.push({ role: "assistant", content: welcomeText });
          sendAvatarSpeakCommand(welcomeText);

          await fetch(`/api/sessions/${session.id}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: "[Session started - Admin greeting]" }),
          }).catch(() => {});
        }, 3000);
      } catch (avatarErr: any) {
        console.error("Avatar connection failed:", avatarErr);
        toast({ title: "Avatar connection issue", description: "Could not connect to live avatar. Please try again.", variant: "destructive" });
        setSessionData(null);
      }
    } catch (err: any) {
      toast({ title: "Connection failed", description: err.message || "Could not start session.", variant: "destructive" });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleUserMessage = async (userMsg: string) => {
    if (!sessionData || isProcessing || !userMsg.trim()) return;

    setIsProcessing(true);
    conversationRef.current.push({ role: "user", content: userMsg });

    try {
      const response = await fetch(`/api/sessions/${sessionData.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg }),
      });

      if (!response.ok) {
        toast({ title: "Error", description: "Failed to get response", variant: "destructive" });
        setIsProcessing(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { setIsProcessing(false); return; }

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
            }
          } catch {}
        }
      }

      if (fullText) {
        const speakText = fullText.length > 500 ? fullText.substring(0, 500) : fullText;
        setSubtitleText(speakText);
        conversationRef.current.push({ role: "assistant", content: fullText });
        sendAvatarSpeakCommand(speakText);

        if (handoffData) {
          await waitForSpeakEnd(30000);
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (handoffData) {
        await performHandoff(handoffData);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const performHandoff = async (handoffData: any) => {
    if (!sessionData) return;
    setHandoffInProgress(true);

    const mechType = handoffData.mechanicType || "heavy_equipment";
    setMechanicType(mechType);
    const mechanic = MECHANIC_INFO[mechType];

    const transferMsg = `I'm now transferring you to ${mechanic?.name || "our specialist"}, our ${mechanic?.title || "diagnostic specialist"}. They'll take great care of you. One moment please.`;
    setSubtitleText(transferMsg);
    sendAvatarSpeakCommand(transferMsg);

    await waitForSpeakEnd(20000);
    await new Promise(r => setTimeout(r, 1500));

    try {
      cleanupAvatarSession();
      setAvatarReady(false);

      await apiRequest("POST", `/api/sessions/${sessionData.id}/handoff`);
      setCurrentAgent("mechanic");

      const room = await connectAvatar(mechType);

      setTimeout(() => {
        const mechGreeting = `Hello! I'm ${mechanic?.name || "your specialist"}. I've reviewed your intake information and I'm ready to help diagnose the issue. Let's get started — can you tell me more about what you're experiencing?`;
        setSubtitleText(mechGreeting);
        conversationRef.current.push({ role: "assistant", content: mechGreeting });
        sendAvatarSpeakCommand(mechGreeting);
        setHandoffInProgress(false);
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
    const room = roomRef.current;
    if (!room) return;

    try {
      if (isListening) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setIsListening(false);
      } else {
        await room.localParticipant.setMicrophoneEnabled(true);
        setIsListening(true);
      }
    } catch (err) {
      console.error("Mic toggle error:", err);
      toast({ title: "Microphone error", description: "Could not access microphone.", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sessionData || !e.target.files) return;
    const formData = new FormData();
    Array.from(e.target.files).forEach((file) => formData.append("files", file));

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["x-session-token"] = accessToken;
      const res = await fetch(`/api/sessions/${sessionData.id}/upload`, {
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
    if (sessionData.visitType === "pro" && sessionData.paymentStatus !== "paid") {
      setShowPaywall(true);
      return;
    }
    setIsGeneratingReport(true);
    try {
      const res = await apiRequest("POST", `/api/sessions/${sessionData.id}/report`);
      if (res.status === 402) { setShowPaywall(true); return; }
      const data = await res.json();
      setReport(data);
      setShowReport(true);
    } catch (err: any) {
      if (err.message?.includes("402")) { setShowPaywall(true); }
      else { toast({ title: "Error generating report", variant: "destructive" }); }
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleCheckout = async () => {
    if (!sessionData) return;
    try {
      const res = await apiRequest("POST", `/api/sessions/${sessionData.id}/checkout`);
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      toast({ title: "Checkout error", variant: "destructive" });
    }
  };

  const copyShareLink = async () => {
    if (!report?.shareToken) return;
    const url = `${window.location.origin}/?shared=${report.shareToken}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  const currentMechanic = mechanicType ? MECHANIC_INFO[mechanicType] : null;

  if (sharedReport) {
    const sr = sharedReport.report;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <title>Shared Report | American Iron</title>
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">American Iron</h1>
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
    return (
      <div className="min-h-screen bg-[#0a0e17] flex flex-col items-center justify-center relative overflow-hidden">
        <title>Live AI Engineer Desk | American Iron</title>
        <meta name="description" content="Connect with AI-powered mechanics for real-time heavy equipment diagnostics." />
        <meta property="og:title" content="Live AI Engineer Desk | American Iron" />
        <meta property="og:description" content="Real-time AI-powered heavy equipment diagnostics with live video avatars." />

        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl" />

        <div className="relative z-10 max-w-md w-full px-6 space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center mx-auto backdrop-blur-sm">
              <Wrench className="w-10 h-10 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight" data-testid="text-brand-name">
                American Iron
              </h1>
              <p className="text-primary/80 text-sm font-medium mt-1">Live AI Engineer Desk</p>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-sm mx-auto" data-testid="text-page-title">
              Speak face-to-face with our AI-powered front desk admin and specialist mechanics.
              Real-time video diagnostics for your heavy equipment.
            </p>
          </div>

          <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent"
                checked={consentGiven}
                onCheckedChange={(c) => setConsentGiven(c as boolean)}
                data-testid="checkbox-consent"
                className="mt-0.5 border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <label htmlFor="consent" className="text-xs text-gray-400 leading-relaxed cursor-pointer">
                I consent to having my conversation transcribed for report generation
                and understand that AI guidance is informational, not a substitute for certified inspection.
              </label>
            </div>

            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={startSession}
              disabled={!consentGiven || isConnecting}
              data-testid="button-start-session"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Connecting to Front Desk...
                </>
              ) : (
                <>
                  <Phone className="w-5 h-5 mr-2" />
                  Walk In
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <Shield className="w-3.5 h-3.5" />
            <span>Encrypted. Secure. AI-Powered.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black flex flex-col relative overflow-hidden" data-testid="live-desk-active">
      <title>Live Session | American Iron</title>

      <div
        className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${shopBackgroundPath})` }}
        data-testid="shop-background"
      />

      <div
        ref={videoContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{ zIndex: 1 }}
        data-testid="video-avatar-container"
      />

      {!avatarReady && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `linear-gradient(to bottom, rgba(10,14,23,0.7), rgba(6,10,20,0.85)), url(${shopBackgroundPath})` }}
        >
          <div className="text-center space-y-4">
            <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mx-auto animate-pulse">
              {currentAgent === "admin" ? (
                <User className="w-12 h-12 text-primary/60" />
              ) : (
                currentMechanic ? <currentMechanic.icon className="w-12 h-12 text-primary/60" /> : <Wrench className="w-12 h-12 text-primary/60" />
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
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
          </div>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="bg-gradient-to-b from-black/70 via-black/30 to-transparent p-4 pb-8">
          <div className="flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-white/10 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <Wrench className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">American Iron</p>
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
        <div className="absolute bottom-32 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
          <div className="max-w-2xl w-full">
            <div className="bg-black/70 backdrop-blur-sm text-white text-sm px-4 py-3 rounded-lg leading-relaxed" data-testid="text-subtitle">
              {subtitleText}
            </div>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div className="bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-8 pb-6 px-4">
          <div className="max-w-xl mx-auto space-y-3">
            {showTextInput && (
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Type your message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendTextMessage()}
                  disabled={isProcessing}
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
                className={`h-14 w-14 rounded-full ${isListening ? "bg-primary ring-4 ring-primary/30" : "bg-white/10 hover:bg-white/20 border border-white/20"}`}
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
              <p className="text-center text-white/50 text-xs">
                Listening... speak naturally
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
            {sessionData.visitType === "pro" && sessionData.paymentStatus !== "paid"
              ? "Get Pro Report ($149)"
              : "Generate Report"}
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

      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent data-testid="modal-paywall" className="bg-card">
          <DialogHeader>
            <DialogTitle>Pro Diagnostic Report</DialogTitle>
            <DialogDescription>Unlock the full diagnostic package</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-md p-4 space-y-2">
              <h4 className="text-sm font-semibold">What's included:</h4>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {["Root-cause analysis matrix", "Step-by-step diagnostic tree", "Required tools list",
                  "Safety checklist", "Labor estimate ranges", "Parts list with alternatives",
                  "Technical SVG diagram", "Downloadable PDF report", "Shareable report link"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <ChevronRight className="w-3 h-3 text-primary shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">$149.00</p>
                <p className="text-xs text-muted-foreground">One-time report fee</p>
              </div>
              <Button onClick={handleCheckout} data-testid="button-checkout">
                Proceed to Checkout
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-card" data-testid="modal-report">
          <DialogHeader>
            <DialogTitle>
              {report?.reportType === "pro" ? "Pro Diagnostic Report" : "Quick Advice Report"}
            </DialogTitle>
            <DialogDescription>
              Generated for {sessionData.equipmentType || "your equipment"}
            </DialogDescription>
          </DialogHeader>
          {report?.content && <ReportContent content={report.content} />}
          {report?.svgDiagram && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Technical Diagram</h4>
              <div className="bg-muted/50 rounded-md border border-card-border p-2 overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: report.svgDiagram }} />
            </div>
          )}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <Button variant="secondary" size="sm" onClick={copyShareLink} data-testid="button-share-report">
              <Share2 className="w-3.5 h-3.5 mr-1.5" />
              Share Report
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportContent({ content }: { content: any }) {
  return (
    <div className="space-y-3 text-sm">
      {content.problemSummary && (
        <div>
          <h4 className="font-semibold mb-1">Problem Summary</h4>
          <p className="text-muted-foreground">{content.problemSummary}</p>
        </div>
      )}
      {content.likelyCauses && (
        <div>
          <h4 className="font-semibold mb-1">Likely Causes</h4>
          <div className="space-y-1">
            {(content.likelyCauses as any[]).map((cause: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{cause.confidence || "Medium"}</Badge>
                <span className="text-muted-foreground">{cause.cause}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {content.rootCauseMatrix && (
        <div>
          <h4 className="font-semibold mb-1">Root Cause Matrix</h4>
          <div className="space-y-1">
            {(content.rootCauseMatrix as any[]).map((item: any, i: number) => (
              <div key={i} className="bg-card/50 border border-card-border rounded-md p-2">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">{item.probability}</Badge>
                  <span className="font-medium text-xs">{item.cause}</span>
                </div>
                {item.evidence && <p className="text-xs text-muted-foreground">{item.evidence}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {content.safeChecks && (
        <div>
          <h4 className="font-semibold mb-1">Safe Checks</h4>
          <ul className="space-y-1">
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
          <h4 className="font-semibold mb-1">Diagnostic Steps</h4>
          <div className="space-y-1">
            {(content.diagnosticTree as any[]).map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-muted-foreground text-xs">
                <span className="font-mono text-primary font-semibold">{step.step}.</span>
                <div>
                  <p>{step.action}</p>
                  {step.expectedResult && <p className="opacity-75">Expected: {step.expectedResult}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {content.partsList && (
        <div>
          <h4 className="font-semibold mb-1">Parts List</h4>
          <div className="space-y-1">
            {(content.partsList as any[]).map((part: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs bg-card/50 border border-card-border rounded-md px-2 py-1.5">
                <span>{part.partName}</span>
                {part.partNumber && <span className="text-muted-foreground font-mono">{part.partNumber}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {content.safetyWarnings && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3">
          <h4 className="font-semibold mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            Safety Warnings
          </h4>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {(content.safetyWarnings as string[]).map((w: string, i: number) => (
              <li key={i}>- {w}</li>
            ))}
          </ul>
        </div>
      )}
      {content.whenToCallTech && (
        <div>
          <h4 className="font-semibold mb-1">When to Call a Technician</h4>
          <p className="text-muted-foreground">{content.whenToCallTech}</p>
        </div>
      )}
      {content.disclaimer && (
        <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">
          {content.disclaimer}
        </p>
      )}
    </div>
  );
}
