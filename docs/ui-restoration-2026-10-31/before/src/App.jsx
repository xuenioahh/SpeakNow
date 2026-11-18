import { lazy, Suspense, useEffect, useState } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { Toaster as SonnerToaster } from "sonner";
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AppErrorBoundary from './components/AppErrorBoundary';
import RouteScroll from './components/RouteScroll';
import { MotionConfig } from 'framer-motion';
import '@/core-flow.css';
import { loadQuestionCatalogue } from '@/lib/bankAccess';

// Page imports
import AuthPage from './pages/AuthPage';
import MainLanding from './pages/MainLanding';
const ExamSpeaking = lazy(() => import('./pages/ExamSpeaking'));
const ExamPractice = lazy(() => import('./pages/ExamPractice'));
const ExamPreparation = lazy(() => import('./pages/ExamPreparation'));
const QuestionBank = lazy(() => import('./pages/QuestionBank'));
const LearningReview = lazy(() => import('./pages/LearningReview'));
const LearningDashboard = lazy(() => import('./pages/LearningDashboard'));
const Membership = lazy(() => import('./pages/Membership'));
const Home = lazy(() => import('./pages/Home'));
const VoiceSetup = lazy(() => import('./pages/VoiceSetup'));
const DailyImmersiveGuidance = lazy(() => import('./pages/DailyImmersiveGuidance'));
const VoiceChat = lazy(() => import('./pages/VoiceChat'));
const CasualVideo = lazy(() => import('./pages/CasualVideo'));
const VoiceReport = lazy(() => import('./pages/VoiceReport'));
const Presentation = lazy(() => import('./pages/Presentation'));
const PresentationAnalysis = lazy(() => import('./pages/PresentationAnalysis'));
const PresentationFeedback = lazy(() => import('./pages/PresentationFeedback'));
const PresentationPractice = lazy(() => import('./pages/PresentationPractice'));
const PresentationReport = lazy(() => import('./pages/PresentationReport'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

const AuthenticatedApp = () => {
  const location = useLocation();
  const { user, isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const [bankStatus, setBankStatus] = useState('loading'), [bankError, setBankError] = useState(''), [bankRevision, setBankRevision] = useState(0);
  useEffect(() => {
    if (isLoadingAuth) return;
    const controller = new AbortController(); setBankStatus('loading');
    loadQuestionCatalogue(controller.signal).then(() => { if (!controller.signal.aborted) setBankStatus('ready'); }).catch(error => { if (!controller.signal.aborted) { setBankError(error.message); setBankStatus('error'); } });
    return () => controller.abort();
  }, [user?.id, isLoadingAuth, bankRevision]);

  if (isLoadingPublicSettings || isLoadingAuth || bankStatus === 'loading' && location.pathname.startsWith('/exam')) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-white rounded-full animate-spin" />
          </div>
          <p className="text-xs text-muted-foreground">Loading SpeakNow...</p>
        </div>
      </div>
    );
  }

  if (bankStatus === 'error' && location.pathname.startsWith('/exam')) return <main className="learning-page"><h1>Practice is temporarily unavailable</h1><p role="alert">{bankError}</p><button onClick={() => setBankRevision(value => value + 1)}>Retry loading</button></main>;

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
        <Route path="/exam/ielts" element={<ExamSpeaking exam="ielts" />} />
        <Route path="/exam/bank/:taskType" element={<QuestionBank />} />
        <Route path="/exam/prepare" element={<ExamPreparation key={location.search} />} />
        <Route path="/exam/practice" element={<ExamPractice key={["setId", "questionId", "scope", "task", "retry", "question", "focus", "sessionMode"].map(key => new URLSearchParams(location.search).get(key)).join(":")} />} />
        <Route path="/practice/review" element={<LearningReview key={location.search} />} />
        <Route path="/progress" element={<LearningDashboard />} />
        <Route path="/membership" element={<Membership />} />
        <Route path="/practice/history" element={<ProgressRedirect />} />
        <Route path="/history" element={<ProgressRedirect />} />
        <Route path="/analysis" element={<ProgressRedirect tab="insights" />} />
        <Route path="/profile/analysis" element={<ProgressRedirect tab="insights" />} />
        <Route path="/voice/history" element={<ProgressRedirect />} />
        <Route path="/presentation/history" element={<ProgressRedirect exam="presentation" />} />
        <Route path="/voice/setup" element={<VoiceSetup />} />
        <Route path="/voice/prepare" element={<DailyImmersiveGuidance />} />
        <Route path="/voice/chat" element={<VoiceChat />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<AuthPage />} />}>
        <Route path="/voice/casual-video" element={<CasualVideo />} />
        <Route path="/voice/report" element={<VoiceReport />} />
        <Route path="/presentation" element={<Presentation />} />
        <Route path="/presentation/analysis" element={<PresentationAnalysis />} />
        <Route path="/presentation/practice" element={<PresentationPractice />} />
        <Route path="/presentation/feedback" element={<PresentationFeedback />} />
        <Route path="/presentation/report" element={<PresentationReport />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
      </Suspense>
    </div>
  );
};

function ProgressRedirect({ tab = 'history', exam = '' }) {
  const location = useLocation(), params = new URLSearchParams(location.search);
  const record = params.get('session') || params.get('record');
  params.set('tab', tab); if (exam) params.set('exam', exam); if (record) params.set('record', record); params.delete('session');
  return <Navigate replace to={`/progress?${params}`} />;
}

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
            theme="light"
            position="top-center"
            toastOptions={{
              style: {
                background: "rgba(255, 255, 255, 0.98)",
                border: "1px solid #d7deea",
                color: "#182235",
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
