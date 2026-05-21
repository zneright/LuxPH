import { motion } from "framer-motion";
import { ArrowLeft, Terminal, Copy } from "lucide-react";
import { Link } from "react-router-dom";

export default function APIDocuPage() {
  return (
    <div className="min-h-screen bg-[#04020a] text-white font-sans relative flex flex-col md:flex-row">
      {/* Sidebar Nav */}
      <aside className="w-full md:w-64 bg-[#0a0514] border-r border-white/5 shrink-0 h-auto md:h-screen md:sticky top-0 p-6 flex flex-col">
        <Link
          to="/"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-12"
        >
          <ArrowLeft size={16} />{" "}
          <span className="text-xs font-bold tracking-widest uppercase">
            Back
          </span>
        </Link>
        <div className="text-sm font-black tracking-widest text-white mb-6">
          LUX DEVELOPER
        </div>
        <nav className="space-y-4 flex-1">
          <div>
            <h5 className="text-[10px] uppercase font-bold text-gray-600 tracking-widest mb-3">
              Getting Started
            </h5>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="text-indigo-400 font-semibold cursor-pointer">
                Installation
              </li>
              <li className="hover:text-white cursor-pointer transition-colors">
                Authentication
              </li>
            </ul>
          </div>
          <div className="pt-4">
            <h5 className="text-[10px] uppercase font-bold text-gray-600 tracking-widest mb-3">
              Transactions
            </h5>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="hover:text-white cursor-pointer transition-colors">
                Initialize Payment
              </li>
              <li className="hover:text-white cursor-pointer transition-colors">
                Verify Hash
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 md:p-16 max-w-4xl relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-600/10 blur-[150px] rounded-full pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-3 mb-4">
            <Terminal className="text-indigo-400" size={28} />
            <h1 className="text-4xl font-black tracking-tight">Installation</h1>
          </div>
          <p className="text-gray-400 text-lg mb-10 leading-relaxed">
            Integrate the Lux PH Gateway into your Node.js or React application
            in minutes. Our SDK handles all Stellar Horizon complexities
            natively.
          </p>

          <h3 className="text-xl font-bold mb-4">NPM Package</h3>
          <p className="text-sm text-gray-500 mb-4">
            Install the official Stellar wrapper tailored for Lux PH.
          </p>

          <div className="relative bg-[#0c0818] border border-white/10 rounded-xl p-4 mb-12 shadow-2xl group">
            <div className="flex items-center justify-between font-mono text-sm text-indigo-300">
              <span>npm install @lux/stellar-sdk</span>
              <button className="text-gray-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                <Copy size={16} />
              </button>
            </div>
          </div>

          <h3 className="text-xl font-bold mb-4">Initializing a Payment</h3>
          <p className="text-sm text-gray-500 mb-4">
            Use the gateway object to create a seamless transaction request.
          </p>

          <div className="w-full bg-[#0c0818] rounded-xl border border-white/10 overflow-hidden shadow-2xl relative">
            {/* Fake Mac Window Dots */}
            <div className="flex items-center px-4 py-3 border-b border-white/5 bg-white/[0.02]">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="mx-auto text-[10px] text-gray-500 font-mono tracking-widest">
                payment.ts
              </div>
            </div>
            {/* Code */}
            <div className="p-6 font-mono text-sm text-gray-300 overflow-x-auto leading-loose">
              <div className="text-indigo-400">
                import <span className="text-white">{`{ LuxGateway }`}</span>{" "}
                from{" "}
                <span className="text-emerald-300">'@lux/stellar-sdk'</span>;
              </div>
              <br />
              <div className="text-gray-500">
                // Configure with your Merchant API Key
              </div>
              <div className="text-indigo-400">
                const <span className="text-white">gateway</span> ={" "}
                <span className="text-indigo-400">new</span> LuxGateway(
                <span className="text-emerald-300">'sk_test_8A9F2...'</span>);
              </div>
              <br />
              <div className="text-indigo-400">
                const <span className="text-white">payment</span> ={" "}
                <span className="text-indigo-400">await</span>{" "}
                gateway.createCharge({`{`}
              </div>
              <div className="pl-4">
                amount: <span className="text-emerald-300">"1250.00"</span>,
              </div>
              <div className="pl-4">
                asset: <span className="text-emerald-300">"PHPC"</span>,
              </div>
              <div className="pl-4">
                memo: <span className="text-emerald-300">"Invoice #4029"</span>
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
