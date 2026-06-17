import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { motion } from "framer-motion";

export default function Me() {
    const navigate = useNavigate();
    const [isPro, setIsPro] = useState(false);
    const [userName, setUserName] = useState("Merchant");

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                const docRef = doc(db, "merchants", user.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setIsPro(docSnap.data().isSubscribed === true);
                    setUserName(docSnap.data().businessName || "Merchant");
                }
            }
        });
        return () => unsubscribe();
    }, []);

    const menuItems = [
        { id: "/merchant", icon: "◈", title: "Dashboard Overview", desc: "View today's live ledger and metrics." },
        { id: "/merchant/settings", icon: "◎", title: "Profile Settings", desc: "Manage your account and wallet connections." },
        { id: "/merchant/subscription", icon: "★", title: "Subscription", desc: "Manage your LuxPH plan." },
    ];

    if (isPro) {
        menuItems.splice(1, 0, { id: "/merchant/analytics", icon: "📊", title: "Advanced Analytics", desc: "Deep-dive into volume and gateway metrics." });
    }

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ padding: "4px", maxWidth: 800, margin: "0 auto" }}>

            {/* Profile Header */}
            <div style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.1), rgba(79,70,229,0.05))", border: "1px solid rgba(124,58,237,0.2)", borderRadius: 24, padding: 32, marginBottom: 32, display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", boxShadow: "0 10px 25px -5px rgba(124,58,237,0.5)" }}>
                    {userName.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0, fontFamily: "'Nunito',sans-serif", color: "#fff" }}>{userName}</h1>
                    <div style={{ fontSize: 13, color: isPro ? "#4ade80" : "#a78bfa", fontFamily: "'DM Mono',monospace", marginTop: 4 }}>
                        {isPro ? "PRO TIER ACTIVE" : "STANDARD TIER"}
                    </div>
                </div>
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#9ca3af", marginBottom: 16, textTransform: "uppercase", letterSpacing: ".05em" }}>My Hub</h2>

            {/* Menu Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                {menuItems.map((item, i) => (
                    <motion.div
                        key={item.id}
                        whileHover={{ scale: 1.02, backgroundColor: "rgba(255,255,255,0.05)" }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate(item.id)}
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24, cursor: "pointer", transition: "border 0.2s" }}
                    >
                        <div style={{ fontSize: 24, marginBottom: 12, color: "#c4b5fd" }}>{item.icon}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 4, fontFamily: "'Nunito',sans-serif" }}>{item.title}</div>
                        <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{item.desc}</div>
                    </motion.div>
                ))}
            </div>

        </motion.div>
    );
}