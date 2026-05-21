import { useState, useEffect, useRef } from "react";
import { collection, getDocs, collectionGroup, doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { KpiCard } from "../../components/admin/AdminUi";
import { LoadingBadge } from "../../components/dashboard/LoadingBadge";
import { motion, AnimatePresence } from "framer-motion";

export default function Overview() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMerchants: 0, proCount: 0, freeCount: 0,
    globalInflow: 0, globalOutflow: 0, globalCashout: 0,
  });
  
  useEffect(() => {
    setIsLoading(false);
  }, []);

  return (
    <div style={{ padding: "4px" }}>
      <h1 style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Ecosystem Overview</h1>
      <p style={{ color: "#9ca3af", fontSize: 13, margin: 0, marginBottom: 32 }}>Global Settlement Layer Operations Center</p>

      {isLoading ? (
          <LoadingBadge text="Loading..." variant="network" />
      ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <KpiCard label="Total Core Merchants" value={stats.totalMerchants.toLocaleString()} sub='Active Nodes' />
              <KpiCard label="Volume Index" value={`₱0.00`} sub='Aggregated Cross-Border Flow' />
              <KpiCard label="System MRR Projection" value={`₱0.00`} sub={`${stats.proCount} Nodes Settling Commercially`} />
          </div>
      )}
    </div>
  );
}
