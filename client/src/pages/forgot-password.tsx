import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, apiFetch } from "@/lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setConfirmation("");
    try {
      const res = await apiFetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Could not send reset email"));
      const data = await res.json() as { message?: string };
      const message = data.message || "If an account exists, a reset link has been sent.";
      setConfirmation(message);
      toast({ title: message });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Could not send reset email",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-[#333]">
        <CardHeader>
          <CardTitle className="text-white">Reset password</CardTitle>
          <CardDescription className="text-gray-400">
            Enter your FixMyIron email. We will send a reset link if the account exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="forgot-email" className="text-gray-300">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1"
                data-testid="input-forgot-email"
              />
            </div>
            {confirmation && (
              <p className="text-sm text-green-400" role="status" data-testid="text-reset-confirmation">
                {confirmation}
              </p>
            )}
            <Button className="w-full bg-[#FFCD11] text-black" disabled={pending} data-testid="button-send-reset">
              {pending ? "Sending…" : "Send reset link"}
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
