import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  apiErrorMessage,
  apiFetch,
  downloadAuthenticatedFile,
  expectJson,
  trustedExternalUrl,
} from "@/lib/api";
import {
  LayoutDashboard, Truck, Search, Wrench, CalendarClock, Package, FileText,
  DollarSign, Headphones, Settings, Bot, Stethoscope, BookOpen, AlertTriangle,
  ShoppingCart, ClipboardList, TrendingUp, History, Video, PhoneCall,
  Menu, X, LogOut, Plus, ChevronRight, Loader2, Eye, Trash2, Edit,
  Activity, Bell, Clock, CheckCircle2, XCircle, ArrowRight, Download, RefreshCw
} from "lucide-react";
const logoImg = "/media/logo.png";
const QUOTE_DRAFT_KEY = "fixmyiron:quote-draft";

type SectionId =
  | "dashboard" | "equipment" | "parts" | "purchase-parts" | "service" | "maintenance"
  | "orders" | "documents" | "billing" | "support" | "admin"
  | "ai-intake" | "ai-diagnosis" | "ai-troubleshooting" | "ai-faultcodes"
  | "ai-parts" | "ai-planning" | "ai-predictive" | "ai-history"
  | "ai-live" | "ai-escalation";

interface NavItem {
  id: SectionId;
  label: string;
  icon: any;
}

const portalNav: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "equipment", label: "My Equipment", icon: Truck },
  { id: "parts", label: "Parts", icon: Search },
  { id: "purchase-parts", label: "Purchase Parts", icon: ShoppingCart },
  { id: "service", label: "Service", icon: Wrench },
  { id: "maintenance", label: "Maintenance", icon: CalendarClock },
  { id: "orders", label: "Orders & Shipping", icon: Package },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "billing", label: "Billing & Account", icon: DollarSign },
  { id: "support", label: "Support Center", icon: Headphones },
  { id: "admin", label: "Account Settings", icon: Settings },
];

const aiNav: NavItem[] = [
  { id: "ai-intake", label: "AI Intake / Triage", icon: Bot },
  { id: "ai-diagnosis", label: "Diagnosis Engine", icon: Stethoscope },
  { id: "ai-troubleshooting", label: "Guided Troubleshooting", icon: BookOpen },
  { id: "ai-faultcodes", label: "Fault Code Center", icon: AlertTriangle },
  { id: "ai-parts", label: "Recommended Parts", icon: ShoppingCart },
  { id: "ai-planning", label: "Repair Planning", icon: ClipboardList },
  { id: "ai-predictive", label: "Predictive Maintenance", icon: TrendingUp },
  { id: "ai-history", label: "Case History", icon: History },
  { id: "ai-live", label: "Live AI Mechanic", icon: Video },
  { id: "ai-escalation", label: "Escalation to Human Expert", icon: PhoneCall },
];

const sectionTitles: Record<SectionId, string> = {
  dashboard: "Dashboard",
  equipment: "My Equipment",
  parts: "Parts Lookup",
  "purchase-parts": "Purchase Parts",
  service: "Service Requests",
  maintenance: "Maintenance Schedules",
  orders: "Orders & Shipping",
  documents: "Documents",
  billing: "Billing & Account",
  support: "Support Center",
  admin: "Account Settings",
  "ai-intake": "AI Intake / Triage",
  "ai-diagnosis": "Diagnosis Engine",
  "ai-troubleshooting": "Guided Troubleshooting",
  "ai-faultcodes": "Fault Code Center",
  "ai-parts": "Recommended Parts",
  "ai-planning": "Repair Planning",
  "ai-predictive": "Predictive Maintenance",
  "ai-history": "Case History",
  "ai-live": "Live AI Mechanic",
  "ai-escalation": "Escalation to Human Expert",
};

function isSectionId(value: string): value is SectionId {
  return Object.prototype.hasOwnProperty.call(sectionTitles, value);
}

function useAuthFetch(url: string, authToken: string | null, enabled = true) {
  return useQuery({
    queryKey: [url],
    queryFn: async () => {
      const res = await apiFetch(url, {}, { authenticated: true, token: authToken });
      return expectJson<any>(res, "Could not load this section");
    },
    enabled: enabled && !!authToken,
  });
}

