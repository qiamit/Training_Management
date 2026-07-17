import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";

export function AuthCallbackPage() {
  const [status, setStatus] = useState("Confirming your email…");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus("Email confirmed. You can continue to your portal.");
      } else {
        setStatus(
          "If you opened this from an email link, confirmation may take a moment. You can sign in once verified.",
        );
      }
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-4 text-center">
      <p className="text-sm text-slate-700">{status}</p>
      <Link to="/" className="text-sm font-semibold text-indigo-600 underline">
        Go to home
      </Link>
    </div>
  );
}
