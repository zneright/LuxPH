import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Navbar from "./Navbar";
import {
  Home,
  Shield,
  FileText,
  User,
  Download,
  Send,
  Wallet,
  CreditCard,
  BarChart2,
  Settings
} from "lucide-react";

export default function MerchantLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasPremiumPlan, setHasPremiumPlan] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDocRef = doc(db, "merchants", user.uid);
        const userSnapshot = await getDoc(userDocRef);
        if (userSnapshot.exists() && userSnapshot.data().isSubscribed) {
          setHasPremiumPlan(true);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Desktop Navigation Menu with Lucide Icons
  const menuSections = [
    {
      title: "Money", items: [
        { path: "/merchant/create", icon: <Download size={18} />, name: "Receive" },
        { path: "/merchant/send-payment", icon: <Send size={18} />, name: "Send" },
      ]
    },
    {
      title: "Tools", items: [
        { path: "/merchant/cashout", icon: <Wallet size={18} />, name: "Withdraw" },
        { path: "/merchant/vault", icon: <Shield size={18} />, name: "Contingency Vault" },
        { path: "/merchant/invoices", icon: <FileText size={18} />, name: "Invoices" },
      ]
    },
    {
      title: "My Account", items: [
        { path: "subscription", icon: <CreditCard size={18} />, name: "My Plan" },
        ...(hasPremiumPlan ? [{ path: "/merchant/analytics", icon: <BarChart2 size={18} />, name: "Reports" }] : []),
        { path: "/merchant/settings", icon: <Settings size={18} />, name: "Settings" },
      ]
    }
  ];

  return (
    <div style={{ height: "100vh", background: "#080b14", color: "#e5e7eb", fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Background Cinematic Glows (Added blur for realism) */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "-10%", left: "-10%", width: "50vw", height: "50vw", borderRadius: "50%", background: "rgba(124,58,237,0.15)", filter: "blur(120px)" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: "50vw", height: "50vw", borderRadius: "50%", background: "rgba(0,180,120,0.1)", filter: "blur(120px)" }} />
      </div>

      <div className="hidden md:block relative z-10">
        <Navbar toggleSidebar={() => { }} />
      </div>

      {/* Main Content Area - FIXED PADDING ISSUE HERE */}
      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1, overflow: "hidden" }} className="pb-[calc(env(safe-area-inset-bottom)+70px)] md:pb-0">

        {/* Side Menu for Computers */}
        <aside
          className="hidden md:flex flex-col bg-white/[0.02] backdrop-blur-md border-r border-white/5"
          style={{ width: 260, padding: "32px 16px", flexShrink: 0, height: "100%", overflowY: "auto" }}
        >
          {menuSections.map(section => (
            <div key={section.title} style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: "#6b7280", letterSpacing: "0.15em", textTransform: "uppercase", padding: "0 16px", marginBottom: 12, fontWeight: 600 }}>
                {section.title}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {section.items.map(item => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path} style={{ textDecoration: "none" }}>
                      <div className={`nav-item ${isActive ? "active" : ""}`}>
                        <div style={{ color: isActive ? "#c4b5fd" : "#9ca3af", transition: "color 0.2s ease" }}>
                          {item.icon}
                        </div>
                        {item.name}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* Page Content */}
        <main style={{ flex: 1, padding: "24px", overflowY: "auto", position: "relative", height: "100%" }} className="md:p-[40px]">
          <Outlet />
        </main>
      </div>

      {/* Bottom Menu for Phones (Upgraded UI & Bug Fix) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 backdrop-blur-3xl z-50" style={{ background: "rgba(8,11,20,0.85)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div style={{ display: "flex", height: 72, justifyContent: "space-between", alignItems: "center", padding: "0 16px" }}>

          {[
            { path: "/merchant", icon: Home, label: "Home" },
            { path: "/merchant/vault", icon: Shield, label: "Vault" },
            { path: "/merchant/invoices", icon: FileText, label: "Invoices" },
            { path: "/merchant/me", icon: User, label: "Me" }
          ].map((tab) => {
            // BUG FIX: Use strict matching so "/merchant" doesn't trigger "/me"
            const isActive = location.pathname === tab.path || (tab.path === "/merchant/me" && location.pathname.startsWith("/merchant/me/"));
            const Icon = tab.icon;

            return (
              <button key={tab.path} onClick={() => navigate(tab.path)} style={{ background: "transparent", border: "none", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "68px", height: "100%", cursor: "pointer", transition: "all 0.3s ease" }}>

                {/* Premium Active Pill Background */}
                {isActive && (
                  <div style={{ position: "absolute", inset: "12px 6px", }} />
                )}

                {/* Icon & Label Container */}
                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: isActive ? 4 : 6, transform: isActive ? "translateY(-2px)" : "translateY(0)", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}>

                  {/* Glowing Icon */}
                  <Icon size={isActive ? 24 : 22} color={isActive ? "#c4b5fd" : "#6b7280"} style={{ transition: "all 0.3s ease", filter: isActive ? "drop-shadow(0 0 8px rgba(167,139,250,0.6))" : "none" }} />

                  {/* Text Label */}
                  <span style={{ fontSize: 10, fontWeight: isActive ? 800 : 600, color: isActive ? "#e5e7eb" : "#6b7280", transition: "all 0.3s ease", opacity: isActive ? 1 : 0.7 }}>
                    {tab.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* CSS Styles for animations and scrollbars */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800&family=DM+Mono:wght@400;500;600&display=swap');
        
        * { box-sizing: border-box; }
        
        main::-webkit-scrollbar, aside::-webkit-scrollbar { width: 6px; }
        main::-webkit-scrollbar-track, aside::-webkit-scrollbar-track { background: transparent; }
        main::-webkit-scrollbar-thumb, aside::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        main::-webkit-scrollbar-thumb:hover, aside::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }

        /* Modern Pill Navigation Styles */
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 16px;
          border-radius: 12px;
          color: #9ca3af;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
          background: transparent;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.04);
          color: #e5e7eb;
        }

        .nav-item.active {
          background: rgba(124, 58, 237, 0.15);
          color: #c4b5fd;
          font-weight: 700;
          box-shadow: inset 0 0 0 1px rgba(124, 58, 237, 0.2);
        }
      `}</style>
    </div>
  );
}