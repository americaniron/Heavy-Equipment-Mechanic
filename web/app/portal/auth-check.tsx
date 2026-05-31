"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AuthCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    const user = localStorage.getItem("user");

    if (!token || !user) {
      router.push("/login");
      return;
    }

    // Verify token with backend
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://api.fixmyiron.com"}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          localStorage.removeItem("auth_token");
          localStorage.removeItem("user");
          router.push("/login");
        }
      })
      .catch(() => {
        router.push("/login");
      })
      .finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-equipment-950">
        <p className="text-zinc-400">Verifying...</p>
      </div>
    );
  }

  return <>{children}</>;
}