function useAuthMutation(method: string, url: string, authToken: string | null, invalidateKeys: string[]) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }, { authenticated: true, token: authToken });
      return expectJson<any>(res, "Request failed");
    },
    onSuccess: () => {
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

function SectionError({
  error,
  retry,
  message = "This section could not be loaded.",
}: {
  error: unknown;
  retry: () => void;
  message?: string;
}) {
  return (
    <Card className="bg-[#1a1a1a] border-red-800" role="alert" data-testid="section-error">
      <CardContent className="p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
        <p className="text-white font-semibold">{message}</p>
        <p className="text-gray-400 text-sm mt-1">
          {error instanceof Error ? error.message : "Please try again."}
        </p>
        <Button className="mt-4 bg-[#FFCD11] text-black" onClick={retry} data-testid="button-retry-section">
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </CardContent>
    </Card>
  );
}

function parseDelimitedRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function DiagnosisPlaybook({ data }: { data: any }) {
  const playbook = data?.playbook;
  if (!playbook) {
    return data?.reply ? <p className="text-gray-300 whitespace-pre-wrap">{data.reply}</p> : null;
  }

  return (
    <div className="space-y-4 text-sm" data-testid="diagnosis-result">
      {Array.isArray(playbook.safety_warnings) && playbook.safety_warnings.length > 0 && (
        <div className="rounded border border-red-800 bg-red-950/30 p-3">
          <p className="font-semibold text-red-300">Safety warnings</p>
          <ul className="mt-1 list-disc pl-5 text-red-200">
            {playbook.safety_warnings.map((warning: string, index: number) => <li key={index}>{warning}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(playbook.possible_causes) && (
        <div>
          <h4 className="font-semibold text-white">Possible causes</h4>
          <div className="mt-2 space-y-2">
            {playbook.possible_causes.map((cause: any, index: number) => (
              <div key={index} className="rounded bg-[#222] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{cause.cause}</span>
                  <Badge variant="secondary" className="text-xs">{cause.likelihood}</Badge>
                </div>
                <p className="mt-1 text-gray-400">{cause.reasoning}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {Array.isArray(playbook.tests_in_order) && (
        <div>
          <h4 className="font-semibold text-white">Tests in order</h4>
          <ol className="mt-2 space-y-2">
            {playbook.tests_in_order.map((test: any, index: number) => (
              <li key={index} className="rounded bg-[#222] p-3 text-gray-300">
                <span className="font-medium text-white">{index + 1}. {test.test}</span>
                {Array.isArray(test.tools) && test.tools.length > 0 && <p className="text-gray-500">Tools: {test.tools.join(", ")}</p>}
                {test.expected_reading_pass && <p className="text-green-400">Pass: {test.expected_reading_pass}</p>}
                {test.expected_reading_fail && <p className="text-red-400">Fail: {test.expected_reading_fail}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}
      {playbook.expected_readings && typeof playbook.expected_readings === "object" && Object.keys(playbook.expected_readings).length > 0 && (
        <div>
          <h4 className="font-semibold text-white">Reference readings</h4>
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(playbook.expected_readings).map(([label, value]) => (
              <div key={label} className="rounded bg-[#222] p-3">
                <dt className="text-gray-500">{label}</dt>
                <dd className="text-gray-200">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {Array.isArray(playbook.parts_likely_needed) && playbook.parts_likely_needed.length > 0 && (
        <div>
          <h4 className="font-semibold text-white">Parts likely needed</h4>
          <div className="mt-2 space-y-2">
            {playbook.parts_likely_needed.map((part: any, index: number) => (
              <div key={index} className="rounded bg-[#222] p-3 text-gray-300">
                <span className="font-mono text-[#FFCD11]">{part.part_number || "Part number TBD"}</span>
                <span> — {part.description}</span>
                {part.why && <p className="mt-1 text-gray-500">{part.why}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSection({ authToken }: { authToken: string | null }) {
  const { data, isLoading, error, refetch } = useAuthFetch("/api/portal/dashboard", authToken);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="bg-[#1a1a1a] border-[#333]">
              <CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Dashboard data could not be loaded." />;

  const stats = data || { equipmentCount: 0, openServiceRequests: 0, pendingInvoices: 0, openTickets: 0, recentServiceRequests: [] };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-gray-400 text-sm">Equipment</p>
                <p className="text-3xl font-bold text-white" data-testid="stat-equipment-count">{stats.equipmentCount}</p>
              </div>
              <Truck className="h-8 w-8 text-[#FFCD11]" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-gray-400 text-sm">Open Cases</p>
                <p className="text-3xl font-bold text-white" data-testid="stat-open-cases">{stats.openServiceRequests}</p>
              </div>
              <Wrench className="h-8 w-8 text-[#FFCD11]" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-gray-400 text-sm">Pending Invoices</p>
                <p className="text-3xl font-bold text-white" data-testid="stat-pending-invoices">{stats.pendingInvoices}</p>
              </div>
              <DollarSign className="h-8 w-8 text-[#FFCD11]" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-gray-400 text-sm">Open Tickets</p>
                <p className="text-3xl font-bold text-white" data-testid="stat-alerts">{stats.openTickets}</p>
              </div>
              <Bell className="h-8 w-8 text-[#FFCD11]" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-white">Recent Activity</CardTitle>
          <Activity className="h-5 w-5 text-[#FFCD11]" />
        </CardHeader>
        <CardContent>
          {stats.recentServiceRequests && stats.recentServiceRequests.length > 0 ? (
            <div className="space-y-3">
              {stats.recentServiceRequests.map((item: any, i: number) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-md bg-[#222]" data-testid={`activity-item-${i}`}>
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{item.message || item.title}</p>
                    <p className="text-gray-500 text-xs">{item.date || item.createdAt}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8" data-testid="text-no-activity">No recent activity. Start by adding equipment or creating a service request.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EquipmentSection({ authToken }: { authToken: string | null }) {
  const { data: equipmentList, isLoading, error, refetch } = useAuthFetch("/api/portal/equipment", authToken);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", type: "", make: "", model: "", year: "", serialNumber: "", smuHours: "", warrantyExpiry: "", notes: "" });
  const { toast } = useToast();

  const createMutation = useAuthMutation("POST", "/api/portal/equipment", authToken, ["/api/portal/equipment", "/api/portal/dashboard"]);
  const updateMutation = useAuthMutation("PUT", `/api/portal/equipment/${editingId}`, authToken, ["/api/portal/equipment", "/api/portal/dashboard"]);
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/portal/equipment/${id}`, {
        method: "DELETE",
      }, { authenticated: true, token: authToken });
      return expectJson(res, "Equipment could not be deleted");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/dashboard"] });
      setDeleteTarget(null);
      toast({ title: "Equipment deleted" });
    },
    onError: (deleteError: Error) => {
      toast({ title: "Delete failed", description: deleteError.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setForm({ name: "", type: "", make: "", model: "", year: "", serialNumber: "", smuHours: "", warrantyExpiry: "", notes: "" });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async () => {
    if (!form.name) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    try {
      if (editingId) {
        await updateMutation.mutateAsync(form);
        toast({ title: "Equipment updated" });
      } else {
        await createMutation.mutateAsync(form);
        toast({ title: "Equipment added" });
      }
      resetForm();
    } catch {
      // useAuthMutation displays the server-provided error.
    }
  };

  const startEdit = (eq: any) => {
    setForm({
      name: eq.name || "", type: eq.type || "", make: eq.make || "", model: eq.model || "",
      year: eq.year || "", serialNumber: eq.serialNumber || "", smuHours: eq.smuHours || "",
      warrantyExpiry: eq.warrantyExpiry || "", notes: eq.notes || "",
    });
    setEditingId(eq.id);
    setShowForm(true);
  };

  if (isLoading) {
    return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  }
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Equipment could not be loaded." />;

  const items = equipmentList || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-gray-400">{items.length} machine{items.length !== 1 ? "s" : ""} registered</p>
        <Button className="bg-[#FFCD11] text-black" onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-equipment">
          <Plus className="h-4 w-4 mr-1" /> Add Equipment
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg">{editingId ? "Edit Equipment" : "Add Equipment"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(["name", "type", "make", "model", "year", "serialNumber", "smuHours", "warrantyExpiry"] as const).map(field => (
                <div key={field}>
                  <Label htmlFor={`equipment-${field}`} className="text-gray-300 text-sm capitalize">{field.replace(/([A-Z])/g, " $1")}</Label>
                  <Input
                    id={`equipment-${field}`}
                    type={field === "warrantyExpiry" ? "date" : field === "year" || field === "smuHours" ? "number" : "text"}
                    required={field === "name"}
                    value={form[field]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    className="bg-[#222] border-[#444] text-white mt-1"
                    placeholder={field}
                    data-testid={`input-equipment-${field}`}
                  />
                </div>
              ))}
            </div>
            <div>
              <Label htmlFor="equipment-notes" className="text-gray-300 text-sm">Notes</Label>
              <Textarea
                id="equipment-notes"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="bg-[#222] border-[#444] text-white mt-1"
                data-testid="input-equipment-notes"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button className="bg-[#FFCD11] text-black" onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-equipment">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editingId ? "Update" : "Save"}
              </Button>
              <Button variant="outline" className="border-[#444] text-gray-300" onClick={resetForm} data-testid="button-cancel-equipment">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-8 text-center">
            <Truck className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400" data-testid="text-no-equipment">No equipment registered yet. Add your first machine to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((eq: any) => (
            <Card key={eq.id} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-equipment-${eq.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{eq.name}</p>
                    <p className="text-gray-400 text-sm">
                      {[eq.make, eq.model, eq.year].filter(Boolean).join(" · ") || "No details"}
                      {eq.serialNumber && <span> · S/N: {eq.serialNumber}</span>}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Badge className="text-xs" variant="secondary">{eq.status || "active"}</Badge>
                    <Button size="icon" variant="ghost" aria-label={`Edit ${eq.name}`} onClick={() => startEdit(eq)} data-testid={`button-edit-equipment-${eq.id}`}><Edit className="h-4 w-4 text-gray-400" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${eq.name}`} onClick={() => setDeleteTarget(eq)} data-testid={`button-delete-equipment-${eq.id}`}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="bg-[#1a1a1a] border-[#444] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete equipment?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              {deleteTarget?.name || "This machine"} will be removed from your portal. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#444] bg-transparent text-gray-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget?.id) deleteMutation.mutate(deleteTarget.id);
              }}
              data-testid="button-confirm-delete-equipment"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PartsSection({ authToken }: { authToken: string | null }) {
  const [serial, setSerial] = useState("");
  const [searchTriggered, setSearchTriggered] = useState(false);
  const { data, isLoading, error, refetch } = useAuthFetch(`/api/portal/parts?serial=${encodeURIComponent(serial)}`, authToken, searchTriggered && !!serial);

  const handleSearch = () => {
    if (serial.trim()) {
      setSearchTriggered(true);
      queryClient.invalidateQueries({ queryKey: [`/api/portal/parts?serial=${encodeURIComponent(serial)}`] });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2">
          <CardTitle className="text-white">Serial-Based Parts Lookup</CardTitle>
          <CardDescription className="text-gray-400">Enter a serial number or prefix to find compatible parts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Input
              aria-label="Equipment serial number or prefix"
              value={serial}
              onChange={e => { setSerial(e.target.value); setSearchTriggered(false); }}
              className="bg-[#222] border-[#444] text-white flex-1 min-w-[200px]"
              placeholder="Enter serial number..."
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              data-testid="input-parts-serial"
            />
            <Button className="bg-[#FFCD11] text-black" onClick={handleSearch} data-testid="button-search-parts">
              <Search className="h-4 w-4 mr-1" /> Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-[#FFCD11]" /></div>}
      {error && <SectionError error={error} retry={() => { void refetch(); }} message="Parts search failed." />}

      {searchTriggered && !isLoading && !error && data && (
        <div className="space-y-2">
          {(Array.isArray(data) ? data : []).length > 0 ? (
            (data as any[]).map((part: any, i: number) => (
              <Card key={i} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-part-${i}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold font-mono">{part.partNumber}</p>
                        {part.category && <Badge variant="outline" className="border-[#555] text-gray-300 text-xs">{part.category}</Badge>}
                      </div>
                      <p className="text-[#FFCD11] text-sm font-medium mt-1">{part.name}</p>
                      <p className="text-gray-400 text-sm">{part.description || "No description"}</p>
                      {part.compatibility && <p className="text-green-400 text-xs mt-1">{part.compatibility}</p>}
                    </div>
                    {part.price && (
                      <Badge className="bg-[#FFCD11] text-black text-sm px-3">
                        {String(part.price).startsWith("$") ? part.price : `$${part.price}`}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="bg-[#1a1a1a] border-[#333]">
              <CardContent className="p-8 text-center">
                <p className="text-gray-400" data-testid="text-no-parts">No parts found for this serial number. Try a different search.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!searchTriggered && !isLoading && (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-8 text-center">
            <Search className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400" data-testid="text-parts-prompt">Enter a serial number above to search for compatible parts.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PurchasePartsSection({ authToken }: { authToken: string | null }) {
  const {
    data: quoteRequests,
    isLoading: quotesLoading,
    error: quotesError,
    refetch: refetchQuotes,
  } = useAuthFetch("/api/portal/quote-requests", authToken);
  const { data: equipmentList, error: equipmentError, refetch: refetchEquipment } = useAuthFetch("/api/portal/equipment", authToken);
  const [showForm, setShowForm] = useState(false);
  const [viewingQuote, setViewingQuote] = useState<number | null>(null);
  const [items, setItems] = useState<Array<{ partNumber: string; description: string; quantity: number; make: string; model: string; serialNumber: string; urgency: string }>>([
    { partNumber: "", description: "", quantity: 1, make: "", model: "", serialNumber: "", urgency: "standard" },
  ]);
  const [notes, setNotes] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [equipmentInfo, setEquipmentInfo] = useState("");
  const [csvParsing, setCsvParsing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const rawDraft = sessionStorage.getItem(QUOTE_DRAFT_KEY);
    if (!rawDraft) return;
    sessionStorage.removeItem(QUOTE_DRAFT_KEY);
    try {
      const draft = JSON.parse(rawDraft) as Array<{ partNumber?: string; description?: string; quantity?: number }>;
      const imported = draft
        .filter((item) => item.partNumber)
        .map((item) => ({
          partNumber: item.partNumber || "",
          description: item.description || "",
          quantity: Math.max(1, item.quantity || 1),
          make: "",
          model: "",
          serialNumber: "",
          urgency: "standard",
        }));
      if (imported.length > 0) {
        setItems(imported);
        setShowForm(true);
        toast({ title: `${imported.length} recommended part${imported.length === 1 ? "" : "s"} added to your quote draft` });
      }
    } catch {
      toast({ title: "The recommended-parts draft could not be opened", variant: "destructive" });
    }
  }, [toast]);

  const { data: quoteDetail, isLoading: detailLoading, error: detailError, refetch: refetchDetail } = useAuthFetch(
    viewingQuote ? `/api/portal/quote-requests/${viewingQuote}` : "",
    authToken,
    !!viewingQuote
  );

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiFetch("/api/portal/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }, { authenticated: true, token: authToken });
      return expectJson<any>(res, "Quote request could not be submitted");
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/dashboard"] });
      toast({ title: "Quote Request Submitted", description: `Reference: ${data.quoteRequest.referenceNumber}. You'll receive an email confirmation shortly.` });
      setShowForm(false);
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setItems([{ partNumber: "", description: "", quantity: 1, make: "", model: "", serialNumber: "", urgency: "standard" }]);
    setNotes("");
    setEquipmentId("");
    setEquipmentInfo("");
  };

  const addItem = () => {
    setItems([...items, { partNumber: "", description: "", quantity: 1, make: "", model: "", serialNumber: "", urgency: "standard" }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    (updated[index] as any)[field] = value;
    setItems(updated);
  };

  const parseRows = (header: string[], rows: string[][]): Array<{ partNumber: string; description: string; quantity: number; make: string; model: string; serialNumber: string; urgency: string }> => {
    const lowerHeader = header.map(h => h.toLowerCase().trim().replace(/"/g, ""));
    const partIdx = lowerHeader.findIndex(h => h.includes("part") && (h.includes("number") || h.includes("num") || h.includes("#") || h === "part"));
    const descIdx = lowerHeader.findIndex(h => h.includes("desc"));
    const qtyIdx = lowerHeader.findIndex(h => h.includes("qty") || h.includes("quantity") || h.includes("count"));
    const makeIdx = lowerHeader.findIndex(h => h.includes("make") || h.includes("brand") || h.includes("manufacturer"));
    const modelIdx = lowerHeader.findIndex(h => h.includes("model"));
    const serialIdx = lowerHeader.findIndex(h => h.includes("serial"));
    const urgencyIdx = lowerHeader.findIndex(h => h.includes("urgency") || h.includes("priority"));

    if (partIdx === -1) {
      toast({ title: "Missing column", description: "File must have a 'Part Number' column", variant: "destructive" });
      return [];
    }

    return rows.map(cols => ({
      partNumber: (cols[partIdx] || "").trim(),
      description: descIdx >= 0 ? (cols[descIdx] || "").trim() : "",
      quantity: qtyIdx >= 0 ? Math.max(1, parseInt(cols[qtyIdx]) || 1) : 1,
      make: makeIdx >= 0 ? (cols[makeIdx] || "").trim() : "",
      model: modelIdx >= 0 ? (cols[modelIdx] || "").trim() : "",
      serialNumber: serialIdx >= 0 ? (cols[serialIdx] || "").trim() : "",
      urgency: urgencyIdx >= 0 && ["standard", "urgent", "emergency"].includes((cols[urgencyIdx] || "").trim().toLowerCase())
        ? (cols[urgencyIdx] || "").trim().toLowerCase()
        : "standard",
    })).filter(item => item.partNumber.length > 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();
    const validExts = ["csv", "txt", "xlsx"];
    if (!ext || !validExts.includes(ext)) {
      toast({ title: "Invalid file type", description: "Please upload a CSV, TXT, or XLSX file", variant: "destructive" });
      e.target.value = "";
      return;
    }

    setCsvParsing(true);

    try {
      if (ext === "xlsx") {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const ExcelJS = await import("exceljs");
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(arrayBuffer);
          const sheet = workbook.worksheets[0];
          const numCols = sheet.columnCount;
          const jsonData: string[][] = [];
          sheet.eachRow({ includeEmpty: false }, (row) => {
            const rowData: string[] = [];
            for (let c = 1; c <= numCols; c++) {
              const cell = row.getCell(c);
              const val = cell.value;
              if (val === null || val === undefined) {
                rowData.push("");
              } else if (typeof val === "object") {
                if ("text" in (val as any)) rowData.push(String((val as any).text));
                else if ("result" in (val as any)) rowData.push(String((val as any).result ?? ""));
                else rowData.push(String(val));
              } else {
                rowData.push(String(val));
              }
            }
            jsonData.push(rowData);
          });

          if (jsonData.length < 2) {
            toast({ title: "Empty spreadsheet", description: "File must have a header row and at least one data row", variant: "destructive" });
            setCsvParsing(false);
            return;
          }

          const header = jsonData[0].map(String);
          const rows = jsonData.slice(1).map(row => row.map(String));
          const parsed = parseRows(header, rows);

          if (parsed.length === 0) {
            toast({ title: "No valid rows", description: "No rows with valid part numbers found", variant: "destructive" });
            setCsvParsing(false);
            return;
          }

          setItems(parsed);
          toast({ title: `${parsed.length} parts imported from ${file.name}`, description: "Review the items below before submitting" });
        } catch {
          toast({ title: "Parse Error", description: "Could not parse the Excel file", variant: "destructive" });
        }
        setCsvParsing(false);
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const text = event.target?.result as string;
            const parsedRows = parseDelimitedRows(text);

            if (parsedRows.length < 2) {
              toast({ title: "Invalid CSV", description: "File must have a header row and at least one data row", variant: "destructive" });
              setCsvParsing(false);
              return;
            }

            const header = parsedRows[0];
            const rows = parsedRows.slice(1);
            const parsed = parseRows(header, rows);

            if (parsed.length === 0) {
              toast({ title: "No valid rows", description: "No rows with valid part numbers found", variant: "destructive" });
              setCsvParsing(false);
              return;
            }

            setItems(parsed);
            toast({ title: `${parsed.length} parts imported`, description: "Review the items below before submitting" });
          } catch {
            toast({ title: "Parse Error", description: "Could not parse the CSV file", variant: "destructive" });
          }
          setCsvParsing(false);
        };
        reader.readAsText(file);
      }
    } catch {
      toast({ title: "File Error", description: "Could not read the file", variant: "destructive" });
      setCsvParsing(false);
    }
    e.target.value = "";
  };

  const handleSubmit = () => {
    const validItems = items.filter(i => i.partNumber.trim().length >= 2);
    if (validItems.length === 0) {
      toast({ title: "No valid parts", description: "Add at least one part with a valid part number", variant: "destructive" });
      return;
    }
    submitMutation.mutate({
      items: validItems.map(i => ({ ...i, quantity: Math.max(1, i.quantity) })),
      notes: notes || undefined,
      equipmentId: equipmentId && equipmentId !== "none" ? equipmentId : undefined,
      equipmentInfo: equipmentInfo || undefined,
    });
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string }> = {
      pending_review: { label: "Pending Review", className: "bg-yellow-600 text-white" },
      reviewing: { label: "Under Review", className: "bg-blue-600 text-white" },
      quoted: { label: "Quoted", className: "bg-green-600 text-white" },
      rejected: { label: "Rejected", className: "bg-red-600 text-white" },
      completed: { label: "Completed", className: "bg-gray-600 text-white" },
    };
    const s = map[status] || { label: status, className: "bg-gray-600 text-white" };
    return <Badge className={s.className}>{s.label}</Badge>;
  };

  if (viewingQuote && detailLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#FFCD11]" /></div>;
  }
  if (viewingQuote && detailError) {
    return (
      <div className="space-y-4">
        <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => setViewingQuote(null)}>
          <ArrowRight className="h-4 w-4 mr-1 rotate-180" /> Back to Quote Requests
        </Button>
        <SectionError error={detailError} retry={() => { void refetchDetail(); }} message="Quote details could not be loaded." />
      </div>
    );
  }
  if (viewingQuote && quoteDetail) {
    return (
      <div className="space-y-4">
        <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => { setViewingQuote(null); queryClient.removeQueries({ queryKey: [`/api/portal/quote-requests/${viewingQuote}`] }); }} data-testid="button-back-quotes">
          <ArrowRight className="h-4 w-4 mr-1 rotate-180" /> Back to Quote Requests
        </Button>

        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="text-white" data-testid="text-quote-ref">{quoteDetail.referenceNumber}</CardTitle>
                <CardDescription className="text-gray-400">
                  Submitted {new Date(quoteDetail.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </CardDescription>
              </div>
              {getStatusBadge(quoteDetail.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-[#222] p-3 rounded">
                <p className="text-gray-400 text-xs">Total Items</p>
                <p className="text-white font-bold text-lg" data-testid="text-total-items">{quoteDetail.totalItems}</p>
              </div>
              <div className="bg-[#222] p-3 rounded">
                <p className="text-gray-400 text-xs">Validated</p>
                <p className="text-green-400 font-bold text-lg">{quoteDetail.validatedItems}</p>
              </div>
              <div className="bg-[#222] p-3 rounded">
                <p className="text-gray-400 text-xs">Invalid</p>
                <p className={`font-bold text-lg ${quoteDetail.invalidItems > 0 ? 'text-red-400' : 'text-gray-500'}`}>{quoteDetail.invalidItems}</p>
              </div>
            </div>
            {quoteDetail.notes && (
              <div className="bg-[#222] p-3 rounded mb-4">
                <p className="text-gray-400 text-xs mb-1">Notes</p>
                <p className="text-white text-sm">{quoteDetail.notes}</p>
              </div>
            )}
            {quoteDetail.equipmentInfo && (
              <div className="bg-[#222] p-3 rounded mb-4">
                <p className="text-gray-400 text-xs mb-1">Equipment</p>
                <p className="text-white text-sm">{quoteDetail.equipmentInfo}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-base">Parts List</CardTitle>
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-[#FFCD11]" /></div>
            ) : (
              <div className="space-y-2">
                {(quoteDetail.items || []).map((item: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded bg-[#222]" data-testid={`quote-item-${i}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold font-mono">{item.partNumber}</span>
                        <Badge className={item.validationStatus === "validated" ? "bg-green-800 text-green-200" : "bg-red-800 text-red-200"}>
                          {item.validationStatus === "validated" ? "Valid" : "Invalid"}
                        </Badge>
                        {item.urgency !== "standard" && (
                          <Badge className="bg-orange-700 text-orange-200">{item.urgency}</Badge>
                        )}
                      </div>
                      {item.catalogName && <p className="text-[#FFCD11] text-sm mt-1">{item.catalogName}</p>}
                      {item.description && <p className="text-gray-400 text-sm mt-1">{item.description}</p>}
                      {item.catalogDescription && !item.description && <p className="text-gray-400 text-sm mt-1">{item.catalogDescription}</p>}
                      <div className="flex gap-4 mt-1 text-xs text-gray-500 flex-wrap">
                        <span>Qty: {item.quantity}</span>
                        {item.make && <span>Make: {item.make}</span>}
                        {item.model && <span>Model: {item.model}</span>}
                        {item.serialNumber && <span>S/N: {item.serialNumber}</span>}
                      </div>
                      {item.validationNotes && (
                        <p className="text-red-400 text-xs mt-1">{item.validationNotes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {quotesError && <SectionError error={quotesError} retry={() => { void refetchQuotes(); }} message="Quote requests could not be loaded." />}
      {equipmentError && showForm && <SectionError error={equipmentError} retry={() => { void refetchEquipment(); }} message="Equipment choices could not be loaded." />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-gray-400 text-sm">Submit your parts list for a formal quote from AMERICAN IRON sales team.</p>
        <Button className="bg-[#FFCD11] text-black" onClick={() => setShowForm(!showForm)} data-testid="button-new-quote">
          <Plus className="h-4 w-4 mr-1" /> New Quote Request
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#1a1a1a] border-[#FFCD11]/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-white">New Parts Quote Request</CardTitle>
            <CardDescription className="text-gray-400">Add parts manually or upload a CSV file</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="quote-file-upload" className="text-gray-300 text-sm">Upload Parts List (Excel or CSV)</Label>
                <Input
                  id="quote-file-upload"
                  type="file"
                  accept=".csv,.txt,.xlsx"
                  onChange={handleFileUpload}
                  className="bg-[#222] border-[#444] text-white mt-1"
                  disabled={csvParsing}
                  data-testid="input-csv-upload"
                />
                <p className="text-gray-500 text-xs mt-1">Supports Excel (.xlsx) and CSV (.csv, .txt). Columns: Part Number (required), Description, Quantity, Make, Model, Serial Number, Urgency</p>
              </div>
              {equipmentList && (equipmentList as any[]).length > 0 && (
                <div className="min-w-[180px]">
                  <Label htmlFor="quote-equipment" className="text-gray-300 text-sm">Link to Equipment</Label>
                  <Select value={equipmentId || "none"} onValueChange={(value) => setEquipmentId(value === "none" ? "" : value)}>
                    <SelectTrigger id="quote-equipment" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-equipment">
                      <SelectValue placeholder="Select equipment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {(equipmentList as any[]).map((eq: any) => (
                        <SelectItem key={eq.id} value={String(eq.id)}>{eq.name} — {eq.make} {eq.model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="quote-equipment-info" className="text-gray-300 text-sm">Equipment Info (optional)</Label>
              <Input
                id="quote-equipment-info"
                value={equipmentInfo}
                onChange={e => setEquipmentInfo(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1"
                placeholder="e.g., CAT 320F 2019, S/N: CAT0320FXXXXX"
                data-testid="input-equipment-info"
              />
            </div>

            <div className="border border-[#333] rounded-md p-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-white font-semibold text-sm">Parts List ({items.length} item{items.length > 1 ? 's' : ''})</p>
                <Button size="sm" variant="outline" className="border-[#444] text-gray-300" onClick={addItem} data-testid="button-add-part">
                  <Plus className="h-3 w-3 mr-1" /> Add Part
                </Button>
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={idx} className="bg-[#222] p-3 rounded-md" data-testid={`part-row-${idx}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400 text-xs font-semibold">Part #{idx + 1}</span>
                      {items.length > 1 && (
                        <Button size="icon" variant="ghost" aria-label={`Remove part ${idx + 1}`} className="h-6 w-6 text-gray-500 hover:text-red-400" onClick={() => removeItem(idx)} data-testid={`button-remove-part-${idx}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <Input
                          aria-label={`Part ${idx + 1} number`}
                          value={item.partNumber}
                          onChange={e => updateItem(idx, "partNumber", e.target.value)}
                          onBlur={async () => {
                            const pn = item.partNumber.trim();
                            if (pn.length >= 2 && !item.description) {
                              try {
                                const resp = await apiFetch(
                                  `/api/portal/parts/validate?partNumber=${encodeURIComponent(pn)}`,
                                  {},
                                  { authenticated: true, token: authToken },
                                );
                                if (resp.ok) {
                                  const data = await resp.json();
                                  if (data.valid && data.name) {
                                    updateItem(idx, "description", `${data.name} — ${data.description || ""}`);
                                  }
                                }
                              } catch {
                                toast({
                                  title: "Part validation unavailable",
                                  description: "You can still submit the part for manual review.",
                                  variant: "destructive",
                                });
                              }
                            }
                          }}
                          className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                          placeholder="Part Number *"
                          data-testid={`input-part-number-${idx}`}
                        />
                      </div>
                      <div>
                        <Input
                          aria-label={`Part ${idx + 1} description`}
                          value={item.description}
                          onChange={e => updateItem(idx, "description", e.target.value)}
                          className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                          placeholder="Description (auto-fills if found)"
                          data-testid={`input-part-desc-${idx}`}
                        />
                      </div>
                      <div>
                        <Input
                          aria-label={`Part ${idx + 1} quantity`}
                          type="number"
                          min={1}
                          max={9999}
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                          placeholder="Qty"
                          data-testid={`input-part-qty-${idx}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mt-2">
                      <Input
                        aria-label={`Part ${idx + 1} make`}
                        value={item.make}
                        onChange={e => updateItem(idx, "make", e.target.value)}
                        className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                        placeholder="Make"
                        data-testid={`input-part-make-${idx}`}
                      />
                      <Input
                        aria-label={`Part ${idx + 1} model`}
                        value={item.model}
                        onChange={e => updateItem(idx, "model", e.target.value)}
                        className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                        placeholder="Model"
                        data-testid={`input-part-model-${idx}`}
                      />
                      <Input
                        aria-label={`Part ${idx + 1} serial number`}
                        value={item.serialNumber}
                        onChange={e => updateItem(idx, "serialNumber", e.target.value)}
                        className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                        placeholder="Serial Number"
                        data-testid={`input-part-serial-${idx}`}
                      />
                      <Select value={item.urgency} onValueChange={v => updateItem(idx, "urgency", v)}>
                        <SelectTrigger aria-label={`Part ${idx + 1} urgency`} className="bg-[#1a1a1a] border-[#444] text-white text-sm" data-testid={`select-urgency-${idx}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                          <SelectItem value="emergency">Emergency</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="quote-notes" className="text-gray-300 text-sm">Additional Notes</Label>
              <Textarea
                id="quote-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1"
                placeholder="Any special requirements, preferred brands, or additional context..."
                rows={3}
                data-testid="input-quote-notes"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => { setShowForm(false); resetForm(); }} data-testid="button-cancel-quote">
                Cancel
              </Button>
              <Button className="bg-[#FFCD11] text-black" onClick={handleSubmit} disabled={submitMutation.isPending} data-testid="button-submit-quote">
                {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                <ShoppingCart className="h-4 w-4 mr-1" /> Submit Quote Request
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!quotesError && quotesLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-[#FFCD11]" /></div>
      ) : !quotesError && quoteRequests && (quoteRequests as any[]).length > 0 ? (
        <div className="space-y-2">
          {(quoteRequests as any[]).map((qr: any) => (
            <Card
              key={qr.id}
              className="bg-[#1a1a1a] border-[#333] cursor-pointer hover:border-[#FFCD11]/40 transition-colors"
              role="button"
              tabIndex={0}
              onClick={() => setViewingQuote(qr.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setViewingQuote(qr.id);
                }
              }}
              data-testid={`quote-card-${qr.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold">{qr.referenceNumber}</span>
                      {getStatusBadge(qr.status)}
                    </div>
                    <div className="flex gap-4 text-gray-400 text-xs mt-1 flex-wrap">
                      <span>{qr.totalItems} part{qr.totalItems > 1 ? 's' : ''}</span>
                      {qr.equipmentInfo && <span>{qr.equipmentInfo}</span>}
                      <span>{new Date(qr.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-500 shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !quotesError ? (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-8 text-center">
            <ShoppingCart className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400" data-testid="text-no-quotes">No quote requests yet. Click "New Quote Request" to submit your parts list.</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ServiceSection({ authToken }: { authToken: string | null }) {
  const { data: requests, isLoading, error, refetch } = useAuthFetch("/api/portal/service-requests", authToken);
  const { data: workOrders, error: workOrdersError, refetch: refetchWorkOrders } = useAuthFetch("/api/portal/work-orders", authToken);
  const { data: equipmentList, error: equipmentError, refetch: refetchEquipment } = useAuthFetch("/api/portal/equipment", authToken);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [form, setForm] = useState({ type: "diagnostic", priority: "normal", description: "", faultCodes: "", equipmentId: "" });
  const { toast } = useToast();

  const createMutation = useAuthMutation("POST", "/api/portal/service-requests", authToken, ["/api/portal/service-requests", "/api/portal/dashboard"]);

  const handleSubmit = async () => {
    if (!form.description) {
      toast({ title: "Description is required", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        ...form,
        equipmentId: form.equipmentId && form.equipmentId !== "none" ? parseInt(form.equipmentId) : null,
      });
      toast({ title: "Service request created" });
      setForm({ type: "diagnostic", priority: "normal", description: "", faultCodes: "", equipmentId: "" });
      setShowForm(false);
    } catch {
      // useAuthMutation displays the server-provided error.
    }
  };

  const items = requests || [];
  const orders = workOrders || [];
  const eqList = equipmentList || [];

  const priorityColor: Record<string, string> = { urgent: "bg-red-600", high: "bg-orange-500", normal: "bg-blue-500", low: "bg-gray-500" };
  const statusColor: Record<string, string> = { open: "bg-blue-600", in_progress: "bg-yellow-600", "in-progress": "bg-yellow-600", completed: "bg-green-600", closed: "bg-gray-600" };

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Service requests could not be loaded." />;

  return (
    <div className="space-y-4">
      {workOrdersError && <SectionError error={workOrdersError} retry={() => { void refetchWorkOrders(); }} message="Work orders could not be loaded." />}
      {equipmentError && showForm && <SectionError error={equipmentError} retry={() => { void refetchEquipment(); }} message="Equipment choices could not be loaded." />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-gray-400">{items.length} service request{items.length !== 1 ? "s" : ""}</p>
        <Button className="bg-[#FFCD11] text-black" onClick={() => setShowForm(!showForm)} data-testid="button-new-service">
          <Plus className="h-4 w-4 mr-1" /> New Request
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-2"><CardTitle className="text-white text-lg">New Service Request</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="service-type" className="text-gray-300 text-sm">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger id="service-type" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-service-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakdown">Breakdown</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="diagnostic">Diagnostic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="service-priority" className="text-gray-300 text-sm">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger id="service-priority" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-service-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="service-equipment" className="text-gray-300 text-sm">Equipment</Label>
                <Select value={form.equipmentId || "none"} onValueChange={v => setForm(f => ({ ...f, equipmentId: v === "none" ? "" : v }))}>
                  <SelectTrigger id="service-equipment" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-service-equipment"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {eqList.map((eq: any) => (
                      <SelectItem key={eq.id} value={String(eq.id)}>{eq.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="service-description" className="text-gray-300 text-sm">Description *</Label>
              <Textarea id="service-description" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-service-description" />
            </div>
            <div>
              <Label htmlFor="service-fault-codes" className="text-gray-300 text-sm">Fault Codes</Label>
              <Input id="service-fault-codes" value={form.faultCodes} onChange={e => setForm(f => ({ ...f, faultCodes: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="e.g., P0420, P0301" data-testid="input-service-faultcodes" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button className="bg-[#FFCD11] text-black" onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-service">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit
              </Button>
              <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
          <Wrench className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400" data-testid="text-no-service">No service requests yet. Create one to get started.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((sr: any) => {
            const isExpanded = expandedId === sr.id;
            const relatedOrders = orders.filter((wo: any) => wo.serviceRequestId === sr.id);
            return (
              <Card key={sr.id} className={`bg-[#1a1a1a] border-[#333] cursor-pointer transition-all ${isExpanded ? "border-[#FFCD11]" : "hover:border-[#555]"}`}
                role="button" tabIndex={0}
                onClick={() => setExpandedId(isExpanded ? null : sr.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedId(isExpanded ? null : sr.id);
                  }
                }}
                data-testid={`card-service-${sr.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold">#{sr.id} — {sr.type}</p>
                      <p className="text-gray-400 text-sm truncate">{sr.description || "No description"}</p>
                      {sr.faultCodes && <p className="text-gray-500 text-xs mt-1">Fault codes: {sr.faultCodes}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge className={`text-xs text-white ${priorityColor[sr.priority] || "bg-gray-500"}`}>{sr.priority}</Badge>
                      <Badge className={`text-xs text-white ${statusColor[sr.status] || "bg-gray-500"}`}>{sr.status}</Badge>
                      <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#333] space-y-3" onClick={e => e.stopPropagation()}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">Type</p>
                          <p className="text-white capitalize">{sr.type}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Priority</p>
                          <p className="text-white capitalize">{sr.priority}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Status</p>
                          <p className="text-white capitalize">{sr.status}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Created</p>
                          <p className="text-white">{sr.createdAt ? new Date(sr.createdAt).toLocaleDateString() : "—"}</p>
                        </div>
                      </div>

                      {sr.description && (
                        <div>
                          <p className="text-gray-500 text-sm">Full Description</p>
                          <p className="text-gray-300 text-sm mt-1">{sr.description}</p>
                        </div>
                      )}

                      {sr.faultCodes && (
                        <div>
                          <p className="text-gray-500 text-sm">Fault Codes</p>
                          <div className="flex gap-1 flex-wrap mt-1">
                            {sr.faultCodes.split(",").map((code: string, i: number) => (
                              <Badge key={i} variant="outline" className="border-red-600 text-red-400 text-xs">{code.trim()}</Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {sr.assignedMechanic && (
                        <div>
                          <p className="text-gray-500 text-sm">Assigned Mechanic</p>
                          <p className="text-white text-sm mt-1">{sr.assignedMechanic}</p>
                        </div>
                      )}

                      {sr.estimatedCost && (
                        <div>
                          <p className="text-gray-500 text-sm">Estimated Cost</p>
                          <p className="text-[#FFCD11] font-bold text-sm mt-1">${sr.estimatedCost}</p>
                        </div>
                      )}

                      {sr.diagnosisResult && (
                        <div>
                          <p className="text-gray-500 text-sm">Diagnosis</p>
                          <div className="bg-[#222] rounded p-3 mt-1">
                            <p className="text-gray-300 text-sm">{typeof sr.diagnosisResult === "string" ? sr.diagnosisResult : JSON.stringify(sr.diagnosisResult, null, 2)}</p>
                          </div>
                        </div>
                      )}

                      {relatedOrders.length > 0 && (
                        <div>
                          <p className="text-gray-500 text-sm mb-1">Work Orders</p>
                          {relatedOrders.map((wo: any) => (
                            <div key={wo.id} className="bg-[#222] rounded p-3 mb-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-white text-sm">Work Order #{wo.id}</p>
                                <Badge className={`text-xs text-white ${statusColor[wo.status] || "bg-gray-500"}`}>{wo.status}</Badge>
                              </div>
                              {wo.technicianNotes && <p className="text-gray-400 text-xs mt-1">{wo.technicianNotes}</p>}
                              {wo.laborHours && <p className="text-gray-500 text-xs mt-1">Labor: {wo.laborHours} hrs</p>}
                              {wo.completedAt && <p className="text-gray-500 text-xs mt-1">Completed: {new Date(wo.completedAt).toLocaleDateString()}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {orders.length > 0 && (
        <div className="mt-6">
          <h3 className="text-white font-semibold mb-3">Work Orders</h3>
          <div className="space-y-2">
            {orders.map((wo: any) => (
              <Card key={wo.id} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-workorder-${wo.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-white">Work Order #{wo.id}</p>
                      <p className="text-gray-400 text-sm">{wo.technicianNotes || "No notes"}</p>
                    </div>
                    <Badge className={`text-xs text-white ${statusColor[wo.status] || "bg-gray-500"}`}>{wo.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MaintenanceSection({ authToken }: { authToken: string | null }) {
  const { data: schedules, isLoading, error, refetch } = useAuthFetch("/api/portal/maintenance", authToken);
  const { data: equipmentList, isLoading: equipmentLoading, error: equipmentError, refetch: refetchEquipment } = useAuthFetch("/api/portal/equipment", authToken);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ serviceType: "", intervalHours: "", lastServiceDate: "", nextServiceDate: "", equipmentId: "" });
  const { toast } = useToast();
  const createMutation = useAuthMutation("POST", "/api/portal/maintenance", authToken, ["/api/portal/maintenance"]);

  const handleSubmit = async () => {
    if (!form.serviceType || !form.equipmentId) {
      toast({ title: "Service type and equipment are required", variant: "destructive" });
      return;
    }
    if (form.intervalHours && (!Number.isFinite(Number(form.intervalHours)) || Number(form.intervalHours) <= 0)) {
      toast({ title: "Interval hours must be greater than zero", variant: "destructive" });
      return;
    }
    if (form.lastServiceDate && form.nextServiceDate && form.nextServiceDate < form.lastServiceDate) {
      toast({ title: "Next service date cannot be before the last service date", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({ ...form, equipmentId: parseInt(form.equipmentId) });
      toast({ title: "Maintenance schedule created" });
      setForm({ serviceType: "", intervalHours: "", lastServiceDate: "", nextServiceDate: "", equipmentId: "" });
      setShowForm(false);
    } catch {
      // useAuthMutation displays the server-provided error.
    }
  };

  const items = schedules || [];
  const eqList = equipmentList || [];

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Maintenance schedules could not be loaded." />;

  return (
    <div className="space-y-4">
      {equipmentError && <SectionError error={equipmentError} retry={() => { void refetchEquipment(); }} message="Equipment choices could not be loaded." />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-gray-400">{items.length} schedule{items.length !== 1 ? "s" : ""}</p>
        <Button className="bg-[#FFCD11] text-black" onClick={() => setShowForm(!showForm)} disabled={equipmentLoading || Boolean(equipmentError) || eqList.length === 0} data-testid="button-add-maintenance">
          <Plus className="h-4 w-4 mr-1" /> Add Schedule
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-2"><CardTitle className="text-white text-lg">New PM Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="maintenance-equipment" className="text-gray-300 text-sm">Equipment *</Label>
                <Select value={form.equipmentId} onValueChange={v => setForm(f => ({ ...f, equipmentId: v }))}>
                  <SelectTrigger id="maintenance-equipment" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-maintenance-equipment"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {eqList.map((eq: any) => <SelectItem key={eq.id} value={String(eq.id)}>{eq.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="maintenance-type" className="text-gray-300 text-sm">Service Type *</Label>
                <Input id="maintenance-type" required value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="e.g., Oil Change" data-testid="input-maintenance-type" />
              </div>
              <div>
                <Label htmlFor="maintenance-interval" className="text-gray-300 text-sm">Interval Hours</Label>
                <Input id="maintenance-interval" type="number" min={1} value={form.intervalHours} onChange={e => setForm(f => ({ ...f, intervalHours: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="250" data-testid="input-maintenance-interval" />
              </div>
              <div>
                <Label htmlFor="maintenance-last-date" className="text-gray-300 text-sm">Last Service Date</Label>
                <Input id="maintenance-last-date" type="date" value={form.lastServiceDate} onChange={e => setForm(f => ({ ...f, lastServiceDate: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-maintenance-last" />
              </div>
              <div>
                <Label htmlFor="maintenance-next-date" className="text-gray-300 text-sm">Next Service Date</Label>
                <Input id="maintenance-next-date" type="date" value={form.nextServiceDate} onChange={e => setForm(f => ({ ...f, nextServiceDate: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-maintenance-next" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button className="bg-[#FFCD11] text-black" onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-maintenance">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
              </Button>
              <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
          <CalendarClock className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400" data-testid="text-no-maintenance">No maintenance schedules yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((s: any) => (
            <Card key={s.id} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-maintenance-${s.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{s.serviceType}</p>
                    <p className="text-gray-400 text-sm">
                      {s.intervalHours && `Every ${s.intervalHours}h`}
                      {s.nextServiceDate && ` · Next: ${s.nextServiceDate}`}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">{s.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OrdersSection({ authToken }: { authToken: string | null }) {
  const { data: quoteRequests, isLoading, error, refetch } = useAuthFetch("/api/portal/quote-requests", authToken);

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Orders could not be loaded." />;

  const items = (quoteRequests || []).filter((q: any) => q.status === "quoted" || q.status === "approved" || q.status === "completed" || q.status === "shipped");
  const statusStyle: Record<string, string> = { quoted: "bg-blue-600", approved: "bg-yellow-600", shipped: "bg-purple-600", completed: "bg-green-600" };
  const statusLabel: Record<string, string> = { quoted: "Quote Received", approved: "Order Confirmed", shipped: "Shipped", completed: "Delivered" };

  return (
    <div className="space-y-4">
      <p className="text-gray-400">{items.length} order{items.length !== 1 ? "s" : ""}</p>

      {items.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-8 text-center">
            <Package className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-white font-semibold mb-2">Order Tracking</p>
            <p className="text-gray-400" data-testid="text-no-orders">No active orders. When you submit a parts quote request and it gets approved, your orders will appear here.</p>
            <p className="text-gray-500 text-sm mt-2">Go to "Purchase Parts" to submit a quote request for the parts you need.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((q: any) => (
            <Card key={q.id} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-order-${q.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">Order {q.referenceNumber || `#${q.id}`}</p>
                    <p className="text-gray-400 text-sm">
                      {q.totalItems || "—"} item{(q.totalItems || 0) !== 1 ? "s" : ""}
                      {q.equipmentInfo && ` · ${q.equipmentInfo}`}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : ""}</p>
                  </div>
                  <Badge className={`text-xs text-white ${statusStyle[q.status] || "bg-gray-500"}`}>{statusLabel[q.status] || q.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsSection({ authToken }: { authToken: string | null }) {
  const { data: docs, isLoading, error, refetch } = useAuthFetch("/api/portal/documents", authToken);
  const categories = [
    { id: "manuals", label: "Manuals", types: ["manual", "manuals"] },
    { id: "invoices", label: "Invoices", types: ["invoice", "invoices"] },
    { id: "reports", label: "Reports", types: ["report", "reports"] },
    { id: "warranties", label: "Warranties", types: ["warranty", "warranties"] },
  ];
  const [filter, setFilter] = useState("all");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { toast } = useToast();

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Documents could not be loaded." />;

  const items = docs || [];
  const selectedCategory = categories.find((category) => category.id === filter);
  const filtered = filter === "all"
    ? items
    : items.filter((document: any) => selectedCategory?.types.includes(String(document.type).toLowerCase()));
  const downloadDocument = async (doc: any) => {
    const downloadPath = doc.downloadUrl || doc.downloadPath;
    if (typeof downloadPath !== "string" || !downloadPath.startsWith("/api/")) {
      toast({
        title: "Download unavailable",
        description: "This document has no authorized download link. Contact support for access.",
        variant: "destructive",
      });
      return;
    }
    setDownloadingId(doc.id);
    try {
      await downloadAuthenticatedFile(downloadPath, doc.title || `document-${doc.id}`);
      toast({ title: "Document downloaded" });
    } catch (downloadError) {
      toast({
        title: "Download failed",
        description: downloadError instanceof Error ? downloadError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === "all" ? "default" : "outline"} className={filter === "all" ? "bg-[#FFCD11] text-black" : "border-[#444] text-gray-300"} onClick={() => setFilter("all")} data-testid="button-filter-all">All</Button>
        {categories.map(category => (
          <Button key={category.id} variant={filter === category.id ? "default" : "outline"} className={filter === category.id ? "bg-[#FFCD11] text-black" : "border-[#444] text-gray-300"} onClick={() => setFilter(category.id)} data-testid={`button-filter-${category.id}`}>
            {category.label}
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400" data-testid="text-no-documents">No documents found.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc: any) => (
            <Card key={doc.id} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-document-${doc.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-[#FFCD11] shrink-0" />
                    <div>
                      <p className="text-white">{doc.title}</p>
                      <p className="text-gray-500 text-xs">{doc.type} {doc.fileSize && `· ${doc.fileSize}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{doc.type}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#444] text-gray-300"
                      onClick={() => { void downloadDocument(doc); }}
                      disabled={downloadingId === doc.id}
                      aria-label={`Download ${doc.title}`}
                      data-testid={`button-download-document-${doc.id}`}
                    >
                      {downloadingId === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function BillingSection({ authToken }: { authToken: string | null }) {
  const { data: invoices, isLoading, error, refetch } = useAuthFetch("/api/portal/invoices", authToken);
  const { data: billing, isLoading: billingLoading, error: billingError, refetch: refetchBilling } = useAuthFetch("/api/portal/billing/me", authToken);
  const { toast } = useToast();
  const [busy, setBusy] = useState<"pro" | "shop" | "portal" | null>(null);
  const checkout = new URLSearchParams(window.location.search).get("checkout");

  const startCheckout = async (target: "pro" | "shop") => {
    setBusy(target);
    try {
      const res = await apiFetch("/api/portal/billing/stripe/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_tier: target }),
      }, { authenticated: true, token: authToken });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Checkout could not start"));
      const data = await res.json() as { url?: unknown };
      window.location.assign(trustedExternalUrl(data.url, ["checkout.stripe.com"]));
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Checkout failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const res = await apiFetch("/api/portal/billing/portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }, { authenticated: true, token: authToken });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Billing portal unavailable"));
      const data = await res.json() as { url?: unknown };
      window.location.assign(trustedExternalUrl(data.url, ["billing.stripe.com"]));
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Portal failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || billingLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Invoices could not be loaded." />;
  if (billingError) return <SectionError error={billingError} retry={() => { void refetchBilling(); }} message="Subscription details could not be loaded." />;

  const items = invoices || [];
  const total = items.reduce((sum: number, inv: any) => sum + parseFloat(inv.amount || "0"), 0);
  const paid = items.filter((inv: any) => inv.status === "paid").reduce((sum: number, inv: any) => sum + parseFloat(inv.amount || "0"), 0);
  const outstanding = total - paid;

  const statusStyle: Record<string, string> = { paid: "bg-green-600", pending: "bg-yellow-600", overdue: "bg-red-600" };

  return (
    <div className="space-y-4">
      {checkout === "success" && (
        <Card className="bg-[#1a1a1a] border-green-700"><CardContent className="p-4 text-green-400">Stripe checkout completed. Entitlements update after the webhook is processed.</CardContent></Card>
      )}
      {checkout === "cancel" && (
        <Card className="bg-[#1a1a1a] border-[#444]"><CardContent className="p-4 text-gray-400">Checkout canceled. Your current plan is unchanged.</CardContent></Card>
      )}
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2">
          <CardTitle className="text-white">Subscription</CardTitle>
          <CardDescription className="text-gray-400">Server-side Stripe entitlements. Paid features are never granted in the browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge className="bg-[#FFCD11] text-black">{billing?.effective_tier || "free"}</Badge>
            <span className="text-gray-400">Status: {billing?.status || "none"}</span>
            <span className="text-gray-400">Diagnoses this month: {billing?.diagnosis_usage?.this_month ?? 0}{billing?.diagnosis_usage?.unlimited ? " (unlimited)" : ` / ${billing?.diagnosis_usage?.limit ?? 3}`}</span>
            <span className="text-gray-400">Live avatar: {billing?.live_avatar_included ? "included" : "Pro/Shop"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="bg-[#FFCD11] text-black" disabled={busy !== null} onClick={() => startCheckout("pro")} data-testid="button-upgrade-pro">
              {busy === "pro" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Choose Pro
            </Button>
            <Button className="bg-[#FFCD11] text-black" disabled={busy !== null} onClick={() => startCheckout("shop")} data-testid="button-upgrade-shop">
              {busy === "shop" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Choose Shop
            </Button>
            <Button
              variant="outline"
              className="border-[#444] text-gray-300"
              disabled={busy !== null || !billing?.has_stripe_customer}
              title={!billing?.has_stripe_customer ? "Choose a paid plan before managing billing" : undefined}
              onClick={openPortal}
              data-testid="button-stripe-portal"
            >
              Manage billing
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-4">
          <p className="text-gray-400 text-sm">Total</p>
          <p className="text-2xl font-bold text-white" data-testid="stat-total-billing">${total.toFixed(2)}</p>
        </CardContent></Card>
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-4">
          <p className="text-gray-400 text-sm">Paid</p>
          <p className="text-2xl font-bold text-green-400" data-testid="stat-paid-billing">${paid.toFixed(2)}</p>
        </CardContent></Card>
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-4">
          <p className="text-gray-400 text-sm">Outstanding</p>
          <p className="text-2xl font-bold text-yellow-400" data-testid="stat-outstanding-billing">${outstanding.toFixed(2)}</p>
        </CardContent></Card>
      </div>

      {items.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
          <DollarSign className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400" data-testid="text-no-invoices">No invoices yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((inv: any) => (
            <Card key={inv.id} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-invoice-${inv.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">Invoice #{inv.id}</p>
                    <p className="text-gray-400 text-sm">{inv.description || "No description"} {inv.dueDate && `· Due: ${inv.dueDate}`}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-bold">${parseFloat(inv.amount || "0").toFixed(2)}</p>
                    <Badge className={`text-xs text-white ${statusStyle[inv.status] || "bg-gray-500"}`}>{inv.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SupportSection({ authToken }: { authToken: string | null }) {
  const { data: tickets, isLoading, error, refetch } = useAuthFetch("/api/portal/support-tickets", authToken);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal", category: "" });
  const { toast } = useToast();
  const createMutation = useAuthMutation("POST", "/api/portal/support-tickets", authToken, ["/api/portal/support-tickets"]);

  const handleSubmit = async () => {
    if (!form.subject) {
      toast({ title: "Subject is required", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync(form);
      toast({ title: "Support ticket created" });
      setForm({ subject: "", description: "", priority: "normal", category: "" });
      setShowForm(false);
    } catch {
      // useAuthMutation displays the server-provided error.
    }
  };

  const items = tickets || [];

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (error) return <SectionError error={error} retry={() => { void refetch(); }} message="Support tickets could not be loaded." />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-gray-400">{items.length} ticket{items.length !== 1 ? "s" : ""}</p>
        <Button className="bg-[#FFCD11] text-black" onClick={() => setShowForm(!showForm)} data-testid="button-new-ticket">
          <Plus className="h-4 w-4 mr-1" /> New Ticket
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-2"><CardTitle className="text-white text-lg">New Support Ticket</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="ticket-subject" className="text-gray-300 text-sm">Subject *</Label>
              <Input id="ticket-subject" required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-ticket-subject" />
            </div>
            <div>
              <Label htmlFor="ticket-description" className="text-gray-300 text-sm">Description</Label>
              <Textarea id="ticket-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-ticket-description" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ticket-priority" className="text-gray-300 text-sm">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger id="ticket-priority" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-ticket-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ticket-category" className="text-gray-300 text-sm">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger id="ticket-category" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-ticket-category"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="technical">Technical</SelectItem>
                    <SelectItem value="parts">Parts</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button className="bg-[#FFCD11] text-black" onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-ticket">
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit
              </Button>
              <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
          <Headphones className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400" data-testid="text-no-tickets">No support tickets. Create one if you need help.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((t: any) => (
            <Card key={t.id} className="bg-[#1a1a1a] border-[#333]" data-testid={`card-ticket-${t.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">{t.subject}</p>
                    <p className="text-gray-400 text-sm truncate">{t.description || "No description"}</p>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{t.priority}</Badge>
                    <Badge variant="secondary" className="text-xs">{t.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminSection({
  authToken,
  customer,
  applySession,
}: {
  authToken: string | null;
  customer: any;
  applySession: (data: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    firstName: customer?.firstName || "",
    lastName: customer?.lastName || "",
    company: customer?.company || "",
    phone: customer?.phone || "",
  });
  const { toast } = useToast();
  const updateMutation = useAuthMutation("PATCH", "/api/portal/profile", authToken, []);

  const handleSave = async () => {
    try {
      const updated = await updateMutation.mutateAsync(form);
      applySession({ authToken, user: updated });
      toast({ title: "Profile updated" });
    } catch {
      // useAuthMutation displays the server-provided error.
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2"><CardTitle className="text-white">Profile Settings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="profile-first-name" className="text-gray-300 text-sm">First Name</Label>
              <Input id="profile-first-name" autoComplete="given-name" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-firstname" />
            </div>
            <div>
              <Label htmlFor="profile-last-name" className="text-gray-300 text-sm">Last Name</Label>
              <Input id="profile-last-name" autoComplete="family-name" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-lastname" />
            </div>
            <div>
              <Label htmlFor="profile-company" className="text-gray-300 text-sm">Company</Label>
              <Input id="profile-company" autoComplete="organization" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-company" />
            </div>
            <div>
              <Label htmlFor="profile-phone" className="text-gray-300 text-sm">Phone</Label>
              <Input id="profile-phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-phone" />
            </div>
          </div>
          <div>
            <Label htmlFor="profile-email" className="text-gray-300 text-sm">Email</Label>
            <Input id="profile-email" value={customer?.email || ""} disabled className="bg-[#222] border-[#444] text-gray-500 mt-1" data-testid="input-admin-email" />
          </div>
          <Button className="bg-[#FFCD11] text-black" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-profile">
            {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2"><CardTitle className="text-white">Account Info</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-gray-400">Role</span>
              <Badge variant="secondary" data-testid="badge-role">{customer?.role || "user"}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-gray-400">Status</span>
              <Badge className="bg-green-600 text-white text-xs" data-testid="badge-status">{customer?.status || "active"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AIIntakeSection({ setLocation }: { setLocation: (path: string) => void }) {
  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardContent className="p-8 text-center">
          <Bot className="h-16 w-16 text-[#FFCD11] mx-auto mb-4" />
          <h3 className="text-white text-xl font-bold mb-2">AI Virtual Mechanic Intake</h3>
          <p className="text-gray-400 mb-6">Start a new AI diagnostic session. Our AI mechanic will guide you through troubleshooting your equipment issues.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Button className="bg-[#FFCD11] text-black" onClick={() => setLocation("/live-desk")} data-testid="button-start-ai-session">
              <Bot className="h-4 w-4 mr-2" /> Start New AI Session
            </Button>
            <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => setLocation("/live-desk")} data-testid="button-goto-livedesk">
              <Video className="h-4 w-4 mr-2" /> Go to Live Desk
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AIDiagnosisSection({ authToken }: { authToken: string | null }) {
  const { data: history, isLoading: historyLoading, error: historyError, refetch: refetchHistory } = useAuthFetch("/api/portal/ai/sessions", authToken);
  const sessions = history?.sessions || [];
  const [form, setForm] = useState({ machine_make: "", machine_model: "", year: "", hours: "", symptoms: "", fault_codes: "" });
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { toast } = useToast();

  const run = async () => {
    if (!form.machine_make.trim() || !form.machine_model.trim() || form.symptoms.trim().length < 3) {
      toast({ title: "Make, model, and symptoms are required", variant: "destructive" });
      return;
    }
    const year = form.year ? Number(form.year) : null;
    const hours = form.hours ? Number(form.hours) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) {
      toast({ title: "Enter a valid model year", variant: "destructive" });
      return;
    }
    if (hours !== null && (!Number.isInteger(hours) || hours < 0 || hours > 200000)) {
      toast({ title: "Hours must be between 0 and 200,000", variant: "destructive" });
      return;
    }
    setPending(true);
    setResult(null);
    setRequestError("");
    try {
      const res = await apiFetch("/api/diagnosis/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_make: form.machine_make.trim(),
          machine_model: form.machine_model.trim(),
          year,
          hours,
          symptoms: form.symptoms.trim(),
          fault_codes: form.fault_codes.split(",").map((s) => s.trim()).filter(Boolean),
          recent_service: [],
          operator_notes: "",
        }),
      }, { authenticated: true, token: authToken });
      if (!res.ok) throw new ApiError(await apiErrorMessage(res, "Diagnosis failed"), res.status);
      const data = await res.json();
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ["/api/portal/ai/sessions"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Diagnosis failed";
      setRequestError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const downloadPdf = async (id: string | number) => {
    const value = String(id);
    setDownloadingId(value);
    try {
      await downloadAuthenticatedFile(`/api/diagnosis/${encodeURIComponent(value)}/pdf`, `fixmyiron-diagnosis-${value}.pdf`);
      toast({ title: "Diagnosis PDF downloaded" });
    } catch (downloadError) {
      toast({
        title: "PDF download failed",
        description: downloadError instanceof Error ? downloadError.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2"><CardTitle className="text-white">Run a structured diagnosis</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label htmlFor="dx-make" className="sr-only">Machine make</Label><Input id="dx-make" placeholder="Make" value={form.machine_make} onChange={e => setForm(f => ({ ...f, machine_make: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-dx-make" /></div>
            <div><Label htmlFor="dx-model" className="sr-only">Machine model</Label><Input id="dx-model" placeholder="Model" value={form.machine_model} onChange={e => setForm(f => ({ ...f, machine_model: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-dx-model" /></div>
            <div><Label htmlFor="dx-year" className="sr-only">Model year</Label><Input id="dx-year" type="number" min={1950} max={2100} placeholder="Year" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="bg-[#222] border-[#444] text-white" /></div>
            <div><Label htmlFor="dx-hours" className="sr-only">Machine hours</Label><Input id="dx-hours" type="number" min={0} max={200000} placeholder="Hours" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} className="bg-[#222] border-[#444] text-white" /></div>
          </div>
          <div><Label htmlFor="dx-symptoms" className="sr-only">Symptoms</Label><Textarea id="dx-symptoms" placeholder="Symptoms" value={form.symptoms} onChange={e => setForm(f => ({ ...f, symptoms: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-dx-symptoms" /></div>
          <div><Label htmlFor="dx-fault-codes" className="sr-only">Fault codes</Label><Input id="dx-fault-codes" placeholder="Fault codes, comma-separated" value={form.fault_codes} onChange={e => setForm(f => ({ ...f, fault_codes: e.target.value }))} className="bg-[#222] border-[#444] text-white" /></div>
          <Button className="bg-[#FFCD11] text-black" onClick={run} disabled={pending} data-testid="button-run-diagnosis">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Stethoscope className="h-4 w-4 mr-1" />} Diagnose
          </Button>
          {requestError && <p className="text-sm text-red-400" role="alert" data-testid="text-diagnosis-error">{requestError}</p>}
          {result && (
            <div className="space-y-3 rounded bg-[#111] p-4">
              <DiagnosisPlaybook data={result} />
              {result.session_id && (
                <Button variant="outline" className="border-[#444] text-gray-300" onClick={() => { void downloadPdf(result.session_id); }} disabled={downloadingId === String(result.session_id)} data-testid="button-download-diagnosis-pdf">
                  {downloadingId === String(result.session_id) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />} Download PDF
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2"><CardTitle className="text-white">Past Diagnoses</CardTitle></CardHeader>
        <CardContent>
          {historyLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : historyError ? (
            <SectionError error={historyError} retry={() => { void refetchHistory(); }} message="Diagnosis history could not be loaded." />
          ) : sessions.length === 0 ? (
            <div className="text-center py-6">
              <Stethoscope className="h-12 w-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400" data-testid="text-no-diagnoses">No structured diagnoses yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: any) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-md bg-[#222]" data-testid={`diagnosis-${s.id}`}>
                  <div>
                    <p className="text-white font-semibold">#{s.id} — {[s.machine_make, s.machine_model].filter(Boolean).join(" ") || "Unknown equipment"}</p>
                    <p className="text-gray-400 text-sm">{s.started_at ? new Date(s.started_at).toLocaleString() : "Date unavailable"} · {s.status}</p>
                  </div>
                  {s.has_playbook && (
                    <Button size="sm" variant="outline" className="border-[#555] text-gray-300" onClick={() => { void downloadPdf(s.id); }} disabled={downloadingId === String(s.id)}>
                      <Download className="h-4 w-4 mr-1" /> PDF
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AITroubleshootingSection({ authToken }: { authToken: string | null }) {
  const [form, setForm] = useState({ machine_make: "", machine_model: "", initial_complaint: "" });
  const [turn, setTurn] = useState<any>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [turnNumber, setTurnNumber] = useState(0);
  const { toast } = useToast();

  const start = async () => {
    if (!form.machine_make.trim() || !form.machine_model.trim() || form.initial_complaint.trim().length < 3) {
      toast({ title: "Make, model, and a complaint are required", variant: "destructive" });
      return;
    }
    setPending(true);
    setRequestError("");
    try {
      const res = await apiFetch("/api/troubleshooting/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }, { authenticated: true, token: authToken });
      if (!res.ok) throw new ApiError(await apiErrorMessage(res, "Could not start troubleshooting"), res.status);
      const data = await res.json();
      setSessionId(String(data.session_id));
      setTurn(data.turn);
      setTurnNumber(data.turn_number || 1);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not start troubleshooting";
      setRequestError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const submitAnswer = async (value = answer) => {
    const trimmed = value.trim();
    if (!sessionId || !trimmed) return;
    setPending(true);
    setRequestError("");
    try {
      const response = await apiFetch(`/api/troubleshooting/${encodeURIComponent(sessionId)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: trimmed }),
      }, { authenticated: true, token: authToken });
      if (!response.ok) throw new ApiError(await apiErrorMessage(response, "Could not submit answer"), response.status);
      const data = await response.json();
      setTurn(data.turn);
      setTurnNumber(data.turn_number || turnNumber + 1);
      setAnswer("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not submit answer";
      setRequestError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const restart = () => {
    setTurn(null);
    setSessionId(null);
    setAnswer("");
    setTurnNumber(0);
    setRequestError("");
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardContent className="p-6 space-y-3">
          <BookOpen className="h-12 w-12 text-[#FFCD11] mb-2" />
          <h3 className="text-white text-xl font-bold">Guided Troubleshooting</h3>
          {!sessionId ? (
            <>
              <Input aria-label="Machine make" placeholder="Make" value={form.machine_make} onChange={e => setForm(f => ({ ...f, machine_make: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-ts-make" />
              <Input aria-label="Machine model" placeholder="Model" value={form.machine_model} onChange={e => setForm(f => ({ ...f, machine_model: e.target.value }))} className="bg-[#222] border-[#444] text-white" />
              <Textarea aria-label="Initial complaint" placeholder="What is the machine doing?" value={form.initial_complaint} onChange={e => setForm(f => ({ ...f, initial_complaint: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-ts-complaint" />
              <Button className="bg-[#FFCD11] text-black" onClick={start} disabled={pending} data-testid="button-start-troubleshooting">
                {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Start wizard
              </Button>
            </>
          ) : (
            <div className="space-y-4 rounded bg-[#111] p-4" data-testid="troubleshooting-result">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-gray-500">Session {sessionId} · Turn {turnNumber}</p>
                <Button size="sm" variant="outline" className="border-[#444] text-gray-300" onClick={restart}>Start over</Button>
              </div>
              {turn?.reasoning && <p className="text-sm text-gray-400">{turn.reasoning}</p>}
              {turn?.terminate ? (
                <div className="space-y-3">
                  <h4 className="text-lg font-semibold text-white">Troubleshooting conclusion</h4>
                  <p className="text-gray-300">{turn.conclusion?.summary}</p>
                  <Badge variant="secondary">Confidence: {turn.conclusion?.confidence}</Badge>
                  {Array.isArray(turn.conclusion?.next_steps) && (
                    <ol className="list-decimal space-y-1 pl-5 text-gray-300">
                      {turn.conclusion.next_steps.map((step: string, index: number) => <li key={index}>{step}</li>)}
                    </ol>
                  )}
                  {Array.isArray(turn.conclusion?.safety_warnings) && turn.conclusion.safety_warnings.length > 0 && (
                    <div className="rounded border border-red-800 p-3 text-red-300">
                      {turn.conclusion.safety_warnings.map((warning: string, index: number) => <p key={index}>{warning}</p>)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-lg font-semibold text-white">{turn?.question}</h4>
                  {Array.isArray(turn?.suggested_answers) && (
                    <div className="flex flex-wrap gap-2">
                      {turn.suggested_answers.map((suggestion: string) => (
                        <Button key={suggestion} size="sm" variant="outline" className="border-[#555] text-gray-300" disabled={pending} onClick={() => { void submitAnswer(suggestion); }}>
                          {suggestion}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div>
                    <Label htmlFor="troubleshooting-answer" className="sr-only">Your answer</Label>
                    <Textarea id="troubleshooting-answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Type your answer…" className="bg-[#222] border-[#444] text-white" data-testid="input-troubleshooting-answer" />
                  </div>
                  <Button className="bg-[#FFCD11] text-black" disabled={pending || !answer.trim()} onClick={() => { void submitAnswer(); }} data-testid="button-submit-troubleshooting-answer">
                    {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit answer
                  </Button>
                </div>
              )}
            </div>
          )}
          {requestError && <p className="text-sm text-red-400" role="alert" data-testid="text-troubleshooting-error">{requestError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function AIFaultCodeSection({ authToken, setLocation }: { authToken: string | null; setLocation: (path: string) => void }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  const handleLookup = async () => {
    if (!code.trim()) return;
    setSearching(true);
    try {
      const res = await apiFetch(
        `/api/portal/ai/fault-codes/${encodeURIComponent(code.trim())}`,
        {},
        { authenticated: true, token: authToken },
      );
      if (res.ok) {
        setResult(await res.json());
      } else {
        setResult({ error: await apiErrorMessage(res, "Code not found") });
      }
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : "Lookup failed" });
    }
    setSearching(false);
  };

  const causes = Array.isArray(result?.likely_causes) ? result.likely_causes : [];
  const actions = Array.isArray(result?.repair_actions) ? result.repair_actions : [];
  const relatedParts = Array.isArray(result?.related_parts) ? result.related_parts : [];
  const requestRelatedPart = (part: any) => {
    sessionStorage.setItem(QUOTE_DRAFT_KEY, JSON.stringify([{
      partNumber: part.part_number,
      description: part.description || "",
      quantity: 1,
    }]));
    setLocation("/portal/purchase-parts");
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2">
          <CardTitle className="text-white">Fault Code Lookup</CardTitle>
          <CardDescription className="text-gray-400">Enter a DTC or fault code to get interpretation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Input aria-label="Fault code" value={code} onChange={e => setCode(e.target.value)} className="bg-[#222] border-[#444] text-white flex-1 min-w-[200px]" placeholder="e.g., P0420, SPN 3251" onKeyDown={e => e.key === "Enter" && handleLookup()} data-testid="input-fault-code" />
            <Button className="bg-[#FFCD11] text-black" onClick={handleLookup} disabled={searching || !code.trim()} data-testid="button-lookup-fault">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />} Lookup
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-4">
            {result.error ? (
              <p className="text-gray-400" data-testid="text-fault-error">{result.error}</p>
            ) : (
              <div data-testid="fault-code-result">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[#FFCD11] font-bold text-lg">{result.code || code}</p>
                  {result.severity && <Badge variant="secondary">{result.severity}</Badge>}
                </div>
                {result.manufacturer && <p className="text-gray-500 text-xs">{result.manufacturer}{result.spn ? ` · SPN ${result.spn}` : ""}{result.fmi ? ` / FMI ${result.fmi}` : ""}</p>}
                <p className="text-white mt-1">{result.description || result.meaning || "Interpretation available after AI analysis"}</p>
                {causes.length > 0 && (
                  <div className="mt-3">
                    <p className="font-semibold text-white">Likely causes</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-gray-300">
                      {causes.map((cause: string, index: number) => <li key={index}>{cause}</li>)}
                    </ul>
                  </div>
                )}
                {actions.length > 0 && (
                  <div className="mt-3">
                    <p className="font-semibold text-white">Repair actions</p>
                    <ol className="mt-1 list-decimal pl-5 text-sm text-gray-300">
                      {actions.map((action: string, index: number) => <li key={index}>{action}</li>)}
                    </ol>
                  </div>
                )}
                {relatedParts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="font-semibold text-white">Related catalog parts</p>
                    {relatedParts.map((part: any) => (
                      <div key={part.part_number} className="flex flex-wrap items-center justify-between gap-2 rounded bg-[#222] p-3">
                        <div>
                          <p className="font-mono text-[#FFCD11]">{part.part_number}</p>
                          <p className="text-sm text-gray-300">{part.description}</p>
                        </div>
                        <Button size="sm" variant="outline" className="border-[#555] text-gray-300" onClick={() => requestRelatedPart(part)}>
                          Request quote
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {result.paid_fields_locked && (
                  <div className="mt-3 rounded border border-yellow-700/60 p-3">
                    <p className="text-sm text-yellow-400">{result.upgrade_hint}</p>
                    <Button size="sm" className="mt-2 bg-[#FFCD11] text-black" onClick={() => setLocation("/portal/billing")}>View plans</Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AIPartsSection({ authToken, setLocation }: { authToken: string | null; setLocation: (path: string) => void }) {
  const { data: history, isLoading: sessionsLoading, error: sessionsError, refetch: refetchSessions } = useAuthFetch("/api/portal/ai/sessions", authToken);
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const { toast } = useToast();
  const run = async () => {
    if (!/^\d+$/.test(sessionId) || Number(sessionId) <= 0) {
      toast({ title: "Choose a diagnostic session", variant: "destructive" });
      return;
    }
    setPending(true);
    setRequestError("");
    try {
      const res = await apiFetch("/api/recommended-parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: Number(sessionId) }),
      }, { authenticated: true, token: authToken });
      if (!res.ok) throw new ApiError(await apiErrorMessage(res, "Recommendation failed"), res.status);
      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Recommendation failed";
      setRequestError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const openQuoteDraft = (cards: any[]) => {
    const draft = cards.map((card) => ({
      partNumber: card.part_number,
      description: card.name || card.why_you_need_it || "",
      quantity: 1,
    }));
    sessionStorage.setItem(QUOTE_DRAFT_KEY, JSON.stringify(draft));
    setLocation("/portal/purchase-parts");
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardContent className="p-6 space-y-3">
          <ShoppingCart className="h-12 w-12 text-[#FFCD11]" />
          <h3 className="text-white text-xl font-bold">AI-Recommended Parts</h3>
          {sessionsError ? (
            <SectionError error={sessionsError} retry={() => { void refetchSessions(); }} message="Diagnostic sessions could not be loaded." />
          ) : (
            <Select value={sessionId} onValueChange={setSessionId} disabled={sessionsLoading}>
              <SelectTrigger className="bg-[#222] border-[#444] text-white" data-testid="select-parts-session">
                <SelectValue placeholder={sessionsLoading ? "Loading sessions…" : "Choose a diagnostic session"} />
              </SelectTrigger>
              <SelectContent>
                {(history?.sessions || []).map((session: any) => (
                  <SelectItem key={session.id} value={String(session.id)}>
                    #{session.id} — {[session.machine_make, session.machine_model].filter(Boolean).join(" ") || "Unknown machine"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input aria-label="Diagnostic session id" placeholder="Or enter a diagnostic session id" inputMode="numeric" value={sessionId} onChange={e => setSessionId(e.target.value.replace(/\D/g, ""))} className="bg-[#222] border-[#444] text-white" data-testid="input-parts-session" />
          <Button className="bg-[#FFCD11] text-black" onClick={run} disabled={pending || !sessionId} data-testid="button-recommend-parts">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Recommend
          </Button>
          {requestError && <p className="text-sm text-red-400" role="alert" data-testid="text-recommended-parts-error">{requestError}</p>}
          {result && (
            <div className="space-y-4 rounded bg-[#111] p-4" data-testid="recommended-parts-result">
              <div>
                <h4 className="text-lg font-semibold text-white">{result.hero_line}</h4>
                <p className="text-sm text-gray-400">{result.urgency_framing}</p>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {(result.cards || []).map((card: any) => (
                  <div key={card.part_number} className="rounded border border-[#333] bg-[#1a1a1a] p-4">
                    <p className="font-mono text-[#FFCD11]">{card.part_number}</p>
                    <p className="font-semibold text-white">{card.name}</p>
                    <p className="mt-1 text-sm text-gray-400">{card.why_you_need_it}</p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-white">{card.price_usd == null ? "Price on request" : `$${Number(card.price_usd).toFixed(2)}`}</span>
                      <Button size="sm" className="bg-[#FFCD11] text-black" onClick={() => openQuoteDraft([card])}>{card.cta_label || "Add to inquiry"}</Button>
                    </div>
                  </div>
                ))}
              </div>
              {result.bundle_offer && (
                <div className="rounded border border-[#FFCD11]/40 p-3 text-sm text-gray-300">
                  <p className="font-semibold text-[#FFCD11]">{result.bundle_offer.label}</p>
                  <p>{result.bundle_offer.rationale}</p>
                </div>
              )}
              {(result.cards || []).length > 1 && (
                <Button className="bg-[#FFCD11] text-black" onClick={() => openQuoteDraft(result.cards)} data-testid="button-add-all-recommended-parts">
                  Add all to quote request
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AIRepairPlanningSection({ authToken }: { authToken: string | null }) {
  const { data: history, isLoading: sessionsLoading, error: sessionsError, refetch: refetchSessions } = useAuthFetch("/api/portal/ai/sessions", authToken);
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const { toast } = useToast();
  const run = async () => {
    if (!/^\d+$/.test(sessionId) || Number(sessionId) <= 0) {
      toast({ title: "Choose a diagnosis with a structured playbook", variant: "destructive" });
      return;
    }
    setPending(true);
    setRequestError("");
    try {
      const res = await apiFetch("/api/repair-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: Number(sessionId) }),
      }, { authenticated: true, token: authToken });
      if (!res.ok) throw new ApiError(await apiErrorMessage(res, "Repair plan failed"), res.status);
      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Repair plan failed";
      setRequestError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardContent className="p-6 space-y-3">
          <ClipboardList className="h-12 w-12 text-[#FFCD11]" />
          <h3 className="text-white text-xl font-bold">Repair Planning</h3>
          {sessionsError ? (
            <SectionError error={sessionsError} retry={() => { void refetchSessions(); }} message="Diagnostic sessions could not be loaded." />
          ) : (
            <Select value={sessionId} onValueChange={setSessionId} disabled={sessionsLoading}>
              <SelectTrigger className="bg-[#222] border-[#444] text-white" data-testid="select-plan-session">
                <SelectValue placeholder={sessionsLoading ? "Loading sessions…" : "Choose a structured diagnosis"} />
              </SelectTrigger>
              <SelectContent>
                {(history?.sessions || []).filter((session: any) => session.has_playbook).map((session: any) => (
                  <SelectItem key={session.id} value={String(session.id)}>
                    #{session.id} — {[session.machine_make, session.machine_model].filter(Boolean).join(" ") || "Unknown machine"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input aria-label="Diagnostic session id" inputMode="numeric" placeholder="Or enter a diagnostic session id" value={sessionId} onChange={e => setSessionId(e.target.value.replace(/\D/g, ""))} className="bg-[#222] border-[#444] text-white" data-testid="input-plan-session" />
          <Button className="bg-[#FFCD11] text-black" onClick={run} disabled={pending || !sessionId} data-testid="button-repair-plan">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Generate plan
          </Button>
          {requestError && <p className="text-sm text-red-400" role="alert" data-testid="text-repair-plan-error">{requestError}</p>}
          {result?.plan && (
            <div className="space-y-4 rounded bg-[#111] p-4 text-sm" data-testid="repair-plan-result">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded bg-[#222] p-3"><p className="text-gray-500">Labor estimate</p><p className="text-lg font-semibold text-white">{result.plan.labor_hours_estimate} hours</p></div>
                <div className="rounded bg-[#222] p-3"><p className="text-gray-500">Projected downtime</p><p className="text-lg font-semibold text-white">{result.plan.downtime_days_projection} days</p></div>
                <div className="rounded bg-[#222] p-3"><p className="text-gray-500">Parts estimate</p><p className="text-lg font-semibold text-white">${Number(result.plan.total_parts_cost_usd || 0).toFixed(2)}</p></div>
              </div>
              <div>
                <h4 className="font-semibold text-white">Required tools</h4>
                <p className="text-gray-300">{(result.plan.required_tools || []).join(", ")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-white">Suggested sequence</h4>
                <ol className="mt-2 space-y-2">
                  {(result.plan.suggested_sequence || []).map((step: any, index: number) => (
                    <li key={index} className="rounded bg-[#222] p-3 text-gray-300">
                      <span className="font-medium text-white">{index + 1}. {step.step}</span> ({step.time_min} min)
                      {step.prerequisites?.length > 0 && <p className="text-gray-500">Prerequisites: {step.prerequisites.join(", ")}</p>}
                    </li>
                  ))}
                </ol>
              </div>
              <p className="text-gray-300">Estimated labor: ${Number(result.plan.total_labor_cost_usd_low || 0).toFixed(2)}–${Number(result.plan.total_labor_cost_usd_high || 0).toFixed(2)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AIPredictiveSection({ authToken }: { authToken: string | null }) {
  const { data: alerts, isLoading, error, refetch } = useAuthFetch("/api/predictive", authToken);
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState("");
  const { toast } = useToast();
  const run = async () => {
    setPending(true);
    setRequestError("");
    try {
      const res = await apiFetch("/api/predictive", {
        method: "POST",
      }, { authenticated: true, token: authToken });
      if (!res.ok) throw new ApiError(await apiErrorMessage(res, "Predictive run failed"), res.status);
      const data = await res.json();
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ["/api/predictive"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Predictive run failed";
      setRequestError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardContent className="p-6 space-y-3">
          <TrendingUp className="h-12 w-12 text-[#FFCD11]" />
          <h3 className="text-white text-xl font-bold">Predictive Maintenance</h3>
          <p className="text-gray-400" data-testid="text-predictive-info">Uses your equipment and diagnostic history. Empty if you have no machines yet.</p>
          <Button className="bg-[#FFCD11] text-black" onClick={run} disabled={pending} data-testid="button-run-predictive">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Generate predictions
          </Button>
          {requestError && <p className="text-sm text-red-400" role="alert" data-testid="text-predictive-error">{requestError}</p>}
          {result && (
            <div className="space-y-3 rounded bg-[#111] p-4" data-testid="predictive-result">
              {result.empty_message && <p className="text-gray-300" role="status">{result.empty_message}</p>}
              {(result.predictions || []).map((prediction: any) => (
                <div key={prediction.equipment_id} className="rounded border border-[#333] bg-[#1a1a1a] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">{prediction.equipment?.make} {prediction.equipment?.model}</p>
                    <Badge className={prediction.risk_score >= 70 ? "bg-red-600" : prediction.risk_score >= 40 ? "bg-yellow-600 text-black" : "bg-green-600"}>{prediction.risk_score}% risk</Badge>
                  </div>
                  <p className="mt-2 text-gray-300">{prediction.recommended_action}</p>
                  <p className="text-sm text-gray-500">Window: {prediction.predicted_failure_window} · Confidence: {Math.round(Number(prediction.confidence || 0) * 100)}%</p>
                </div>
              ))}
            </div>
          )}
          <div>
            <h4 className="mb-2 font-semibold text-white">Saved alerts</h4>
            {isLoading ? <Skeleton className="h-16 w-full" /> : error ? (
              <SectionError error={error} retry={() => { void refetch(); }} message="Saved predictive alerts could not be loaded." />
            ) : (alerts?.alerts || []).length > 0 ? (
              <div className="space-y-2">
                {alerts.alerts.map((alert: any) => (
                  <div key={alert.id} className="rounded bg-[#222] p-3 text-sm text-gray-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{alert.recommendedAction}</span>
                      <Badge variant="secondary">{alert.riskScore}% risk</Badge>
                    </div>
                    <p className="text-gray-500">{alert.predictedFailureWindow}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-gray-500">No predictive alerts yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AICaseHistorySection({ authToken }: { authToken: string | null }) {
  const { data: liveCases, isLoading: liveLoading, error: liveError, refetch: refetchLive } = useAuthFetch("/api/portal/cases", authToken);
  const { data: diagnosisHistory, isLoading: diagnosisLoading, error: diagnosisError, refetch: refetchDiagnoses } = useAuthFetch("/api/portal/ai/sessions", authToken);
  const [expandedLiveId, setExpandedLiveId] = useState<number | null>(null);
  const [selectedDiagnosisId, setSelectedDiagnosisId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const { data: diagnosisDetail, isLoading: detailLoading, error: detailError, refetch: refetchDetail } = useAuthFetch(
    selectedDiagnosisId ? `/api/diagnosis/${selectedDiagnosisId}` : "",
    authToken,
    Boolean(selectedDiagnosisId),
  );
  const { toast } = useToast();

  const cases = liveCases || [];
  const diagnoses = diagnosisHistory?.sessions || [];

  const downloadPdf = async (id: string | number) => {
    const value = String(id);
    setDownloadingId(value);
    try {
      await downloadAuthenticatedFile(`/api/diagnosis/${encodeURIComponent(value)}/pdf`, `fixmyiron-diagnosis-${value}.pdf`);
      toast({ title: "Diagnosis PDF downloaded" });
    } catch (error) {
      toast({ title: "PDF download failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section aria-labelledby="structured-history-heading">
        <h3 id="structured-history-heading" className="mb-3 text-lg font-semibold text-white">Structured diagnoses</h3>
        {diagnosisLoading ? <Skeleton className="h-20 w-full" /> : diagnosisError ? (
          <SectionError error={diagnosisError} retry={() => { void refetchDiagnoses(); }} message="Structured diagnosis history could not be loaded." />
        ) : diagnoses.length === 0 ? (
          <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-6 text-center text-gray-400">No structured diagnoses yet.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {diagnoses.map((diagnosis: any) => {
              const selected = selectedDiagnosisId === String(diagnosis.id);
              return (
                <Card key={diagnosis.id} className={`bg-[#1a1a1a] border-[#333] ${selected ? "border-[#FFCD11]" : ""}`} data-testid={`card-diagnosis-history-${diagnosis.id}`}>
                  <CardContent className="p-4">
                    <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setSelectedDiagnosisId(selected ? null : String(diagnosis.id))}>
                      <div>
                        <p className="font-semibold text-white">Diagnosis #{diagnosis.id} — {[diagnosis.machine_make, diagnosis.machine_model].filter(Boolean).join(" ") || "Unknown machine"}</p>
                        <p className="text-sm text-gray-500">{diagnosis.started_at ? new Date(diagnosis.started_at).toLocaleString() : "Date unavailable"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{diagnosis.status}</Badge>
                        <ChevronRight className={`h-4 w-4 text-gray-400 ${selected ? "rotate-90" : ""}`} />
                      </div>
                    </button>
                    {selected && (
                      <div className="mt-4 space-y-3 border-t border-[#333] pt-4">
                        {detailLoading ? <Skeleton className="h-24 w-full" /> : detailError ? (
                          <SectionError error={detailError} retry={() => { void refetchDetail(); }} message="Diagnosis details could not be loaded." />
                        ) : (
                          <>
                            <DiagnosisPlaybook data={diagnosisDetail} />
                            {diagnosis.has_playbook && (
                              <Button variant="outline" className="border-[#444] text-gray-300" disabled={downloadingId === String(diagnosis.id)} onClick={() => { void downloadPdf(diagnosis.id); }}>
                                <Download className="h-4 w-4 mr-2" /> Download PDF
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="live-history-heading">
        <h3 id="live-history-heading" className="mb-3 text-lg font-semibold text-white">Live Desk sessions</h3>
        {liveLoading ? <Skeleton className="h-20 w-full" /> : liveError ? (
          <SectionError error={liveError} retry={() => { void refetchLive(); }} message="Live Desk history could not be loaded." />
        ) : cases.length === 0 ? (
          <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
            <History className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400" data-testid="text-no-cases">No Live Desk sessions yet.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {cases.map((item: any) => {
              const expanded = expandedLiveId === item.id;
              return (
                <Card key={item.id} className={`bg-[#1a1a1a] border-[#333] ${expanded ? "border-[#FFCD11]" : ""}`} data-testid={`card-case-${item.id}`}>
                  <CardContent className="p-4">
                    <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setExpandedLiveId(expanded ? null : item.id)}>
                      <div className="min-w-0">
                        <p className="font-semibold text-white">Session #{item.id} — {item.equipmentType || "General"} {item.make || ""} {item.model || ""}</p>
                        <p className="truncate text-sm text-gray-400">{item.problemSummary || "No summary"}</p>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 text-gray-400 ${expanded ? "rotate-90" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#333] pt-4 text-sm sm:grid-cols-2">
                        <div><p className="text-gray-500">Status</p><p className="text-white">{item.status}</p></div>
                        <div><p className="text-gray-500">Created</p><p className="text-white">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</p></div>
                        {item.serialNumber && <div><p className="text-gray-500">Serial number</p><p className="font-mono text-white">{item.serialNumber}</p></div>}
                        {item.faultCodes && <div><p className="text-gray-500">Fault codes</p><p className="text-white">{item.faultCodes}</p></div>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function AILiveMechanicSection({ setLocation }: { setLocation: (path: string) => void }) {
  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#FFCD11]">
        <CardContent className="p-8 text-center">
          <Video className="h-16 w-16 text-[#FFCD11] mx-auto mb-4" />
          <h3 className="text-white text-2xl font-bold mb-2">Live AI Mechanic</h3>
          <p className="text-gray-400 mb-6">Connect with our AI-powered virtual mechanic avatar for real-time diagnostic support. Get instant guidance on equipment issues through live video interaction.</p>
          <Button className="bg-[#FFCD11] text-black font-bold text-lg px-8" onClick={() => setLocation("/live-desk")} data-testid="button-live-mechanic">
            <Video className="h-5 w-5 mr-2" /> Launch Live AI Mechanic
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function AIEscalationSection({ authToken }: { authToken: string | null }) {
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal", equipmentInfo: "" });
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const { data: escalationHistory, isLoading: historyLoading, error: historyError, refetch: refetchHistory } = useAuthFetch("/api/portal/ai/escalations", authToken);

  const escalateMutation = useAuthMutation("POST", "/api/portal/ai/escalations", authToken, ["/api/portal/ai/escalations"]);

  const handleSubmit = async () => {
    if (!form.subject) {
      toast({ title: "Subject is required", variant: "destructive" });
      return;
    }
    try {
      await escalateMutation.mutateAsync(form);
      toast({ title: "Escalation submitted. A human expert will review your request." });
      setSubmitted(true);
    } catch {
      // error handled by mutation
    }
  };

  if (submitted) {
    return (
      <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-white text-xl font-bold mb-2">Escalation Submitted</h3>
        <p className="text-gray-400" data-testid="text-escalation-success">Your request has been submitted. A human expert will reach out to you shortly.</p>
        <Button className="mt-4 bg-[#FFCD11] text-black" onClick={() => { setSubmitted(false); setForm({ subject: "", description: "", priority: "normal", equipmentInfo: "" }); }}>Submit Another</Button>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2">
          <CardTitle className="text-white">Request Human Expert</CardTitle>
          <CardDescription className="text-gray-400">Need a real mechanic? Submit an escalation request and our team will follow up.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="escalation-subject" className="text-gray-300 text-sm">Subject *</Label>
            <Input id="escalation-subject" required value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-escalation-subject" />
          </div>
          <div>
            <Label htmlFor="escalation-description" className="text-gray-300 text-sm">Description</Label>
            <Textarea id="escalation-description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-escalation-description" />
          </div>
          <div>
            <Label htmlFor="escalation-equipment" className="text-gray-300 text-sm">Equipment Info</Label>
            <Input id="escalation-equipment" value={form.equipmentInfo} onChange={e => setForm(f => ({ ...f, equipmentInfo: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="Make, model, serial..." data-testid="input-escalation-equipment" />
          </div>
          <div>
            <Label htmlFor="escalation-priority" className="text-gray-300 text-sm">Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger id="escalation-priority" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-escalation-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="bg-[#FFCD11] text-black" onClick={handleSubmit} disabled={escalateMutation.isPending} data-testid="button-submit-escalation">
            {escalateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <PhoneCall className="h-4 w-4 mr-1" /> Submit Escalation
          </Button>
        </CardContent>
      </Card>
      <section aria-labelledby="escalation-history-heading">
        <h3 id="escalation-history-heading" className="mb-3 text-lg font-semibold text-white">Previous escalations</h3>
        {historyLoading ? <Skeleton className="h-16 w-full" /> : historyError ? (
          <SectionError error={historyError} retry={() => { void refetchHistory(); }} message="Escalation history could not be loaded." />
        ) : (escalationHistory?.escalations || []).length > 0 ? (
          <div className="space-y-2">
            {escalationHistory.escalations.map((item: any) => (
              <Card key={item.id} className="bg-[#1a1a1a] border-[#333]">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div><p className="font-semibold text-white">{item.subject}</p><p className="text-sm text-gray-400">{item.description || "No description"}</p></div>
                  <div className="flex gap-2"><Badge variant="secondary">{item.priority}</Badge><Badge variant="secondary">{item.status}</Badge></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <p className="text-sm text-gray-500">No previous escalations.</p>}
      </section>
    </div>
  );
}

export default function PortalPage() {
  const {
    customer,
    authToken,
    logout,
    retrySession,
    applySession,
    isAuthenticated,
    isLoading: authLoading,
    sessionError,
  } = useAuth();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/portal/:section");
  const querySection = new URLSearchParams(window.location.search).get("section");
  const initialSection = params?.section || querySection || "dashboard";
  const [activeSection, setActiveSection] = useState<SectionId>(isSectionId(initialSection) ? initialSection : "dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const next = params?.section || querySection || "dashboard";
    setActiveSection(isSectionId(next) ? next : "dashboard");
  }, [location, params?.section, querySection]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated && !(authToken && sessionError)) {
      const requestedPath = location.startsWith("/portal") ? location : "/portal";
      setLocation(`/login?redirect=${encodeURIComponent(requestedPath)}`);
    }
  }, [authLoading, authToken, isAuthenticated, location, sessionError, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FFCD11]" />
      </div>
    );
  }

  if (!isAuthenticated && authToken && sessionError) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-red-800 bg-[#1a1a1a]" role="alert" data-testid="session-restore-error">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <h1 className="text-lg font-semibold text-white">We could not restore your session</h1>
            <p className="mt-2 text-sm text-gray-400">{sessionError}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button className="bg-[#FFCD11] text-black" onClick={retrySession} data-testid="button-retry-session">
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
              <Button variant="outline" className="border-[#444] text-gray-300" onClick={logout} data-testid="button-clear-session">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const renderSection = () => {
    switch (activeSection) {
      case "dashboard": return <DashboardSection authToken={authToken} />;
      case "equipment": return <EquipmentSection authToken={authToken} />;
      case "parts": return <PartsSection authToken={authToken} />;
      case "purchase-parts": return <PurchasePartsSection authToken={authToken} />;
      case "service": return <ServiceSection authToken={authToken} />;
      case "maintenance": return <MaintenanceSection authToken={authToken} />;
      case "orders": return <OrdersSection authToken={authToken} />;
      case "documents": return <DocumentsSection authToken={authToken} />;
      case "billing": return <BillingSection authToken={authToken} />;
      case "support": return <SupportSection authToken={authToken} />;
      case "admin": return <AdminSection authToken={authToken} customer={customer} applySession={applySession} />;
      case "ai-intake": return <AIIntakeSection setLocation={setLocation} />;
      case "ai-diagnosis": return <AIDiagnosisSection authToken={authToken} />;
      case "ai-troubleshooting": return <AITroubleshootingSection authToken={authToken} />;
      case "ai-faultcodes": return <AIFaultCodeSection authToken={authToken} setLocation={setLocation} />;
      case "ai-parts": return <AIPartsSection authToken={authToken} setLocation={setLocation} />;
      case "ai-planning": return <AIRepairPlanningSection authToken={authToken} />;
      case "ai-predictive": return <AIPredictiveSection authToken={authToken} />;
      case "ai-history": return <AICaseHistorySection authToken={authToken} />;
      case "ai-live": return <AILiveMechanicSection setLocation={setLocation} />;
      case "ai-escalation": return <AIEscalationSection authToken={authToken} />;
      default: return <DashboardSection authToken={authToken} />;
    }
  };

  const handleNav = (id: SectionId) => {
    setActiveSection(id);
    setSidebarOpen(false);
    setLocation(`/portal/${id}`);
  };

  return (
    <div className="min-h-screen bg-[#111111] flex">
      {sidebarOpen && (
        <button type="button" aria-label="Close portal navigation" className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        id="portal-navigation"
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-[#1a1a1a] border-r border-[#333] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "visible translate-x-0" : "invisible -translate-x-full lg:visible lg:translate-x-0"
        }`}
        aria-label="Portal navigation"
        data-testid="sidebar"
      >
        <div className="p-4 border-b border-[#333] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="AMERICAN IRON" className="h-8" data-testid="img-sidebar-logo" />
            <span className="text-[#FFCD11] font-bold text-sm">AMERICAN IRON</span>
          </div>
          <Button size="icon" variant="ghost" className="lg:hidden text-gray-400" aria-label="Close portal navigation" onClick={() => setSidebarOpen(false)} data-testid="button-close-sidebar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-4 py-2">
            <p className="text-[#FFCD11] text-xs font-bold tracking-wider">CUSTOMER PORTAL</p>
          </div>
          {portalNav.map(item => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                activeSection === item.id
                  ? "text-[#FFCD11] bg-[#FFCD11]/10 border-r-2 border-[#FFCD11]"
                  : "text-gray-400 hover:text-white hover:bg-[#222]"
              }`}
              aria-current={activeSection === item.id ? "page" : undefined}
              data-testid={`nav-${item.id}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}

          <div className="px-4 py-2 mt-4">
            <p className="text-[#FFCD11] text-xs font-bold tracking-wider">AI VIRTUAL MECHANIC</p>
          </div>
          {aiNav.map(item => (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                activeSection === item.id
                  ? "text-[#FFCD11] bg-[#FFCD11]/10 border-r-2 border-[#FFCD11]"
                  : "text-gray-400 hover:text-white hover:bg-[#222]"
              }`}
              aria-current={activeSection === item.id ? "page" : undefined}
              data-testid={`nav-${item.id}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-[#333]">
          <div className="mb-3">
            <p className="text-white text-sm font-semibold" data-testid="text-customer-name">{customer?.firstName} {customer?.lastName}</p>
            {customer?.company && <p className="text-gray-500 text-xs" data-testid="text-customer-company">{customer.company}</p>}
          </div>
          <Button variant="outline" className="mb-2 w-full border-[#444] text-gray-300" onClick={() => setLocation("/admin")} data-testid="button-admin-console">
            <Settings className="h-4 w-4 mr-2" /> Admin Console
          </Button>
          <Button variant="outline" className="w-full border-[#444] text-gray-300" onClick={logout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-[#111111] border-b border-[#333] px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                className="lg:hidden text-gray-400"
                aria-label="Open portal navigation"
                aria-controls="portal-navigation"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen(true)}
                data-testid="button-open-sidebar"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span>Portal</span>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-white">{sectionTitles[activeSection]}</span>
                </div>
                <h1 className="text-white text-lg font-bold" data-testid="text-section-title">{sectionTitles[activeSection]}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-[#FFCD11] text-black text-xs" data-testid="badge-customer-name">
                {customer?.firstName} {customer?.lastName}
              </Badge>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
