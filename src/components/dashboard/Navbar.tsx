import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Menu, User, LogOut } from "lucide-react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedLogo from "../AnimatedLogo";

interface NavbarProps {
  toggleSidebar: () => void;
}

export default function Navbar({ toggleSidebar }: NavbarProps) {
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [businessName, setBusinessName] = useState("Loading...");
  const [email, setEmail] = useState("");
  const [initials, setInitials] = useState("");
  const [isPro, setIsPro] = useState(false);
  const [logoAnimKey, setLogoAnimKey] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setEmail(user.email || "merchant@luxph.io");
        let init = user.email ? user.email.charAt(0).toUpperCase() : "M";

        try {
          const docRef = doc(db, "merchants", user.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const bName = data.businessName || "My Store";
            setBusinessName(bName);
            setIsPro(data.isSubscribed === true);

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
    <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 72, background: "rgba(255,255,255,.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e5e7eb" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          className="md:hidden text-gray-500 hover:text-gray-900 transition-colors"
          onClick={toggleSidebar}
          style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
        >
          <Menu size={24} />
        </button>

        <div
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          onClick={() => navigate("/")}
          onMouseEnter={() => setLogoAnimKey(prev => prev + 1)}
        >
          <AnimatedLogo isPro={isPro} size={32} triggerKey={logoAnimKey} />
          <div style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 900, fontSize: 20, color: "#111827", letterSpacing: ".02em" }}>
            LUX <span style={{ color: "#7c3aed" }}>PH</span>
          </div>

          {isPro && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, boxShadow: ["0 0 4px rgba(245, 158, 11, 0.2)", "0 0 16px rgba(245, 158, 11, 0.4)", "0 0 4px rgba(245, 158, 11, 0.2)"] }}
              transition={{ boxShadow: { duration: 2, repeat: Infinity, ease: "easeInOut" } }}
              style={{
                marginLeft: 10, background: "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)", color: "#fff",
                fontSize: 10, fontWeight: 900, fontFamily: "'DM Mono', monospace", padding: "2px 9px",
                borderRadius: 12, letterSpacing: "0.08em", position: "relative", overflow: "hidden", cursor: "default", userSelect: "none"
              }}
            >
              PRO
              <motion.div
                animate={{ left: ["-100%", "200%"] }}
                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                style={{ position: "absolute", top: 0, bottom: 0, width: "30%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)", transform: "skewX(-25deg)" }}
              />
            </motion.div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        <span className="hidden sm:inline-block" style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", background: isPro ? "#fef3c7" : "#e0e7ff", color: isPro ? "#b45309" : "#4f46e5", border: isPro ? "1px solid #fde68a" : "1px solid #c7d2fe", padding: "4px 12px", borderRadius: 20, letterSpacing: ".05em", fontWeight: 700 }}>
          {isPro ? "PRO MERCHANT" : "MERCHANT"}
        </span>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          style={{ width: 36, height: 36, borderRadius: "50%", background: isPro ? "linear-gradient(135deg,#f59e0b,#d97706)" : "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer", padding: 0, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}
        >
          {initials}
        </motion.button>

        <AnimatePresence>
          {isDropdownOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setIsDropdownOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ position: "absolute", top: 48, right: 0, width: 220, background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "8px", zIndex: 50, boxShadow: "0 10px 40px rgba(0,0,0,0.1)" }}
              >
                <div style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6", marginBottom: "4px", overflow: "hidden" }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#111827", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{businessName}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", fontWeight: 500 }}>{email}</div>
                </div>

                <Link to="/merchant/settings" onClick={() => setIsDropdownOpen(false)} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", borderRadius: 6, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#f3f4f6"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                    <User size={16} className={isPro ? "text-[#f59e0b]" : "text-[#7c3aed]"} /> Profile Settings
                  </div>
                </Link>

                <div onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#ef4444", cursor: "pointer", borderRadius: 6, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#fef2f2"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <LogOut size={16} /> Log out
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}