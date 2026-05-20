import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Firebase Auth & Firestore Core Imports ──────────────────────────────
import { auth, db } from "../config/firebase";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // ── Route based on 'admins' collection check ──
  const checkRoleAndNavigate = async (uid: string) => {
    try {
      // Check if the user has a document in the 'admins' collection
      const adminRef = doc(db, "admins", uid);
      const adminSnap = await getDoc(adminRef);

      if (adminSnap.exists()) {
        navigate("/admin");
      } else {
        // If not in 'admins', assume they are a standard merchant
        navigate("/merchant");
      }
    } catch (err) {
      console.error("Error checking role:", err);
      setError("Failed to verify account permissions.");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Authenticate via Email/Password
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await checkRoleAndNavigate(userCredential.user.uid);
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(err.message || "An error occurred during authentication.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await checkRoleAndNavigate(userCredential.user.uid);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to sign in with Google.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b14] text-[#e5e7eb] font-['Nunito',sans-serif] flex items-center justify-center relative overflow-hidden">

      {/* Background Glows */}
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

        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-white/10"></div>
          <span className="px-3 text-xs text-[#6b7280] uppercase font-semibold tracking-wider">or continue with</span>
          <div className="flex-1 border-t border-white/10"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className={`w-full flex items-center justify-center bg-white/[0.04] border border-white/10 rounded-lg py-3 text-white text-[14px] font-semibold transition-colors ${isLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-white/[0.08] cursor-pointer"}`}
        >
          <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google
        </button>

        <div className="mt-6 text-center text-sm text-[#6b7280]">
          Don't have an account? <span onClick={() => navigate("/signup")} className="text-[#a78bfa] cursor-pointer hover:underline font-semibold">Sign up</span>
        </div>
      </div>
    </div>
  );
}