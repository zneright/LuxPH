import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  Search,
  Filter,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function ConsolePage() {
  const [balance] = useState("124,500.00");

  const transactions = [
    {
      id: "tx_8ae391",
      type: "received",
      amount: "+ ₱ 1,250.00",
      status: "Settled",
      time: "2 mins ago",
    },
    {
      id: "tx_9b4c22",
      type: "received",
      amount: "+ ₱ 8,400.00",
      status: "Settled",
      time: "15 mins ago",
    },
    {
      id: "tx_1c0f88",
      type: "withdrawn",
      amount: "- ₱ 15,000.00",
      status: "Processing",
      time: "2 hours ago",
    },
    {
      id: "tx_3d7a91",
      type: "received",
      amount: "+ ₱ 450.00",
      status: "Settled",
      time: "5 hours ago",
    },
  ];

  return (
    <div className="min-h-screen bg-[#060610] text-white font-sans relative overflow-hidden selection:bg-indigo-500/30">
      {/* Background Nebulas */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vh] bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)] blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vh] bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.1)_0%,transparent_70%)] blur-[100px] pointer-events-none" />

      {/* Navigation */}
      <nav className="border-b border-white/5 bg-white/[0.02] backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />{" "}
            <span className="text-xs font-bold tracking-widest uppercase">
              Back to Home
            </span>
          </Link>
          <div className="text-sm font-black tracking-widest bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-300">
            LUX CONSOLE
          </div>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 border border-white/20 flex items-center justify-center text-xs font-bold shadow-[0_0_15px_rgba(99,102,241,0.4)]">
            NP
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-black mb-8">Dashboard Overview</h1>

          {/* Top Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {/* Balance Card */}
            <div className="md:col-span-2 bg-[#0c0c14]/80 backdrop-blur-xl border border-white/5 p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] group-hover:bg-indigo-500/20 transition-all" />
              <div className="flex items-center gap-3 mb-6">
                <Wallet className="text-indigo-400" size={20} />
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                  Available Balance (PHPC)
                </span>
              </div>
              <div className="text-5xl md:text-6xl font-black mb-8 tracking-tight">
                ₱ {balance}
              </div>
              <div className="flex gap-4">
                <button className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl text-sm font-bold tracking-wide hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                  <ArrowDownLeft size={16} /> Receive Funds
                </button>
                <button className="flex items-center gap-2 bg-white/[0.05] border border-white/10 px-6 py-3 rounded-xl text-sm font-bold tracking-wide hover:bg-white/[0.1] transition-colors">
                  <ArrowUpRight size={16} /> Withdraw
                </button>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-[#0c0c14]/80 backdrop-blur-xl border border-white/5 p-8 rounded-3xl shadow-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <Activity className="text-emerald-400" size={20} />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    Network Status
                  </span>
                </div>
                <div className="text-2xl font-bold text-white mb-2">
                  Synced to Ledger
                </div>
                <p className="text-xs text-emerald-400 font-mono">
                  Last block: 12 seconds ago
                </p>
              </div>
              <div className="pt-6 border-t border-white/5 mt-6">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                  30-Day Volume
                </div>
                <div className="text-2xl font-bold text-white">
                  ₱ 482,000.00
                </div>
              </div>
            </div>
          </div>

          {/* Transactions Ledger */}
          <div className="bg-[#0c0c14]/80 backdrop-blur-xl border border-white/5 rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-bold">Recent Transactions</h2>
              <div className="flex gap-3">
                <div className="flex items-center bg-white/[0.02] border border-white/10 rounded-lg px-3 py-2">
                  <Search size={14} className="text-gray-400 mr-2" />
                  <input
                    type="text"
                    placeholder="Search hashes..."
                    className="bg-transparent border-none outline-none text-xs text-white placeholder-gray-500 w-32"
                  />
                </div>
                <button className="flex items-center gap-2 bg-white/[0.02] border border-white/10 px-3 py-2 rounded-lg text-xs font-bold text-gray-300 hover:text-white transition-colors">
                  <Filter size={14} /> Filter
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/[0.01] text-[10px] uppercase tracking-widest text-gray-500">
                    <th className="p-6 font-bold">Transaction Hash</th>
                    <th className="p-6 font-bold">Status</th>
                    <th className="p-6 font-bold">Time</th>
                    <th className="p-6 font-bold text-right">Amount (PHPC)</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {transactions.map((tx, i) => (
                    <tr
                      key={i}
                      className="border-b border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      <td className="p-6 font-mono text-indigo-300 group-hover:text-indigo-400">
                        {tx.id}...
                      </td>
                      <td className="p-6">
                        <span
                          className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${tx.status === "Settled" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="p-6 text-gray-400 text-xs">{tx.time}</td>
                      <td
                        className={`p-6 text-right font-bold ${tx.type === "received" ? "text-emerald-400" : "text-white"}`}
                      >
                        {tx.amount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
