import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Firebase Auth Core Imports ──────────────────────────────
import { auth } from "../config/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    // Hardcoded Admin bypass remains pristine for presentation testing
    if (email === "admin@luxph.io" && password === "admin123") {
      navigate("/admin");
      setIsLoading(false);
      return;
    }

    try {
      // ── Authenticate Real Merchant Session via Firebase ──
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/merchant");
    } catch (err) {
      console.error(err);
      // Friendly readable error strings instead of raw system logs
      if ((err as any).code === "auth/user-not-found" || (err as any).code === "auth/wrong-password") {
        setError("Invalid email or password. Please try again.");
      } else {
        setError((err as Error).message || "An error occurred during authentication.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b14] text-[#e5e7eb] font-['Nunito',sans-serif] flex items-center justify-center relative overflow-hidden">

      {/* Background Glows (Matching your dashboard) */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full" style={{ background: "radial-gradient(circle,rgba(0,80,60,.35) 0%,transparent 70%)" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[560px] h-[560px] rounded-full" style={{ background: "radial-gradient(circle,rgba(88,28,235,.25) 0%,transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-md p-8 bg-white/[0.04] border border-white/[0.08] rounded-2xl backdrop-blur-md shadow-2xl">
        <div className="text-center mb-8">
          <div className="font-black text-2xl text-white tracking-wide mb-2">LUX <span className="text-[#7c3aed]">PH</span></div>
          <h1 className="text-xl font-bold text-white mb-1">Welcome back</h1>
          <p className="text-sm text-[#9ca3af]">Enter your details to access your account</p>
        </div>

        {/* Hackathon Quick Fill Buttons */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => { setEmail("merchant@luxph.io"); setPassword("password123"); setError(""); }}
            className="flex-1 py-1.5 text-[10px] font-['DM_Mono',monospace] uppercase tracking-wider bg-[#7c3aed]/10 text-[#a78bfa] border border-[#7c3aed]/30 rounded-md hover:bg-[#7c3aed]/20 transition-colors"
          >
            Demo Merchant
          </button>
          <button
            type="button"
            onClick={() => { setEmail("admin@luxph.io"); setPassword("admin123"); setError(""); }}
            className="flex-1 py-1.5 text-[10px] font-['DM_Mono',monospace] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/20 transition-colors"
          >
            Demo Admin
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[10px] font-['DM_Mono',monospace] text-[#6b7280] uppercase tracking-[.06em] mb-1.5">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#7c3aed] transition-colors"
              placeholder="name@company.com"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-['DM_Mono',monospace] text-[#6b7280] uppercase tracking-[.06em] mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#7c3aed] transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {error && <div className="text-red-400 text-xs text-center font-medium bg-red-400/10 py-2 rounded-md">{error}</div>}

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full mt-4 bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] text-white border-none rounded-lg py-3 font-bold text-[14px] transition-shadow ${isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer shadow-lg shadow-[#7c3aed]/20 hover:shadow-[#7c3aed]/40"}`}
          >
            {isLoading ? "Verifying Credentials..." : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#6b7280]">
          Don't have an account? <span onClick={() => navigate("/signup")} className="text-[#a78bfa] cursor-pointer hover:underline font-semibold">Sign up</span>
        </div>
      </div>
    </div>
  );
}