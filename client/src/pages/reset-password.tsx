import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage, apiFetch } from "@/lib/api";

export default function ResetPassword() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (password !== confirmation) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      const res = await apiFetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "Reset failed"));
      const data = await res.json() as { message?: string };
      toast({ title: data.message || "Password updated" });
      setLocation("/login");
    } catch (err: unknown) {
      toast({ title: err instanceof Error ? err.message : "Reset failed", variant: "destructive" });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111] flex items-center justify-center px-4">
      <Card className="w-full max-w-md bg-[#1a1a1a] border-[#333]">
        <CardHeader>
          <CardTitle className="text-white">Choose a new password</CardTitle>
          <CardDescription className="text-gray-400">This link expires one hour after it was issued.</CardDescription>
        </CardHeader>
        <CardContent>
          {!token && (
            <div className="mb-4 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300" role="alert" data-testid="text-reset-token-missing">
              This reset link is missing its token. Request a new password reset email.
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="reset-password" className="text-gray-300">New password</Label>
              <Input
                id="reset-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1"
                data-testid="input-reset-password"
              />
            </div>
            <div>
              <Label htmlFor="reset-password-confirmation" className="text-gray-300">Confirm new password</Label>
              <Input
                id="reset-password-confirmation"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className="bg-[#222] border-[#444] text-white mt-1"
                data-testid="input-reset-password-confirmation"
              />
            </div>
            <Button className="w-full bg-[#FFCD11] text-black" disabled={pending || !token} data-testid="button-reset-submit">
              {pending ? "Updating…" : "Update password"}
            </Button>
            <Button type="button" variant="ghost" className="w-full text-gray-300" onClick={() => setLocation(token ? "/login" : "/forgot-password")}>
              {token ? "Back to sign in" : "Request a new reset link"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
