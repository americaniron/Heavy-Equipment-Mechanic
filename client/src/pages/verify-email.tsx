import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiErrorMessage, apiFetch, safeInternalPath } from "@/lib/api";

export default function VerifyEmail() {
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const redirectTo = safeInternalPath(params.get("redirect"), "/portal");
  const { applySession } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const res = await apiFetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Verification failed"));
      const data = await res.json() as Record<string, unknown>;
      applySession(data);
      toast({ title: "Email verified" });
      setLocation(redirectTo);
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Verification failed", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    if (!email) {
      toast({ title: "Enter your email first", variant: "destructive" });
      return;
    }
    setResending(true);
    try {
      const response = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response, "Could not resend verification code"));
      }
      const data = await response.json() as { message?: string };
      toast({ title: data.message || "If verification is still pending, a new code was sent." });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not resend verification code",
        variant: "destructive",
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-[#333]">
        <CardHeader>
          <CardTitle className="text-white">Verify your email</CardTitle>
          <CardDescription className="text-gray-400">
            Enter the 6-digit code we sent to continue to FixMyIron.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="verification-email" className="text-gray-300">Email</Label>
              <Input
                id="verification-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1"
                data-testid="input-verify-email"
              />
            </div>
            <div>
              <Label htmlFor="verification-code" className="text-gray-300">Verification code</Label>
              <Input
                id="verification-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="bg-[#222] border-[#444] text-white mt-1 tracking-[0.4em] text-center"
                data-testid="input-verify-code"
              />
            </div>
            <Button className="w-full bg-[#FFCD11] text-black" disabled={pending || code.length !== 6} data-testid="button-verify-submit">
              {pending ? "Verifying…" : "Verify and continue"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-gray-300" disabled={pending || resending} onClick={resend} data-testid="button-resend-code">
              {resending ? "Resending…" : "Resend code"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-gray-300" onClick={() => setLocation("/login")}>
              Back to sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
