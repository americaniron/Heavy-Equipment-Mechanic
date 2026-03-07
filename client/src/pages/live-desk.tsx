import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
  TaskType,
  TaskMode,
  type StartAvatarResponse,
} from "@heygen/streaming-avatar";
import {
  Mic, MicOff, Send, Upload, FileText, Phone, Shield,
  Loader2, Wrench, Zap, Anchor, Droplets, Cpu, User,
  ChevronRight, X, Download, Share2, AlertTriangle, Volume2, VolumeX, Keyboard
} from "lucide-react";

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

const MECHANIC_INFO: Record<string, { name: string; title: string; icon: any; avatarName: string }> = {
  heavy_equipment: { name: "Mike Torres", title: "Heavy Equipment Mechanic", icon: Wrench, avatarName: "Wayne_20240711" },
  power_gen: { name: "Sarah Chen", title: "Power Generation Engineer", icon: Zap, avatarName: "Susan_public_2_20240328" },
  marine: { name: "James Coastal", title: "Marine Engine Mechanic", icon: Anchor, avatarName: "josh_lite3_20230714" },
  hydraulics: { name: "David Pressure", title: "Hydraulics Specialist", icon: Droplets, avatarName: "Wayne_20240711" },
  electrical: { name: "Elena Circuit", title: "Electrical Controls Specialist", icon: Cpu, avatarName: "Susan_public_2_20240328" },
};

