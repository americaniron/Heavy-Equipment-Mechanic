import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Lock, LayoutDashboard, Users, Eye, Mail, MessageCircle,
  Search, ChevronLeft, ArrowRight, Phone, Wrench, Zap,
  Anchor, Droplets, Cpu, Package, X, FileText, Clock,
  CheckCircle2, XCircle, Building2, MapPin, AlertTriangle
} from "lucide-react";
const logoPath = "/media/logo.png";

interface Visit {
  id: number;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  company: string | null;
  equipmentType: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  serialNumber: string | null;
  problemSummary: string | null;
  faultCodes: string | null;
  visitType: string | null;
  mechanicType: string | null;
  status: string;
  language: string | null;
  createdAt: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  hasReport: boolean;
}

interface Dashboard {
  totalVisits: number;
  completedVisits: number;
  activeVisits: number;
  uniqueCustomers: number;
  registeredCustomers: number;
  visitsByType: Record<string, number>;
  recentVisits: Visit[];
}

interface VisitDetail {
  session: any;
  messages: any[];
  report: any;
  visitLog: any;
}

const MECHANIC_ICONS: Record<string, any> = {
  heavy_equipment: Wrench,
  power_gen: Zap,
  marine: Anchor,
  hydraulics: Droplets,
  electrical: Cpu,
  parts: Package,
};

const MECHANIC_LABELS: Record<string, string> = {
  heavy_equipment: "Heavy Equipment",
  power_gen: "Power Generation",
  marine: "Marine",
  hydraulics: "Hydraulics",
  electrical: "Electrical",
  parts: "Parts",
};

