import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface LoadingOverlayProps {
    isLoading: boolean;
    message?: string;
}

export const LoadingOverlay = ({ isLoading, message = "Processing..." }: LoadingOverlayProps) => {
    if (!isLoading) return null;

    // Create an array of 9 items for our 3x3 block grid
    const blocks = [...Array(9)].map((_, i) => i);

    // Animation variants for the container to stagger the blocks
    const containerVariants = {
        initial: { opacity: 0 },
        animate: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
            },
        },
        exit: { opacity: 0 },
    };

    // Animation variants for individual blocks
    const blockVariants = {
        initial: { scale: 0.3, opacity: 0.2 },
        animate: {
            scale: [0.3, 1, 0.3],
            opacity: [0.2, 1, 0.2],
            transition: {
                repeat: Infinity,
                duration: 1.2,
                ease: "easeInOut",
            },
        },
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#080b14]/80 backdrop-blur-sm z-[999] flex flex-col items-center justify-center overflow-hidden"
            >
                {/* BLOCK ANIMATION GRID */}
                <motion.div
                    variants={containerVariants}
                    initial="initial"
                    animate="animate"
                    className="grid grid-cols-3 gap-2 mb-6"
                >
                    {blocks.map((index) => (
                        <motion.div
                            key={index}
                            variants={blockVariants}
                            className="w-5 h-5 rounded-sm"
                            style={{
                                // Alternate block colors slightly for a cooler effect
                                background: index % 2 === 0 ? "#7c3aed" : "#a78bfa",
                                boxShadow: "0 0 10px rgba(124, 58, 237, 0.4)"
                            }}
                        />
                    ))}
                </motion.div>

                {/* LOADING MESSAGE */}
                <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="text-white font-bold text-sm tracking-widest uppercase font-['DM_Mono',monospace]"
                >
                    {message}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};