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
import Expenses from "./pages/Expenses";
import Invoices from "./pages/Invoices";
import Drivers from "./pages/Drivers";
import ThirdParties from "./pages/ThirdParties";
import Clients from "./pages/Clients";
import Caisse from "./pages/Caisse";
import AuditLogs from "./pages/AuditLogs";
import Articles from "./pages/Articles";
import Chargements from "./pages/Chargements";
import Fournisseurs from "./pages/Fournisseurs";
import UsersPage from "./pages/Users";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
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
            <Route path="/trajets" element={<Navigate to="/clients" replace />} />
            <Route path="/depenses" element={<ProtectedRoute><Layout><Expenses /></Layout></ProtectedRoute>} />
            <Route path="/factures" element={<ProtectedRoute><Layout><Invoices /></Layout></ProtectedRoute>} />
              <Route path="/chauffeurs" element={<ProtectedRoute><Layout><Drivers /></Layout></ProtectedRoute>} />
              <Route path="/clients" element={<ProtectedRoute><Layout><Clients /></Layout></ProtectedRoute>} />
              <Route path="/tiers" element={<ProtectedRoute><Layout><ThirdParties /></Layout></ProtectedRoute>} />
              <Route path="/articles" element={<ProtectedRoute><Layout><Articles /></Layout></ProtectedRoute>} />
              <Route path="/chargements" element={<ProtectedRoute><Layout><Chargements /></Layout></ProtectedRoute>} />
              <Route path="/fournisseurs" element={<ProtectedRoute><Layout><Fournisseurs /></Layout></ProtectedRoute>} />
              <Route path="/envoi-colis" element={<Navigate to="/clients" replace />} />
              <Route path="/banque" element={<ProtectedRoute><Navigate to="/caisse" replace /></ProtectedRoute>} />
              <Route path="/caisse" element={<ProtectedRoute><Layout><Caisse /></Layout></ProtectedRoute>} />
              <Route path="/credits" element={<Navigate to="/factures" replace />} />
              <Route path="/historique" element={<ProtectedRoute><Layout><AuditLogs /></Layout></ProtectedRoute>} />
              <Route path="/utilisateurs" element={<AdminRoute><Layout><UsersPage /></Layout></AdminRoute>} />
              <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
