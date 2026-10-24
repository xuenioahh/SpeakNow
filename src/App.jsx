import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { Toaster as SonnerToaster } from "sonner";
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AppErrorBoundary from './components/AppErrorBoundary';
import RouteScroll from './components/RouteScroll';
import { MotionConfig } from 'framer-motion';

// Page imports
import AuthPage from './pages/AuthPage';
import MainLanding from './pages/MainLanding';
const ExamSpeaking = lazy(() => import('./pages/ExamSpeaking'));
const ExamPractice = lazy(() => import('./pages/ExamPractice'));
const LearningReview = lazy(() => import('./pages/LearningReview'));
const LearningHistory = lazy(() => import('./pages/LearningHistory'));
const Home = lazy(() => import('./pages/Home'));
const VoiceSetup = lazy(() => import('./pages/VoiceSetup'));
const VoiceChat = lazy(() => import('./pages/VoiceChat'));
const CasualVideo = lazy(() => import('./pages/CasualVideo'));
const VoiceReport = lazy(() => import('./pages/VoiceReport'));
const Presentation = lazy(() => import('./pages/Presentation'));
const PresentationAnalysis = lazy(() => import('./pages/PresentationAnalysis'));
const PresentationFeedback = lazy(() => import('./pages/PresentationFeedback'));
const PresentationPractice = lazy(() => import('./pages/PresentationPractice'));
const PresentationReport = lazy(() => import('./pages/PresentationReport'));
const Profile = lazy(() => import('./pages/Profile'));
const VoiceHistory = lazy(() => import('./pages/VoiceHistory'));
const PresentationHistory = lazy(() => import('./pages/PresentationHistory'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
          <p className="text-xs text-muted-foreground">Loading SpeakNow...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
  }

  return (
    <div key={location.pathname} className="route-stage">
      <Suspense fallback={<div className="route-loading" role="status">Opening your studio…</div>}>
    <Routes location={location}>
      <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<MainLanding />} />
        <Route path="/voice" element={<Home />} />
        <Route path="/exam" element={<ExamSpeaking />} />
        <Route path="/exam/practice" element={<ExamPractice key={location.search} />} />
        <Route path="/practice/review" element={<LearningReview key={location.search} />} />
        <Route path="/practice/history" element={<LearningHistory />} />
        <Route path="/voice/setup" element={<VoiceSetup />} />
        <Route path="/voice/chat" element={<VoiceChat key={location.search} />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<AuthPage />} />}>
        <Route path="/voice/casual-video" element={<CasualVideo />} />
        <Route path="/voice/report" element={<VoiceReport />} />
        <Route path="/presentation" element={<Presentation />} />
        <Route path="/presentation/analysis" element={<PresentationAnalysis />} />
        <Route path="/presentation/practice" element={<PresentationPractice />} />
        <Route path="/presentation/feedback" element={<PresentationFeedback />} />
        <Route path="/presentation/report" element={<PresentationReport />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/voice/history" element={<VoiceHistory />} />
        <Route path="/presentation/history" element={<PresentationHistory />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
      </Suspense>
    </div>
  );
};

function App() {
  return (
    <AppErrorBoundary>
      <MotionConfig reducedMotion="user">
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <RouteScroll />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster
            theme="dark"
            position="top-center"
            toastOptions={{
              style: {
                background: "rgba(30, 41, 59, 0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#F1F5F9",
                borderRadius: "16px",
                backdropFilter: "blur(16px)",
              },
            }}
          />
        </QueryClientProvider>
      </AuthProvider>
      </MotionConfig>
    </AppErrorBoundary>
  )
}

export default App
