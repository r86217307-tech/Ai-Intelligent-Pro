/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Analyzer from "./pages/Analyzer";
import TestMode from "./pages/TestMode";
import History from "./pages/History";
import Settings from "./pages/Settings";
import NewsSignal from "./pages/NewsSignal";
import Login from "./pages/Login";
import Sufia from "./pages/Sufia";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-center" toastOptions={{
            style: { background: '#18181b', color: '#f4f4f5', border: '1px solid #27272a' }
          }}/>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="analyzer" element={<Analyzer />} />
              <Route path="test-mode" element={<TestMode />} />
              <Route path="news" element={<NewsSignal />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route path="sufia" element={<Sufia />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
