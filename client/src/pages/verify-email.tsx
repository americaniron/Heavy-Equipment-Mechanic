import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export default function VerifyEmail() {
  const params = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const { applySession } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      applySession(data);
      toast({ title: "Email verified" });
      setLocation("/portal");
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Verification failed", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    toast({ title: "If verification is still pending, a new code was sent." });
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-[#333]">
        <CardHeader>
          <CardTitle className="text-white">Verify your email</CardTitle>
          <CardDescription className="text-gray-400">
            Enter the 6-digit code we sent to keep you inside FixMyIron. Clerk identity stays behind this form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-gray-300">Email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1"
                data-testid="input-verify-email"
              />
            </div>
            <div>
              <Label className="text-gray-300">Verification code</Label>
              <Input
                inputMode="numeric"
                pattern="\d{6}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1 tracking-[0.4em] text-center"
                data-testid="input-verify-code"
              />
            </div>
            <Button className="w-full bg-[#FFCD11] text-black" disabled={pending} data-testid="button-verify-submit">
              {pending ? "Verifying…" : "Verify and continue"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-gray-300" onClick={resend} data-testid="button-resend-code">
              Resend code
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
