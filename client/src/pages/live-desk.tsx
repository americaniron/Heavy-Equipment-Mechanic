import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Mic, MicOff, Send, Upload, Download, Share2, FileText,
  Video, Phone, AlertTriangle, Shield, Loader2, X,
  Wrench, Zap, Anchor, Droplets, Cpu, User, ChevronRight
} from "lucide-react";

interface SessionMessage {
  id: number;
  role: string;
  content: string;
  agentType: string;
  createdAt: string;
}

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
  messages: SessionMessage[];
  files: any[];
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
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<"admin" | "mechanic">("admin");
  const [mechanicType, setMechanicType] = useState<string | null>(null);
  const [handoffInProgress, setHandoffInProgress] = useState(false);
  const [avatarConnected, setAvatarConnected] = useState(false);
  const [avatarSessionId, setAvatarSessionId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [sharedReport, setSharedReport] = useState<{ report: ReportData; session: any } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session");
    const payment = params.get("payment");
    const shared = params.get("shared");

    if (shared) {
      loadSharedReport(shared);
      window.history.replaceState({}, "", "/live-desk");
    } else if (sessionId && payment === "success") {
      const storedToken = sessionStorage.getItem(`session_token_${sessionId}`);
      if (storedToken) setAccessToken(storedToken);
      loadSession(parseInt(sessionId), storedToken);
      toast({ title: "Payment successful", description: "Your Pro Diagnostic Report is being generated." });
      window.history.replaceState({}, "", "/live-desk");
    }
  }, []);

  const loadSharedReport = async (token: string) => {
    try {
      const res = await fetch(`/api/shared/${token}`);
      if (!res.ok) {
        toast({ title: "Report not found", description: "This share link may have expired.", variant: "destructive" });
        return;
      }
      const data = await res.json();
      setSharedReport(data);
    } catch (err) {
      toast({ title: "Error loading report", description: "Could not load the shared report.", variant: "destructive" });
    }
  };

  const loadSession = async (sessionId: number, token?: string | null) => {
    try {
      const tkn = token || accessToken;
      const res = await fetch(`/api/sessions/${sessionId}`, {
        headers: tkn ? { "x-session-token": tkn } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setSessionData(data);
      setMessages(data.messages || []);
      if (data.status === "diagnosing" || data.status === "completed") {
        setCurrentAgent("mechanic");
        setMechanicType(data.mechanicType);
      }
    } catch (err) {
      console.error("Failed to load session:", err);
    }
  };

  const startSession = async () => {
    if (!consentGiven) {
      toast({ title: "Consent required", description: "Please accept the consent checkbox to begin.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiRequest("POST", "/api/sessions", {
        consentGiven: true,
        provider: "heygen",
      });
      const session = await res.json();
      setAccessToken(session.accessToken);
      sessionStorage.setItem(`session_token_${session.id}`, session.accessToken);
      setSessionData(session);
      setMessages([]);
      setCurrentAgent("admin");

      await connectAvatar("heygen", "admin");

      const welcomeRes = await fetch(`/api/sessions/${session.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello, I need help with my equipment." }),
      });

      await handleStreamResponse(welcomeRes);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const connectAvatar = async (provider: string, agentType: string) => {
    try {
      const res = await apiRequest("POST", "/api/avatar/session", { provider, agentType });
      const avatarData = await res.json();
      setAvatarSessionId(avatarData.sessionId);

      if (avatarData.offer && avatarData.iceServers) {
        const pc = new RTCPeerConnection({
          iceServers: avatarData.iceServers,
        });

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
            setAvatarConnected(true);
          }
        };

        pc.onicecandidate = async (event) => {
          if (event.candidate && avatarData.sessionId) {
            try {
              await apiRequest("POST", "/api/avatar/ice", {
                sessionId: avatarData.sessionId,
                candidate: event.candidate.toJSON(),
              });
            } catch (e) {
              console.error("ICE candidate error:", e);
            }
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(avatarData.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await apiRequest("POST", "/api/avatar/sdp", {
          sessionId: avatarData.sessionId,
          sdp: answer.sdp,
        });

        peerConnectionRef.current = pc;
      }
    } catch (err) {
      console.error("Avatar connection failed:", err);
    }
  };

  const handleStreamResponse = async (response: Response) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Connection error" }));
      toast({ title: "Error", description: errorData.error || "Failed to get response", variant: "destructive" });
      return;
    }

    setIsStreaming(true);
    setStreamingText("");

    const reader = response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

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
            setStreamingText(fullText);
          } else if (event.type === "handoff") {
            setHandoffInProgress(true);
            setMechanicType(event.mechanicType);

            setTimeout(async () => {
              if (sessionData) {
                await apiRequest("POST", `/api/sessions/${sessionData.id}/handoff`);
                setCurrentAgent("mechanic");
                setHandoffInProgress(false);

                if (avatarSessionId) {
                  try { await apiRequest("DELETE", `/api/avatar/session/${avatarSessionId}`); } catch {}
                }
                await connectAvatar("did", "mechanic");

                await loadSession(sessionData.id);
              }
            }, 2000);
          } else if (event.type === "done") {
            if (fullText && sessionData) {
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now(),
                  role: "assistant",
                  content: fullText,
                  agentType: currentAgent,
                  createdAt: new Date().toISOString(),
                },
              ]);
            }
            setStreamingText("");

            if (avatarSessionId && fullText) {
              try {
                const speakText = fullText.length > 200 ? fullText.substring(0, 200) + "..." : fullText;
                await apiRequest("POST", "/api/avatar/speak", {
                  sessionId: avatarSessionId,
                  text: speakText,
                });
              } catch (e) {
                console.error("Avatar speak error:", e);
              }
            }
          }
        } catch {}
      }
    }

    setIsStreaming(false);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !sessionData || isStreaming) return;

    const userMsg = inputText.trim();
    setInputText("");
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        role: "user",
        content: userMsg,
        agentType: currentAgent,
        createdAt: new Date().toISOString(),
      },
    ]);

    try {
      const response = await fetch(`/api/sessions/${sessionData.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg }),
      });
      await handleStreamResponse(response);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());

        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = (reader.result as string).split(",")[1];

          setMessages((prev) => [
            ...prev,
            {
              id: Date.now(),
              role: "user",
              content: "[Voice message - transcribing...]",
              agentType: currentAgent,
              createdAt: new Date().toISOString(),
            },
          ]);

          try {
            const response = await fetch(`/api/sessions/${sessionData!.id}/message`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ useVoice: true, audio: base64 }),
            });
            await handleStreamResponse(response);
          } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
          }
        };
        reader.readAsDataURL(blob);
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
    } catch (err) {
      toast({ title: "Microphone access denied", description: "Please allow microphone access.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
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
        toast({ title: "Files uploaded", description: "Your files have been attached to this session." });
        await loadSession(sessionData.id);
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
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
      if (res.status === 402) {
        setShowPaywall(true);
        return;
      }
      const reportData = await res.json();
      setReport(reportData);
      setShowReport(true);
    } catch (err: any) {
      if (err.message.includes("402")) {
        setShowPaywall(true);
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
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
    } catch (err: any) {
      toast({ title: "Checkout error", description: err.message, variant: "destructive" });
    }
  };

  const copyShareLink = async () => {
    if (!report?.shareToken) return;
    const url = `${window.location.origin}/live-desk?shared=${report.shareToken}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: "Share link copied to clipboard." });
  };

  const currentMechanic = mechanicType ? MECHANIC_INFO[mechanicType] : null;
  const MechanicIcon = currentMechanic?.icon || Wrench;

  if (sharedReport) {
    const sr = sharedReport.report;
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <title>Shared Report | American Iron US</title>
        <meta name="description" content="Shared diagnostic report from American Iron US." />

        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold">American Iron US</h1>
              <p className="text-xs text-muted-foreground">Shared Report</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setSharedReport(null); }} data-testid="button-back-home">
            Start New Session
          </Button>
        </header>

        <div className="flex-1 p-4 max-w-2xl mx-auto w-full">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={sr.reportType === "pro" ? "default" : "secondary"}>
                {sr.reportType === "pro" ? "Pro Diagnostic" : "Quick Advice"}
              </Badge>
              {sharedReport.session?.equipmentType && (
                <span className="text-sm text-muted-foreground">
                  {sharedReport.session.make} {sharedReport.session.model} {sharedReport.session.equipmentType}
                </span>
              )}
            </div>

            {sr.content && typeof sr.content === "object" && (
              <div className="space-y-3 text-sm">
                {(sr.content as any).problemSummary && (
                  <div>
                    <h4 className="font-semibold mb-1">Problem Summary</h4>
                    <p className="text-muted-foreground">{(sr.content as any).problemSummary}</p>
                  </div>
                )}
                {(sr.content as any).likelyCauses && (
                  <div>
                    <h4 className="font-semibold mb-1">Likely Causes</h4>
                    <div className="space-y-1">
                      {((sr.content as any).likelyCauses as any[]).map((cause: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs">{cause.confidence || "Medium"}</Badge>
                          <span className="text-muted-foreground">{cause.cause}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(sr.content as any).rootCauseMatrix && (
                  <div>
                    <h4 className="font-semibold mb-1">Root Cause Matrix</h4>
                    <div className="space-y-1">
                      {((sr.content as any).rootCauseMatrix as any[]).map((item: any, i: number) => (
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
                {(sr.content as any).safeChecks && (
                  <div>
                    <h4 className="font-semibold mb-1">Safe Checks</h4>
                    <ul className="space-y-1">
                      {((sr.content as any).safeChecks as string[]).map((check: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-muted-foreground">
                          <ChevronRight className="w-3 h-3 shrink-0 mt-1 text-primary" />
                          {check}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(sr.content as any).safetyWarnings && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3">
                    <h4 className="font-semibold mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                      Safety Warnings
                    </h4>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {((sr.content as any).safetyWarnings as string[]).map((w: string, i: number) => (
                        <li key={i}>- {w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(sr.content as any).disclaimer && (
                  <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">
                    {(sr.content as any).disclaimer}
                  </p>
                )}
              </div>
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

        <footer className="border-t border-border/50 p-3 text-center">
          <div className="flex items-start gap-1.5 justify-center text-xs text-muted-foreground">
            <Shield className="w-3 h-3 shrink-0 mt-0.5" />
            <p>AI guidance is informational only. Not a substitute for certified inspection.</p>
          </div>
        </footer>
      </div>
    );
  }

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <title>Live AI Engineer Desk | American Iron US</title>
        <meta name="description" content="Get real-time AI-powered heavy equipment diagnostics from expert mechanic avatars." />

        <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Wrench className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-sm font-semibold" data-testid="text-brand-name">American Iron US</h1>
              <p className="text-xs text-muted-foreground">Live AI Engineer Desk</p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block" />
            Online
          </Badge>
        </header>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-lg w-full space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Video className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold" data-testid="text-page-title">Live AI Engineer Desk</h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
                Connect with our AI-powered registration admin and specialist mechanics
                for real-time equipment diagnostics. Get expert guidance powered by
                HeyGen and D-ID avatar technology.
              </p>
            </div>

            <div className="bg-card rounded-md border border-card-border p-4 space-y-4">
              <h3 className="text-sm font-medium">How it works</h3>
              <div className="space-y-3">
                {[
                  { step: "1", text: "Our Registration Admin collects your equipment details" },
                  { step: "2", text: "You're assigned to a specialist mechanic" },
                  { step: "3", text: "Get real-time diagnostic guidance and reports" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-xs font-semibold text-primary">{item.step}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-md border border-card-border p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="consent"
                  checked={consentGiven}
                  onCheckedChange={(checked) => setConsentGiven(checked as boolean)}
                  data-testid="checkbox-consent"
                />
                <label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                  I consent to having my conversation transcribed for report generation
                  and case details stored for follow-up. I understand that AI guidance
                  is informational and not a substitute for certified inspection.
                </label>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={startSession}
              disabled={!consentGiven || isLoading}
              data-testid="button-start-session"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4 mr-2" />
                  Start Live Session
                </>
              )}
            </Button>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <p>
                AI guidance is informational only. For safety-critical scenarios,
                our agents will advise safe shutdown and recommend certified technician on-site.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="live-desk-active">
      <title>Live Session | American Iron US</title>

      <header className="border-b border-border/50 px-4 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Wrench className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">American Iron US</h1>
            <p className="text-xs text-muted-foreground">Live AI Engineer Desk</p>
          </div>
        </div>

        <div className="flex items-center gap-2" data-testid="status-bar">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card border border-card-border">
            {currentAgent === "admin" ? (
              <User className="w-3.5 h-3.5 text-primary" />
            ) : (
              <MechanicIcon className="w-3.5 h-3.5 text-primary" />
            )}
            <span className="text-xs font-medium" data-testid="text-current-agent">
              {currentAgent === "admin"
                ? "Registration Admin"
                : currentMechanic?.name || "Specialist"}
            </span>
          </div>

          <Badge
            variant={sessionData.tier === "pro" ? "default" : "secondary"}
            data-testid="badge-tier"
          >
            {sessionData.tier === "pro" ? "Pro" : "Free"}
          </Badge>

          {avatarConnected && (
            <Badge variant="outline" className="text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 inline-block" />
              Live
            </Badge>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="relative bg-black/5 dark:bg-black/20 aspect-video max-h-[280px] w-full shrink-0">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover"
              data-testid="video-avatar"
            />

            {!avatarConnected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 rounded-full bg-card border-2 border-border flex items-center justify-center mx-auto">
                    {currentAgent === "admin" ? (
                      <User className="w-10 h-10 text-muted-foreground" />
                    ) : (
                      <MechanicIcon className="w-10 h-10 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {currentAgent === "admin"
                        ? "Registration Admin"
                        : currentMechanic?.name || "Specialist"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {currentAgent === "admin"
                        ? "AI-Powered Intake Agent"
                        : currentMechanic?.title || "Diagnostic Specialist"}
                    </p>
                  </div>
                  {handoffInProgress && (
                    <div className="flex items-center gap-2 justify-center text-primary">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-xs font-medium">Transferring to specialist...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {handoffInProgress && avatarConnected && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center backdrop-blur-sm">
                <div className="text-center space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  <p className="text-sm font-medium">Connecting to {currentMechanic?.name || "Specialist"}...</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3 max-w-2xl mx-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    data-testid={`message-${msg.role}-${msg.id}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-card-border"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-1.5 mb-1">
                          {msg.agentType === "admin" ? (
                            <User className="w-3 h-3 text-muted-foreground" />
                          ) : (
                            <Wrench className="w-3 h-3 text-muted-foreground" />
                          )}
                          <span className="text-xs text-muted-foreground font-medium">
                            {msg.agentType === "admin" ? "Admin" : currentMechanic?.name || "Specialist"}
                          </span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))}

                {isStreaming && streamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-md px-3 py-2 text-sm bg-card border border-card-border">
                      <div className="flex items-center gap-1.5 mb-1">
                        {currentAgent === "admin" ? (
                          <User className="w-3 h-3 text-muted-foreground" />
                        ) : (
                          <MechanicIcon className="w-3 h-3 text-muted-foreground" />
                        )}
                        <span className="text-xs text-muted-foreground font-medium">
                          {currentAgent === "admin" ? "Admin" : currentMechanic?.name || "Specialist"}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{streamingText}</p>
                      <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5" />
                    </div>
                  </div>
                )}

                {isStreaming && !streamingText && (
                  <div className="flex justify-start">
                    <div className="rounded-md px-3 py-2 bg-card border border-card-border">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border/50 p-3 shrink-0">
              <div className="flex items-center gap-2 max-w-2xl mx-auto">
                <Button
                  size="icon"
                  variant={isRecording ? "destructive" : "secondary"}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isStreaming || !sessionData}
                  data-testid="button-microphone"
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>

                <Input
                  placeholder="Type your message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  disabled={isStreaming || isRecording}
                  className="flex-1"
                  data-testid="input-message"
                />

                <Button
                  size="icon"
                  onClick={sendMessage}
                  disabled={!inputText.trim() || isStreaming}
                  data-testid="button-send"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="w-72 border-l border-border/50 flex flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-border/50">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Session Panel</h3>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {sessionData.customerName && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer</h4>
                  <p className="text-sm font-medium" data-testid="text-customer-name">{sessionData.customerName}</p>
                  {sessionData.equipmentType && (
                    <p className="text-xs text-muted-foreground">
                      {sessionData.make} {sessionData.model} {sessionData.equipmentType}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</h4>

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
                  disabled={isGeneratingReport || messages.length < 2}
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
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setShowReport(true)}
                      data-testid="button-view-report"
                    >
                      <Download className="w-3.5 h-3.5 mr-2" />
                      View Report
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-start"
                      onClick={copyShareLink}
                      data-testid="button-share"
                    >
                      <Share2 className="w-3.5 h-3.5 mr-2" />
                      Copy Share Link
                    </Button>
                  </>
                )}
              </div>

              {sessionData.files && sessionData.files.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uploaded Files</h4>
                  {sessionData.files.map((file: any) => (
                    <div key={file.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3 shrink-0" />
                      <span className="truncate">{file.fileName}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Session Notes</h4>
                <div className="bg-card/50 rounded-md p-2 text-xs text-muted-foreground space-y-1 border border-card-border">
                  <p>Status: {sessionData.status}</p>
                  {sessionData.visitType && <p>Type: {sessionData.visitType === "pro" ? "Pro Diagnostics" : sessionData.visitType === "emergency" ? "Emergency" : "Quick Advice"}</p>}
                  {sessionData.mechanicType && <p>Specialist: {currentMechanic?.title}</p>}
                  <p>Messages: {messages.length}</p>
                </div>
              </div>
            </div>
          </ScrollArea>

          <div className="p-3 border-t border-border/50">
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
              <p>AI guidance is informational only. Not a substitute for certified inspection.</p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent data-testid="modal-paywall">
          <DialogHeader>
            <DialogTitle>Pro Diagnostic Report</DialogTitle>
            <DialogDescription>
              Unlock the full diagnostic package for your equipment
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-card rounded-md border border-card-border p-4 space-y-3">
              <h4 className="text-sm font-semibold">What's included:</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  "Root-cause analysis matrix",
                  "Step-by-step diagnostic tree",
                  "Required tools list",
                  "Safety checklist",
                  "Labor estimate ranges",
                  "Complete parts list with alternatives",
                  "Technical SVG diagram",
                  "Downloadable PDF report",
                  "Shareable report link",
                ].map((item) => (
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="modal-report">
          <DialogHeader>
            <DialogTitle>
              {report?.reportType === "pro" ? "Pro Diagnostic Report" : "Quick Advice Report"}
            </DialogTitle>
            <DialogDescription>
              Generated for {sessionData.equipmentType || "your equipment"}
            </DialogDescription>
          </DialogHeader>
          {report && (
            <div className="space-y-4">
              {report.content && typeof report.content === "object" && (
                <div className="space-y-3 text-sm">
                  {(report.content as any).problemSummary && (
                    <div>
                      <h4 className="font-semibold mb-1">Problem Summary</h4>
                      <p className="text-muted-foreground">{(report.content as any).problemSummary}</p>
                    </div>
                  )}

                  {(report.content as any).likelyCauses && (
                    <div>
                      <h4 className="font-semibold mb-1">Likely Causes</h4>
                      <div className="space-y-1">
                        {((report.content as any).likelyCauses as any[]).map((cause: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{cause.confidence || "Medium"}</Badge>
                            <span className="text-muted-foreground">{cause.cause}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(report.content as any).rootCauseMatrix && (
                    <div>
                      <h4 className="font-semibold mb-1">Root Cause Matrix</h4>
                      <div className="space-y-1">
                        {((report.content as any).rootCauseMatrix as any[]).map((item: any, i: number) => (
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

                  {(report.content as any).safeChecks && (
                    <div>
                      <h4 className="font-semibold mb-1">Safe Checks</h4>
                      <ul className="space-y-1">
                        {((report.content as any).safeChecks as string[]).map((check: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-muted-foreground">
                            <ChevronRight className="w-3 h-3 shrink-0 mt-1 text-primary" />
                            {check}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(report.content as any).diagnosticTree && (
                    <div>
                      <h4 className="font-semibold mb-1">Diagnostic Steps</h4>
                      <div className="space-y-1">
                        {((report.content as any).diagnosticTree as any[]).map((step: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-muted-foreground text-xs">
                            <span className="font-mono text-primary font-semibold">{step.step}.</span>
                            <div>
                              <p>{step.action}</p>
                              {step.expectedResult && <p className="text-xs opacity-75">Expected: {step.expectedResult}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(report.content as any).partsList && (
                    <div>
                      <h4 className="font-semibold mb-1">Parts List</h4>
                      <div className="space-y-1">
                        {((report.content as any).partsList as any[]).map((part: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs bg-card/50 border border-card-border rounded-md px-2 py-1.5">
                            <span>{part.partName}</span>
                            <div className="flex items-center gap-2">
                              {part.partNumber && <span className="text-muted-foreground font-mono">{part.partNumber}</span>}
                              <Badge variant={part.verified ? "default" : "secondary"} className="text-xs">
                                {part.verified ? "Verified" : "Verify"}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(report.content as any).safetyWarnings && (
                    <div className="bg-destructive/5 border border-destructive/20 rounded-md p-3">
                      <h4 className="font-semibold mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                        Safety Warnings
                      </h4>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {((report.content as any).safetyWarnings as string[]).map((warning: string, i: number) => (
                          <li key={i}>- {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(report.content as any).whenToCallTech && (
                    <div>
                      <h4 className="font-semibold mb-1">When to Call a Technician</h4>
                      <p className="text-muted-foreground">{(report.content as any).whenToCallTech}</p>
                    </div>
                  )}

                  {(report.content as any).disclaimer && (
                    <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-2">
                      {(report.content as any).disclaimer}
                    </p>
                  )}
                </div>
              )}

              {report.svgDiagram && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Technical Diagram</h4>
                  <div
                    className="bg-card rounded-md border border-card-border p-2 overflow-x-auto"
                    dangerouslySetInnerHTML={{ __html: report.svgDiagram }}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                <Button variant="secondary" size="sm" onClick={copyShareLink} data-testid="button-share-report">
                  <Share2 className="w-3.5 h-3.5 mr-1.5" />
                  Share Report
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
