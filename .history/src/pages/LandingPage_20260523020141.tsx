import { Link } from "react-router-dom";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Zap,
  Percent,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { motion, useScroll, useTransform } from "framer-motion";
import { EarthCanvas } from "../components/EarthCanvas";
import AnimatedLogo from "../components/AnimatedLogo";

// ─── ANIMATION VARIANTS ────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 80, damping: 20 },
  },
};
const stagger = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.18 } },
};
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.8 } },
};

// ─── STATIC STAR ────────────────────────────────────────────────────────────
const StaticStar = ({
  x,
  y,
  size = 1,
  opacity = 0.3,
}: {
  x: string | number;
  y: string | number;
  size?: number;
  opacity?: number;
}) => (
  <div
    className="absolute rounded-full bg-white pointer-events-none"
    style={{ left: x, top: y, width: 2 * size, height: 2 * size, opacity }}
  />
);

// ─── SHOOTING STAR (METEORITE) ──────────────────────────────────────────────
const ShootingStar = ({ delay = 0 }: { delay?: number }) => {
  const startX = useMemo(() => Math.random() * 100 + 20, []);
  const startY = useMemo(() => Math.random() * 50 - 20, []);
  const repeatDelay = useMemo(() => Math.random() * 7 + 3, []);

  return (
    <motion.div
      className="absolute pointer-events-none z-0 flex items-center justify-end"
      style={{
        top: `${startY}vh`,
        left: `${startX}vw`,
        width: "180px",
        height: "2px",
        background:
          "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.6) 50%, rgba(255,255,255,1) 100%)",
        transformOrigin: "right",
      }}
      initial={{ x: 0, y: 0, opacity: 0, rotate: -45 }}
      animate={{
        x: -1500,
        y: 1500,
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        delay: delay,
        ease: "linear",
        repeatDelay: repeatDelay,
      }}
    >
      <div className="w-[4px] h-[4px] bg-white rounded-full shadow-[0_0_15px_4px_rgba(255,255,255,0.8)]" />
    </motion.div>
  );
};

const developers = [
  {
    number: "01",
    name: "Nishia",
    role: "Frontend Lead",
    image: "/images/developer_1.jpg",
    skills: ["React", "Firebase", "Tailwind"],
    ring: "from-violet-500 to-sky-400",
    glowBg: "from-violet-500/15 to-sky-500/5",
    hoverBorder: "hover:border-violet-400/40",
    roleCls: "border-violet-400/20 bg-violet-500/10 text-violet-300",
    lineCls: "from-violet-400 to-sky-400",
  },
  {
    number: "02",
    name: "Renz",
    role: "Backend Architect",
    image: "/images/developer_2.jpg",
    skills: ["Node.js", "Security", "Stellar"],
    ring: "from-emerald-400 to-cyan-400",
    glowBg: "from-emerald-500/15 to-cyan-500/5",
    hoverBorder: "hover:border-emerald-400/40",
    roleCls: "border-emerald-400/20 bg-emerald-500/10 text-emerald-300",
    lineCls: "from-emerald-400 to-cyan-400",
  },
  {
    number: "03",
    name: "Liezl",
    role: "UI/UX Designer",
    image: "/images/developer_3.jpg",
    skills: ["Figma", "UX Research", "Prototyping"],
    ring: "from-amber-400 to-rose-400",
    glowBg: "from-amber-500/15 to-rose-500/5",
    hoverBorder: "hover:border-amber-400/40",
    roleCls: "border-amber-400/20 bg-amber-500/10 text-amber-300",
    lineCls: "from-amber-400 to-rose-400",
  },
];

