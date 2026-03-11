import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { InstallPromptDialog } from "./components/InstallPromptDialog";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useOnboarding } from "./contexts/OnboardingContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import TimeTracking from "./pages/TimeTracking";
import ExternalTimeTracking from "./pages/ExternalTimeTracking";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectOverview from "./pages/ProjectOverview";
import MyHours from "./pages/MyHours";
import MyDocuments from "./pages/MyDocuments";
import Reports from "./pages/Reports";
import Admin from "./pages/Admin";
import HoursReport from "./pages/HoursReport";
import Employees from "./pages/Employees";
import Notepad from "./pages/Notepad";
import Disturbances from "./pages/Disturbances";
import DisturbanceDetail from "./pages/DisturbanceDetail";
import BadWeather from "./pages/BadWeather";
import DailyReports from "./pages/DailyReports";
import DailyReportDetail from "./pages/DailyReportDetail";
import LegalWorkTimeReport from "./pages/LegalWorkTimeReport";
import EquipmentPage from "./pages/Equipment";
import EquipmentDetail from "./pages/EquipmentDetail";
import ScheduleBoard from "./pages/ScheduleBoard";
import IncomingInvoices from "./pages/IncomingInvoices";
import DocumentLibrary from "./pages/DocumentLibrary";
import ProjectChatPage from "./pages/ProjectChatPage";
import CompanyChatPage from "./pages/CompanyChatPage";
import OrderManagement from "./pages/OrderManagement";
import IncomingDocuments from "./pages/IncomingDocuments";
import Warehouse from "./pages/Warehouse";
import SafetyEvaluations from "./pages/SafetyEvaluations";
import SafetyEvaluationDetail from "./pages/SafetyEvaluationDetail";
import MySafety from "./pages/MySafety";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { usePushNotifications } from "./hooks/usePushNotifications";

const queryClient = new QueryClient();

function AppContent() {
  const {
    showInstallDialog,
    handleInstallDialogClose,
  } = useOnboarding();

  // Request push notification permission after login
  const { permission: pushPermission, requestPermission: requestPush } = usePushNotifications();

  useEffect(() => {
    if (pushPermission === "default") {
      // Ask for push permission after a short delay (after login)
      const timer = setTimeout(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) requestPush();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [pushPermission]);

  // Ensure user profile exists (for users created via Cloud dashboard)
  useEffect(() => {
    const ensureProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc('ensure_user_profile');
      }
    };
    ensureProfile();
  }, []);

  // Realtime listener for in-app notifications (popup)
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const setupNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel("user-notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const notification = payload.new as {
              title: string;
              message: string;
              type: string;
            };
            toast({
              title: notification.title,
              description: notification.message,
              duration: 8000,
            });
          }
        )
        .subscribe();
    };

    setupNotifications();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/time-tracking" element={<TimeTracking />} />
        <Route path="/external-time-tracking" element={<ExternalTimeTracking />} />
        {/* Ab Facharbeiter */}
        <Route path="/projects" element={<ProtectedRoute minRole="facharbeiter"><Projects /></ProtectedRoute>} />
        <Route path="/projects/:projectId" element={<ProtectedRoute minRole="facharbeiter"><ProjectOverview /></ProtectedRoute>} />
        <Route path="/projects/:projectId/chat" element={<ProtectedRoute minRole="extern"><ProjectChatPage /></ProtectedRoute>} />
        <Route path="/projects/:projectId/:type" element={<ProtectedRoute minRole="facharbeiter"><ProjectDetail /></ProtectedRoute>} />
        <Route path="/projects/:projectId/orders" element={<ProtectedRoute minRole="facharbeiter"><OrderManagement /></ProtectedRoute>} />
        {/* Alle eingeloggten */}
        <Route path="/company-chat" element={<CompanyChatPage />} />
        <Route path="/my-hours" element={<MyHours />} />
        <Route path="/my-documents" element={<MyDocuments />} />
        <Route path="/my-safety" element={<MySafety />} />
        {/* Ab Vorarbeiter */}
        <Route path="/reports" element={<ProtectedRoute minRole="vorarbeiter"><Reports /></ProtectedRoute>} />
        <Route path="/disturbances" element={<ProtectedRoute minRole="vorarbeiter"><Disturbances /></ProtectedRoute>} />
        <Route path="/disturbances/:id" element={<ProtectedRoute minRole="vorarbeiter"><DisturbanceDetail /></ProtectedRoute>} />
        <Route path="/bad-weather" element={<ProtectedRoute minRole="vorarbeiter"><BadWeather /></ProtectedRoute>} />
        <Route path="/daily-reports" element={<ProtectedRoute minRole="vorarbeiter"><DailyReports /></ProtectedRoute>} />
        <Route path="/daily-reports/:id" element={<ProtectedRoute minRole="vorarbeiter"><DailyReportDetail /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute minRole="vorarbeiter"><DocumentLibrary /></ProtectedRoute>} />
        <Route path="/safety-evaluations" element={<ProtectedRoute minRole="vorarbeiter"><SafetyEvaluations /></ProtectedRoute>} />
        <Route path="/safety-evaluations/:id" element={<ProtectedRoute minRole="vorarbeiter"><SafetyEvaluationDetail /></ProtectedRoute>} />
        {/* Nur Admin */}
        <Route path="/admin" element={<ProtectedRoute minRole="admin"><Admin /></ProtectedRoute>} />
        <Route path="/hours-report" element={<ProtectedRoute minRole="admin"><HoursReport /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute minRole="admin"><Employees /></ProtectedRoute>} />
        <Route path="/legal-work-time" element={<ProtectedRoute minRole="admin"><LegalWorkTimeReport /></ProtectedRoute>} />
        <Route path="/equipment" element={<ProtectedRoute minRole="admin"><EquipmentPage /></ProtectedRoute>} />
        <Route path="/equipment/:id" element={<ProtectedRoute minRole="admin"><EquipmentDetail /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute minRole="vorarbeiter"><ScheduleBoard /></ProtectedRoute>} />
        <Route path="/incoming-invoices" element={<ProtectedRoute minRole="admin"><IncomingInvoices /></ProtectedRoute>} />
        <Route path="/incoming-documents" element={<ProtectedRoute minRole="facharbeiter"><IncomingDocuments /></ProtectedRoute>} />
        <Route path="/warehouse" element={<ProtectedRoute minRole="facharbeiter"><Warehouse /></ProtectedRoute>} />
        {/* Sonstige */}
        <Route path="/notepad" element={<Notepad />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Install Prompt Dialog */}
      <InstallPromptDialog
        open={showInstallDialog}
        onClose={handleInstallDialogClose}
      />
    </>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <OnboardingProvider>
            <AppContent />
          </OnboardingProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
