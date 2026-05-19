import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../config/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { Horizon } from "@stellar/stellar-sdk";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

interface TransactionData {
  amount?: string;
  amountToken?: string;
  token: string;
  timestamp: string;
  networkSpeedSeconds?: number;
  totalWaitTimeSeconds?: number;
  payoutMethod?: "bank" | "gcash" | "qr";
  status?: string; // Added to track success/failure
}

const FloatingWrapper = ({ children, delay = 0, yOffset = 4 }: { children: React.ReactNode, delay?: number, yOffset?: number }) => (
  <motion.div animate={{ y: [0, -yOffset, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay }} style={{ height: "100%" }}>
    {children}
  </motion.div>
);

const AnimatedStatCard = ({ label, value, sub, accent, delay }: { label: string, value: string | React.ReactNode, sub: React.ReactNode, accent: string, delay: number }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay, type: "spring", bounce: 0.4 }}
    whileHover={{ scale: 1.03, translateY: -5, boxShadow: `0 10px 30px -10px ${accent}60` }}
    style={{ background: "linear-gradient(145deg, rgba(255,255,255,.05) 0%, rgba(255,255,255,.01) 100%)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 16, padding: 20, position: "relative", overflow: "hidden", height: "100%", backdropFilter: "blur(10px)" }}
  >
    <motion.div
      animate={{ opacity: [0.1, 0.4, 0.1], scale: [1, 1.2, 1] }}
      transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay }}
      style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, background: accent, filter: "blur(40px)", borderRadius: "50%", pointerEvents: "none" }}
    />
    <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: 8, fontFamily: "'DM Mono',monospace" }}>{label}</div>
    <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 6, fontFamily: "'Nunito',sans-serif", letterSpacing: "-0.02em" }}>{value}</div>
    <div style={{ fontSize: 12, color: "#9ca3af" }}>{sub}</div>
  </motion.div>
);

// Mini Progress Bar for Routing Distribution
const MiniBar = ({ label, value, max, color }: { label: string, value: number, max: number, color: string }) => {
  const percent = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9ca3af", marginBottom: 4, fontFamily: "'DM Mono',monospace" }}>
        <span>{label}</span>
        <span style={{ color: "#fff", fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 1, delay: 0.5 }} style={{ height: "100%", background: color }} />
      </div>
    </div>
  );
};

