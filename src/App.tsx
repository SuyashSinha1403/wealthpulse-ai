import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Index from "./pages/Index";
import GoalPlanner from "./pages/GoalPlanner";

import Investments from "./pages/Investments";
import Expenses from "./pages/Expenses";
import { Navigate } from "react-router-dom";
import BankAccounts from "./pages/BankAccounts";
import Liabilities from "./pages/Liabilities";
import CashFlow from "./pages/CashFlow";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
              <Route path="/goal-planner" element={<AppLayout><GoalPlanner /></AppLayout>} />
              <Route path="/investments" element={<AppLayout><Investments /></AppLayout>} />
              <Route path="/cash-flow" element={<AppLayout><CashFlow /></AppLayout>} />
              <Route path="/expenses" element={<Navigate to="/cash-flow" replace />} />
              <Route path="/bank-accounts" element={<AppLayout><BankAccounts /></AppLayout>} />
              <Route path="/liabilities" element={<AppLayout><Liabilities /></AppLayout>} />
              <Route path="/reports" element={<Navigate to="/cash-flow" replace />} />
              <Route path="/settings" element={<AppLayout><SettingsPage /></AppLayout>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