export default function LandingPage() {
  const [freeCapLimit, setFreeCapLimit] = useState(100000);
  const [activeNav, setActiveNav] = useState(false);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.25], [0, -60]);

  // Simulated free cap (replace with Firebase fetch)
  useEffect(() => {
    setFreeCapLimit(100000);
    const onScroll = () => setActiveNav(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const backgroundNodes = useMemo(
    () =>
      [...Array(80)].map(() => ({
        x: `${Math.random() * 100}%`,
        y: `${Math.random() * 100}%`,
        size: Math.random() * 1.8 + 0.3,
        opacity: Math.random() * 0.5 + 0.1,
      })),
    [],
  );

  const meteorites = useMemo(
    () =>
      [...Array(6)].map(() => ({
        delay: Math.random() * 5,
      })),
    [],
  );

  const ledgerElements = useMemo(
    () =>
      [...Array(3)].map(() => ({
        width: `${Math.random() * 40 + 20}%`,
        left: `${Math.random() * 50}%`,
      })),
    [],
  );

  const footerData = {
    product: [
      { label: "On-Chain Console", to: "/console" },
      { label: "Verification Ledger", to: "/verification" },
      { label: "Anchor Defined", to: "/anchor-defined" },
      { label: "API Documentation", to: "/api-documentation" },
    ],
    legal: [
      { label: "Privacy Policy", to: "/privacy-policy" },
      { label: "Non-Custodial Agreement", to: "/non-custodial" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Security", to: "/security" },
    ],
  };

  return (
    <div
      className="relative min-h-screen text-white font-sans overflow-x-hidden"
      style={{ background: "#060610" }}
    >
      {/* ── GLOBAL STARFIELD ─────────────────────────────────────── */}
      <div className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none overflow-hidden">
        {backgroundNodes.map((n, i) => (
          <StaticStar
            key={i}
            x={n.x}
            y={n.y}
            size={n.size}
            opacity={n.opacity}
          />
        ))}
        {meteorites.map((m, i) => (
          <ShootingStar key={`meteor-${i}`} delay={m.delay} />
        ))}
      </div>

      {/* ── NEBULA BACKGROUND LAYERS ──────────────────────────────── */}
      <div className="fixed top-0 left-0 w-full h-full z-0 pointer-events-none overflow-hidden">
        {/* Core indigo nebula */}
        <div
          style={{
            position: "absolute",
            top: "10%",
            left: "30%",
            width: "80vw",
            height: "80vh",
            background:
              "radial-gradient(ellipse at center, rgba(99,102,241,0.18) 0%, rgba(139,92,246,0.1) 35%, transparent 70%)",
            filter: "blur(80px)",
            transform: "rotate(-15deg)",
          }}
        />
        {/* Fuchsia / violet arm */}
        <div
          style={{
            position: "absolute",
            top: "5%",
            left: "-10%",
            width: "70vw",
            height: "60vh",
            background:
              "radial-gradient(ellipse at center, rgba(192,132,252,0.15) 0%, rgba(167,139,250,0.08) 40%, transparent 70%)",
            filter: "blur(100px)",
            transform: "rotate(20deg)",
          }}
        />
        {/* Cyan edge */}
        <div
          style={{
            position: "absolute",
            top: "40%",
            right: "-15%",
            width: "60vw",
            height: "50vh",
            background:
              "radial-gradient(ellipse at center, rgba(34,211,238,0.1) 0%, rgba(59,130,246,0.07) 40%, transparent 70%)",
            filter: "blur(90px)",
            transform: "rotate(-30deg)",
          }}
        />
        {/* Pink lower arm */}
        <div
          style={{
            position: "absolute",
            bottom: "5%",
            left: "20%",
            width: "65vw",
            height: "45vh",
            background:
              "radial-gradient(ellipse at center, rgba(244,114,182,0.1) 0%, rgba(216,180,254,0.06) 40%, transparent 70%)",
            filter: "blur(110px)",
            transform: "rotate(10deg)",
          }}
        />
        {/* Emerald mid-nebula */}
        <div
          style={{
            position: "absolute",
            top: "60%",
            left: "5%",
            width: "45vw",
            height: "40vh",
            background:
              "radial-gradient(ellipse at center, rgba(16,185,129,0.08) 0%, transparent 70%)",
            filter: "blur(80px)",
          }}
        />
        {/* Dense core bright spot */}
        <div
          style={{
            position: "absolute",
            top: "20%",
            left: "45%",
            width: "30vw",
            height: "30vw",
            background:
              "radial-gradient(circle, rgba(129,140,248,0.22) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      <div className="relative z-10">
        {/* ══════════════════════════════════════════════════════════
            SECTION 1: NAVIGATION
        ══════════════════════════════════════════════════════════ */}
        <motion.nav
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
          style={{
            background: activeNav ? "rgba(6,6,16,0.85)" : "transparent",
            backdropFilter: activeNav ? "blur(20px)" : "none",
            borderBottom: activeNav
              ? "1px solid rgba(255,255,255,0.05)"
              : "none",
          }}
        >
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 max-w-7xl mx-auto">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <AnimatedLogo />
              
            </div>

            {/* Nav links */}
            <div className="hidden lg:flex items-center gap-8 text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              {[
                { label: "Features", to: "#features" },
                { label: "MSME Tools", to: "#msme-tools" },
                { label: "Stellar PH", to: "#stellar-ph" },
                { label: "On-Chain Ledger", to: "#on-chain-ledger" },
              ].map((item) => (
                <a
                  key={item.label}
                  href={item.to}
                  className="hover:text-white transition-colors duration-300 hover:tracking-[0.25em]"
                >
                  {item.label}
                </a>
              ))}
            </div>

            {/* CTA buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                to="/signin"
                className="px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold tracking-wide text-gray-300 border border-white/10 rounded-lg hover:bg-white/5 transition-all duration-300 whitespace-nowrap"
              >
                <span className="hidden sm:inline">Merchant </span>Login
              </Link>
              <Link
                to="/signup"
                className="px-3 sm:px-4 py-2 text-[10px] sm:text-xs font-bold tracking-wide bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-all duration-300 shadow-lg shadow-indigo-500/20 whitespace-nowrap"
              >
                <span className="hidden sm:inline">Create </span>Account
              </Link>
            </div>
          </div>
        </motion.nav>

        {/* ══════════════════════════════════════════════════════════
            SECTION 2: HERO
        ══════════════════════════════════════════════════════════ */}
        <motion.header
          ref={heroRef}
          style={{ opacity: heroOpacity, y: heroY }}
          className="relative flex flex-col items-center justify-center text-center px-4 pt-32 md:pt-40 pb-24 md:pb-40 max-w-5xl mx-auto"
        >
          {/* Announcement pill */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mb-8 px-4 py-1.5 rounded-full border border-indigo-400/20 text-[11px] font-semibold tracking-widest text-indigo-300 uppercase"
            style={{
              background: "rgba(99,102,241,0.08)",
              backdropFilter: "blur(10px)",
            }}
          >
            ✦ Now Live on Stellar Mainnet ✦
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl sm:text-6xl md:text-[5.5rem] font-black tracking-tight mb-8 leading-[1.02]"
            style={{
              background:
                "linear-gradient(160deg, #ffffff 30%, #c4b5fd 65%, #818cf8 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 40px rgba(139,92,246,0.3))",
            }}
          >
            Frictionless
            <br />
            On-Chain
            <br />
            Payments.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.7 }}
            className="text-gray-300 text-base sm:text-lg md:text-xl mb-12 max-w-2xl font-medium leading-relaxed"
          >
            A premium, non-custodial financial gateway engineered natively on
            the Stellar Network for Filipino MSMEs. Process digital pesos (PHPC)
            instantly. Preserve 100% of your revenue flow.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.6 }}
            className="flex flex-col sm:flex-row items-center gap-4"
          >
            <Link
              to="/signup"
              className="w-full sm:w-auto flex items-center justify-center gap-3 px-8 py-4 rounded-xl text-base font-bold tracking-wide transition-all duration-300 group"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow:
                  "0 0 40px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              Start Accepting Payments
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </motion.div>

          {/* Stat strip */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1, duration: 0.8 }}
            className="mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-12"
          >
            {[
              { label: "Processing Fee", value: "0%" },
              { label: "Settlement Time", value: "~5s" },
              { label: "Uptime SLA", value: "99.9%" },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div
                  className="text-3xl font-black mb-1"
                  style={{
                    background: "linear-gradient(135deg,#10b981,#34d399)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {stat.value}
                </div>
                <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-widest">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.header>

        {/* ══════════════════════════════════════════════════════════
            SECTION 3: LUX IN ASTRONOMY
        ══════════════════════════════════════════════════════════ */}
        <motion.section
          id="features"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 md:pb-32"
        >
          <motion.div
            variants={fadeUp}
            className="relative rounded-3xl overflow-hidden p-8 md:p-14 border border-white/5"
            style={{
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(139,92,246,0.04) 50%, rgba(6,6,16,0.8) 100%)",
              backdropFilter: "blur(20px)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Decorative nebula inside the card */}
            <div
              className="absolute top-0 right-0 w-1/2 h-full pointer-events-none opacity-40"
              style={{
                background:
                  "radial-gradient(ellipse at top right, rgba(139,92,246,0.3) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute bottom-0 left-0 w-1/3 h-1/2 pointer-events-none opacity-20"
              style={{
                background:
                  "radial-gradient(ellipse at bottom left, rgba(34,211,238,0.3) 0%, transparent 70%)",
              }}
            />

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-10 md:gap-16">
              {/* Lux symbol */}
              <div
                className="flex-shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center border border-violet-500/30"
                style={{
                  background:
                    "radial-gradient(circle, rgba(139,92,246,0.25) 0%, rgba(6,6,16,0.5) 100%)",
                  boxShadow:
                    "0 0 60px rgba(139,92,246,0.3), inset 0 0 30px rgba(139,92,246,0.1)",
                }}
              >
                <span
                  className="text-4xl md:text-5xl font-black"
                  style={{
                    background: "linear-gradient(135deg,#c4b5fd,#818cf8)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  lx
                </span>
              </div>

              <div className="text-center md:text-left">
                <p className="text-[10px] uppercase font-bold tracking-[0.35em] text-violet-400 mb-3">
                  Our Cosmic Inspiration
                </p>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black mb-5 leading-tight">
                  Lux PH: Named after the SI unit of Illuminance.
                </h2>
                <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-2xl">
                  In astronomy,{" "}
                  <span className="text-violet-300 font-semibold">
                    Lux (lx)
                  </span>{" "}
                  is the SI unit of Illuminance — the total luminous flux per
                  unit area, measuring how intensely light flows across a
                  surface. One lux equals one lumen per square meter: absolute
                  clarity defined by photon velocity. Like light itself, digital
                  payment flows must be fast, constant, and inherently
                  decentralized. We chose this metric to define our velocity.
                </p>
                <div className="mt-6 flex flex-wrap justify-center md:justify-start gap-4 text-xs font-mono">
                  {[
                    "1 lx = 1 lm / m²",
                    "Speed: 299,792 km/s",
                    "Quantum Finality",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full border border-violet-500/20 text-violet-400"
                      style={{ background: "rgba(139,92,246,0.07)" }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 4: MSME FEATURE CARDS
        ══════════════════════════════════════════════════════════ */}
        <motion.section
          id="msme-tools"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 md:pb-32"
        >
          <motion.div variants={fadeUp} className="text-center mb-14">
            <p className="text-[10px] uppercase font-bold tracking-[0.35em] text-indigo-400 mb-3">
              Why LUX PH
            </p>
            <h2 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">
              Built for Filipino MSMEs.
              <br className="hidden md:block" /> Not for banks.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
            {[
              {
                Icon: Percent,
                gradient: "from-emerald-500/15 to-teal-500/10",
                glow: "rgba(16,185,129,0.15)",
                textColor: "text-emerald-400",
                border: "rgba(16,185,129,0.2)",
                title: "0% Processing Fees",
                desc: "Traditional gateways seize 3% of your growth. We execute native Stellar transactions, eradicating transaction costs so MSMEs capture 100% of revenue.",
                tag: "Zero Cost",
              },
              {
                Icon: Zap,
                gradient: "from-indigo-500/15 to-violet-500/10",
                glow: "rgba(99,102,241,0.2)",
                textColor: "text-indigo-400",
                border: "rgba(99,102,241,0.25)",
                title: "5-Second Settlement",
                desc: "No multi-day banking clearance delays. Digital assets (PHPC) are cryptographically verified and available in your secure on-chain wallet in microseconds.",
                tag: "Instant Final",
              },
              {
                Icon: ShieldCheck,
                gradient: "from-amber-500/15 to-orange-500/10",
                glow: "rgba(245,158,11,0.15)",
                textColor: "text-amber-400",
                border: "rgba(245,158,11,0.2)",
                title: "Strictly Non-Custodial",
                desc: "Lux PH provides the analytical dashboard, but you own the absolute keys to your capital. Funds move directly between peer wallets, secured by cryptography.",
                tag: "You Own It",
              },
            ].map((f, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                whileHover={{
                  y: -6,
                  transition: { type: "spring", stiffness: 300 },
                }}
                className={`relative rounded-2xl p-8 border overflow-hidden group cursor-default`}
                style={{
                  borderColor: f.border,
                  background: `linear-gradient(135deg, rgba(6,6,16,0.9) 0%, rgba(6,6,16,0.7) 100%)`,
                  boxShadow: `0 0 0 0 ${f.glow}`,
                  transition: "box-shadow 0.4s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 20px 60px ${f.glow}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 0 0 ${f.glow}`;
                }}
              >
                {/* Gradient bg */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-8">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center border"
                      style={{ background: `${f.glow}`, borderColor: f.border }}
                    >
                      <f.Icon className={`${f.textColor} w-6 h-6`} />
                    </div>
                    <span
                      className={`text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full ${f.textColor}`}
                      style={{
                        background: `${f.glow}`,
                        border: `1px solid ${f.border}`,
                      }}
                    >
                      {f.tag}
                    </span>
                  </div>
                  <h3 className="text-xl font-extrabold mb-4 text-white">
                    {f.title}
                  </h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {f.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 5: 3D EARTH + STELLAR HORIZON
        ══════════════════════════════════════════════════════════ */}
        <motion.section
          id="stellar-ph"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 md:pb-32"
        >
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
            {/* 3D Earth container */}
            <motion.div
              variants={fadeIn}
              className="w-full lg:w-1/2 flex-shrink-0"
            >
              <div
                className="relative mx-auto"
                style={{
                  width: "min(420px, 100%)",
                  height: "min(420px, 80vw)",
                }}
              >
                {/* Outer glow ring */}
                <div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(99,102,241,0.08) 50%, transparent 70%)",
                    filter: "blur(20px)",
                    transform: "scale(1.2)",
                  }}
                />
                {/* Earth canvas */}
                <EarthCanvas />

                {/* Animated transaction pings */}
                {[
                  { top: "20%", left: "25%", color: "#10B981", delay: 0 },
                  { top: "55%", left: "65%", color: "#6366f1", delay: 1.5 },
                  { top: "75%", left: "35%", color: "#f59e0b", delay: 3 },
                ].map((ping, i) => (
                  <motion.div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{ top: ping.top, left: ping.left }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      delay: ping.delay,
                      ease: "easeOut",
                    }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        background: ping.color,
                        boxShadow: `0 0 12px ${ping.color}`,
                      }}
                    />
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Content */}
            <motion.div
              variants={fadeUp}
              className="w-full lg:w-1/2 text-center lg:text-left"
            >
              <p className="text-[10px] uppercase font-bold tracking-[0.35em] text-indigo-400 mb-4">
                Immutable Auditing
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 leading-tight tracking-tight">
                Real-time audit verification via Stellar Horizon.
              </h2>
              <p className="text-gray-400 text-base md:text-lg mb-8 leading-relaxed">
                Our Firebase-powered engine monitors Stellar Horizon streaming
                defined by on-chain finality. We map standard merchant invoices
                directly to immutable transaction hashes. Transparency defined
                by the flow of data.
              </p>

              {/* Feature mini-list */}
              <div className="space-y-4 mb-10">
                {[
                  {
                    title: "Horizon API Integration",
                    desc: "Live streaming from Stellar consensus nodes",
                  },
                  {
                    title: "Invoice ↔ Hash Mapping",
                    desc: "Every payment linked to an immutable record",
                  },
                  {
                    title: "Public Ledger Proof",
                    desc: "Verifiable by anyone, anywhere, anytime",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: "rgba(16,185,129,0.15)",
                        border: "1px solid rgba(16,185,129,0.3)",
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-white">
                        {item.title}
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        — {item.desc}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <a
                href="https://github.com/zneright/LuxPH"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center lg:justify-start gap-2 px-7 py-3.5 text-sm font-semibold text-gray-200 border border-white/10 rounded-xl hover:border-indigo-400/40 hover:text-white transition-all duration-300 group w-2 sm:w-auto"
                style={{
                  backdropFilter: "blur(10px)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                View System Architecture
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-300" />
              </a>
            </motion.div>
          </div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 6: COMPARISON TABLE
        ══════════════════════════════════════════════════════════ */}
        <motion.section
          id="on-chain-ledger"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="max-w-5xl mx-auto px-4 sm:px-6 pb-20 md:pb-32"
        >
          <motion.div variants={fadeUp} className="text-center mb-14">
            <p className="text-[10px] uppercase font-bold tracking-[0.35em] text-indigo-400 mb-3">
              MSME Benefits
            </p>
            <h2 className="text-3xl md:text-5xl font-black leading-tight tracking-tight">
              How we beat traditional gateways.
            </h2>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="rounded-2xl border border-white/5 overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.01)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 40px 80px rgba(0,0,0,0.4)",
            }}
          >
            {/* Header row */}
            <div
              className="flex items-center p-5 md:p-7 border-b border-white/8"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <div className="w-[32%] text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Core Feature
              </div>
              <div className="w-[34%] text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
                Traditional Gateway
              </div>
              <div className="w-[34%] text-right text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                LUX PH Ecosystem
              </div>
            </div>

            {[
              {
                feature: "Fees per transaction",
                trad: "2.5% – 3.5%",
                lux: "₱0 — Zero Cost",
                highlight: true,
              },
              {
                feature: "Settlement timeframe",
                trad: "1 – 3 Banking Days",
                lux: "Final in ~5 seconds",
                highlight: true,
              },
              {
                feature: "Capital custody",
                trad: "Custodial third-party",
                lux: "Non-Custodial, You Own Keys",
                highlight: false,
              },
              {
                feature: "Audit transparency",
                trad: "Private centralized DB",
                lux: "Public Stellar Ledger",
                highlight: false,
              },
            ].map((row, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5 }}
                className="flex items-center p-5 md:p-7 border-b border-white/5 last:border-0 group hover:bg-white/[0.015] transition-colors"
              >
                <div className="w-[32%] text-sm md:text-base font-semibold text-gray-200 group-hover:text-white transition-colors pr-4">
                  {row.feature}
                </div>
                <div className="w-[34%] text-center text-sm text-gray-500">
                  {row.trad}
                </div>
                <div
                  className={`w-[34%] text-right flex items-center justify-end gap-2 font-bold text-sm md:text-base ${row.highlight ? "text-emerald-400" : "text-gray-100"}`}
                >
                  {row.highlight && (
                    <CheckCircle2
                      size={15}
                      className="flex-shrink-0 text-emerald-400"
                    />
                  )}
                  <span>{row.lux}</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 7: CTA + LEDGER VISUAL
        ══════════════════════════════════════════════════════════ */}
        <motion.section
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="max-w-7xl mx-auto px-4 sm:px-6 pb-20 md:pb-32"
        >
          <div className="flex flex-col lg:flex-row items-center gap-14 lg:gap-20">
            {/* Text */}
            <motion.div
              variants={fadeUp}
              className="w-full lg:w-1/2 text-center lg:text-left"
            >
              <p className="text-[10px] uppercase font-bold tracking-[0.35em] text-indigo-400 mb-4">
                Scale Now
              </p>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-6 leading-tight tracking-tight">
                Scale your enterprise with decentralized PHP-PHPC payments.
              </h2>
              <p className="text-gray-400 text-base md:text-lg mb-8 leading-relaxed">
                Terminate standard transactional erosion that minimizes margins.
                Join the financial velocity engineered for Filipino MSMEs on the
                Stellar Network.
              </p>
              <p
                className="text-[11px] text-gray-500 font-mono tracking-wider mb-8 inline-block px-4 py-2 rounded-lg border border-white/5"
                style={{ background: "rgba(255,255,255,0.02)" }}
              >
                // Current Platform Sandbox Cap: ₱
                {freeCapLimit.toLocaleString()} PHPC
              </p>
              <div>
                <Link
                  to="/signup"
                  className="w-full sm:w-auto px-10 py-4 rounded-xl text-base font-bold tracking-wide transition-all duration-300 hover:-translate-y-0.5"
                  style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    boxShadow:
                      "0 0 40px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                >
                  Deploy Your On-Chain Merchant Console
                </Link>
              </div>
            </motion.div>

            {/* Live transaction card */}
            <motion.div
              variants={fadeUp}
              className="w-full lg:w-1/2 flex justify-center lg:justify-end"
            >
              <div className="relative w-full max-w-sm">
                {/* Card glow */}
                <div
                  className="absolute -inset-4 rounded-2xl pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 70%)",
                    filter: "blur(20px)",
                  }}
                />

                <div
                  className="relative rounded-2xl p-6 border border-white/8"
                  style={{
                    background: "rgba(12,12,20,0.95)",
                    backdropFilter: "blur(20px)",
                    boxShadow: "0 40px 80px rgba(0,0,0,0.5)",
                  }}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-5 pb-5 border-b border-white/8">
                    <div className="text-sm font-semibold text-white">
                      Latest On-Chain Hash
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                        style={{ boxShadow: "0 0 8px #10B981" }}
                      />
                      <span className="text-xs font-bold text-emerald-400">
                        Final
                      </span>
                    </div>
                  </div>

                  {/* Tx data */}
                  <div
                    className="space-y-3 font-mono text-[11px] text-gray-400 p-4 rounded-lg border border-white/5"
                    style={{ background: "rgba(255,255,255,0.01)" }}
                  >
                    {[
                      {
                        label: "VOLUME",
                        value: "₱ 1,250.00 PHPC",
                        color: "text-white font-bold",
                      },
                      {
                        label: "SENDER",
                        value: "G...5R2z",
                        color: "text-indigo-400",
                      },
                      {
                        label: "RECIPIENT",
                        value: "G...LuxP",
                        color: "text-emerald-400",
                      },
                      {
                        label: "BLOCK HASH",
                        value: "8ae3...f4b1",
                        color: "text-gray-600 text-[10px]",
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        className="flex justify-between items-center"
                      >
                        <span>{row.label}:</span>
                        <span className={row.color}>{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Decorative ledger lines */}
                  {ledgerElements.map((el, i) => (
                    <div
                      key={i}
                      className="absolute rounded h-px"
                      style={{
                        background: "rgba(16,185,129,0.2)",
                        width: el.width,
                        left: el.left,
                        bottom: `${-10 - i * 12}px`,
                        opacity: 1 - i * 0.25,
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* ══════════════════════════════════════════════════════════
            SECTION 8: MEET THE DEVELOPERS
        ══════════════════════════════════════════════════════════ */}
        <section className="relative z-10 py-24 px-6 overflow-hidden">
          {/* Ambient blobs */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-violet-600/20 blur-[100px]" />
            <div className="absolute bottom-[-5rem] right-[10%] w-64 h-64 rounded-full bg-emerald-600/15 blur-[80px]" />
            <div className="absolute top-[40%] -right-10 w-48 h-48 rounded-full bg-amber-500/10 blur-[70px]" />
          </div>

          {/* Grid texture */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />

          <div className="relative max-w-6xl mx-auto text-center">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <div className="mb-3 flex items-center justify-center gap-3">
                <span className="h-px w-7 bg-gradient-to-r from-transparent to-violet-500" />
                <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">
                  the team
                </span>
                <span className="h-px w-7 bg-gradient-to-l from-transparent to-violet-500" />
              </div>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-4">
                Meet the{" "}
                <span className="bg-gradient-to-r from-violet-400 to-sky-400 bg-clip-text text-transparent">
                  Developers
                </span>
              </h2>
              <p className="text-gray-500 text-lg max-w-xl mx-auto font-light leading-relaxed">
                The minds behind the platform building futuristic financial
                experiences.
              </p>
            </motion.div>

            {/* Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {developers.map((dev, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.15 }}
                  viewport={{ once: true }}
                  whileHover={{ y: -10, scale: 1.02 }}
                  className={`group relative overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.04] backdrop-blur-xl transition-all duration-300 ${dev.hoverBorder} hover:shadow-2xl`}
                >
                  {/* Hover glow overlay */}
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${dev.glowBg} opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
                  />

                  <div className="relative z-10 flex flex-col items-center px-6 pb-6 pt-8 text-center">
                    {/* Card number */}
                    <span className="absolute right-4 top-4 font-mono text-[11px] font-bold text-white/20">
                      {dev.number}
                    </span>

                    {/* Avatar */}
                    <div className="relative mb-5">
                      <div
                        className={`absolute -inset-[3px] rounded-full bg-gradient-to-r ${dev.ring} opacity-50 transition-all duration-300 group-hover:opacity-100 group-hover:scale-110`}
                      />
                      <img
                        src={dev.image}
                        alt={dev.name}
                        className="relative z-10 block h-[88px] w-[88px] rounded-full border-[3px] border-[#0a0a12] object-cover"
                      />
                      <span className="absolute bottom-1 right-1 z-20 block h-3 w-3 rounded-full border-2 border-[#0a0a12] bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.2)]" />
                    </div>

                    {/* Name */}
                    <h3 className="mb-2 text-lg font-bold tracking-tight text-white">
                      {dev.name}
                    </h3>

                    {/* Role pill */}
                    <span
                      className={`mb-4 rounded-full border px-3 py-[3px] text-[11px] font-medium uppercase tracking-widest ${dev.roleCls}`}
                    >
                      {dev.role}
                    </span>

                    {/* Animated divider */}
                    <div className="relative mb-4 h-px w-full bg-white/[0.07]">
                      <div
                        className={`absolute inset-0 origin-left scale-x-0 bg-gradient-to-r ${dev.lineCls} transition-transform duration-500 delay-75 group-hover:scale-x-100`}
                      />
                    </div>

                    {/* Skill chips */}
                    <div className="mb-5 flex flex-wrap justify-center gap-1.5">
                      {dev.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-[3px] text-[10px] font-medium text-gray-400"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Social icons */}
                    <div className="flex gap-2.5 translate-y-2 opacity-0 transition-all duration-300 delay-[50ms] group-hover:translate-y-0 group-hover:opacity-100">
                      {["github", "linkedin", "twitter"].map((s) => (
                        <a
                          key={s}
                          href="#"
                          aria-label={s}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-gray-400 transition-colors hover:bg-white/[0.12] hover:text-white"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-4 h-4"
                          >
                            {s === "github" && (
                              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                            )}
                            {s === "linkedin" && (
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                            )}
                            {s === "twitter" && (
                              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.259 5.632L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
                            )}
                          </svg>
                        </a>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <footer
          className="border-t border-white/5 pt-16 pb-10 px-4 sm:px-6 relative z-10"
          style={{
            background: "rgba(6,6,16,0.8)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-sm text-gray-500">
            {/* Brand Column */}
            <div>
              <div className="flex items-center gap-2 mb-5">
                <AnimatedLogo />

              </div>
              <p className="mb-4 text-xs leading-relaxed">
                Lux PH defines decentralized on-chain finality engineered
                specifically to uplift Philippine MSME operations through
                velocity and custody ownership. Built natively on Stellar rails.
              </p>
              <p className="text-[11px] text-gray-600 font-mono">
                © 2026 LUX PH — Stellar Network Gateway
              </p>
            </div>

            {/* Links Column */}
            <div className="grid grid-cols-2 gap-8 md:col-span-2">
              {/* Product Links */}
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-widest mb-2">
                  Product
                </h4>
                {footerData.product.map((link) => (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="hover:text-white transition-colors duration-300 text-xs w-fit"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>

              {/* Legal Links */}
              <div className="flex flex-col gap-3">
                <h4 className="text-xs font-bold text-gray-200 uppercase tracking-widest mb-2">
                  Legal
                </h4>
                {footerData.legal.map((link) => (
                  <Link
                    key={link.label}
                    to={link.to}
                    className="hover:text-white transition-colors duration-300 text-xs w-fit"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}