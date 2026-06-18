import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LoadingOverlayProps {
    isLoading: boolean;
    message?: string;
}

export const LoadingOverlay = ({ isLoading, message = "Processing..." }: LoadingOverlayProps) => {
    if (!isLoading) return null;

    const blocks = [...Array(9)].map((_, i) => i);

    const containerVariants = {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { staggerChildren: 0.1 } },
        exit: { opacity: 0 },
    };

    const blockVariants = {
        initial: { scale: 0.3, opacity: 0.2 },
        animate: {
            scale: [0.3, 1, 0.3],
            opacity: [0.2, 1, 0.2],
            transition: { repeat: Infinity, duration: 1.2, ease: "easeInOut" },
        },
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(255, 255, 255, 0.85)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    zIndex: 9999,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden"
                }}
            >
                <motion.div
                    variants={containerVariants}
                    initial="initial"
                    animate="animate"
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "8px",
                        marginBottom: "24px"
                    }}
                >
                    {blocks.map((index) => (
                        <motion.div
                            key={index}
                            variants={blockVariants}
                            style={{
                                width: "20px",
                                height: "20px",
                                borderRadius: "6px",
                                background: index % 2 === 0 ? "#6366f1" : "#818cf8",
                                boxShadow: "0 4px 10px rgba(99, 102, 241, 0.3)"
                            }}
                        />
                    ))}
                </motion.div>

                <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    style={{
                        color: "#1f2937",
                        fontWeight: 800,
                        fontSize: "14px",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        fontFamily: "'DM Mono', monospace"
                    }}
                >
                    {message}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};