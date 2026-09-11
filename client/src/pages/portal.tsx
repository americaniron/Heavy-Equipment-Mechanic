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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard, Truck, Search, Wrench, CalendarClock, Package, FileText,
  DollarSign, Headphones, Settings, Bot, Stethoscope, BookOpen, AlertTriangle,
  ShoppingCart, ClipboardList, TrendingUp, History, Video, PhoneCall,
  Menu, X, LogOut, Plus, ChevronRight, Loader2, Eye, Trash2, Edit,
  Activity, Bell, Clock, CheckCircle2, XCircle, ArrowRight
} from "lucide-react";
const logoImg = "/media/logo.png";

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
  { id: "admin", label: "Admin", icon: Settings },
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

function useAuthFetch(url: string, authToken: string | null, enabled = true) {
  return useQuery({
    queryKey: [url],
    queryFn: async () => {
      const res = await fetch(url, {
        headers: { "x-auth-token": authToken || "" },
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: enabled && !!authToken,
  });
}

function useAuthMutation(method: string, url: string, authToken: string | null, invalidateKeys: string[]) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": authToken || "",
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

function DashboardSection({ authToken }: { authToken: string | null }) {
  const { data, isLoading } = useAuthFetch("/api/portal/dashboard", authToken);

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
  const { data: equipmentList, isLoading } = useAuthFetch("/api/portal/equipment", authToken);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", type: "", make: "", model: "", year: "", serialNumber: "", smuHours: "", warrantyExpiry: "", notes: "" });
  const { toast } = useToast();

  const createMutation = useAuthMutation("POST", "/api/portal/equipment", authToken, ["/api/portal/equipment", "/api/portal/dashboard"]);
  const updateMutation = useAuthMutation("PUT", `/api/portal/equipment/${editingId}`, authToken, ["/api/portal/equipment", "/api/portal/dashboard"]);
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/portal/equipment/${id}`, {
        method: "DELETE",
        headers: { "x-auth-token": authToken || "" },
      });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/dashboard"] });
      toast({ title: "Equipment deleted" });
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
    if (editingId) {
      await updateMutation.mutateAsync(form);
      toast({ title: "Equipment updated" });
    } else {
      await createMutation.mutateAsync(form);
      toast({ title: "Equipment added" });
    }
    resetForm();
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
                  <Label className="text-gray-300 text-sm capitalize">{field.replace(/([A-Z])/g, " $1")}</Label>
                  <Input
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
              <Label className="text-gray-300 text-sm">Notes</Label>
              <Textarea
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
                    <Button size="icon" variant="ghost" onClick={() => startEdit(eq)} data-testid={`button-edit-equipment-${eq.id}`}><Edit className="h-4 w-4 text-gray-400" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(eq.id)} data-testid={`button-delete-equipment-${eq.id}`}><Trash2 className="h-4 w-4 text-gray-400" /></Button>
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

function PartsSection({ authToken }: { authToken: string | null }) {
  const [serial, setSerial] = useState("");
  const [searchTriggered, setSearchTriggered] = useState(false);
  const { data, isLoading } = useAuthFetch(`/api/portal/parts?serial=${encodeURIComponent(serial)}`, authToken, searchTriggered && !!serial);

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

      {searchTriggered && !isLoading && data && (
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
                    {part.price && <Badge className="bg-[#FFCD11] text-black text-sm px-3">${part.price}</Badge>}
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
  const { data: quoteRequests, isLoading: quotesLoading } = useAuthFetch("/api/portal/quote-requests", authToken);
  const { data: equipmentList } = useAuthFetch("/api/portal/equipment", authToken);
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

  const { data: quoteDetail, isLoading: detailLoading } = useAuthFetch(
    viewingQuote ? `/api/portal/quote-requests/${viewingQuote}` : "",
    authToken,
    !!viewingQuote
  );

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/portal/quote-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/portal/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portal/dashboard"] });
      toast({ title: "Quote Request Submitted", description: `Reference: ${data.quoteRequest.referenceNumber}. You'll receive an email confirmation shortly.` });
      setShowForm(false);
      resetForm();
    },
    onError: (err: any) => {
      let msg = err.message;
      try { msg = JSON.parse(err.message)?.error || msg; } catch {}
      toast({ title: "Submission Failed", description: msg, variant: "destructive" });
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
      urgency: urgencyIdx >= 0 ? ((cols[urgencyIdx] || "standard").trim().toLowerCase()) : "standard",
    })).filter(item => item.partNumber.length > 0);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();
    const validExts = ["csv", "txt", "xlsx"];
    if (!ext || !validExts.includes(ext)) {
      toast({ title: "Invalid file type", description: "Please upload a CSV, TXT, or XLSX file", variant: "destructive" });
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
            const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

            if (lines.length < 2) {
              toast({ title: "Invalid CSV", description: "File must have a header row and at least one data row", variant: "destructive" });
              setCsvParsing(false);
              return;
            }

            const header = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
            const rows = lines.slice(1).map(line => line.split(",").map(c => c.trim().replace(/^"|"$/g, "")));
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
      equipmentId: equipmentId || undefined,
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
                <Label className="text-gray-300 text-sm">Upload Parts List (Excel or CSV)</Label>
                <Input
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
                  <Label className="text-gray-300 text-sm">Link to Equipment</Label>
                  <Select value={equipmentId} onValueChange={setEquipmentId}>
                    <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-equipment">
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
              <Label className="text-gray-300 text-sm">Equipment Info (optional)</Label>
              <Input
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
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-500 hover:text-red-400" onClick={() => removeItem(idx)} data-testid={`button-remove-part-${idx}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <Input
                          value={item.partNumber}
                          onChange={e => updateItem(idx, "partNumber", e.target.value)}
                          onBlur={async () => {
                            const pn = item.partNumber.trim();
                            if (pn.length >= 2 && !item.description) {
                              try {
                                const headers: Record<string, string> = {};
                                if (authToken) headers["x-auth-token"] = authToken;
                                const resp = await fetch(`/api/portal/parts/validate?partNumber=${encodeURIComponent(pn)}`, { headers });
                                if (resp.ok) {
                                  const data = await resp.json();
                                  if (data.valid && data.name) {
                                    updateItem(idx, "description", `${data.name} — ${data.description || ""}`);
                                  }
                                }
                              } catch {}
                            }
                          }}
                          className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                          placeholder="Part Number *"
                          data-testid={`input-part-number-${idx}`}
                        />
                      </div>
                      <div>
                        <Input
                          value={item.description}
                          onChange={e => updateItem(idx, "description", e.target.value)}
                          className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                          placeholder="Description (auto-fills if found)"
                          data-testid={`input-part-desc-${idx}`}
                        />
                      </div>
                      <div>
                        <Input
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
                        value={item.make}
                        onChange={e => updateItem(idx, "make", e.target.value)}
                        className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                        placeholder="Make"
                        data-testid={`input-part-make-${idx}`}
                      />
                      <Input
                        value={item.model}
                        onChange={e => updateItem(idx, "model", e.target.value)}
                        className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                        placeholder="Model"
                        data-testid={`input-part-model-${idx}`}
                      />
                      <Input
                        value={item.serialNumber}
                        onChange={e => updateItem(idx, "serialNumber", e.target.value)}
                        className="bg-[#1a1a1a] border-[#444] text-white text-sm"
                        placeholder="Serial Number"
                        data-testid={`input-part-serial-${idx}`}
                      />
                      <Select value={item.urgency} onValueChange={v => updateItem(idx, "urgency", v)}>
                        <SelectTrigger className="bg-[#1a1a1a] border-[#444] text-white text-sm" data-testid={`select-urgency-${idx}`}>
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
              <Label className="text-gray-300 text-sm">Additional Notes</Label>
              <Textarea
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

      {quotesLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-[#FFCD11]" /></div>
      ) : (quoteRequests && (quoteRequests as any[]).length > 0) ? (
        <div className="space-y-2">
          {(quoteRequests as any[]).map((qr: any) => (
            <Card
              key={qr.id}
              className="bg-[#1a1a1a] border-[#333] cursor-pointer hover:border-[#FFCD11]/40 transition-colors"
              onClick={() => setViewingQuote(qr.id)}
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
      ) : (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardContent className="p-8 text-center">
            <ShoppingCart className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400" data-testid="text-no-quotes">No quote requests yet. Click "New Quote Request" to submit your parts list.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ServiceSection({ authToken }: { authToken: string | null }) {
  const { data: requests, isLoading } = useAuthFetch("/api/portal/service-requests", authToken);
  const { data: workOrders } = useAuthFetch("/api/portal/work-orders", authToken);
  const { data: equipmentList } = useAuthFetch("/api/portal/equipment", authToken);
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
    await createMutation.mutateAsync({
      ...form,
      equipmentId: form.equipmentId ? parseInt(form.equipmentId) : null,
    });
    toast({ title: "Service request created" });
    setForm({ type: "diagnostic", priority: "normal", description: "", faultCodes: "", equipmentId: "" });
    setShowForm(false);
  };

  const items = requests || [];
  const orders = workOrders || [];
  const eqList = equipmentList || [];

  const priorityColor: Record<string, string> = { urgent: "bg-red-600", high: "bg-orange-500", normal: "bg-blue-500", low: "bg-gray-500" };
  const statusColor: Record<string, string> = { open: "bg-blue-600", "in-progress": "bg-yellow-600", completed: "bg-green-600", closed: "bg-gray-600" };

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
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
                <Label className="text-gray-300 text-sm">Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-service-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="breakdown">Breakdown</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="diagnostic">Diagnostic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-service-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Equipment</Label>
                <Select value={form.equipmentId} onValueChange={v => setForm(f => ({ ...f, equipmentId: v }))}>
                  <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-service-equipment"><SelectValue placeholder="Select..." /></SelectTrigger>
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
              <Label className="text-gray-300 text-sm">Description *</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-service-description" />
            </div>
            <div>
              <Label className="text-gray-300 text-sm">Fault Codes</Label>
              <Input value={form.faultCodes} onChange={e => setForm(f => ({ ...f, faultCodes: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="e.g., P0420, P0301" data-testid="input-service-faultcodes" />
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
                onClick={() => setExpandedId(isExpanded ? null : sr.id)} data-testid={`card-service-${sr.id}`}>
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
  const { data: schedules, isLoading } = useAuthFetch("/api/portal/maintenance", authToken);
  const { data: equipmentList } = useAuthFetch("/api/portal/equipment", authToken);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ serviceType: "", intervalHours: "", lastServiceDate: "", nextServiceDate: "", equipmentId: "" });
  const { toast } = useToast();
  const createMutation = useAuthMutation("POST", "/api/portal/maintenance", authToken, ["/api/portal/maintenance"]);

  const handleSubmit = async () => {
    if (!form.serviceType || !form.equipmentId) {
      toast({ title: "Service type and equipment are required", variant: "destructive" });
      return;
    }
    await createMutation.mutateAsync({ ...form, equipmentId: parseInt(form.equipmentId) });
    toast({ title: "Maintenance schedule created" });
    setForm({ serviceType: "", intervalHours: "", lastServiceDate: "", nextServiceDate: "", equipmentId: "" });
    setShowForm(false);
  };

  const items = schedules || [];
  const eqList = equipmentList || [];

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-gray-400">{items.length} schedule{items.length !== 1 ? "s" : ""}</p>
        <Button className="bg-[#FFCD11] text-black" onClick={() => setShowForm(!showForm)} data-testid="button-add-maintenance">
          <Plus className="h-4 w-4 mr-1" /> Add Schedule
        </Button>
      </div>

      {showForm && (
        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-2"><CardTitle className="text-white text-lg">New PM Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-sm">Equipment *</Label>
                <Select value={form.equipmentId} onValueChange={v => setForm(f => ({ ...f, equipmentId: v }))}>
                  <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-maintenance-equipment"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {eqList.map((eq: any) => <SelectItem key={eq.id} value={String(eq.id)}>{eq.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Service Type *</Label>
                <Input value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="e.g., Oil Change" data-testid="input-maintenance-type" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Interval Hours</Label>
                <Input value={form.intervalHours} onChange={e => setForm(f => ({ ...f, intervalHours: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="250" data-testid="input-maintenance-interval" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Last Service Date</Label>
                <Input type="date" value={form.lastServiceDate} onChange={e => setForm(f => ({ ...f, lastServiceDate: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-maintenance-last" />
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Next Service Date</Label>
                <Input type="date" value={form.nextServiceDate} onChange={e => setForm(f => ({ ...f, nextServiceDate: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-maintenance-next" />
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
  const { data: quoteRequests, isLoading } = useAuthFetch("/api/portal/quote-requests", authToken);

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

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
  const { data: docs, isLoading } = useAuthFetch("/api/portal/documents", authToken);
  const categories = ["manuals", "invoices", "reports", "warranties"];
  const [filter, setFilter] = useState("all");

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  const items = docs || [];
  const filtered = filter === "all" ? items : items.filter((d: any) => d.type === filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant={filter === "all" ? "default" : "outline"} className={filter === "all" ? "bg-[#FFCD11] text-black" : "border-[#444] text-gray-300"} onClick={() => setFilter("all")} data-testid="button-filter-all">All</Button>
        {categories.map(cat => (
          <Button key={cat} variant={filter === cat ? "default" : "outline"} className={filter === cat ? "bg-[#FFCD11] text-black" : "border-[#444] text-gray-300"} onClick={() => setFilter(cat)} data-testid={`button-filter-${cat}`}>
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
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
                  <Badge variant="secondary" className="text-xs">{doc.type}</Badge>
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
  const { data: invoices, isLoading } = useAuthFetch("/api/portal/invoices", authToken);
  const { data: billing } = useAuthFetch("/api/portal/billing/me", authToken);
  const { toast } = useToast();
  const [busy, setBusy] = useState<"pro" | "shop" | "portal" | null>(null);
  const checkout = new URLSearchParams(window.location.search).get("checkout");

  const startCheckout = async (target: "pro" | "shop") => {
    setBusy(target);
    try {
      const res = await fetch("/api/portal/billing/stripe/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
        body: JSON.stringify({ target_tier: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout could not start");
      window.location.href = data.url;
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Checkout failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy("portal");
    try {
      const res = await fetch("/api/portal/billing/portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Billing portal unavailable");
      window.location.href = data.url;
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Portal failed", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

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
            <Button variant="outline" className="border-[#444] text-gray-300" disabled={busy !== null} onClick={openPortal} data-testid="button-stripe-portal">
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
  const { data: tickets, isLoading } = useAuthFetch("/api/portal/support-tickets", authToken);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal", category: "" });
  const { toast } = useToast();
  const createMutation = useAuthMutation("POST", "/api/portal/support-tickets", authToken, ["/api/portal/support-tickets"]);

  const handleSubmit = async () => {
    if (!form.subject) {
      toast({ title: "Subject is required", variant: "destructive" });
      return;
    }
    await createMutation.mutateAsync(form);
    toast({ title: "Support ticket created" });
    setForm({ subject: "", description: "", priority: "normal", category: "" });
    setShowForm(false);
  };

  const items = tickets || [];

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

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
              <Label className="text-gray-300 text-sm">Subject *</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-ticket-subject" />
            </div>
            <div>
              <Label className="text-gray-300 text-sm">Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-ticket-description" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-300 text-sm">Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-ticket-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-ticket-category"><SelectValue placeholder="Select..." /></SelectTrigger>
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

function AdminSection({ authToken, customer }: { authToken: string | null; customer: any }) {
  const [form, setForm] = useState({
    firstName: customer?.firstName || "",
    lastName: customer?.lastName || "",
    company: customer?.company || "",
    phone: customer?.phone || "",
  });
  const { toast } = useToast();
  const updateMutation = useAuthMutation("PATCH", "/api/portal/profile", authToken, []);

  const handleSave = async () => {
    await updateMutation.mutateAsync(form);
    toast({ title: "Profile updated" });
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2"><CardTitle className="text-white">Profile Settings</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 text-sm">First Name</Label>
              <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-firstname" />
            </div>
            <div>
              <Label className="text-gray-300 text-sm">Last Name</Label>
              <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-lastname" />
            </div>
            <div>
              <Label className="text-gray-300 text-sm">Company</Label>
              <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-company" />
            </div>
            <div>
              <Label className="text-gray-300 text-sm">Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-admin-phone" />
            </div>
          </div>
          <div>
            <Label className="text-gray-300 text-sm">Email</Label>
            <Input value={customer?.email || ""} disabled className="bg-[#222] border-[#444] text-gray-500 mt-1" data-testid="input-admin-email" />
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
  const { data: cases } = useAuthFetch("/api/portal/cases", authToken);
  const sessions = (cases || []).filter((c: any) => c.diagnosisResult || c.status === "diagnosed" || c.status === "diagnosing");
  const [form, setForm] = useState({ machine_make: "", machine_model: "", year: "", hours: "", symptoms: "", fault_codes: "" });
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  const run = async () => {
    setPending(true);
    setResult(null);
    try {
      const res = await fetch("/api/diagnosis/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
        body: JSON.stringify({
          machine_make: form.machine_make,
          machine_model: form.machine_model,
          year: form.year ? Number(form.year) : null,
          hours: form.hours ? Number(form.hours) : null,
          symptoms: form.symptoms,
          fault_codes: form.fault_codes.split(",").map((s) => s.trim()).filter(Boolean),
          recent_service: [],
          operator_notes: "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Diagnosis failed");
      setResult(data);
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Diagnosis failed", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2"><CardTitle className="text-white">Run a structured diagnosis</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="Make" value={form.machine_make} onChange={e => setForm(f => ({ ...f, machine_make: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-dx-make" />
            <Input placeholder="Model" value={form.machine_model} onChange={e => setForm(f => ({ ...f, machine_model: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-dx-model" />
            <Input placeholder="Year" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} className="bg-[#222] border-[#444] text-white" />
            <Input placeholder="Hours" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} className="bg-[#222] border-[#444] text-white" />
          </div>
          <Textarea placeholder="Symptoms" value={form.symptoms} onChange={e => setForm(f => ({ ...f, symptoms: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-dx-symptoms" />
          <Input placeholder="Fault codes, comma-separated" value={form.fault_codes} onChange={e => setForm(f => ({ ...f, fault_codes: e.target.value }))} className="bg-[#222] border-[#444] text-white" />
          <Button className="bg-[#FFCD11] text-black" onClick={run} disabled={pending} data-testid="button-run-diagnosis">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Stethoscope className="h-4 w-4 mr-1" />} Diagnose
          </Button>
          {result && (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-[#111] p-3 rounded" data-testid="diagnosis-result">{JSON.stringify(result, null, 2)}</pre>
          )}
        </CardContent>
      </Card>
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardHeader className="pb-2"><CardTitle className="text-white">Past Diagnoses</CardTitle></CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-6">
              <Stethoscope className="h-12 w-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400" data-testid="text-no-diagnoses">No diagnosis results yet. Complete an AI session to see results here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s: any) => (
                <div key={s.id} className="p-3 rounded-md bg-[#222]" data-testid={`diagnosis-${s.id}`}>
                  <p className="text-white font-semibold">{s.equipmentType || "Unknown Equipment"} — {s.make} {s.model}</p>
                  <p className="text-gray-400 text-sm">{s.problemSummary || "No summary"}</p>
                  {s.faultCodes && <p className="text-yellow-400 text-xs mt-1">Fault Codes: {s.faultCodes}</p>}
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
  const [pending, setPending] = useState(false);
  const { toast } = useToast();

  const start = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/troubleshooting/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Could not start troubleshooting");
      setSessionId(data.id || data.session_id);
      setTurn(data);
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardContent className="p-6 space-y-3">
          <BookOpen className="h-12 w-12 text-[#FFCD11] mb-2" />
          <h3 className="text-white text-xl font-bold">Guided Troubleshooting</h3>
          <Input placeholder="Make" value={form.machine_make} onChange={e => setForm(f => ({ ...f, machine_make: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-ts-make" />
          <Input placeholder="Model" value={form.machine_model} onChange={e => setForm(f => ({ ...f, machine_model: e.target.value }))} className="bg-[#222] border-[#444] text-white" />
          <Textarea placeholder="What is the machine doing?" value={form.initial_complaint} onChange={e => setForm(f => ({ ...f, initial_complaint: e.target.value }))} className="bg-[#222] border-[#444] text-white" data-testid="input-ts-complaint" />
          <Button className="bg-[#FFCD11] text-black" onClick={start} disabled={pending} data-testid="button-start-troubleshooting">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Start wizard
          </Button>
          {turn && <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-[#111] p-3 rounded" data-testid="troubleshooting-result">{JSON.stringify(turn, null, 2)}</pre>}
          {sessionId && <p className="text-gray-500 text-xs">Session {sessionId}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function AIFaultCodeSection({ authToken }: { authToken: string | null }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  const handleLookup = async () => {
    if (!code.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/portal/fault-codes?code=${encodeURIComponent(code)}`, {
        headers: { "x-auth-token": authToken || "" },
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        setResult({ error: "Code not found" });
      }
    } catch {
      setResult({ error: "Lookup failed" });
    }
    setSearching(false);
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
            <Input value={code} onChange={e => setCode(e.target.value)} className="bg-[#222] border-[#444] text-white flex-1 min-w-[200px]" placeholder="e.g., P0420, SPN 3251" onKeyDown={e => e.key === "Enter" && handleLookup()} data-testid="input-fault-code" />
            <Button className="bg-[#FFCD11] text-black" onClick={handleLookup} disabled={searching} data-testid="button-lookup-fault">
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
                <p className="text-[#FFCD11] font-bold text-lg">{result.code || code}</p>
                {result.manufacturer && <p className="text-gray-500 text-xs">{result.manufacturer}{result.spn ? ` · SPN ${result.spn}` : ""}{result.fmi ? ` / FMI ${result.fmi}` : ""}</p>}
                <p className="text-white mt-1">{result.description || result.meaning || "Interpretation available after AI analysis"}</p>
                {result.likely_causes && <p className="text-gray-300 text-sm mt-2">Causes: {String(result.likely_causes)}</p>}
                {result.paid_fields_locked && <p className="text-yellow-400 text-xs mt-2">{result.upgrade_hint}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AIPartsSection({ authToken }: { authToken: string | null }) {
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const run = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/recommended-parts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
        body: JSON.stringify({ session_id: Number(sessionId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Recommendation failed");
      setResult(data);
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      <Card className="bg-[#1a1a1a] border-[#333]">
        <CardContent className="p-6 space-y-3">
          <ShoppingCart className="h-12 w-12 text-[#FFCD11]" />
          <h3 className="text-white text-xl font-bold">AI-Recommended Parts</h3>
          <Input placeholder="Diagnostic session id" value={sessionId} onChange={e => setSessionId(e.target.value)} className="bg-[#222] border-[#444] text-white" data-testid="input-parts-session" />
          <Button className="bg-[#FFCD11] text-black" onClick={run} disabled={pending} data-testid="button-recommend-parts">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Recommend
          </Button>
          {result && <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-[#111] p-3 rounded" data-testid="recommended-parts-result">{JSON.stringify(result, null, 2)}</pre>}
        </CardContent>
      </Card>
    </div>
  );
}

function AIRepairPlanningSection({ authToken }: { authToken: string | null }) {
  const [sessionId, setSessionId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const run = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/repair-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
        body: JSON.stringify({ session_id: Number(sessionId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Repair plan failed");
      setResult(data);
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
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
          <Input placeholder="Diagnostic session id" value={sessionId} onChange={e => setSessionId(e.target.value)} className="bg-[#222] border-[#444] text-white" data-testid="input-plan-session" />
          <Button className="bg-[#FFCD11] text-black" onClick={run} disabled={pending} data-testid="button-repair-plan">
            {pending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Generate plan
          </Button>
          {result && <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-[#111] p-3 rounded" data-testid="repair-plan-result">{JSON.stringify(result, null, 2)}</pre>}
        </CardContent>
      </Card>
    </div>
  );
}

function AIPredictiveSection({ authToken }: { authToken: string | null }) {
  const { data: alerts } = useAuthFetch("/api/predictive", authToken);
  const [result, setResult] = useState<any>(null);
  const [pending, setPending] = useState(false);
  const { toast } = useToast();
  const run = async () => {
    setPending(true);
    try {
      const res = await fetch("/api/predictive", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-token": authToken || "" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.error || "Predictive run failed");
      setResult(data);
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Failed", variant: "destructive" });
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
          {result && <pre className="text-xs text-gray-300 whitespace-pre-wrap bg-[#111] p-3 rounded" data-testid="predictive-result">{JSON.stringify(result, null, 2)}</pre>}
          {alerts?.alerts && <pre className="text-xs text-gray-500 whitespace-pre-wrap">{JSON.stringify(alerts.alerts, null, 2)}</pre>}
        </CardContent>
      </Card>
    </div>
  );
}

function AICaseHistorySection({ authToken }: { authToken: string | null }) {
  const { data: cases, isLoading } = useAuthFetch("/api/portal/cases", authToken);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  const items = cases || [];

  const renderReportContent = (report: any) => {
    if (!report) return null;
    const content = report.content;
    if (!content) return <p className="text-gray-400 text-sm">Report generated — no detailed content available.</p>;

    if (typeof content === "string") {
      return <p className="text-gray-300 text-sm whitespace-pre-wrap">{content}</p>;
    }

    return (
      <div className="space-y-2 text-sm">
        {content.summary && <div><p className="text-gray-500">Summary</p><p className="text-gray-300">{content.summary}</p></div>}
        {content.diagnosis && <div><p className="text-gray-500">Diagnosis</p><p className="text-gray-300">{content.diagnosis}</p></div>}
        {content.recommendations && (
          <div>
            <p className="text-gray-500">Recommendations</p>
            {Array.isArray(content.recommendations)
              ? <ul className="list-disc list-inside text-gray-300">{content.recommendations.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
              : <p className="text-gray-300">{content.recommendations}</p>}
          </div>
        )}
        {content.faultCodes && (
          <div>
            <p className="text-gray-500">Fault Codes Analyzed</p>
            <div className="flex gap-1 flex-wrap mt-1">
              {(Array.isArray(content.faultCodes) ? content.faultCodes : [content.faultCodes]).map((fc: string, i: number) => (
                <Badge key={i} variant="outline" className="border-red-600 text-red-400 text-xs">{fc}</Badge>
              ))}
            </div>
          </div>
        )}
        {content.severity && <div><p className="text-gray-500">Severity</p><Badge className={`text-xs text-white ${content.severity === "critical" ? "bg-red-600" : content.severity === "high" ? "bg-orange-500" : "bg-blue-500"}`}>{content.severity}</Badge></div>}
        {content.estimatedRepairTime && <div><p className="text-gray-500">Estimated Repair Time</p><p className="text-gray-300">{content.estimatedRepairTime}</p></div>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-gray-400">{items.length} past session{items.length !== 1 ? "s" : ""}</p>
      {items.length === 0 ? (
        <Card className="bg-[#1a1a1a] border-[#333]"><CardContent className="p-8 text-center">
          <History className="h-12 w-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400" data-testid="text-no-cases">No AI sessions yet. Start one from the Intake section.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((c: any) => {
            const isExpanded = expandedId === c.id;
            return (
              <Card key={c.id} className={`bg-[#1a1a1a] border-[#333] cursor-pointer transition-all ${isExpanded ? "border-[#FFCD11]" : "hover:border-[#555]"}`}
                onClick={() => setExpandedId(isExpanded ? null : c.id)} data-testid={`card-case-${c.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold">
                        Session #{c.id} — {c.equipmentType || "General"} {c.make || ""} {c.model || ""}
                      </p>
                      <p className="text-gray-400 text-sm truncate">{c.problemSummary || "No summary"}</p>
                      <p className="text-gray-500 text-xs mt-1">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.report && <Stethoscope className="h-4 w-4 text-[#FFCD11]" title="Has AI report" />}
                      <Badge variant="secondary" className="text-xs">{c.status}</Badge>
                      <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-[#333] space-y-3" onClick={e => e.stopPropagation()}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        {c.equipmentType && <div><p className="text-gray-500">Equipment Type</p><p className="text-white">{c.equipmentType}</p></div>}
                        {c.make && <div><p className="text-gray-500">Make / Model</p><p className="text-white">{c.make} {c.model || ""}</p></div>}
                        {c.serialNumber && <div><p className="text-gray-500">Serial Number</p><p className="text-white font-mono">{c.serialNumber}</p></div>}
                        {c.yearOfManufacture && <div><p className="text-gray-500">Year</p><p className="text-white">{c.yearOfManufacture}</p></div>}
                        <div><p className="text-gray-500">Status</p><p className="text-white capitalize">{c.status}</p></div>
                        <div><p className="text-gray-500">Date</p><p className="text-white">{c.createdAt ? new Date(c.createdAt).toLocaleString() : "—"}</p></div>
                      </div>

                      {c.problemSummary && (
                        <div>
                          <p className="text-gray-500 text-sm">Problem Summary</p>
                          <p className="text-gray-300 text-sm mt-1">{c.problemSummary}</p>
                        </div>
                      )}

                      {c.report ? (
                        <div className="bg-[#222] rounded p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Stethoscope className="h-5 w-5 text-[#FFCD11]" />
                            <p className="text-[#FFCD11] font-semibold">AI Diagnosis Report</p>
                            <Badge variant="outline" className="border-[#FFCD11] text-[#FFCD11] text-xs ml-auto">{c.report.reportType || "diagnostic"}</Badge>
                          </div>
                          {renderReportContent(c.report)}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm italic">No diagnosis report generated for this session.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
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

  const escalateMutation = useAuthMutation("POST", "/api/portal/escalation", authToken, []);

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
            <Label className="text-gray-300 text-sm">Subject *</Label>
            <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-escalation-subject" />
          </div>
          <div>
            <Label className="text-gray-300 text-sm">Description</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" data-testid="input-escalation-description" />
          </div>
          <div>
            <Label className="text-gray-300 text-sm">Equipment Info</Label>
            <Input value={form.equipmentInfo} onChange={e => setForm(f => ({ ...f, equipmentInfo: e.target.value }))} className="bg-[#222] border-[#444] text-white mt-1" placeholder="Make, model, serial..." data-testid="input-escalation-equipment" />
          </div>
          <div>
            <Label className="text-gray-300 text-sm">Priority</Label>
            <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-escalation-priority"><SelectValue /></SelectTrigger>
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
    </div>
  );
}

export default function PortalPage() {
  const { customer, authToken, logout, isAuthenticated, isLoading: authLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/portal/:section");
  const querySection = new URLSearchParams(window.location.search).get("section");
  const initialSection = (params?.section || querySection || "dashboard") as SectionId;
  const [activeSection, setActiveSection] = useState<SectionId>(
    initialSection in sectionTitles ? initialSection : "dashboard",
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const next = (params?.section || querySection || "dashboard") as SectionId;
    if (next in sectionTitles) setActiveSection(next);
  }, [location, params?.section, querySection]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login?redirect=/portal");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FFCD11]" />
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
      case "admin": return <AdminSection authToken={authToken} customer={customer} />;
      case "ai-intake": return <AIIntakeSection setLocation={setLocation} />;
      case "ai-diagnosis": return <AIDiagnosisSection authToken={authToken} />;
      case "ai-troubleshooting": return <AITroubleshootingSection authToken={authToken} />;
      case "ai-faultcodes": return <AIFaultCodeSection authToken={authToken} />;
      case "ai-parts": return <AIPartsSection authToken={authToken} />;
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
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-[#1a1a1a] border-r border-[#333] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        data-testid="sidebar"
      >
        <div className="p-4 border-b border-[#333] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="AMERICAN IRON" className="h-8" data-testid="img-sidebar-logo" />
            <span className="text-[#FFCD11] font-bold text-sm">AMERICAN IRON</span>
          </div>
          <Button size="icon" variant="ghost" className="lg:hidden text-gray-400" onClick={() => setSidebarOpen(false)} data-testid="button-close-sidebar">
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
          <Button variant="outline" className="w-full border-[#444] text-gray-300" onClick={logout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-[#111111] border-b border-[#333] px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Button size="icon" variant="ghost" className="lg:hidden text-gray-400" onClick={() => setSidebarOpen(true)} data-testid="button-open-sidebar">
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
