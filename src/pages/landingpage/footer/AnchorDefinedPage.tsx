import { motion } from "framer-motion";
import { ArrowLeft, Coins, RefreshCw, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";

export default function AnchorDefinedPage() {
  return (
    <div className="min-h-screen bg-[#060610] text-white font-sans relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-[20%] left-[-20%] w-[60vw] h-[60vh] bg-[radial-gradient(ellipse_at_center,rgba(216,180,254,0.1)_0%,transparent_70%)] blur-[100px] pointer-events-none" />

      {/* Navigation */}
      <nav className="border-b border-white/5 bg-transparent absolute top-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />{" "}
            <span className="text-xs font-bold tracking-widest uppercase">
              Back to Home
            </span>
          </Link>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-20 px-6 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-20"
        >
          <h1 className="text-4xl md:text-6xl font-black mb-6 tracking-tight">
            The PHPC Anchor Protocol
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-lg leading-relaxed">
            Lux PH utilizes a strictly audited 1:1 fiat-backed stablecoin model.
            Understand how physical Pesos are digitized for high-velocity MSME
            commerce.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connector Line (Desktop) */}
          <div className="hidden md:block absolute top-1/2 left-[10%] right-[10%] h-px bg-gradient-to-r from-fuchsia-500/0 via-fuchsia-500/30 to-fuchsia-500/0 -translate-y-1/2 z-0" />

          {/* Step 1 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#0c0c14]/90 backdrop-blur-xl border border-white/10 p-8 rounded-3xl relative z-10 shadow-2xl text-center"
          >
            <div className="w-16 h-16 mx-auto bg-white/[0.03] border border-white/10 rounded-full flex items-center justify-center mb-6">
              <Coins className="text-gray-300" size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">1. Fiat Deposit</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Merchant deposits standard Philippine Pesos (PHP) into regulated
              institutional bank accounts.
            </p>
          </motion.div>

          {/* Step 2 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-b from-fuchsia-900/20 to-[#0c0c14]/90 backdrop-blur-xl border border-fuchsia-500/30 p-8 rounded-3xl relative z-10 shadow-[0_0_40px_rgba(217,70,239,0.15)] text-center transform md:-translate-y-4"
          >
            <div className="w-16 h-16 mx-auto bg-fuchsia-500/20 border border-fuchsia-500/50 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(217,70,239,0.4)]">
              <RefreshCw className="text-fuchsia-300" size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3 text-fuchsia-100">
              2. Smart Anchor Minting
            </h3>
            <p className="text-sm text-fuchsia-200/70 leading-relaxed">
              Lux PH verifies the deposit and autonomously mints the exact
              equivalent in digital PHPC onto the Stellar Ledger.
            </p>
          </motion.div>

          {/* Step 3 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-[#0c0c14]/90 backdrop-blur-xl border border-white/10 p-8 rounded-3xl relative z-10 shadow-2xl text-center"
          >
            <div className="w-16 h-16 mx-auto bg-white/[0.03] border border-white/10 rounded-full flex items-center justify-center mb-6">
              <LockKeyhole className="text-emerald-400" size={24} />
            </div>
            <h3 className="text-xl font-bold mb-3">
              3. Cryptographic Settlement
            </h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              PHPC flows frictionlessly between MSMEs. When withdrawn, tokens
              are burned and fiat is released.
            </p>
          </motion.div>
        </div>

        {/* Reserve Box */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-20 border border-white/5 bg-white/[0.02] p-8 rounded-3xl text-center max-w-2xl mx-auto"
        >
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
            Live Reserve Status
          </h4>
          <div className="text-3xl font-black text-white font-mono">
            ₱ 1,482,500.00{" "}
            <span className="text-gray-600 font-sans text-xl">Backed</span>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
