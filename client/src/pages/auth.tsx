import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { safeInternalPath } from "@/lib/api";
import { Building2, Mail, Lock, User, Phone, ArrowLeft, Wrench, ChevronRight, ChevronLeft, AlertTriangle } from "lucide-react";
const logoImg = "/media/logo.png";

const EQUIPMENT_TYPES = [
  "Excavator", "Loader", "Dozer", "Backhoe", "Skid Steer",
  "Crane", "Forklift", "Gen-Set / Generator", "Marine Engine",
  "Power Unit", "Hydraulic Press", "Compressor", "Pump",
  "Truck / Haul Vehicle", "Other"
];

export default function AuthPage() {
  const [location, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">(() =>
    window.location.pathname.startsWith("/register") ? "register" : "login",
  );
  const [regStep, setRegStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");

  const [equipType, setEquipType] = useState("");
  const [equipMake, setEquipMake] = useState("");
  const [equipModel, setEquipModel] = useState("");
  const [equipYear, setEquipYear] = useState("");
  const [equipSerial, setEquipSerial] = useState("");
  const [equipSmuHours, setEquipSmuHours] = useState("");
  const [problemSummary, setProblemSummary] = useState("");
  const [faultCodes, setFaultCodes] = useState("");
  const [equipLocation, setEquipLocation] = useState("");

  const { login, register, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const redirectTo = safeInternalPath(params.get("redirect"), "/portal");
  const authPath = (path: "/login" | "/register") =>
    redirectTo === "/portal" ? path : `${path}?redirect=${encodeURIComponent(redirectTo)}`;

  useEffect(() => {
    setMode(location.startsWith("/register") ? "register" : "login");
  }, [location]);

  useEffect(() => {
    if (isAuthenticated) setLocation(redirectTo);
  }, [isAuthenticated, redirectTo, setLocation]);

  if (isAuthenticated) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        try {
          await login(email, password);
          toast({ title: "Welcome back!" });
          setLocation(redirectTo);
        } catch (err: any) {
          if (err?.needsVerification) {
            toast({ title: "Verify your email", description: err.message });
            setLocation(`/verify-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`);
            return;
          }
          throw err;
        }
      } else {
        if (regStep === 1) {
          if (!firstName || !lastName || !email || !password) {
            toast({ title: "Missing fields", description: "Please fill in all required fields", variant: "destructive" });
            setIsSubmitting(false);
            return;
          }
          if (password.length < 8) {
            toast({ title: "Password too short", description: "Password must be at least 8 characters", variant: "destructive" });
            setIsSubmitting(false);
            return;
          }
          setRegStep(2);
          setIsSubmitting(false);
          return;
        }

        if (regStep === 2) {
          if (!equipType || !problemSummary) {
            toast({ title: "Missing fields", description: "Equipment type and problem description are required", variant: "destructive" });
            setIsSubmitting(false);
            return;
          }

          const created = await register({
            email, password, firstName, lastName, company, phone,
            equipmentType: equipType,
            equipmentMake: equipMake,
            equipmentModel: equipModel,
            equipmentYear: equipYear,
            equipmentSerial: equipSerial,
            equipmentSmuHours: equipSmuHours,
            problemSummary,
            faultCodes,
            equipmentLocation: equipLocation,
          });
          if (created?.requiresVerification) {
            toast({ title: "Check your email", description: "Enter the 6-digit FixMyIron verification code." });
            setLocation(`/verify-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`);
            return;
          }
          toast({ title: "Account created! Welcome to AMERICAN IRON." });
          setLocation(redirectTo);
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <img src={logoImg} alt="American Iron" className="h-14 mx-auto mb-3" data-testid="img-logo" />
          <h1 className="text-2xl font-bold text-[#FFCD11]" data-testid="text-portal-title">AMERICAN IRON</h1>
          <p className="text-gray-400 mt-1 text-sm" data-testid="text-portal-subtitle">
            {mode === "register" && regStep === 2
              ? "Tell us about your equipment"
              : "Customer & AI Mechanic Portal"}
          </p>
        </div>

        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-3">
            <div className="flex gap-2 mb-3">
              <Button
                variant={mode === "login" ? "default" : "outline"}
                className={mode === "login" ? "flex-1 bg-[#FFCD11] text-black hover:bg-[#e6b800]" : "flex-1 border-[#444] text-gray-300"}
                onClick={() => { setMode("login"); setRegStep(1); setLocation(authPath("/login")); }}
                data-testid="button-login-tab"
              >
                Sign In
              </Button>
              <Button
                variant={mode === "register" ? "default" : "outline"}
                className={mode === "register" ? "flex-1 bg-[#FFCD11] text-black hover:bg-[#e6b800]" : "flex-1 border-[#444] text-gray-300"}
                onClick={() => { setMode("register"); setRegStep(1); setLocation(authPath("/register")); }}
                data-testid="button-register-tab"
              >
                Create Account
              </Button>
            </div>
            <CardTitle className="text-white text-lg" data-testid="heading-auth">
              {mode === "login" ? "Welcome back" :
               regStep === 1 ? "Create account" : "Step 2: Equipment & Issue"}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {mode === "login"
                ? "Access your equipment, service requests, and AI diagnostics"
                : regStep === 1
                  ? "Contact details so our specialists can reach you"
                  : "Tell us what you're working with and what's going wrong"}
            </CardDescription>
            {mode === "register" && (
              <div className="flex gap-1 mt-2">
                <div className={`h-1 flex-1 rounded-full ${regStep >= 1 ? "bg-[#FFCD11]" : "bg-[#333]"}`} />
                <div className={`h-1 flex-1 rounded-full ${regStep >= 2 ? "bg-[#FFCD11]" : "bg-[#333]"}`} />
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              {mode === "register" && regStep === 1 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="register-first-name" className="text-gray-300 text-sm">First Name *</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                          id="register-first-name"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={e => setFirstName(e.target.value)}
                          className="pl-9 bg-[#222] border-[#444] text-white"
                          placeholder="John"
                          required
                          data-testid="input-first-name"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="register-last-name" className="text-gray-300 text-sm">Last Name *</Label>
                      <div className="relative mt-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input
                          id="register-last-name"
                          autoComplete="family-name"
                          value={lastName}
                          onChange={e => setLastName(e.target.value)}
                          className="pl-9 bg-[#222] border-[#444] text-white"
                          placeholder="Doe"
                          required
                          data-testid="input-last-name"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="register-company" className="text-gray-300 text-sm">Company</Label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="register-company"
                        autoComplete="organization"
                        value={company}
                        onChange={e => setCompany(e.target.value)}
                        className="pl-9 bg-[#222] border-[#444] text-white"
                        placeholder="Your company name"
                        data-testid="input-company"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="register-phone" className="text-gray-300 text-sm">Phone</Label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="register-phone"
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="pl-9 bg-[#222] border-[#444] text-white"
                        placeholder="+1 (555) 000-0000"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>
                </>
              )}

              {mode === "login" || (mode === "register" && regStep === 1) ? (
                <>
                  <div>
                    <Label htmlFor="login-email" className="text-gray-300 text-sm">Email *</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="pl-9 bg-[#222] border-[#444] text-white"
                        placeholder="you@company.com"
                        required
                        data-testid="input-email"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="login-password" className="text-gray-300 text-sm">Password *</Label>
                    <div className="relative mt-1">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        id="login-password"
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="pl-9 bg-[#222] border-[#444] text-white"
                        placeholder="Min 8 characters"
                        minLength={8}
                        required
                        data-testid="input-password"
                      />
                    </div>
                    {mode === "login" && (
                      <button
                        type="button"
                        className="text-xs text-[#FFCD11] mt-2"
                        onClick={() => setLocation("/forgot-password")}
                        data-testid="link-forgot-password"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                </>
              ) : null}

              {mode === "register" && regStep === 2 && (
                <>
                  <div>
                    <Label htmlFor="register-equipment-type" className="text-gray-300 text-sm">Equipment Type *</Label>
                    <Select value={equipType} onValueChange={setEquipType}>
                      <SelectTrigger id="register-equipment-type" className="bg-[#222] border-[#444] text-white mt-1" data-testid="select-equip-type">
                        <SelectValue placeholder="Select equipment type" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#222] border-[#444]">
                        {EQUIPMENT_TYPES.map(t => (
                          <SelectItem key={t} value={t} className="text-white hover:bg-[#333]">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="register-equipment-make" className="text-gray-300 text-sm">Make</Label>
                      <Input id="register-equipment-make" value={equipMake} onChange={e => setEquipMake(e.target.value)}
                        className="bg-[#222] border-[#444] text-white mt-1" placeholder="e.g. Caterpillar" data-testid="input-equip-make" />
                    </div>
                    <div>
                      <Label htmlFor="register-equipment-model" className="text-gray-300 text-sm">Model</Label>
                      <Input id="register-equipment-model" value={equipModel} onChange={e => setEquipModel(e.target.value)}
                        className="bg-[#222] border-[#444] text-white mt-1" placeholder="e.g. 320F" data-testid="input-equip-model" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="register-equipment-year" className="text-gray-300 text-sm">Year</Label>
                      <Input id="register-equipment-year" type="number" min={1950} max={2100} value={equipYear} onChange={e => setEquipYear(e.target.value)}
                        className="bg-[#222] border-[#444] text-white mt-1" placeholder="2020" data-testid="input-equip-year" />
                    </div>
                    <div>
                      <Label htmlFor="register-equipment-serial" className="text-gray-300 text-sm">Serial #</Label>
                      <Input id="register-equipment-serial" value={equipSerial} onChange={e => setEquipSerial(e.target.value)}
                        className="bg-[#222] border-[#444] text-white mt-1" placeholder="Serial" data-testid="input-equip-serial" />
                    </div>
                    <div>
                      <Label htmlFor="register-equipment-hours" className="text-gray-300 text-sm">SMU/Hours</Label>
                      <Input id="register-equipment-hours" type="number" min={0} value={equipSmuHours} onChange={e => setEquipSmuHours(e.target.value)}
                        className="bg-[#222] border-[#444] text-white mt-1" placeholder="Hours" data-testid="input-equip-smu" />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="register-equipment-location" className="text-gray-300 text-sm">Equipment Location</Label>
                    <Input id="register-equipment-location" value={equipLocation} onChange={e => setEquipLocation(e.target.value)}
                      className="bg-[#222] border-[#444] text-white mt-1" placeholder="City, State or Job Site" data-testid="input-equip-location" />
                  </div>
                  <div>
                    <Label htmlFor="register-problem-summary" className="text-gray-300 text-sm flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#FFCD11]" />
                      Problem Description *
                    </Label>
                    <Textarea id="register-problem-summary" value={problemSummary} onChange={e => setProblemSummary(e.target.value)}
                      className="bg-[#222] border-[#444] text-white mt-1 min-h-[80px]"
                      placeholder="Describe the issue you're experiencing with your equipment..."
                      required data-testid="input-problem-summary" />
                  </div>
                  <div>
                    <Label htmlFor="register-fault-codes" className="text-gray-300 text-sm">Fault Codes (if any)</Label>
                    <Input id="register-fault-codes" value={faultCodes} onChange={e => setFaultCodes(e.target.value)}
                      className="bg-[#222] border-[#444] text-white mt-1" placeholder="e.g. P0300, E361" data-testid="input-fault-codes" />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-1">
                {mode === "register" && regStep === 2 && (
                  <Button type="button" variant="outline" onClick={() => setRegStep(1)}
                    className="border-[#444] text-gray-300 hover:bg-[#333]" data-testid="button-back-step">
                    <ChevronLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-[#FFCD11] text-black font-bold hover:bg-[#e6b800] h-11"
                  data-testid="button-submit-auth"
                >
                  {isSubmitting ? "Please wait..." :
                   mode === "login" ? "SIGN IN" :
                   regStep === 1 ? (<>NEXT: EQUIPMENT INFO <ChevronRight className="h-4 w-4 ml-1" /></>) :
                   "CREATE ACCOUNT & START"}
                </Button>
              </div>
            </form>

            <div className="mt-4 pt-3 border-t border-[#333] text-center">
              <Button
                variant="link"
                onClick={() => setLocation("/")}
                className="text-gray-400 hover:text-[#FFCD11]"
                data-testid="link-back-home"
              >
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to AMERICAN IRON Home
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-gray-500 text-xs mt-4" data-testid="text-shared-registration">
          Your registration works across all AMERICAN IRON LLC portals.
        </p>
      </div>
    </div>
  );
}
