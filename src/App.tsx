import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./contexts/AppContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Layout } from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Trucks from "./pages/Trucks";
import Trips from "./pages/Trips";
import Expenses from "./pages/Expenses";
import Invoices from "./pages/Invoices";
import Drivers from "./pages/Drivers";
import ThirdParties from "./pages/ThirdParties";
import Clients from "./pages/Clients";
import ParcelShipping from "./pages/ParcelShipping";
import Caisse from "./pages/Caisse";
import Credits from "./pages/Credits";
import AuditLogs from "./pages/AuditLogs";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
            <Route path="/camions" element={<ProtectedRoute><Layout><Trucks /></Layout></ProtectedRoute>} />
            <Route path="/trajets" element={<ProtectedRoute><Layout><Trips /></Layout></ProtectedRoute>} />
            <Route path="/depenses" element={<ProtectedRoute><Layout><Expenses /></Layout></ProtectedRoute>} />
            <Route path="/factures" element={<ProtectedRoute><Layout><Invoices /></Layout></ProtectedRoute>} />
              <Route path="/chauffeurs" element={<ProtectedRoute><Layout><Drivers /></Layout></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute><Layout><Clients /></Layout></ProtectedRoute>} />
              <Route path="/tiers" element={<ProtectedRoute><Layout><ThirdParties /></Layout></ProtectedRoute>} />
              <Route path="/envoi-colis" element={<ProtectedRoute><Layout><ParcelShipping /></Layout></ProtectedRoute>} />
              <Route path="/banque" element={<ProtectedRoute><Navigate to="/caisse" replace /></ProtectedRoute>} />
              <Route path="/caisse" element={<ProtectedRoute><Layout><Caisse /></Layout></ProtectedRoute>} />
              <Route path="/credits" element={<ProtectedRoute><Layout><Credits /></Layout></ProtectedRoute>} />
              <Route path="/historique" element={<ProtectedRoute><Layout><AuditLogs /></Layout></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
