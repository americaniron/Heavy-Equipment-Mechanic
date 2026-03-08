import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2, Mail, Lock, User, Phone, ArrowLeft } from "lucide-react";
import logoImg from "@assets/american-iron-logo_1772935008934.png";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const { login, register, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  if (isAuthenticated) {
    setLocation("/portal");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        if (!firstName || !lastName) {
          toast({ title: "Missing fields", description: "First and last name are required", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        await register({ email, password, firstName, lastName, company, phone });
      }
      toast({ title: mode === "login" ? "Welcome back!" : "Account created!" });
      setLocation("/portal");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoImg} alt="American Iron" className="h-16 mx-auto mb-4" data-testid="img-logo" />
          <h1 className="text-2xl font-bold text-[#FFCD11]" data-testid="text-portal-title">AMERICAN IRON</h1>
          <p className="text-gray-400 mt-1" data-testid="text-portal-subtitle">Customer & AI Mechanic Portal</p>
        </div>

        <Card className="bg-[#1a1a1a] border-[#333]">
          <CardHeader className="pb-4">
            <div className="flex gap-2 mb-4">
              <Button
                variant={mode === "login" ? "default" : "outline"}
                className={mode === "login" ? "flex-1 bg-[#FFCD11] text-black hover:bg-[#e6b800]" : "flex-1 border-[#444] text-gray-300"}
                onClick={() => setMode("login")}
                data-testid="button-login-tab"
              >
                Sign In
              </Button>
              <Button
                variant={mode === "register" ? "default" : "outline"}
                className={mode === "register" ? "flex-1 bg-[#FFCD11] text-black hover:bg-[#e6b800]" : "flex-1 border-[#444] text-gray-300"}
                onClick={() => setMode("register")}
                data-testid="button-register-tab"
              >
                Create Account
              </Button>
            </div>
            <CardTitle className="text-white text-lg">
              {mode === "login" ? "Sign in to your account" : "Create your account"}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {mode === "login"
                ? "Access your equipment, service requests, and AI diagnostics"
                : "Register to access mechanic services and the full portal"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-gray-300 text-sm">First Name *</Label>
                    <div className="relative mt-1">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
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
                    <Label className="text-gray-300 text-sm">Last Name *</Label>
                    <div className="relative mt-1">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
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
              )}

              <div>
                <Label className="text-gray-300 text-sm">Email *</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    type="email"
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
                <Label className="text-gray-300 text-sm">Password *</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="pl-9 bg-[#222] border-[#444] text-white"
                    placeholder="Min 6 characters"
                    minLength={6}
                    required
                    data-testid="input-password"
                  />
                </div>
              </div>

              {mode === "register" && (
                <>
                  <div>
                    <Label className="text-gray-300 text-sm">Company</Label>
                    <div className="relative mt-1">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
                        value={company}
                        onChange={e => setCompany(e.target.value)}
                        className="pl-9 bg-[#222] border-[#444] text-white"
                        placeholder="Your company name"
                        data-testid="input-company"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-300 text-sm">Phone</Label>
                    <div className="relative mt-1">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                      <Input
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

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#FFCD11] text-black font-bold hover:bg-[#e6b800] h-11"
                data-testid="button-submit-auth"
              >
                {isSubmitting ? "Please wait..." : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-[#333] text-center">
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

        <p className="text-center text-gray-500 text-xs mt-6" data-testid="text-shared-registration">
          Your registration works across all AMERICAN IRON LLC portals.
          Same credentials for Customer Portal and AI Virtual Mechanic Portal.
        </p>
      </div>
    </div>
  );
}
