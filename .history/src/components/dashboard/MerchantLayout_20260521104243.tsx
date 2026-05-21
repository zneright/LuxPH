import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import Navbar from "./Navbar";

const groups = [
  {
    label: "Overview", items: [
      { id: "/merchant", icon: "⬡", label: "Dashboard" },
      { id: "/merchant/invoices", icon: "◳", label: "Invoices" },
      { id: "/merchant/create", icon: "✦", label: "Create Invoice" },
      { id: "/merchant/send-payment", icon: "⇀", label: "Send Payment" }
    ]
  },
  {
    label: "Finance", items: [
      { id: "/merchant/cashout", icon: "⇌", label: "Cash Out" },
      { id: "/merchant/analytics", icon: "◈", label: "Analytics" },
    ]
  },
  {
    label: "Account", items: [
      { id: "/merchant/settings", icon: "◎", label: "Settings" },
      { id: "/merchant/subscription", icon: "★", label: "Subscription" },
    ]
  },
];

export default function MerchantLayout() {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    // FIX 1: Changed minHeight to exact height: 100vh and added overflow: hidden
    <div style={{ height: "100vh", background: "#080b14", color: "#e5e7eb", fontFamily: "'Nunito', sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Background Glows */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -100, left: -100, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,rgba(0,80,60,.35) 0%,transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: -120, right: -80, width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle,rgba(88,28,235,.25) 0%,transparent 70%)" }} />
      </div>

      <Navbar toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

      {/* FIX 2: Made this flex container take up exactly the remaining space */}
      <div style={{ display: "flex", flex: 1, position: "relative", zIndex: 1, overflow: "hidden" }}>

        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="md:hidden"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 30 }}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        {/* FIX 3: Added height: 100% to force it to touch the absolute bottom */}
        <aside
          className={`absolute md:relative z-40 transition-transform duration-300 ease-in-out bg-[#080b14]/95 md:bg-white/[0.02] backdrop-blur-xl md:backdrop-blur-sm border-r border-white/5 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
          style={{ width: 220, padding: "24px 0", flexShrink: 0, height: "100%", overflowY: "auto" }}
        >
          {groups.map(g => (
            <div key={g.label} style={{ marginBottom: 26 }}>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", color: "#4b5563", letterSpacing: ".1em", textTransform: "uppercase", padding: "0 18px", marginBottom: 8 }}>{g.label}</div>
              {g.items.map(item => (
                <Link
                  key={item.id}
                  to={item.id}
                  onClick={() => setIsSidebarOpen(false)}
                  style={{ textDecoration: "none" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", cursor: "pointer", color: location.pathname === item.id ? "#c4b5fd" : "#9ca3af", borderLeft: `2px solid ${location.pathname === item.id ? "#7c3aed" : "transparent"}`, background: location.pathname === item.id ? "rgba(124,58,237,.08)" : "transparent", fontSize: 13, fontWeight: location.pathname === item.id ? 600 : 400, transition: "all .12s" }}>
                    <span style={{ opacity: location.pathname === item.id ? 1 : .6 }}>{item.icon}</span>
                    {item.label}
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </aside>

        {/* Main Content Area */}
        {/* FIX 4: Added height: 100% to ensure only this area scrolls */}
        <main style={{ flex: 1, padding: "30px", overflowY: "auto", position: "relative", height: "100%" }}>
          <Outlet />
        </main>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        input::placeholder { color: #4b5563; }
        select option { background: #1a1a2e; color: #e5e7eb; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(1.4)} }
        
        main::-webkit-scrollbar { width: 6px; }
        main::-webkit-scrollbar-track { background: transparent; }
        main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        main::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}