const ADMIN_AVATAR = "Anna_public_3_20240108";
const ADMIN_VOICE = "1bd001e7e50f421d891986aad5571571";

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
  const [userTranscript, setUserTranscript] = useState("");
  const [showPaywall, setShowPaywall] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sharedReport, setSharedReport] = useState<{ report: ReportData; session: any } | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const avatarRef = useRef<StreamingAvatar | null>(null);
  const sessionInfoRef = useRef<StartAvatarResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<Array<{ role: string; content: string }>>([]);
  const [usingFallback, setUsingFallback] = useState(false);

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
      if (avatarRef.current) {
        avatarRef.current.stopAvatar().catch(() => {});
      }
    };
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

  const initializeAvatar = async (avatarName: string) => {
    try {
      const tokenRes = await fetch("/api/avatar/token");
      if (!tokenRes.ok) throw new Error("Failed to get avatar token");
      const { token } = await tokenRes.json();

      const avatar = new StreamingAvatar({ token });
      avatarRef.current = avatar;

      avatar.on(StreamingEvents.STREAM_READY, (event: any) => {
        if (videoRef.current && event.detail) {
          videoRef.current.srcObject = event.detail;
          videoRef.current.play().catch(() => {});
        }
        setAvatarReady(true);
      });

      avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setIsTalking(true);
      });

      avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setIsTalking(false);
        setTimeout(() => setSubtitleText(""), 2000);
      });

      avatar.on(StreamingEvents.AVATAR_TALKING_MESSAGE, (event: any) => {
        if (event.detail?.message) {
          setSubtitleText(event.detail.message);
        }
      });

      avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event: any) => {
        if (event.detail?.message) {
          setUserTranscript(event.detail.message);
        }
      });

      avatar.on(StreamingEvents.USER_END_MESSAGE, (event: any) => {
        if (event.detail?.message) {
          const userMsg = event.detail.message;
          setUserTranscript("");
          handleUserMessage(userMsg);
        }
      });

      avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        setAvatarReady(false);
        toast({ title: "Connection lost", description: "Avatar stream disconnected.", variant: "destructive" });
      });

      const sessionInfo = await avatar.createStartAvatar({
        quality: AvatarQuality.Medium,
        avatarName,
        voice: { voiceId: ADMIN_VOICE, rate: 1.0 },
        language: "en",
      });

      sessionInfoRef.current = sessionInfo;

      await avatar.startAvatar(
        { quality: AvatarQuality.Medium, avatarName, voice: { voiceId: ADMIN_VOICE }, language: "en" },
        sessionInfo
      );

      return avatar;
    } catch (error: any) {
      console.error("Avatar initialization error:", error);
      throw error;
    }
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

      let avatarReady = false;
      try {
        const avatar = await initializeAvatar(ADMIN_AVATAR);
        avatarReady = true;

        setTimeout(async () => {
          try {
            const welcomeText = "Welcome to American Iron US! I'm here to help you with your equipment. What can I help you with today?";
            setSubtitleText(welcomeText);
            await avatar.speak({
              text: welcomeText,
              taskType: TaskType.TALK,
              taskMode: TaskMode.SYNC,
            });

            conversationRef.current.push({ role: "assistant", content: welcomeText });

            await fetch(`/api/sessions/${session.id}/message`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: "[Session started - Admin greeting]" }),
            }).catch(() => {});

            try {
              await avatar.startVoiceChat({ isInputAudioMuted: false });
              setIsListening(true);
            } catch {
              setShowTextInput(true);
            }
          } catch (err) {
            console.error("Welcome message error:", err);
            setShowTextInput(true);
          }
        }, 2000);
      } catch (avatarErr) {
        console.error("Avatar connection failed, using text mode:", avatarErr);
        setUsingFallback(true);
        setAvatarReady(true);
        setShowTextInput(true);

        const welcomeText = "Welcome to American Iron US! I'm here to help you with your equipment. What can I help you with today?";
        setSubtitleText(welcomeText);
        conversationRef.current.push({ role: "assistant", content: welcomeText });

        speakWithBrowser(welcomeText);

        await fetch(`/api/sessions/${session.id}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "[Session started - Admin greeting]" }),
        }).catch(() => {});
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

        if (avatarRef.current && !usingFallback) {
          try {
            await avatarRef.current.speak({
              text: speakText,
              taskType: TaskType.TALK,
              taskMode: TaskMode.SYNC,
            });
          } catch (err) {
            console.error("Avatar speak error:", err);
            speakWithBrowser(speakText);
          }
        } else {
          speakWithBrowser(speakText);
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

    setSubtitleText(`Transferring you to ${mechanic?.name || "our specialist"}. One moment please...`);

    if (avatarRef.current) {
      try {
        await avatarRef.current.speak({
          text: `I'm now transferring you to ${mechanic?.name || "our specialist"}, our ${mechanic?.title || "diagnostic specialist"}. They'll take great care of you. One moment please.`,
          taskType: TaskType.TALK,
          taskMode: TaskMode.SYNC,
        });
      } catch {}
    }

    try {
      if (avatarRef.current) {
        await avatarRef.current.stopAvatar().catch(() => {});
      }
      setAvatarReady(false);

      await apiRequest("POST", `/api/sessions/${sessionData.id}/handoff`);
      setCurrentAgent("mechanic");

      const newAvatar = await initializeAvatar(mechanic?.avatarName || ADMIN_AVATAR);

      setTimeout(async () => {
        const mechGreeting = `Hello! I'm ${mechanic?.name || "your specialist"}. I've reviewed your intake information and I'm ready to help diagnose the issue. Let's get started — can you tell me more about what you're experiencing?`;
        setSubtitleText(mechGreeting);
        conversationRef.current.push({ role: "assistant", content: mechGreeting });

        try {
          await newAvatar.speak({
            text: mechGreeting,
            taskType: TaskType.TALK,
            taskMode: TaskMode.SYNC,
          });

          try {
            await newAvatar.startVoiceChat({ isInputAudioMuted: false });
            setIsListening(true);
          } catch {
            setShowTextInput(true);
          }
        } catch {}

        setHandoffInProgress(false);
      }, 2000);
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

    if (avatarRef.current && isListening) {
      try { await avatarRef.current.stopListening(); } catch {}
    }

    await handleUserMessage(msg);

    if (avatarRef.current && isListening) {
      try { await avatarRef.current.startListening(); } catch {}
    }
  };

  const toggleMicrophone = async () => {
    if (!avatarRef.current) return;

    try {
      if (isListening) {
        await avatarRef.current.closeVoiceChat();
        setIsListening(false);
      } else {
        await avatarRef.current.startVoiceChat({ isInputAudioMuted: false });
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
        <title>Shared Report | American Iron US</title>
        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">American Iron US</h1>
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
        <title>Live AI Engineer Desk | American Iron US</title>
        <meta name="description" content="Connect with AI-powered mechanics for real-time heavy equipment diagnostics." />
        <meta property="og:title" content="Live AI Engineer Desk | American Iron US" />
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
                American Iron US
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
      <title>Live Session | American Iron US</title>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        data-testid="video-avatar"
      />

      {(!avatarReady || usingFallback) && (
        <div className={`absolute inset-0 bg-gradient-to-b from-[#0f1829] via-[#0a1020] to-[#060a14] flex items-center justify-center z-10`}>
          {!avatarReady ? (
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
          ) : (
            <div className="text-center relative">
              <div className={`w-44 h-44 md:w-56 md:h-56 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 ${isTalking ? 'border-primary shadow-lg shadow-primary/20' : 'border-white/10'} flex items-center justify-center mx-auto transition-all duration-300`}>
                <div className={`w-40 h-40 md:w-52 md:h-52 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center ${isTalking ? 'scale-105' : 'scale-100'} transition-transform duration-300`}>
                  {currentAgent === "admin" ? (
                    <User className="w-20 h-20 md:w-24 md:h-24 text-gray-400" />
                  ) : (
                    currentMechanic ? <currentMechanic.icon className="w-20 h-20 md:w-24 md:h-24 text-gray-400" /> : <Wrench className="w-20 h-20 md:w-24 md:h-24 text-gray-400" />
                  )}
                </div>
              </div>
              {isTalking && (
                <div className="flex items-center justify-center gap-1 mt-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-1 bg-primary rounded-full animate-pulse" style={{
                      height: `${12 + Math.random() * 20}px`,
                      animationDelay: `${i * 100}ms`,
                      animationDuration: '0.6s',
                    }} />
                  ))}
                </div>
              )}
              <p className="text-white text-lg font-medium mt-4">
                {currentAgent === "admin"
                  ? "Registration Admin"
                  : currentMechanic?.name || "Specialist"}
              </p>
              <p className="text-gray-400 text-sm">
                {currentAgent === "admin"
                  ? "American Iron US - Front Desk"
                  : currentMechanic?.title || "Diagnostic Specialist"}
              </p>
            </div>
          )}
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
                <p className="text-white text-sm font-semibold">American Iron US</p>
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

      {(subtitleText || userTranscript) && (
        <div className="absolute bottom-32 left-0 right-0 z-20 flex justify-center px-4 pointer-events-none">
          <div className="max-w-2xl w-full">
            {userTranscript && (
              <div className="bg-primary/80 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-lg mb-2 inline-block">
                <span className="text-primary-foreground/70 text-xs mr-2">You:</span>
                {userTranscript}
              </div>
            )}
            {subtitleText && (
              <div className="bg-black/70 backdrop-blur-sm text-white text-sm px-4 py-3 rounded-lg leading-relaxed" data-testid="text-subtitle">
                {subtitleText}
              </div>
            )}
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
                onClick={async () => {
                  if (avatarRef.current) await avatarRef.current.stopAvatar().catch(() => {});
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