export default function Analytics() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isPro, setIsPro] = useState<boolean | null>(null);

  // --- CORE SYSTEM METRICS ---
  const [totalIn, setTotalIn] = useState(0);
  const [totalOutPayments, setTotalOutPayments] = useState(0);
  const [totalOutCashouts, setTotalOutCashouts] = useState(0);
  const [feesSaved, setFeesSaved] = useState(0);

  // --- GRANULAR SEGMENT COUNT TRACKERS ---
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [cashoutCount, setCashoutCount] = useState(0);

  // --- FAILED / CANCELLED TRACKERS ---
  const [failedInvoices, setFailedInvoices] = useState(0);
  const [failedPayments, setFailedPayments] = useState(0);
  const [failedCashouts, setFailedCashouts] = useState(0);

  // --- GRANULAR TICKET SIZE CALCULATIONS ---
  const [avgInvoice, setAvgInvoice] = useState(0);
  const [avgPayment, setAvgPayment] = useState(0);
  const [avgCashout, setAvgCashout] = useState(0);
  const [maxTicketIn, setMaxTicketIn] = useState(0);

  // --- SPECIFIC SPEED STATE ---
  const [rxSpeeds, setRxSpeeds] = useState({ net: "0.00", wait: "0.00" });
  const [txSpeeds, setTxSpeeds] = useState({ net: "0.00", wait: "0.00" });
  const [cxSpeeds, setCxSpeeds] = useState({ net: "0.00", wait: "0.00" }); // Added Cashout Speeds

  // --- LIVE PIE BREAKDOWNS ---
  const [tokenStats, setTokenStats] = useState({ phpc: 0, usdc: 0, xlm: 0, totalTokens: 0 });
  const [cashoutMethods, setCashoutMethods] = useState({ bank: 0, gcash: 0, qr: 0, total: 0 });

  const [heatmapBars, setHeatmapBars] = useState<number[]>(new Array(12).fill(0));
  const [liveLedger, setLiveLedger] = useState<any>({ sequence: "Loading...", protocol: "...", baseFee: "..." });

  // LIVE RADAR FROM STELLAR BLOCKS
  useEffect(() => {
    if (!isPro) return;
    const server = new Horizon.Server(HORIZON_URL);
    const closeStream = server.ledgers().cursor("now").stream({
      onmessage: (ledger) => {
        setLiveLedger({
          sequence: ledger.sequence,
          protocol: ledger.protocol_version,
          baseFee: ledger.base_fee_in_stroops
        });
      },
      onerror: (err) => console.error("Ledger stream error:", err)
    });
    return () => closeStream();
  }, [isPro]);

  useEffect(() => {
    const fetchAnalyticsData = async (uid: string) => {
      try {
        const [invoicesSnap, paymentsSnap, cashoutsSnap] = await Promise.all([
          getDocs(collection(db, `merchants/${uid}/invoices`)),
          getDocs(collection(db, `merchants/${uid}/payments`)),
          getDocs(collection(db, `merchants/${uid}/cashouts`))
        ]);

        let sumIn = 0;
        let phpc = 0, usdc = 0, xlm = 0;
        let rxNetTotal = 0, rxWaitTotal = 0, rxSpeedCount = 0;
        let txNetTotal = 0, txWaitTotal = 0, txSpeedCount = 0;
        let cxNetTotal = 0, cxWaitTotal = 0, cxSpeedCount = 0; // Cashout specific totals
        let maxIn = 0;

        let failInv = 0, failPay = 0, failCash = 0;
        let successInv = 0, successPay = 0, successCash = 0;

        const hourlyCounts = new Array(12).fill(0);
        const processTime = (tStr: string) => {
          if (!tStr) return;
          const bucket = Math.floor(new Date(tStr).getHours() / 2);
          hourlyCounts[bucket]++;
        };

        // 1. Process Invoices (Receive)
        invoicesSnap.forEach((doc) => {
          const data = doc.data() as TransactionData;
          if (data.status === "failed" || data.status === "cancelled") {
            failInv++;
            return; // EXCLUDE FAILED/CANCELLED FROM METRICS
          }

          successInv++;
          const amt = parseFloat(data.amount || "0");
          sumIn += amt;
          maxIn = Math.max(maxIn, amt);

          if (data.token === "PHPC") phpc += amt;
          if (data.token === "USDC") usdc += amt;
          if (data.token === "XLM") xlm += amt;

          if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
            rxNetTotal += data.networkSpeedSeconds;
            rxWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
            rxSpeedCount++;
          }
          processTime(data.timestamp);
        });

        // 2. Process Supplier Deliveries (Send)
        let sumOutPay = 0;
        paymentsSnap.forEach((doc) => {
          const data = doc.data() as TransactionData;
          if (data.status === "failed" || data.status === "cancelled") {
            failPay++;
            return; // EXCLUDE FAILED/CANCELLED FROM METRICS
          }

          successPay++;
          sumOutPay += parseFloat(data.amount || "0");

          if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
            txNetTotal += data.networkSpeedSeconds;
            txWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
            txSpeedCount++;
          }
          processTime(data.timestamp);
        });

        // 3. Process Off-Ramps (Cashouts)
        let sumOutCash = 0;
        let mBank = 0, mGcash = 0, mQr = 0;
        cashoutsSnap.forEach((doc) => {
          const data = doc.data() as TransactionData;
          if (data.status === "failed" || data.status === "cancelled") {
            failCash++;
            return; // EXCLUDE FAILED/CANCELLED FROM METRICS
          }

          successCash++;
          sumOutCash += parseFloat(data.amountToken || data.amount || "0");

          if (data.networkSpeedSeconds && data.networkSpeedSeconds > 0) {
            cxNetTotal += data.networkSpeedSeconds;
            cxWaitTotal += (data.totalWaitTimeSeconds || data.networkSpeedSeconds);
            cxSpeedCount++;
          }

          if (data.payoutMethod === "bank") mBank++;
          if (data.payoutMethod === "gcash") mGcash++;
          if (data.payoutMethod === "qr") mQr++;
          processTime(data.timestamp);
        });

        // Tally States
        setTotalIn(sumIn);
        setFeesSaved(sumIn * 0.035); // Calculate 3.5% Gateway fees saved!
        setTotalOutPayments(sumOutPay);
        setTotalOutCashouts(sumOutCash);
        setMaxTicketIn(maxIn);

        // Update counts strictly with successful records
        setInvoiceCount(successInv);
        setPaymentCount(successPay);
        setCashoutCount(successCash);

        // Record the failed / cancelled statuses
        setFailedInvoices(failInv);
        setFailedPayments(failPay);
        setFailedCashouts(failCash);

        setAvgInvoice(successInv > 0 ? sumIn / successInv : 0);
        setAvgPayment(successPay > 0 ? sumOutPay / successPay : 0);
        setAvgCashout(successCash > 0 ? sumOutCash / successCash : 0);

        setCashoutMethods({ bank: mBank, gcash: mGcash, qr: mQr, total: successCash });

        if (rxSpeedCount > 0) {
          setRxSpeeds({ net: (rxNetTotal / rxSpeedCount).toFixed(2), wait: (rxWaitTotal / rxSpeedCount).toFixed(2) });
        }
        if (txSpeedCount > 0) {
          setTxSpeeds({ net: (txNetTotal / txSpeedCount).toFixed(2), wait: (txWaitTotal / txSpeedCount).toFixed(2) });
        }
        if (cxSpeedCount > 0) {
          setCxSpeeds({ net: (cxNetTotal / cxSpeedCount).toFixed(2), wait: (cxWaitTotal / cxSpeedCount).toFixed(2) });
        }

        const maxTx = Math.max(...hourlyCounts);
        setHeatmapBars(hourlyCounts.map(c => maxTx > 0 ? (c / maxTx) * 100 : 15));
        setTokenStats({ phpc, usdc, xlm, totalTokens: phpc + usdc + xlm > 0 ? phpc + usdc + xlm : 1 });

      } catch (error) {
        console.error("Failed to compile analytics matrices:", error);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const merchantDoc = await getDoc(doc(db, "merchants", user.uid));
        if (merchantDoc.exists()) {
          const proStatus = merchantDoc.data().isSubscribed === true;
          setIsPro(proStatus);
          if (proStatus) await fetchAnalyticsData(user.uid);
        } else { setIsPro(false); }
      } else { setIsPro(false); }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- CHART MATH CALCULATIONS ---
  const pPHPC = Math.round((tokenStats.phpc / tokenStats.totalTokens) * 100) || 0;
  const pUSDC = Math.round((tokenStats.usdc / tokenStats.totalTokens) * 100) || 0;
  const pXLM = 100 - pPHPC - pUSDC;

  const dashPHPC = `${pPHPC} ${100 - pPHPC}`;
  const dashUSDC = `${pUSDC} ${100 - pUSDC}`;
  const dashXLM = `${pXLM} ${100 - pXLM}`;

  const offsetUSDC = -pPHPC;
  const offsetXLM = -(pPHPC + pUSDC);
  // -------------------------------

  const totalOutGlobal = totalOutPayments + totalOutCashouts;

  if (isLoading) {
    return <div className="min-h-screen relative"><LoadingOverlay isLoading={true} message="Booting Quantum Analytics Logic..." /></div>;
  }

  if (!isPro) {
    return (
      <div style={{ position: "relative", minHeight: "80vh", overflow: "hidden" }}>
        <div style={{ filter: "blur(12px) opacity(0.25)", pointerEvents: "none", userSelect: "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>{[1, 2, 3, 4].map(i => <div key={i} style={{ height: 140, background: "rgba(255,255,255,0.05)", borderRadius: 16 }} />)}</div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", zIndex: 10 }}>
          <div style={{ background: "rgba(8,11,20,0.9)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: 24, padding: "48px 40px", maxWidth: 440, textAlign: "center", backdropFilter: "blur(20px)" }}>
            <div style={{ fontSize: 56, marginBottom: 20 }}>📊</div>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 12 }}>Unlock Pro Command Analytics</h2>
            <p style={{ color: "#9ca3af", fontSize: 14, marginBottom: 32 }}>Deep-dive into independent segment velocities, payment flows, and fiat gateway distributions.</p>
            <motion.button whileHover={{ scale: 1.05 }} onClick={() => navigate("/subscription")} style={{ width: "100%", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "#fff", border: "none", borderRadius: 12, padding: "16px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>Upgrade to Pro Dashboard</motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>

      {/* HEADER W/ STREAM */}
      <div style={{ marginBottom: 32, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, fontFamily: "'Nunito',sans-serif", color: "#fff", margin: "0 0 4px 0" }}>Command Center</h1>
          <p style={{ color: "#9ca3af", fontSize: 14, margin: 0 }}>Advanced Segment Audits · <span style={{ color: "#4ade80", fontWeight: 800 }}>PRO ACTIVE</span></p>
        </div>
        <div style={{ background: "rgba(124,58,237,0.06)", border: "1px solid rgba(124,58,237,0.2)", padding: "10px 18px", borderRadius: 12, display: "flex", alignItems: "center", gap: 16, fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#a78bfa" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} style={{ width: 6, height: 6, background: "#4ade80", borderRadius: "50%", boxShadow: "0 0 8px #4ade80" }} />LEDGER: <strong style={{ color: "#fff" }}>{liveLedger.sequence}</strong></div>
          <div style={{ width: 1, height: 12, background: "rgba(255,255,255,0.1)" }} />
          <div>FEE: <strong style={{ color: "#fff" }}>{liveLedger.baseFee} STROOPS</strong></div>
        </div>
      </div>

      {/* GLOBAL HIGH LEVEL METRICS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
        <FloatingWrapper delay={0}><AnimatedStatCard delay={0.1} label="Total Inflow" value={`₱${totalIn.toLocaleString()}`} sub="All Customer Payments" accent="#7c3aed" /></FloatingWrapper>
        <FloatingWrapper delay={0.2}><AnimatedStatCard delay={0.2} label="Net Capital Position" value={`₱${(totalIn - totalOutGlobal).toLocaleString()}`} sub="Retained Balance On-chain" accent="#3b82f6" /></FloatingWrapper>
        <FloatingWrapper delay={0.4}><AnimatedStatCard delay={0.3} label="Total Outflow" value={`₱${totalOutGlobal.toLocaleString()}`} sub="Suppliers + Cashouts Combined" accent="#f59e0b" /></FloatingWrapper>
        <FloatingWrapper delay={0.6}><AnimatedStatCard delay={0.4} label="Platform Fees Saved" value={<span>₱{feesSaved.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>} sub={<span style={{ color: "#10b981" }}>vs 3.5% Gateway Rates</span>} accent="#10b981" /></FloatingWrapper>
      </div>

      {/* GRANULAR SEGMENT PERFORMANCES */}
      <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: "'Nunito',sans-serif", display: "flex", alignItems: "center", gap: 8 }}>📊 Independent Segment Audits</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 32 }}>

        {/* RECEIVE / INVOICE METRICS */}
        <motion.div whileHover={{ y: -4 }} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(167,139,250,0.15)", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>🧾 RECEIVE SEGMENT</span><span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>Inbound</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Invoices Cleared</span><strong style={{ color: "#fff" }}>{invoiceCount}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Avg Invoice Ticket</span><strong style={{ color: "#4ade80" }}>₱{avgInvoice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>High-Water Mark</span><strong style={{ color: "#fff" }}>₱{maxTicketIn.toLocaleString()}</strong></div>

            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Failed / Cancelled</span><strong style={{ color: "#ef4444" }}>{failedInvoices}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Network Speed</span><strong style={{ color: "#10b981" }}>⚡ {rxSpeeds.net}s</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Human Wait Time</span><strong style={{ color: "#f59e0b" }}>⏱ {rxSpeeds.wait}s</strong></div>
          </div>
        </motion.div>

        {/* SEND / SUPPLIER METRICS */}
        <motion.div whileHover={{ y: -4 }} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>💸 SEND SEGMENT</span><span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>Outbound</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Supplier Disbursals</span><strong style={{ color: "#fff" }}>{paymentCount}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Avg Supplier Ticket</span><strong style={{ color: "#ef4444" }}>₱{avgPayment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Total Disbursed</span><strong style={{ color: "#fff" }}>₱{totalOutPayments.toLocaleString()}</strong></div>

            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Failed / Cancelled</span><strong style={{ color: "#ef4444" }}>{failedPayments}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Network Speed</span><strong style={{ color: "#10b981" }}>⚡ {txSpeeds.net}s</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Human Wait Time</span><strong style={{ color: "#f59e0b" }}>⏱ {txSpeeds.wait}s</strong></div>
          </div>
        </motion.div>

        {/* CASHOUT / OFF-RAMP METRICS */}
        <motion.div whileHover={{ y: -4 }} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 16, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ color: "#3b82f6", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>🏦 CASHOUT SEGMENT</span><span style={{ color: "#fff", fontSize: 12, fontWeight: 800 }}>Off-Ramp</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Avg Bank Clearance</span><strong style={{ color: "#fff" }}>₱{avgCashout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>

            <div style={{ borderTop: "1px dashed rgba(255,255,255,0.1)", margin: "4px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Failed / Cancelled</span><strong style={{ color: "#ef4444" }}>{failedCashouts}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Network Speed</span><strong style={{ color: "#10b981" }}>⚡ {cxSpeeds.net}s</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#9ca3af", fontSize: 13 }}>Human Wait Time</span><strong style={{ color: "#f59e0b" }}>⏱ {cxSpeeds.wait}s</strong></div>

            {/* Visual Routing Breakdown */}
            <div style={{ padding: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, marginTop: 4 }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", marginBottom: 8, letterSpacing: "0.05em" }}>Gateway Routing Profile</div>
              <MiniBar label="Bank InstaPay" value={cashoutMethods.bank} max={cashoutMethods.total} color="#3b82f6" />
              <MiniBar label="GCash E-Wallet" value={cashoutMethods.gcash} max={cashoutMethods.total} color="#10b981" />
              <MiniBar label="QR Ph Code" value={cashoutMethods.qr} max={cashoutMethods.total} color="#f59e0b" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* VISUAL LAYOUT ROW */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

        {/* Token Circle Distribution Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 20, padding: 32 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 32, display: "flex", justifyContent: "space-between" }}>Asset Settlement Matrix</div>
          <div style={{ display: "flex", gap: 40, alignItems: "center" }}>
            <div style={{ position: "relative", width: 160, height: 160 }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 40, ease: "linear" }} style={{ width: "100%", height: "100%" }}>
                <svg viewBox="0 0 36 36" width={160} height={160} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="rgba(255,255,255,0.02)" strokeWidth="3" />
                  {tokenStats.totalTokens > 0 && (
                    <>
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="3.5" strokeDasharray={dashPHPC} strokeDashoffset="0" />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#3b82f6" strokeWidth="3.5" strokeDasharray={dashUSDC} strokeDashoffset={offsetUSDC} />
                      <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#8b5cf6" strokeWidth="3.5" strokeDasharray={dashXLM} strokeDashoffset={offsetXLM} />
                    </>
                  )}
                </svg>
              </motion.div>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", fontSize: 24 }}>💎</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { color: "#10b981", label: "PHPC (Peso)", value: `${pPHPC}%`, amount: `₱${tokenStats.phpc.toLocaleString()}` },
                { color: "#3b82f6", label: "USDC (Dollar)", value: `${pUSDC}%`, amount: `₱${tokenStats.usdc.toLocaleString()}` },
                { color: "#8b5cf6", label: "XLM (Native)", value: `${pXLM}%`, amount: `₱${tokenStats.xlm.toLocaleString()}` }
              ].map((t, i) => (
                <FloatingWrapper key={t.label} delay={i * 0.2} yOffset={3}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: t.color, boxShadow: `0 0 12px ${t.color}` }} />
                    <span style={{ fontSize: 14, color: "#d1d5db", fontWeight: 700 }}>{t.label}</span>
                    <div style={{ marginLeft: "auto", textAlign: "right" }}>
                      <div style={{ fontWeight: 900, color: "#fff", fontSize: 16 }}>{t.value}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{t.amount}</div>
                    </div>
                  </div>
                </FloatingWrapper>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Real-time Heatmap Chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} style={{ background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)", borderRadius: 20, padding: 32 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 32, display: "flex", justifyContent: "space-between" }}>System Load Window <span style={{ fontSize: 12, color: "#4ade80" }}>Dynamic</span></div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, borderBottom: "1px dashed rgba(255,255,255,.1)", paddingBottom: 10 }}>
            {heatmapBars.map((h, i) => (
              <motion.div
                key={i}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: [0.95, 1, 0.95] }}
                style={{ flex: 1, height: `${h}%`, borderRadius: "6px 6px 0 0", background: h > 50 ? "linear-gradient(180deg, #7c3aed, #4f46e5)" : "rgba(124,58,237,0.2)", transformOrigin: "bottom" }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.1 }}
                whileHover={{ backgroundColor: "#a855f7" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280", fontFamily: "'DM Mono',monospace", marginTop: 16, fontWeight: 600 }}>
            {["12AM", "4AM", "8AM", "12PM", "4PM", "8PM"].map(t => <span key={t}>{t}</span>)}
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}