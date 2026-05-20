import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";

// The Layout wrappers
import MerchantLayout from "./components/dashboard/MerchantLayout";
import AdminLayout from "./components/admin/AdminLayout";

// Security Shield component wrapper
import ProtectedRoute from "./components/auth/ProtectedRoute";

// The Merchant Pages
import DashboardOverview from "./pages/merchant/DashboardOverview";
import Invoices from "./pages/merchant/Invoices";
import CreateInvoice from "./pages/merchant/CreateInvoice";
import CashOut from "./pages/merchant/CashOut";
import Analytics from "./pages/merchant/Analytics";
import Settings from "./pages/merchant/Settings";
import Subscription from "./pages/merchant/Subscription";
import SendPayment from "./pages/merchant/SendPayment";

// The Admin Pages
import Overview from "./pages/admin/Overview";
import Merchants from "./pages/admin/Merchants";
import Transactions from "./pages/admin/Transactions";
import PlatformConfig from "./pages/admin/PlatformConfig";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes - Anyone can view */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        {/* Protected Merchant Routes */}
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

        {/* Protected Administrative Console Tracks */}
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

        {/* Safety Net Routing Back to Landing Page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}