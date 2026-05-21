import React, { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import AnimatedLogo from "../AnimatedLogo"; // Adjust path based on your folder structure

const navItems = [
  {
    group: "Platform", items: [
      { id: "/admin", icon: "⬡", label: "Overview" },
      { id: "/admin/merchants", icon: "◳", label: "Merchants" },
      { id: "/admin/transactions", icon: "⇌", label: "Transactions" },
    ]
  },
  {
    group: "Config", items: [
      { id: "/admin/config", icon: "◎", label: "Platform Config" },
    ]
  },
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Admin user states
  const [adminEmail, setAdminEmail] = useState("admin@luxph.io");
  const [logoAnimKey, setLogoAnimKey] = useState(0);

  // Dynamic system configurations driven by Firestore real-time snapshots
  const [systemNetwork, setSystemNetwork] = useState("Loading...");
  const [isMainnet, setIsMainnet] = useState(false);
  const [ledgerNumber, setLedgerNumber] = useState("Syncing...");

  useEffect(() => {
    // 1. Manage Admin Session Verification Status
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAdminEmail(user.email || "admin@luxph.io");
      } else {
        navigate("/signin"); // Safeguard: Boot unauthenticated sessions out
      }
    });

    // 2. 🚨 FIRESTORE REAL-TIME SNAPSHOT INTEGRATION 🚨
    const configDocRef = doc(db, "system_config", "global");
    const unsubscribeSnapshot = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const networkState = data.stellarNetwork || "Testnet (Development)";
        setSystemNetwork(networkState);

        const mainnetFlag = networkState === "Mainnet (Public)";
        setIsMainnet(mainnetFlag);

        // Fetch or simulate latest synchronized ledger tracks cleanly
        if (data.latestSyncedLedger) {
          setLedgerNumber(Number(data.latestSyncedLedger).toLocaleString());
        } else {
          setLedgerNumber(mainnetFlag ? "52,841,900" : "12,490,110");
        }
      } else {
        setSystemNetwork("Testnet (Development)");
        setIsMainnet(false);
        setLedgerNumber("12,490,110");
      }
    }, (error) => {
      console.error("Firestore Administrative stream disruption:", error);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSnapshot();
    };
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/signin", { replace: true });
    } catch (error) {
      console.error("Signout failure:", error);
    }
  };

  return (
    <div style={{ height: "100vh", background: "#080b14", color: "#e5e7eb", fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Background glows — admin uses a teal accent instead of purple */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -100, left: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,80,60,.35) 0%,transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -120, right: -80, width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle,rgba(14,116,144,.2) 0%,transparent 70%)" }} />
      </div>

      {/* Top nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", height: 60, background: "rgba(8,11,20,.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,.07)" }}>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            className="md:hidden text-gray-400 hover:text-white transition-colors"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            <Menu size={24} />
          </button>

          {/* Logo Brand Frame using extracted reusable component */}
          <div
            onClick={() => navigate("/")}
            onMouseEnter={() => setLogoAnimKey(prev => prev + 1)}
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
          >
            <AnimatedLogo isPro={true} size={32} triggerKey={logoAnimKey} />
            <div style={{ fontFamily: "'Nunito',sans-serif", fontWeight: 900, fontSize: 20, color: "#fff", letterSpacing: ".02em" }}>
              LUX <span style={{ color: "#06b6d4" }}>PH</span>
            </div>
          </div>

          <div className="hidden md:block" style={{ width: 1, height: 18, background: "rgba(255,255,255,.1)" }} />
          <div className="hidden md:block" style={{ fontSize: 12, color: "#9ca3af", fontWeight: 500 }}>Admin Console</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
          {/* Reactive Live Ledger Switch Indicator */}
          <div className="hidden sm:flex" style={{ alignItems: "center", gap: 6, fontSize: 12, color: isMainnet ? "#4ade80" : "#f59e0b" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: isMainnet ? "#4ade80" : "#f59e0b", display: "inline-block" }} />
            {isMainnet ? "Mainnet Live" : "Testnet Operational"}
          </div>

          <span className="hidden sm:inline-block" style={{ fontSize: 11, fontFamily: "'DM Mono',monospace", background: "rgba(6,182,212,.12)", color: "#67e8f9", border: "1px solid rgba(6,182,212,.25)", padding: "3px 10px", borderRadius: 20, letterSpacing: ".05em" }}>ADMIN</span>

          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#0e7490,#0369a1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", border: "2px solid rgba(255,255,255,0.1)", cursor: "pointer", padding: 0 }}
          >
            AD
          </button>

          {isDropdownOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setIsDropdownOpen(false)} />
              <div style={{ position: "absolute", top: 44, right: 0, width: 200, background: "rgba(18,18,26,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: "8px", zIndex: 50, boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,.06)", marginBottom: "4px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>System Admin</div>
                  <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{adminEmail}</div>
                </div>
                <div onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, color: "#f87171", cursor: "pointer", borderRadius: 6, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(248,113,113,.1)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <LogOut size={16} />
                  Log out
                </div>
              </div>
            </>
          )}
        </div>
      </nav>

      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1, overflow: "hidden" }}>

        {isSidebarOpen && (
          <div
            className="md:hidden"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 30 }}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={`absolute md:relative z-40 transition-transform duration-300 ease-in-out bg-[#080b14]/95 md:bg-white/[0.02] backdrop-blur-xl md:backdrop-blur-sm border-r border-white/5 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
          style={{ width: 220, padding: "24px 0", flexShrink: 0, height: "100%", overflowY: "auto", display: "flex", flexDirection: "column" }}
        >
          <div style={{ flex: 1 }}>
            {navItems.map(g => (
              <div key={g.group} style={{ marginBottom: 26 }}>
                <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#4b5563", letterSpacing: ".1em", textTransform: "uppercase", padding: "0 18px", marginBottom: 8 }}>{g.group}</div>
                {g.items.map(item => (
                  <Link key={item.id} to={item.id} onClick={() => setIsSidebarOpen(false)} style={{ textDecoration: "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", cursor: "pointer", color: location.pathname === item.id ? "#67e8f9" : "#9ca3af", borderLeft: `2px solid ${location.pathname === item.id ? "#0e7490" : "transparent"}`, background: location.pathname === item.id ? "rgba(14,116,144,.1)" : "transparent", fontSize: 13, fontWeight: location.pathname === item.id ? 600 : 400, transition: "all .12s" }}>
                      <span style={{ opacity: location.pathname === item.id ? 1 : .6 }}>{item.icon}</span>
                      {item.label}
                    </div>
                  </Link>
                ))}
              </div>
            ))}
          </div>

          {/* Dynamic Footer Card Syncing with Global Snapshot Profiles */}
          <div style={{ margin: "20px 12px", background: isMainnet ? "rgba(74,222,128,.04)" : "rgba(245,158,11,.04)", border: isMainnet ? "1px solid rgba(74,222,128,.15)" : "1px solid rgba(245,158,11,.15)", borderRadius: 10, padding: "12px 14px", transition: "all 0.3s" }}>
            <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#4b5563", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Stellar Network</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: isMainnet ? "#4ade80" : "#f59e0b", marginBottom: 4, fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: isMainnet ? "#4ade80" : "#f59e0b" }} />
              {isMainnet ? "Mainnet · Online" : "Testnet · Active"}
            </div>
            <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace" }}>Ledger #{ledgerNumber}</div>
          </div>
        </aside>

        <main style={{ flex: 1, padding: 30, overflowY: "auto", position: "relative", height: "100%" }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: #4b5563; }
        select option { background: #1a1a2e; color: #e5e7eb; }
        
        main::-webkit-scrollbar { width: 6px; }
        main::-webkit-scrollbar-track { background: transparent; }
        main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        main::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}