import { useMemo } from "react";
import { Sparkles, Zap, Percent, ShieldCheck, CheckCircle2, Orbit } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

// 1. Define the TypeScript interface for the props
interface FloatingNodeProps {
  delay?: number;
  x: string | number;
  y: string | number;
  size?: number;
}

// 2. Helper component for floating background stars/nodes
const FloatingNode = ({ delay = 0, x, y, size = 1 }: FloatingNodeProps) => {
  // Calculate random transition values ONCE per node instance
  const { randomDuration, randomDelay } = useMemo(() => ({
    randomDuration: 4 + Math.random() * 2,
    randomDelay: delay + Math.random()
  }), [delay]);

  return (
    <motion.div
      className="absolute rounded-full bg-white opacity-40 z-0"
      style={{ left: x, top: y, width: 2 * size, height: 2 * size }}
      animate={{
        opacity: [0.2, 0.6, 0.2],
        scale: [1, 1.3 * size, 1],
      }}
      transition={{
        duration: randomDuration,
        delay: randomDelay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
};

export default function LandingPage() {
  // Generate the 30 background star coordinates ONCE when component mounts
  const backgroundNodes = useMemo(() => {
    return [...Array(30)].map(() => ({
      x: `${Math.random() * 100}%`,
      y: `${Math.random() * 100}%`,
      size: Math.random() * 2 + 0.5,
      delay: Math.random() * 2
    }));
  }, []);

  // Generate the 3 floating ledger element widths/positions ONCE
  const ledgerElements = useMemo(() => {
    return [...Array(3)].map(() => ({
      width: `${Math.random() * 40 + 20}%`,
      left: `${Math.random() * 50}%`
    }));
  }, []);

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] text-white font-sans overflow-hidden">

      {/* --- Ambient Background Textures & Gradients --- */}
      <div className="absolute top-0 left-0 w-full h-full z-0 pointer-events-none opacity-60">
        {/* Code-based stellar background effect */}
        <div className="absolute top-0 left-0 w-full h-full">
          {backgroundNodes.map((node, i) => (
            <FloatingNode
              key={i}
              x={node.x}
              y={node.y}
              size={node.size}
              delay={node.delay}
            />
          ))}
        </div>

        <img src="/images/Texture.png" alt="" className="absolute top-0 w-full h-full object-cover mix-blend-overlay opacity-30" />
        <img src="/images/circles.png" alt="" className="absolute top-[30%] w-full object-cover opacity-10" />
        <div className="absolute top-0 w-full h-full bg-gradient-to-b from-[#0F172A]/80 to-[#0a0a0f] mix-blend-overlay" />

        {/* Stellar Blueprint Glow */}
        <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-[#6366f1]/20 blur-[150px] rounded-full opacity-40" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#c084fc]/15 blur-[130px] rounded-full opacity-30" />
      </div>

      {/* --- Main Content Wrapper --- */}
      <div className="relative z-10">

        {/* Navigation */}
        <nav className="flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
          {/* Logo & Brand Name Container */}
          <div className="flex items-center">
            {/* Sequenced "Lux" Animation */}
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 35 35"
              className="w-10 h-10 ml-1 mr-4"
            >
              <defs>
                <path id="snake-path" d="M 0 0 L 0 20 Q 0 24 4 24 L 20 20 L 20 0 Q 20 -4 16 -4 Z" fill="none" />
              </defs>

              {[
                { delay: 1.60, color: "#10B981", id: "blk-1" },
                { delay: 0.8, color: "#8b5cf6", id: "blk-2" },
                { delay: 0, color: "#3b82f6", id: "blk-accent" },
              ].map((segment) => (
                <motion.rect
                  key={segment.id}
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: [1, 1, 1],
                    x: [0, 0, 20, 20, 0],
                    y: [0, 20, 20, 0, 0],
                    rotate: [0, 90, 0, -90, 0],
                  }}
                  transition={{
                    duration: 3,
                    ease: "easeInOut",
                    repeat: Infinity,
                    delay: segment.delay,
                    rotate: { type: "spring", stiffness: 300, damping: 20 },
                  }}
                  x="0"
                  y="0"
                  width="13"
                  height="13"
                  rx="3"
                  fill={segment.color}
                />
              ))}
            </motion.svg>
            <div className="text-xl font-bold tracking-wider">LUX PH</div>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
            <a href="#" className="hover:text-white transition-colors">Features</a>
            <a href="#" className="hover:text-white transition-colors">MSME Tools</a>
            <a href="#" className="hover:text-white transition-colors">Stellar Integration</a>
            <a href="#" className="hover:text-white transition-colors">Audit Ledger</a>
          </div>

          {/* Auth Buttons */}
          <div className="flex items-center gap-4">
            <Link
              to="/signin"
              className="px-4 py-2 text-sm font-medium text-white hover:bg-white/10 rounded-md transition-colors border border-white/20"
            >
              Merchant Login
            </Link>
            <Link
              to="/signup"
              className="px-4 py-2 text-sm font-medium bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-md transition-colors shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)]"
            >
              Create Account
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <header className="flex flex-col items-center justify-center text-center px-4 pt-20 pb-32 max-w-4xl mx-auto relative">
          <Sparkles className="absolute top-10 left-10 text-white/10 w-16 h-16 pointer-events-none" />
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 leading-[1.1]">
            Zero-Fee Payments <br /> for Filipino <br /> MSMEs.
          </h1>
          <p className="text-gray-400 text-lg mb-10 max-w-xl relative">
            A premium, non-custodial payment gateway built natively on the Stellar Network. Accept digital pesos (PHPC) instantly and keep 100% of your revenue.
            <Sparkles className="absolute -bottom-10 -right-10 text-white/10 w-12 h-12 pointer-events-none" />
          </p>
          <button className="px-8 py-3 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-lg font-medium transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] hover:-translate-y-0.5">
            Start Accepting Payments
          </button>
        </header>

        {/* Feature Cards Grid */}
        <section className="max-w-7xl mx-auto px-6 pb-32 relative">
          <div className="absolute inset-0 bg-[#0a0a0f] [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] opacity-40 z-0"></div>
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: { staggerChildren: 0.15 }
              }
            }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10"
          >
            {/* Card 1 */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 30 },
                show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } }
              }}
              className="bg-white/[0.02] backdrop-blur-sm border border-white/5 p-8 rounded-2xl hover:bg-white/[0.04] hover:border-[#6366f1]/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)] transition-all duration-300 group"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-[#10B981]/20 to-[#047857]/20 rounded-full flex items-center justify-center mb-6 border border-white/10 group-hover:border-[#10B981]/50 transition-colors">
                <Percent className="text-[#10B981] w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-white group-hover:text-[#10B981] transition-colors">0% Transaction Fees</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Stop losing 3% to traditional payment gateways. By leveraging the Stellar Network's minimal network costs, we eliminate the middleman tax entirely.
              </p>
            </motion.div>

            {/* Card 2 */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 30 },
                show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } }
              }}
              className="bg-white/[0.02] backdrop-blur-sm border border-white/5 p-8 rounded-2xl hover:bg-white/[0.04] hover:border-[#6366f1]/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)] transition-all duration-300 group"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-[#6366f1]/20 to-[#c084fc]/20 rounded-full flex items-center justify-center mb-6 border border-white/10 group-hover:border-[#6366f1]/50 transition-colors">
                <Zap className="text-[#818cf8] w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-white group-hover:text-[#818cf8] transition-colors">5-Second Settlement</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                No more waiting 1 to 3 business days for your funds to clear. Payments settle directly to your non-custodial Stellar wallet in just 5 seconds.
              </p>
            </motion.div>

            {/* Card 3 */}
            <motion.div
              variants={{
                hidden: { opacity: 0, y: 30 },
                show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } }
              }}
              className="bg-white/[0.02] backdrop-blur-sm border border-white/5 p-8 rounded-2xl hover:bg-white/[0.04] hover:border-[#6366f1]/30 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)] transition-all duration-300 group"
            >
              <div className="w-12 h-12 bg-gradient-to-br from-[#F59E0B]/20 to-[#D97706]/20 rounded-full flex items-center justify-center mb-6 border border-white/10 group-hover:border-[#F59E0B]/50 transition-colors">
                <ShieldCheck className="text-[#FBBF24] w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold mb-3 text-white group-hover:text-[#FBBF24] transition-colors">Strictly Non-Custodial</h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                We provide the reporting dashboard, but you own the private keys. We never hold, freeze, or access your business capital.
              </p>
            </motion.div>
          </motion.div>
        </section>

        {/* Floating Stellar Horizon & Tech Rings Section */}
        <section className="max-w-7xl mx-auto px-6 pb-32">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col md:flex-row items-center justify-between gap-12 mt-10 relative"
          >
            {/* Left Side: Floating Stellar Network Elements */}
            <div className="w-full md:w-1/2 flex justify-center relative items-center min-h-[400px]">

              {/* Central Stellar Orb */}
              <motion.div
                animate={{
                  y: [-15, 15, -15],
                  scale: [1, 1.03, 1],
                }}
                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                className="relative z-10 flex flex-col items-center justify-center bg-[#0F172A]/80 backdrop-blur-md border border-[#818cf8]/30 rounded-full w-56 h-56 shadow-[0_0_60px_rgba(99,102,241,0.3)]"
              >
                <Orbit className="text-[#818cf8] w-24 h-24 mb-2" strokeWidth={1} />
                <span className="text-[10px] font-semibold tracking-[0.2em] text-[#c084fc] uppercase">Network Node</span>

                {/* Internal rotating light */}
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-2 rounded-full border border-dashed border-[#818cf8]/20"
                />
              </motion.div>

              {/* Orbiting PHPC Tokens */}
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute z-20 w-12 h-12 bg-[#12121a] border border-[#10B981]/40 rounded-full flex items-center justify-center font-bold text-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                  style={{
                    originX: "50%",
                    originY: "50%",
                  }}
                  animate={{
                    rotate: [0, 360],
                  }}
                  transition={{
                    duration: 10 + i * 2,
                    repeat: Infinity,
                    ease: "linear",
                    delay: i * -3,
                  }}
                >
                  <motion.span
                    animate={{ rotate: [0, -360] }}
                    transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "linear", delay: i * -3 }}
                  >
                    ₱
                  </motion.span>
                  <div className="absolute inset-0 rounded-full bg-[#10B981]/5 blur-sm" />
                </motion.div>
              ))}

              {/* Outer Network Rings */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-0">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                  className="absolute w-[320px] h-[320px] md:w-[400px] md:h-[400px] border border-[#818cf8]/20 rounded-full border-dashed"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                  className="absolute w-[400px] h-[400px] md:w-[500px] md:h-[500px] border border-[#c084fc]/10 rounded-full"
                />
              </div>

              {/* Stellar Sparkle nodes */}
              <FloatingNode x="10%" y="20%" size={2} delay={0.5} />
              <FloatingNode x="80%" y="15%" size={1.5} delay={1.2} />
              <FloatingNode x="90%" y="70%" size={2.5} delay={0.1} />
              <FloatingNode x="15%" y="85%" size={1.8} delay={0.9} />
            </div>

            {/* Right Side: Typography & CTA */}
            <div className="w-full md:w-1/2 z-10 relative">
              <Sparkles className="absolute -top-16 -left-10 text-white/5 w-20 h-20 pointer-events-none" />
              <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight relative">
                Real-time <br />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#818cf8] to-[#c084fc]">
                  audit verification
                </span> <br />
                via Stellar Horizon
              </h2>
              <p className="text-gray-400 text-lg mb-8 max-w-md leading-relaxed">
                Our Firebase-powered reconciliation engine monitors the Stellar Horizon API in real-time. We link your Web2 invoices directly to immutable on-chain transaction hashes. We provide the UI, you own the truth.
              </p>

              <button className="relative inline-flex items-center justify-center px-8 py-3 text-sm font-medium text-white bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 hover:border-[#818cf8]/50 hover:text-[#818cf8] transition-all duration-300 backdrop-blur-sm group cursor-pointer shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                View System Architecture
                <span className="ml-2 transition-transform duration-300 group-hover:translate-x-1">
                  →
                </span>
              </button>
            </div>
          </motion.div>
        </section>

        {/* Competitor Comparison Table */}
        <section className="max-w-5xl mx-auto px-6 pb-32 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#6366f1]/5 blur-[120px] rounded-full opacity-50 z-0" />
          <div className="text-center mb-12 relative z-10">
            <h2 className="text-4xl font-bold mb-6">How we beat the<br />traditional gateways.</h2>
          </div>

          <div className="bg-[#12121a]/80 backdrop-blur-md rounded-2xl border border-white/5 overflow-hidden relative z-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            {/* Table Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.03] text-sm font-semibold text-gray-400 uppercase tracking-wider">
              <div className="w-1/3">Feature</div>
              <div className="w-1/3 text-center">Traditional Gateways</div>
              <div className="w-1/3 text-right text-[#818cf8]">Lux PH</div>
            </div>

            {/* Table Rows */}
            {[
              { feature: "Transaction Fees", trad: "2.5% - 3.5%", lux: "₱0 (You keep 100%)", highlight: true },
              { feature: "Settlement Time", trad: "1 - 3 Business Days", lux: "5 Seconds", highlight: true },
              { feature: "Fund Custody", trad: "Custodial (They hold it)", lux: "Non-Custodial", highlight: false },
              { feature: "Audit Transparency", trad: "Closed Internal Database", lux: "Public Stellar Ledger", highlight: false },
            ].map((row, i) => (
              <div key={i} className="flex items-center justify-between p-6 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors group">
                <div className="w-1/3 font-semibold text-white group-hover:text-[#818cf8] transition-colors">{row.feature}</div>
                <div className="w-1/3 text-center text-gray-400 font-medium">{row.trad}</div>
                <div className={`w-1/3 text-right font-bold flex items-center justify-end gap-2 ${row.highlight ? 'text-[#10B981]' : 'text-white'}`}>
                  {row.highlight && <CheckCircle2 size={16} className="text-[#10B981]" />}
                  {row.lux}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom CTA Section */}
        <section className="max-w-7xl mx-auto px-6 pb-32 flex flex-col md:flex-row items-center justify-between relative">
          <div className="absolute bottom-0 left-10 text-white/5 w-24 h-24 pointer-events-none" />
          <div className="w-full md:w-1/2 z-10 relative">
            <motion.div
              animate={{ x: [0, 10, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="absolute -top-12 -left-8 w-20 h-20 border-l-2 border-t-2 border-[#6366f1]/20 rounded-tl-xl"
            />
            <h2 className="text-5xl font-bold mb-6 leading-tight">Scale your business<br />with borderless<br />digital payments.</h2>
            <p className="text-gray-400 mb-8 max-w-md">
              Stop letting gateway fees eat into your margins. Join the financial revolution built explicitly for Filipino MSMEs on the Stellar Network and take back control of your revenue flow.
            </p>
            <button className="px-8 py-3 bg-[#6366f1] hover:bg-[#4f46e5] shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] text-white rounded-lg font-medium transition-all hover:-translate-y-0.5">
              Deploy Your Merchant Dashboard
            </button>
          </div>
          <div className="w-full md:w-1/2 flex justify-end relative mt-12 md:mt-0 min-h-[350px] items-center">

            {/* Floating PHPC Transaction Flow */}
            <motion.div
              animate={{ y: [-10, 10, -10] }}
              transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
              className="bg-[#0F172A]/90 border border-white/10 rounded-xl p-6 w-full max-w-sm z-10 shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-4">
                <div className="text-sm font-semibold text-white">Latest Transaction (PHPC)</div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
                  <span className="text-xs text-[#10B981]">Verified</span>
                </div>
              </div>
              <div className="space-y-3 font-mono text-xs text-gray-400">
                <div className="flex justify-between"><span>Amount:</span> <span className="text-white font-bold">₱ 1,250.00 PHPC</span></div>
                <div className="flex justify-between"><span>From:</span> <span className="text-[#818cf8]">G...5R2z</span></div>
                <div className="flex justify-between"><span>To:</span> <span className="text-[#10B981]">G...LuxP</span></div>
                <div className="flex justify-between text-[10px]"><span>Hash:</span> <span className="text-gray-600">8ae3...f4b1</span></div>
              </div>

              {/* Floating ledger elements */}
              {ledgerElements.map((el, i) => (
                <motion.div
                  key={i}
                  className="absolute bg-[#10B981]/10 rounded h-1"
                  style={{
                    width: el.width,
                    left: el.left,
                    bottom: `${-20 - i * 15}px`,
                  }}
                  animate={{ x: [0, 30, 0], opacity: [0.3, 0.7, 0.3] }}
                  transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                />
              ))}
            </motion.div>

            {/* Glowing background behind the transaction card */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-[#10B981]/10 blur-[80px] rounded-full z-0" />

            <Sparkles className="absolute top-10 right-10 text-[#818cf8]/40 w-10 h-10 animate-pulse" />
            <Sparkles className="absolute bottom-10 left-10 text-[#c084fc]/30 w-8 h-8 animate-pulse" />
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/10 pt-20 pb-10 px-6 mt-20 relative z-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-sm text-gray-400">
            <div>
              <div className="text-white font-bold mb-4 tracking-wider flex items-center gap-2">
                <Zap size={18} className="text-[#818cf8]" /> LUX PH
              </div>
              <p className="mb-4 text-xs leading-relaxed">
                Lux PH is a high-velocity settlement engine designed to empower the 1.1 million MSMEs in the Philippines. Built proudly and natively on the Stellar Network.
              </p>
              <p className="text-xs text-gray-600">© 2026 Lux PH · Stellar Hackathon 2026 Entry</p>
            </div>

            <div className="grid grid-cols-2 gap-8 md:col-span-2">
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-semibold mb-2">Platform</h4>
                <a href="#" className="hover:text-white transition-colors">Merchant Dashboard</a>
                <a href="#" className="hover:text-white transition-colors">Generate Invoices</a>
                <a href="#" className="hover:text-white transition-colors">Architecture Whitepaper</a>
                <a href="#" className="hover:text-white transition-colors">Stellar PHPC Anchor</a>
              </div>
              <div className="flex flex-col gap-3">
                <h4 className="text-white font-semibold mb-2">Legal & Security</h4>
                <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-white transition-colors">Non-Custodial Agreement</a>
                <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-white transition-colors">Open Source GitHub</a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}