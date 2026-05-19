import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

// THIS is where you import auth and db from your config folder!
import { auth, db } from "../config/firebase";
import { createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function SignUp() {
  const navigate = useNavigate();

  // Form State
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);

  // UI State
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const createMerchantProfile = async (uid: string, email: string | null, bName: string) => {
    await setDoc(doc(db, "merchants", uid), {
      businessName: bName,
      email: email,
      termsAccepted: true,
      createdAt: serverTimestamp(),

      isSubscribed: false,
      totalVolumeProcessed: 0,

      preferences: {
        currency: "PHPC",
        notificationsEnabled: true
      },
      totalRevenue: 0,
      invoicesGenerated: 0
    });
  };

  // Standard Email/Password Sign Up (Typed event)
  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreed) {
      setError("Please agree to the Terms and Conditions to continue.");
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Save business name to Firestore
      await createMerchantProfile(user.uid, user.email, businessName);

      navigate("/merchant");
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Failed to create an account.");
    } finally {
      setIsLoading(false);
    }
  };

  // Google OAuth Sign Up
  const handleGoogleSignIn = async () => {
    setError("");
    if (!agreed) {
      setError("Please agree to the Terms and Conditions to continue with Google.");
      return;
    }

    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // If they are new, we might need a default business name (like their display name)
      // You can optimize this later to prompt for a business name if one doesn't exist
      await createMerchantProfile(user.uid, user.email, user.displayName || "My Business");

      navigate("/merchant");
    } catch (err) {
      console.error(err);
      // Safely cast the unknown error to an Error object
      setError((err as Error).message || "Failed to sign in with Google.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080b14] text-[#e5e7eb] font-['Nunito',sans-serif] flex items-center justify-center relative overflow-hidden py-12">

      {/* Background Glows */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-[20%] left-[-10%] w-[500px] h-[500px] rounded-full" style={{ background: "radial-gradient(circle,rgba(0,80,60,.25) 0%,transparent 70%)" }} />
        <div className="absolute bottom-[10%] right-[-10%] w-[560px] h-[560px] rounded-full" style={{ background: "radial-gradient(circle,rgba(88,28,235,.25) 0%,transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-md p-8 bg-white/[0.04] border border-white/[0.08] rounded-2xl backdrop-blur-md shadow-2xl">
        <div className="text-center mb-8">
          <div className="font-black text-2xl text-white tracking-wide mb-2">LUX <span className="text-[#7c3aed]">PH</span></div>
          <h1 className="text-xl font-bold text-white mb-1">Create an Account</h1>
          <p className="text-sm text-[#9ca3af]">Start accepting zero-fee payments today.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSignUp} className="space-y-4">
          <div>
            <label className="block text-[10px] font-['DM_Mono',monospace] text-[#6b7280] uppercase tracking-[.06em] mb-1.5">Business Name</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2.5 text-white text-[13px] outline-none focus:border-[#7c3aed] transition-colors"
              placeholder="Sari-Sari Store"
              required
            />
          </div>
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
              placeholder="Create a strong password"
              required
            />
          </div>

          {/* Terms and Conditions Checkbox */}
          <div className="flex items-start gap-3 mt-6 bg-white/[0.02] p-3 rounded-lg border border-white/5">
            <input
              type="checkbox"
              id="terms"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#7c3aed] cursor-pointer"
            />
            <label htmlFor="terms" className="text-xs text-[#9ca3af] leading-relaxed cursor-pointer">
              I agree to the <span className="text-[#a78bfa] hover:underline">Terms of Service</span>, <span className="text-[#a78bfa] hover:underline">Privacy Policy</span>, and acknowledge that Lux PH is a non-custodial gateway and does not hold my funds.
            </label>
          </div>

          <button
            type="submit"
            disabled={isLoading || !agreed}
            className={`w-full mt-2 border-none rounded-lg py-3 font-bold text-[14px] transition-all ${agreed && !isLoading
              ? 'bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] text-white cursor-pointer shadow-lg shadow-[#7c3aed]/20'
              : 'bg-white/10 text-gray-400 cursor-not-allowed'
              }`}
          >
            {isLoading ? "Processing..." : "Create Account"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-xs text-[#6b7280] uppercase tracking-wider font-['DM_Mono',monospace]">Or</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading || !agreed}
          className={`w-full flex items-center justify-center gap-2 border border-white/10 rounded-lg py-2.5 font-semibold text-[13px] transition-colors ${agreed && !isLoading ? 'bg-white/[0.04] text-white hover:bg-white/10 cursor-pointer' : 'bg-white/5 text-gray-500 cursor-not-allowed'
            }`}
        >
          {/* Simple SVG for Google G */}
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>

        <div className="mt-6 text-center text-sm text-[#6b7280]">
          Already have an account? <span onClick={() => navigate("/signin")} className="text-[#a78bfa] cursor-pointer hover:underline font-semibold">Log in</span>
        </div>
      </div>
    </div>
  );
}