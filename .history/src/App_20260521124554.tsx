import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";

import MerchantLayout from "./components/dashboard/MerchantLayout";
import AdminLayout from "./components/admin/AdminLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";

import DashboardOverview from "./pages/merchant/DashboardOverview";
import Invoices from "./pages/merchant/Invoices";
import CreateInvoice from "./pages/merchant/CreateInvoice";
import CashOut from "./pages/merchant/CashOut";
import Analytics from "./pages/merchant/Analytics";
import Settings from "./pages/merchant/Settings";
import Subscription from "./pages/merchant/Subscription";
import SendPayment from "./pages/merchant/SendPayment";

import Overview from "./pages/admin/Overview";
import Merchants from "./pages/admin/Merchants";
import Transactions from "./pages/admin/Transactions";
import PlatformConfig from "./pages/admin/PlatformConfig";

// Import the new Wallet Provider
import { NetworkProvider } from "./contexts/NetworkContext";
import { WalletProvider } from "./contexts/WalletContext";

export default function App() {
  return (
    <NetworkProvider>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />

            <Route
              path="/merchant"
              element={
                <ProtectedRoute>
                  <MerchantLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardOverview />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="create" element={<CreateInvoice />} />
              <Route path="cashout" element={<CashOut />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="settings" element={<Settings />} />
              <Route path="subscription" element={<Subscription />} />
              <Route path="send-payment" element={<SendPayment />} />
            </Route>

            <Route
              path="/admin"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="merchants" element={<Merchants />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="config" element={<PlatformConfig />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </NetworkProvider>
  );
}