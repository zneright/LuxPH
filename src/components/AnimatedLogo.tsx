import React from "react";
import { motion } from "framer-motion";

interface AnimatedLogoProps {
    isPro?: boolean;
    size?: number; // Allows you to scale the logo anywhere (e.g., 32 for nav, 120 for splash)
    triggerKey?: number | string; // Changing this triggers the wrap/unwrap intro animation
}

export default function AnimatedLogo({ isPro = false, size = 32, triggerKey }: AnimatedLogoProps) {
    return (
        <div style={{ height: size, width: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.svg
                key={triggerKey}
                width="100%"
                height="100%"
                viewBox="0 0 240 240"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                animate={isPro ? {
                    scale: [1, 1.03, 1]
                } : {
                    scale: 1
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            >
                <defs>
                    <linearGradient id="luxGrad" x1="44" y1="40" x2="196" y2="196" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#22C55E" />
                        <stop offset="0.55" stopColor="#8B5CF6" />
                        <stop offset="1" stopColor="#3B82F6" />
                    </linearGradient>
                </defs>

                {/* L-Track Line-Drawing / Wrapping Animation */}
                <motion.path
                    d="M76 42V134 C76 160 94 178 120 178H186"
                    stroke="url(#luxGrad)"
                    strokeWidth="22"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ strokeDasharray: "0 400", strokeDashoffset: 400 }}
                    animate={{ strokeDasharray: "400 0", strokeDashoffset: 0 }}
                    transition={{ duration: 1.1, ease: "easeInOut" }}
                />

                {/* Top Block (Green) with Separated Spring & Glow Transitions */}
                <motion.rect
                    x="44"
                    y="24"
                    width="64"
                    height="64"
                    rx="20"
                    fill="#22C55E"
                    initial={{ opacity: 0, y: -60, scale: 0.4 }}
                    animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        filter: isPro ? [
                            "drop-shadow(0 0 2px rgba(34,197,94,0.2))",
                            "drop-shadow(0 0 16px rgba(34,197,94,0.75))",
                            "drop-shadow(0 0 2px rgba(34,197,94,0.2))"
                        ] : "drop-shadow(0 0 0px rgba(0,0,0,0))"
                    }}
                    transition={{
                        default: {
                            type: "spring",
                            stiffness: 140,
                            damping: 12,
                            delay: 0.2
                        },
                        filter: {
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 0.2
                        }
                    }}
                />

                {/* Bottom Block (Blue) with Separated Spring & Glow Transitions */}
                <motion.rect
                    x="154"
                    y="146"
                    width="64"
                    height="64"
                    rx="20"
                    fill="#3B82F6"
                    initial={{ opacity: 0, x: 60, scale: 0.4 }}
                    animate={{
                        opacity: 1,
                        x: 0,
                        scale: 1,
                        filter: isPro ? [
                            "drop-shadow(0 0 2px rgba(59,130,246,0.2))",
                            "drop-shadow(0 0 16px rgba(59,130,246,0.75))",
                            "drop-shadow(0 0 2px rgba(59,130,246,0.2))"
                        ] : "drop-shadow(0 0 0px rgba(0,0,0,0))"
                    }}
                    transition={{
                        default: {
                            type: "spring",
                            stiffness: 140,
                            damping: 12,
                            delay: 0.35
                        },
                        filter: {
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 0.6
                        }
                    }}
                />
            </motion.svg>
        </div>
    );
}