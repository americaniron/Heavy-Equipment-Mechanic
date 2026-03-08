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
  HardHat, Cog, ArrowRight, CheckCircle2, Star
} from "lucide-react";
import shopBackgroundPath from "@assets/shop_background.png";
import logoPath from "@assets/american-iron-logo_1772935008934.png";
import heroFacilityPath from "@assets/hero_facility.png";
import workshopVideoPath from "@assets/generated_videos/workshop_aerial_view.mp4";
import serviceHeavyEquipPath from "@assets/service_heavyequip.png";
import servicePowerGenPath from "@assets/service_powergen.png";
import serviceMarinePath from "@assets/service_marine.png";
import serviceHydraulicsPath from "@assets/service_hydraulics.png";
import serviceElectricalPath from "@assets/service_electrical.png";

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
  },
  ar: {
    heavy_equipment: { name: "خالد المهندس", title: "ميكانيكي معدات ثقيلة", icon: Wrench },
    power_gen: { name: "ليلى", title: "مهندسة توليد الطاقة", icon: Zap },
    marine: { name: "عمر البحري", title: "ميكانيكي محركات بحرية", icon: Anchor },
    hydraulics: { name: "حسن", title: "أخصائي هيدروليك", icon: Droplets },
    electrical: { name: "نور", title: "أخصائية كهرباء وتحكم", icon: Cpu },
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

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const avatarSessionTokenRef = useRef<string | null>(null);
  const avatarSessionIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<Array<{ role: string; content: string }>>([]);
  const pendingHandoffRef = useRef<any>(null);
  const speakEndedResolveRef = useRef<(() => void) | null>(null);
  const introPlayingRef = useRef(false);
  const heroVideoRef = useRef<HTMLVideoElement>(null);

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

  const connectAvatar = async (agentType: string = "admin", language: string = "en"): Promise<Room> => {
    const res = await apiRequest("POST", "/api/avatar/session", { agentType, language });
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
        language: selectedLanguage,
      });
      const session = await res.json();
      setAccessToken(session.accessToken);
      sessionStorage.setItem(`session_token_${session.id}`, session.accessToken);
      setSessionData(session);
      setCurrentAgent("admin");

      try {
        const room = await connectAvatar("admin", selectedLanguage);

        setTimeout(async () => {
          setIntroPlaying(true);
          introPlayingRef.current = true;

          const introText = selectedLanguage === "ar"
            ? "مرحباً بكم في أمريكان أيرون! نحن وجهتكم الأولى لتشخيص المعدات الثقيلة والدعم الميكانيكي المتخصص. " +
              "إليكم كيف يعمل النظام. أخبروني قليلاً عن معداتكم والمشكلة التي تواجهونها، وسأوصلكم بأحد ميكانيكيينا المتخصصين الخمسة. " +
              "لدينا خبراء في المعدات الثقيلة مثل الحفارات والبلدوزرات، وأنظمة توليد الطاقة، والمحركات البحرية، والأنظمة الهيدروليكية، والتحكم الكهربائي. " +
              "كل ميكانيكي لديه عقود من الخبرة العملية ومستعد لإرشادكم في تشخيص فوري هنا وجهاً لوجه. " +
              "بعد استشارتكم ستحصلون على تقرير تشخيصي يمكنكم تقديمه مباشرة لفريق الصيانة. الآن أخبروني ما المشكلة مع معداتكم ولنبدأ!"
            : "Welcome to American Iron! We're your one-stop shop for heavy equipment diagnostics and expert mechanical support. " +
              "Here's how it works. You tell me a little about your equipment and the issue you're experiencing, and I'll connect you with one of our five specialist mechanics. " +
              "We have experts in heavy equipment like excavators and bulldozers, power generation systems, marine engines, hydraulic systems, and electrical controls. " +
              "Each mechanic has decades of hands-on experience and is ready to walk you through a real-time diagnosis, right here, face to face. " +
              "After your consultation, you'll receive a diagnostic report you can take straight to your service team. Now, let me know what's going on with your equipment, and we'll get started!";

          setSubtitleText(introText);
          sendAvatarSpeakCommand(introText);
          await waitForSpeakEnd(90000);

          if (introPlayingRef.current) {
            setIntroPlaying(false);
            introPlayingRef.current = false;
            setShowTextInput(true);
          }
          conversationRef.current.push({ role: "assistant", content: introText });

          await fetch(`/api/sessions/${session.id}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: "[Session started - Admin greeting and intro]" }),
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

  const lastCueTimeRef = useRef<number>(0);

  const sendAvatarListeningCue = useCallback(() => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") return;
    const now = Date.now();
    if (now - lastCueTimeRef.current < 8000) return;
    lastCueTimeRef.current = now;
    const cues = selectedLanguage === "ar"
      ? ["حسناً", "فهمت", "تمام", "أفهم"]
      : ["Mm-hmm", "I see", "Got it", "Okay"];
    const cue = cues[Math.floor(Math.random() * cues.length)];
    try {
      const encoder = new TextEncoder();
      const payload = JSON.stringify({
        event_type: "avatar.speak_text",
        session_id: avatarSessionIdRef.current,
        text: cue,
      });
      room.localParticipant.publishData(encoder.encode(payload), {
        reliable: true,
        topic: "agent-control",
      });
    } catch {}
  }, [selectedLanguage]);

  const handleUserMessage = async (userMsg: string) => {
    if (!sessionData || isProcessing || !userMsg.trim()) return;

    setIsProcessing(true);
    setIsListening(false);
    conversationRef.current.push({ role: "user", content: userMsg });

    sendAvatarListeningCue();

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
    const mechanicInfo = MECHANIC_INFO[selectedLanguage] || MECHANIC_INFO.en;
    const mechanic = mechanicInfo[mechType];

    const transferMsg = selectedLanguage === "ar"
      ? `سأقوم الآن بتحويلك إلى ${mechanic?.name || "المتخصص لدينا"}، ${mechanic?.title || "أخصائي التشخيص"}. سيعتنون بك جيداً. لحظة من فضلك.`
      : `I'm now transferring you to ${mechanic?.name || "our specialist"}, our ${mechanic?.title || "diagnostic specialist"}. They'll take great care of you. One moment please.`;
    setSubtitleText(transferMsg);
    sendAvatarSpeakCommand(transferMsg);

    await waitForSpeakEnd(20000);
    await new Promise(r => setTimeout(r, 1500));

    try {
      cleanupAvatarSession();
      setAvatarReady(false);

      await apiRequest("POST", `/api/sessions/${sessionData.id}/handoff`);
      setCurrentAgent("mechanic");

      const room = await connectAvatar(mechType, selectedLanguage);

      setTimeout(() => {
        const mechGreeting = selectedLanguage === "ar"
          ? `مرحباً! أنا ${mechanic?.name || "المتخصص"}. لقد راجعت معلومات القبول الخاصة بك وأنا مستعد لمساعدتك في تشخيص المشكلة. لنبدأ — هل يمكنك إخباري المزيد عما تواجهه؟`
          : `Hello! I'm ${mechanic?.name || "your specialist"}. I've reviewed your intake information and I'm ready to help diagnose the issue. Let's get started — can you tell me more about what you're experiencing?`;
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
    setIsGeneratingReport(true);
    try {
      const res = await apiRequest("POST", `/api/sessions/${sessionData.id}/report`);
      const data = await res.json();
      setReport(data);
      setShowReport(true);
    } catch (err: any) {
      toast({ title: "Error generating report", variant: "destructive" });
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
    ];

    const features = [
      { icon: User, text: "Face-to-face AI-powered video consultations" },
      { icon: HardHat, text: "Decades of combined specialist experience" },
      { icon: FileText, text: "Detailed diagnostic reports for your service team" },
      { icon: Shield, text: "Encrypted and secure — your data stays private" },
    ];

    return (
      <div className="min-h-screen bg-[#111111] text-white overflow-x-hidden" data-testid="landing-page">
        <title>AMERICAN IRON | Live AI Engineer Desk</title>
        <meta name="description" content="Walk into AMERICAN IRON — AI-powered heavy equipment diagnostics with live video specialists." />
        <meta property="og:title" content="AMERICAN IRON | Live AI Engineer Desk" />
        <meta property="og:description" content="Real-time AI-powered heavy equipment diagnostics with live video avatars." />

        <nav className="fixed top-0 left-0 right-0 z-50 bg-[#111111]/90 backdrop-blur-md border-b border-[#FFCD11]/10" data-testid="nav-bar">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logoPath} alt="AMERICAN IRON" className="h-12 w-auto" data-testid="img-logo-nav" />
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-gray-400">
              <a href="#services" className="hover:text-[#FFCD11] transition-colors" data-testid="link-services">Services</a>
              <a href="#why" className="hover:text-[#FFCD11] transition-colors" data-testid="link-why">Why AMERICAN IRON</a>
              <Button
                size="sm"
                className="bg-[#FFCD11] text-black hover:bg-[#e6b800] font-bold"
                onClick={() => document.getElementById("walk-in-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-nav-walkin"
              >
                WALK IN NOW
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
              className="w-full h-full object-cover opacity-30"
              data-testid="video-hero-bg"
              poster={heroFacilityPath}
              src={workshopVideoPath}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#111111] via-[#111111]/60 to-[#111111]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#111111] via-transparent to-[#111111]" />
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

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="h-14 px-10 text-lg font-black bg-[#FFCD11] text-black hover:bg-[#e6b800] rounded-lg shadow-lg shadow-[#FFCD11]/20"
                onClick={() => document.getElementById("walk-in-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="button-hero-walkin"
              >
                WALK IN NOW
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <a href="#services" className="text-gray-400 hover:text-[#FFCD11] text-sm font-medium flex items-center gap-1 transition-colors">
                Explore Our Services <ChevronRight className="w-4 h-4" />
              </a>
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
                FIVE EXPERT DIVISIONS.<br />ONE POWERFUL FACILITY.
              </h2>
              <p className="text-gray-400 mt-4 max-w-xl mx-auto">
                Each specialist brings decades of real-world experience to diagnose your equipment issues in real time.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {services.map((svc, i) => (
                <div
                  key={i}
                  className="group relative rounded-xl overflow-hidden border border-white/5 bg-[#1a1a1a] hover:border-[#FFCD11]/30 transition-all duration-300"
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
                  </div>
                </div>
              ))}

              <button
                className="relative rounded-xl overflow-hidden border border-[#FFCD11]/20 bg-gradient-to-br from-[#FFCD11]/10 to-[#1a1a1a] flex flex-col items-center justify-center p-8 text-center cursor-pointer hover:border-[#FFCD11]/40 transition-all duration-300"
                onClick={() => document.getElementById("walk-in-section")?.scrollIntoView({ behavior: "smooth" })}
                data-testid="card-service-walkin"
              >
                <div className="w-14 h-14 rounded-full bg-[#FFCD11]/20 flex items-center justify-center mb-4">
                  <ArrowRight className="w-7 h-7 text-[#FFCD11]" />
                </div>
                <h3 className="text-lg font-black text-[#FFCD11] mb-2">WALK IN NOW</h3>
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
                { step: "01", title: "WALK IN", desc: "Click the button and you're instantly connected to our AI front desk admin — no appointments, no waiting." },
                { step: "02", title: "DESCRIBE THE ISSUE", desc: "Tell us about your equipment and the problem you're experiencing. Our admin routes you to the right specialist." },
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

        <section id="walk-in-section" className="relative py-24 overflow-hidden" data-testid="walkin-section">
          <div className="absolute inset-0 bg-gradient-to-b from-[#111111] via-[#0d0d0d] to-[#111111]" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA2MCAwIEwgMCAwIDAgNjAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjA1LDE3LDAuMDMpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IGZpbGw9InVybCgjZ3JpZCkiIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiLz48L3N2Zz4=')] opacity-50" />

          <div className="relative z-10 max-w-lg mx-auto px-4 sm:px-6 text-center space-y-8">
            <img src={logoPath} alt="AMERICAN IRON" className="h-28 w-auto mx-auto" data-testid="img-logo-walkin" />

            <div className="space-y-3">
              <h2 className="text-2xl sm:text-3xl font-black text-white" data-testid="text-walkin-heading">
                READY TO WALK IN?
              </h2>
              <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
                Our AI-powered front desk admin is standing by to connect you with a specialist. No appointments necessary — just walk in.
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
                    {selectedLanguage === "ar" ? "جاري الاتصال بالاستقبال..." : "CONNECTING TO FRONT DESK..."}
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-5 h-5 mr-2" />
                    {selectedLanguage === "ar" ? "ادخل الآن" : "WALK IN NOW"}
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
    <div className="h-screen w-screen bg-black flex flex-col relative overflow-hidden" data-testid="live-desk-active">
      <title>Live Session | AMERICAN IRON</title>

      <div
        className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${shopBackgroundPath})` }}
        data-testid="shop-background"
      />

      <div
        ref={videoContainerRef}
        className={`absolute inset-0 w-full h-full transition-all duration-500 ${avatarListening ? "ring-2 ring-inset ring-[#FFCD11]/40 listening-glow" : ""}`}
        style={{ zIndex: 1 }}
        data-testid="video-avatar-container"
      />

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
        <div className="absolute bottom-32 left-0 right-0 z-20 flex justify-center px-4" style={{ pointerEvents: "none" }}>
          <div className="max-w-2xl w-full space-y-2">
            {introPlaying && (
              <div className="flex items-center justify-between" style={{ pointerEvents: "auto" }}>
                <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
                  Introduction
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/60 hover:text-white text-xs h-7 px-3"
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
            <div className="bg-black/70 backdrop-blur-sm text-white text-sm px-4 py-3 rounded-lg leading-relaxed" data-testid="text-subtitle" dir={selectedLanguage === "ar" ? "rtl" : "ltr"}>
              {subtitleText}
            </div>
          </div>
        </div>
      )}

      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-500 ${introPlaying ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        <div className="bg-gradient-to-t from-black/80 via-black/50 to-transparent pt-8 pb-6 px-4">
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