export default function AdminPortal() {
  const { toast } = useToast();
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem("adminToken"));
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "visits" | "customers">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<VisitDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);

  const headers = useCallback(() => ({
    "Content-Type": "application/json",
    "x-admin-token": adminToken || "",
  }), [adminToken]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        toast({ title: "Invalid password", variant: "destructive" });
        return;
      }
      const data = await res.json();
      localStorage.setItem("adminToken", data.token);
      setAdminToken(data.token);
      setPassword("");
    } catch {
      toast({ title: "Login failed", variant: "destructive" });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("adminToken");
    setAdminToken(null);
    setDashboard(null);
    setVisits([]);
  };

  const loadDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard", { headers: headers() });
      if (res.status === 401) { logout(); return; }
      setDashboard(await res.json());
    } catch {
      toast({ title: "Failed to load dashboard", variant: "destructive" });
    }
  }, [headers]);

  const loadVisits = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/visits", { headers: headers() });
      if (res.status === 401) { logout(); return; }
      setVisits(await res.json());
    } catch {
      toast({ title: "Failed to load visits", variant: "destructive" });
    }
  }, [headers]);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/customers", { headers: headers() });
      if (res.status === 401) { logout(); return; }
      setCustomers(await res.json());
    } catch {
      toast({ title: "Failed to load customers", variant: "destructive" });
    }
  }, [headers]);

  const loadVisitDetail = async (visitId: number) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/visits/${visitId}`, { headers: headers() });
      if (!res.ok) throw new Error();
      setSelectedVisit(await res.json());
    } catch {
      toast({ title: "Failed to load visit details", variant: "destructive" });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!adminToken) return;
    loadDashboard();
    loadVisits();
    loadCustomers();
  }, [adminToken]);

  const filteredVisits = visits.filter(v => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (v.customerName?.toLowerCase().includes(q) ||
      v.customerEmail?.toLowerCase().includes(q) ||
      v.company?.toLowerCase().includes(q) ||
      v.equipmentType?.toLowerCase().includes(q) ||
      v.serialNumber?.toLowerCase().includes(q) ||
      v.problemSummary?.toLowerCase().includes(q));
  });

  if (!adminToken) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <img src={logoPath} alt="AMERICAN IRON" className="h-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white" data-testid="text-admin-title">ADMIN PORTAL</h1>
            <p className="text-gray-500 text-sm mt-1">Internal management access</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-2xl border border-white/10 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="w-4 h-4 text-[#FFCD11]" />
              <span className="text-white text-sm font-medium">Admin Password</span>
            </div>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
              data-testid="input-admin-password"
              className="bg-[#111] border-white/20 text-white mb-4"
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
            <Button
              onClick={handleLogin}
              disabled={isLoggingIn || !password}
              data-testid="button-admin-login"
              className="w-full bg-[#FFCD11] hover:bg-[#e6b800] text-black font-semibold"
            >
              {isLoggingIn ? "Signing in..." : "Sign In"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedVisit) {
    const s = selectedVisit.session;
    const report = selectedVisit.report;
    return (
      <div className="min-h-screen bg-[#111111] text-white">
        <div className="sticky top-0 z-10 bg-[#1a1a1a] border-b border-white/10 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Button variant="ghost" onClick={() => setSelectedVisit(null)} className="text-gray-400 hover:text-white" data-testid="button-back-to-list">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back to Visits
            </Button>
            <div className="flex gap-2">
              {s.customerEmail && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                  data-testid="button-email-customer"
                  onClick={() => window.open(`mailto:${s.customerEmail}?subject=Follow-up from AMERICAN IRON&body=Dear ${s.customerName || "Customer"},`)}
                >
                  <Mail className="w-4 h-4 mr-1" /> Email
                </Button>
              )}
              {s.customerPhone && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                  data-testid="button-whatsapp-customer"
                  onClick={() => {
                    const phone = s.customerPhone.replace(/\D/g, "");
                    window.open(`https://wa.me/${phone}?text=Hi ${s.customerName || ""}, this is AMERICAN IRON following up on your recent visit.`);
                  }}
                >
                  <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-5">
              <h3 className="text-[#FFCD11] font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <Users className="w-4 h-4" /> Customer Information
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Name</span><span data-testid="text-detail-name">{s.customerName || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Email</span><span data-testid="text-detail-email">{s.customerEmail || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Phone</span><span data-testid="text-detail-phone">{s.customerPhone || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Company</span><span data-testid="text-detail-company">{s.company || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Location</span><span>{s.location || "—"}</span></div>
              </div>
            </div>

            <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-5">
              <h3 className="text-[#FFCD11] font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <Wrench className="w-4 h-4" /> Machine Information
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Type</span><span data-testid="text-detail-equipment">{s.equipmentType || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Make / Model</span><span>{[s.make, s.model].filter(Boolean).join(" ") || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Year</span><span>{s.year || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Serial #</span><span className="font-mono text-xs">{s.serialNumber || "—"}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">SMU Hours</span><span>{s.smuHours || "—"}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-5">
            <h3 className="text-[#FFCD11] font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Visit Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div><span className="text-gray-400 block mb-1">Problem Summary</span><p data-testid="text-detail-problem">{s.problemSummary || "—"}</p></div>
              <div><span className="text-gray-400 block mb-1">Fault Codes</span><p className="font-mono">{s.faultCodes || "None"}</p></div>
              <div><span className="text-gray-400 block mb-1">Issue Started</span><p>{s.issueStarted || "—"}</p></div>
            </div>
            <div className="flex gap-3 mt-4">
              <Badge className={s.visitType === "pro" ? "bg-purple-500/20 text-purple-300" : s.visitType === "emergency" ? "bg-red-500/20 text-red-300" : "bg-blue-500/20 text-blue-300"}>
                {s.visitType || "quick_advice"}
              </Badge>
              <Badge className="bg-[#FFCD11]/20 text-[#FFCD11]">{MECHANIC_LABELS[s.mechanicType] || s.mechanicType || "Admin"}</Badge>
              <Badge className={s.status === "completed" ? "bg-green-500/20 text-green-300" : "bg-yellow-500/20 text-yellow-300"}>{s.status}</Badge>
            </div>
          </div>

          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-5">
            <h3 className="text-[#FFCD11] font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> Conversation Log ({selectedVisit.messages.length} messages)
            </h3>
            <div className="max-h-80 overflow-y-auto space-y-3">
              {selectedVisit.messages.map((msg: any, i: number) => (
                <div key={i} className={`p-3 rounded-lg text-sm ${msg.role === "user" ? "bg-blue-500/10 border border-blue-500/20 ml-8" : "bg-white/5 border border-white/10 mr-8"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">{msg.role === "user" ? "Customer" : msg.agentType === "mechanic" ? "Mechanic" : "Admin"}</Badge>
                    <span className="text-gray-500 text-xs">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-gray-300 whitespace-pre-wrap">{msg.content.replace(/<INTAKE_JSON>[\s\S]*?<\/INTAKE_JSON>/g, "").replace(/<VERIFY_REQUEST>[\s\S]*?<\/VERIFY_REQUEST>/g, "").replace(/<VERIFY_CODE>[\s\S]*?<\/VERIFY_CODE>/g, "").trim()}</p>
                </div>
              ))}
              {selectedVisit.messages.length === 0 && <p className="text-gray-500 text-center py-4">No messages recorded</p>}
            </div>
          </div>

          {report && (
            <div className="bg-[#1a1a1a] rounded-xl border border-[#FFCD11]/20 p-5">
              <h3 className="text-[#FFCD11] font-semibold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Diagnostic Report
              </h3>
              <div className="text-sm text-gray-300">
                <p className="mb-2"><strong className="text-white">Type:</strong> {report.reportType}</p>
                {report.shareToken && (
                  <p className="mb-2"><strong className="text-white">Share Link:</strong> <a href={`/api/shared/${report.shareToken}`} className="text-blue-400 underline" target="_blank">{report.shareToken}</a></p>
                )}
                <pre className="mt-3 bg-[#111] p-4 rounded-lg overflow-x-auto text-xs max-h-60 overflow-y-auto">
                  {JSON.stringify(report.content, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111111] text-white">
      <div className="sticky top-0 z-10 bg-[#1a1a1a] border-b border-white/10 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoPath} alt="AMERICAN IRON" className="h-8" />
            <span className="text-[#FFCD11] font-bold text-sm tracking-wider">ADMIN PORTAL</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" onClick={() => window.location.href = "/"} data-testid="button-back-to-app">
              Back to App
            </Button>
            <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300" onClick={logout} data-testid="button-admin-logout">
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex gap-2 mb-6">
          {[
            { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
            { key: "visits" as const, label: "All Visits", icon: Eye },
            { key: "customers" as const, label: "Customers", icon: Users },
          ].map(tab => (
            <Button
              key={tab.key}
              variant={activeTab === tab.key ? "default" : "outline"}
              size="sm"
              data-testid={`button-tab-${tab.key}`}
              className={activeTab === tab.key ? "bg-[#FFCD11] text-black hover:bg-[#e6b800]" : "border-white/20 text-gray-400 hover:text-white"}
              onClick={() => {
                setActiveTab(tab.key);
                if (tab.key === "visits") loadVisits();
                if (tab.key === "customers") loadCustomers();
                if (tab.key === "dashboard") loadDashboard();
              }}
            >
              <tab.icon className="w-4 h-4 mr-1" /> {tab.label}
            </Button>
          ))}
        </div>

        {activeTab === "dashboard" && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Visits", value: dashboard.totalVisits, color: "text-white" },
                { label: "Completed", value: dashboard.completedVisits, color: "text-green-400" },
                { label: "Active", value: dashboard.activeVisits, color: "text-yellow-400" },
                { label: "Unique Customers", value: dashboard.uniqueCustomers, color: "text-blue-400" },
              ].map((stat, i) => (
                <div key={i} className="bg-[#1a1a1a] rounded-xl border border-white/10 p-5 text-center" data-testid={`stat-${stat.label.toLowerCase().replace(/ /g, "-")}`}>
                  <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-gray-500 text-xs mt-1 uppercase tracking-wider">{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#1a1a1a] rounded-xl border border-white/10 p-5">
              <h3 className="text-[#FFCD11] font-semibold text-sm uppercase tracking-wider mb-4">Visits by Specialty</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(dashboard.visitsByType).map(([type, count]) => {
                  const Icon = MECHANIC_ICONS[type] || Wrench;
                  return (
                    <div key={type} className="flex items-center gap-3 bg-[#111] rounded-lg p-3">
                      <Icon className="w-5 h-5 text-[#FFCD11]" />
                      <div>
                        <p className="text-white text-sm font-medium">{MECHANIC_LABELS[type] || type}</p>
                        <p className="text-gray-500 text-xs">{count} visits</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === "visits" && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Search by name, email, company, equipment, serial number..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                data-testid="input-visit-search"
                className="pl-10 bg-[#1a1a1a] border-white/10 text-white"
              />
            </div>

            <div className="space-y-2">
              {filteredVisits.map(visit => {
                const Icon = MECHANIC_ICONS[visit.mechanicType || ""] || Wrench;
                return (
                  <div
                    key={visit.id}
                    className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4 hover:border-[#FFCD11]/30 cursor-pointer transition-all"
                    data-testid={`card-visit-${visit.id}`}
                    onClick={() => loadVisitDetail(visit.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#FFCD11]/10 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-[#FFCD11]" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm" data-testid={`text-visit-name-${visit.id}`}>
                            {visit.customerName || "Anonymous"}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {visit.customerEmail || "No email"} {visit.company ? `• ${visit.company}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {visit.emailVerified && <CheckCircle2 className="w-4 h-4 text-green-400" title="Email verified" />}
                        {visit.hasReport && <FileText className="w-4 h-4 text-blue-400" title="Has report" />}
                        <Badge className={visit.status === "completed" ? "bg-green-500/20 text-green-300 text-xs" : "bg-yellow-500/20 text-yellow-300 text-xs"}>
                          {visit.status}
                        </Badge>
                        <span className="text-gray-600 text-xs">{new Date(visit.createdAt).toLocaleDateString()}</span>
                        <ArrowRight className="w-4 h-4 text-gray-600" />
                      </div>
                    </div>
                    {visit.problemSummary && (
                      <p className="text-gray-400 text-xs mt-2 ml-13 truncate">{visit.problemSummary}</p>
                    )}
                    <div className="flex gap-2 mt-2 ml-13">
                      {visit.equipmentType && <Badge variant="outline" className="text-xs border-white/10 text-gray-400">{visit.equipmentType}</Badge>}
                      {visit.make && <Badge variant="outline" className="text-xs border-white/10 text-gray-400">{visit.make} {visit.model}</Badge>}
                      {visit.visitType && <Badge variant="outline" className="text-xs border-white/10 text-gray-400">{visit.visitType}</Badge>}
                    </div>
                  </div>
                );
              })}
              {filteredVisits.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Eye className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>{searchQuery ? "No visits match your search" : "No visits recorded yet"}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "customers" && (
          <div className="space-y-2">
            {customers.map((c: any) => (
              <div key={c.id} className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4" data-testid={`card-customer-${c.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium text-sm">{c.firstName} {c.lastName}</p>
                      <p className="text-gray-500 text-xs">{c.email} {c.company ? `• ${c.company}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.email && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-400 hover:text-blue-300 h-8"
                        data-testid={`button-email-${c.id}`}
                        onClick={() => window.open(`mailto:${c.email}?subject=Follow-up from AMERICAN IRON`)}
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                    )}
                    {c.phone && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-green-400 hover:text-green-300 h-8"
                        data-testid={`button-whatsapp-${c.id}`}
                        onClick={() => {
                          const phone = c.phone.replace(/\D/g, "");
                          window.open(`https://wa.me/${phone}?text=Hi ${c.firstName}, this is AMERICAN IRON.`);
                        }}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Badge className={c.status === "active" ? "bg-green-500/20 text-green-300 text-xs" : "bg-gray-500/20 text-gray-300 text-xs"}>
                      {c.status}
                    </Badge>
                    <span className="text-gray-600 text-xs">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
            {customers.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No registered customers yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === "dashboard" && !dashboard && (
          <div className="text-center py-12 text-gray-500">Loading dashboard...</div>
        )}
      </div>
    </div>
  );
}
