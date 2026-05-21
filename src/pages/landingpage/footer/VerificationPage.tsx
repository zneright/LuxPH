import { motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  ShieldCheck,
  Database,
  Search,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function VerificationPage() {
  return (
    <div className="min-h-screen bg-[#060610] text-white font-sans relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.15)_0%,transparent_70%)] blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('/images/noise.png')] opacity-5 mix-blend-overlay pointer-events-none" />

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

      <main className="relative z-10 pt-32 pb-20 px-6 max-w-4xl mx-auto text-center flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-16 h-16 mx-auto bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <ShieldCheck className="text-blue-400" size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-6 tracking-tight">
            Cryptographic Ledger Verification
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto mb-12 text-lg">
            Every transaction executed through Lux PH is permanently etched onto
            the Stellar Mainnet. Enter a transaction hash below to verify
            cryptographic finality.
          </p>

          {/* Search Bar */}
          <div className="w-full max-w-2xl mx-auto relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-500"></div>
            <div className="relative bg-[#0c0c14] border border-white/10 rounded-2xl p-2 flex items-center shadow-2xl">
              <Search className="text-gray-400 ml-4 mr-2" size={20} />
              <input
                type="text"
                placeholder="Enter Transaction Hash (e.g. 8ae391bf...)"
                className="flex-1 bg-transparent border-none outline-none text-white px-2 py-4 font-mono text-sm placeholder-gray-600"
              />
              <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-xl font-bold tracking-wide transition-colors">
                Verify
              </button>
            </div>
          </div>
        </motion.div>

        {/* Live Network Stream Dummy */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="w-full max-w-3xl mt-24 text-left"
        >
          <div className="flex items-center gap-2 mb-6">
            <Database className="text-emerald-400" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-300">
              Live Horizon Stream
            </h3>
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((_, i) => (
              <div
                key={i}
                className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />
                  <div>
                    <div className="font-mono text-xs text-blue-300 mb-1">
                      tx_94f8a1...e7c2{i}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                      Settled • {i + 1} sec ago
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-sm">
                    ₱ {(Math.random() * 5000).toFixed(2)}
                  </span>
                  <CheckCircle2 className="text-emerald-500" size={16} />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
