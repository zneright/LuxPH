import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Menu, User, LogOut } from "lucide-react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { motion } from "framer-motion";

interface NavbarProps {
  toggleSidebar: () => void;
}

export default function Navbar({ toggleSidebar }: NavbarProps) {
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Profile States
  const [businessName, setBusinessName] = useState("Loading...");
  const [email, setEmail] = useState("");
  const [initials, setInitials] = useState("");
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setEmail(user.email || "merchant@luxph.io");

        // Default initial fallback
        let init = user.email ? user.email.charAt(0).toUpperCase() : "M";

        try {
          const docRef = doc(db, "merchants", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const bName = data.businessName || "My Store";
            setBusinessName(bName);
            setIsPro(data.isSubscribed === true);

            // Generate initials from business name (e.g., "Juan Store" -> "JS")
            const words = bName.split(" ");
            if (words.length >= 2) {
              init = (words[0][0] + words[1][0]).toUpperCase();
            } else if (bName.length > 0) {
              init = bName.substring(0, 2).toUpperCase();
            }
          } else {
            setBusinessName("My Store");
            setIsPro(false);
          }
        } catch (err) {
          console.error("Failed to fetch profile for navbar:", err);
          setBusinessName("My Store");
        }

        setInitials(init);
      } else {
        // Clear state if not logged in
        setBusinessName("");
        setEmail("");
        setInitials("");
        setIsPro(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/signin");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <nav style={{
      position: "sticky",
      top: 0,
      zIndex: 50,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      height: 60,
      background: "rgba(8,11,20,.85)",
      backdropFilter: "blur(12px)",
      borderBottom: isPro ? "none" : "1px solid rgba(255,255,255,.07)" // Remove standard border for Pro
    }}>

      {/* --- PRO AMBIENT EFFECTS FOR THE ENTIRE BAR --- */}
      {isPro && (
        <>
          {/* Breathing Golden Ambient Glow */}
          <motion.div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(ellipse at 50% 100%, rgba(245,158,11,0.08), transparent 60%)",
              pointerEvents: "none",
              zIndex: -1
            }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Animated Sweeping Golden Bottom Border */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, overflow: "hidden" }}>
            <motion.div
              style={{
                width: "200%",
                height: "100%",
                background: "linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.8) 25%, #fde68a 50%, rgba(245,158,11,0.8) 75%, transparent 100%)",
              }}
              animate={{ x: ["-50%", "0%"] }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </>
      )}

      {/* Left Side: Burger Menu (Mobile) & Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          className="md:hidden text-gray-400 hover:text-white transition-colors"
          onClick={toggleSidebar}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          <Menu size={24} />
        </button>

        <div style={{ display: "flex", alignItems: "center" }}>
          <div onClick={() => navigate("/")} style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 900, fontSize: 20, color: "#fff", letterSpacing: ".02em", cursor: "pointer", position: "relative", zIndex: 10 }}>
            LUX <span style={{ color: "#7c3aed" }}>PH</span>
          </div>

          {/* Premium Animated PRO Badge */}
          {isPro && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: 1,
                scale: 1,
                boxShadow: [
                  "0 0 4px rgba(245, 158, 11, 0.3)",
                  "0 0 12px rgba(245, 158, 11, 0.7)",
                  "0 0 4px rgba(245, 158, 11, 0.3)"
                ]
              }}
              transition={{ boxShadow: { duration: 2.5, repeat: Infinity, ease: "easeInOut" } }}
              style={{
                marginLeft: 10,
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 900,
                fontFamily: "'DM Mono', monospace",
                padding: "2px 8px",
                borderRadius: 12,
                letterSpacing: "0.05em",
                position: "relative",
                overflow: "hidden",
                cursor: "default",
                userSelect: "none"
              }}
            >
              PRO
              {/* Metallic Shine Sweep Overlay */}
              <motion.div
                animate={{ left: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", repeatDelay: 1 }}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  width: "50%",
                  background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
                  transform: "skewX(-20deg)",
                }}
              />
            </motion.div>
          )}
        </div>
      </div>

      {/* Right Side: Badge & Profile Dropdown */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>

        {/* Dynamic Elite Status Badge */}
        {isPro ? (
          <motion.span
            animate={{
              boxShadow: ["0 0 0px rgba(245,158,11,0)", "0 0 10px rgba(245,158,11,0.3)", "0 0 0px rgba(245,158,11,0)"],
              borderColor: ["rgba(245,158,11,0.4)", "rgba(245,158,11,0.8)", "rgba(245,158,11,0.4)"]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="hidden sm:inline-block"
            style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", background: "rgba(245,158,11,.1)", color: "#fcd34d", border: "1px solid rgba(245,158,11,.4)", padding: "3px 10px", borderRadius: 20, letterSpacing: ".05em", fontWeight: "bold" }}
          >
            PRO MERCHANT
          </motion.span>
        ) : (
          <span className="hidden sm:inline-block" style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", background: "rgba(124,58,237,.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,.3)", padding: "3px 10px", borderRadius: 20, letterSpacing: ".05em" }}>
            MERCHANT
          </span>
        )}

        {/* Avatar Button */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: isPro ? "linear-gradient(135deg, #f59e0b, #d97706)" : "linear-gradient(135deg,#7c3aed,#4f46e5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            border: isPro ? "2px solid rgba(253, 230, 138, 0.4)" : "2px solid rgba(255,255,255,0.1)",
            cursor: "pointer",
            padding: 0,
            position: "relative",
            zIndex: 10
          }}
        >
          {initials}
        </button>

        {/* Profile Dropdown Menu */}
        {isDropdownOpen && (
          <>
            {/* Invisible overlay to close dropdown when clicking outside */}
            <div
              style={{ position: "fixed", inset: 0, zIndex: 40 }}
              onClick={() => setIsDropdownOpen(false)}
            />

            <div style={{ position: "absolute", top: 44, right: 0, width: 200, background: "rgba(18,18,26,0.95)", backdropFilter: "blur(12px)", border: isPro ? "1px solid rgba(245,158,11,.3)" : "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "8px", zIndex: 50, boxShadow: isPro ? "0 10px 40px rgba(245,158,11,0.15)" : "0 10px 40px rgba(0,0,0,0.5)" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.06)", marginBottom: "4px", overflow: "hidden" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                  {businessName}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
                  {email}
                </div>
              </div>

              <Link to="/merchant/settings" onClick={() => setIsDropdownOpen(false)} style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, color: "#e5e7eb", cursor: "pointer", borderRadius: 6, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,.05)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <User size={16} className={isPro ? "text-[#f59e0b]" : "text-[#a78bfa]"} />
                  Profile Settings
                </div>
              </Link>

              <div onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, color: "#f87171", cursor: "pointer", borderRadius: 6, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(248,113,113,.1)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                <LogOut size={16} />
                Log out
              </div>
            </div>
          </>
        )}
      </div>
    </nav>
  );
}