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

    // 🚀 Dashboard removed, high-end SVG icons added
    const menuItems = [
        {
            id: "/merchant/settings",
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
            ),
            title: "Profile Settings",
            desc: "Manage your account and wallet connections.",
            color: "#8b5cf6",
            bg: "#f3e8ff"
        },
        {
            id: "/merchant/subscription",
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                </svg>
            ),
            title: "Subscription",
            desc: "Manage your LuxPH premium plan.",
            color: "#f59e0b",
            bg: "#fffbeb"
        },
    ];

    if (isPro) {
        menuItems.push({
            id: "/merchant/analytics",
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                </svg>
            ),
            title: "Advanced Analytics",
            desc: "Deep-dive into volume and gateway metrics.",
            color: "#10b981",
            bg: "#ecfdf5"
        });
    }

    // Framer Motion Variants for Staggered App-Like Grid
    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 15, scale: 0.95 },
        show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 400, damping: 30 } }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: "16px", maxWidth: 840, margin: "0 auto", boxSizing: "border-box", minHeight: "80vh" }}>

            {/* 🚀 PREMIUM MOBILE-FIRST STYLES & PRO ANIMATION ENGINE */}
            <style>{`
                /* Holographic Flow for Pro Header */
                @keyframes pearlFlow {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }

                /* Sweeping Glare Effect */
                @keyframes sweepGlare {
                    0% { transform: translateX(-150%) skewX(-25deg); opacity: 0; }
                    20% { opacity: 1; }
                    40% { transform: translateX(250%) skewX(-25deg); opacity: 0; }
                    100% { transform: translateX(250%) skewX(-25deg); opacity: 0; }
                }

                /* Breathing glow for Pro Avatar */
                @keyframes avatarBreathe {
                    0%, 100% { box-shadow: 0 0 15px rgba(16, 185, 129, 0.4); transform: scale(1); }
                    50% { box-shadow: 0 0 25px rgba(16, 185, 129, 0.7); transform: scale(1.03); }
                }

                .header-card {
                    position: relative;
                    border-radius: 28px;
                    padding: 32px 24px;
                    margin-bottom: 32px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    overflow: hidden;
                    transition: all 0.5s ease;
                }

                @media (min-width: 768px) {
                    .header-card {
                        padding: 40px 36px;
                        gap: 28px;
                        border-radius: 36px;
                    }
                }

                /* STANDARD TIER HEADER */
                .header-card.standard {
                    background: linear-gradient(135deg, #f8fafc, #f1f5f9);
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.03);
                }

                /* PRO TIER HEADER */
                .header-card.pro {
                    background: linear-gradient(120deg, #ffffff 0%, #d1fae5 30%, #fef3c7 70%, #ffffff 100%);
                    background-size: 300% 300%;
                    animation: pearlFlow 8s ease-in-out infinite;
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    box-shadow: 0 15px 35px -5px rgba(16, 185, 129, 0.15);
                }

                /* Pro Glare Overlay */
                .header-card.pro::after {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; bottom: 0; width: 40%;
                    background: linear-gradient(to right, transparent, rgba(255,255,255,0.9), transparent);
                    animation: sweepGlare 6s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    pointer-events: none;
                    z-index: 1;
                }

                .avatar-ring {
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    font-weight: 900;
                    color: #fff;
                    z-index: 2;
                    position: relative;
                    flex-shrink: 0;
                }

                @media (min-width: 768px) {
                    .avatar-ring {
                        width: 80px;
                        height: 80px;
                        font-size: 34px;
                    }
                }

                /* Mobile-First App Grid */
                .hub-grid {
                    display: grid;
                    grid-template-columns: 1fr; /* iOS List view on mobile */
                    gap: 16px;
                }

                @media (min-width: 768px) {
                    .hub-grid {
                        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); /* Masonry Cards on Desktop */
                        gap: 24px;
                    }
                }

                .hub-card {
                    background: #ffffff;
                    border: 1px solid #e5e7eb;
                    border-radius: 24px;
                    padding: 20px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 4px 10px -2px rgba(0, 0, 0, 0.02);
                }

                @media (min-width: 768px) {
                    .hub-card {
                        flex-direction: column;
                        align-items: flex-start;
                        padding: 32px;
                        gap: 16px;
                    }
                }

                .hub-card:hover {
                    transform: translateY(-4px) scale(1.01);
                    border-color: #d1d5db;
                    box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.08);
                }

                .icon-wrapper {
                    width: 52px;
                    height: 52px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .text-content {
                    flex: 1;
                }
            `}</style>

            {/* Premium Profile Header */}
            <div className={`header-card ${isPro ? "pro" : "standard"}`}>
                <div
                    className="avatar-ring"
                    style={{
                        background: isPro ? "linear-gradient(135deg, #10b981, #059669)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                        animation: isPro ? "avatarBreathe 3s ease-in-out infinite" : "none",
                        boxShadow: isPro ? "none" : "0 8px 20px rgba(59, 130, 246, 0.3)"
                    }}
                >
                    {userName.charAt(0).toUpperCase()}
                </div>

                <div style={{ zIndex: 2, position: "relative", width: "100%", overflow: "hidden" }}>
                    <h1 style={{ fontSize: "clamp(24px, 5vw, 32px)", fontWeight: 900, margin: "0 0 6px 0", fontFamily: "'Nunito',sans-serif", color: "#111827", letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {userName}
                    </h1>

                    {isPro ? (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", padding: "4px 12px", borderRadius: 99 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#059669", boxShadow: "0 0 8px #10b981" }} />
                            <span style={{ fontSize: 11, fontWeight: 900, color: "#047857", fontFamily: "'DM Mono',monospace", letterSpacing: "0.05em" }}>
                                PRO TIER ACTIVE
                            </span>
                        </div>
                    ) : (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#f3f4f6", border: "1px solid #e5e7eb", padding: "4px 12px", borderRadius: 99 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#9ca3af" }} />
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#4b5563", fontFamily: "'DM Mono',monospace", letterSpacing: "0.05em" }}>
                                STANDARD TIER
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, padding: "0 4px" }}>
                <h2 style={{ fontSize: 14, fontWeight: 800, color: "#9ca3af", margin: 0, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: "'DM Mono',monospace" }}>My Hub</h2>
            </div>

            {/* Responsive App-Style Grid */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="hub-grid"
            >
                {menuItems.map((item) => (
                    <motion.div
                        key={item.id}
                        variants={itemVariants}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => navigate(item.id)}
                        className="hub-card"
                    >
                        <div className="icon-wrapper" style={{ background: item.bg, color: item.color }}>
                            {item.icon}
                        </div>
                        <div className="text-content">
                            <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", marginBottom: 4, fontFamily: "'Nunito',sans-serif" }}>
                                {item.title}
                            </div>
                            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.5, fontWeight: 500 }}>
                                {item.desc}
                            </div>
                        </div>

                        {/* Mobile right arrow indicator */}
                        <div className="md:hidden" style={{ color: "#d1d5db", marginLeft: "auto" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    </motion.div>
                ))}
            </motion.div>

        </motion.div>
    );
}