import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import { AuthProvider } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { PageTransition } from '@/components/animations/PageTransition';
import { Toaster } from 'sonner';

// Route-level code splitting. Each page becomes its own chunk that only
// downloads when the user navigates to it. Named exports are rewrapped
// as default so React.lazy accepts them.
const LoginPage = lazy(() =>
  import('@/pages/Login').then((m) => ({ default: m.LoginPage })),
);
const DashboardPage = lazy(() =>
  import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })),
);
const MembersPage = lazy(() =>
  import('@/pages/Members').then((m) => ({ default: m.MembersPage })),
);
const MemberDetailPage = lazy(() =>
  import('@/pages/MemberDetail').then((m) => ({ default: m.MemberDetailPage })),
);
const ActivityPage = lazy(() =>
  import('@/pages/Activity').then((m) => ({ default: m.ActivityPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })),
);

function RouteSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}

// Animated routes wrapper
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<RouteSpinner />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={
            <PageTransition>
              <LoginPage />
            </PageTransition>
          } />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={
              <PageTransition>
                <DashboardPage />
              </PageTransition>
            } />
            <Route path="/members" element={
              <PageTransition>
                <MembersPage />
              </PageTransition>
            } />
            <Route path="/members/:id" element={
              <PageTransition>
                <MemberDetailPage />
              </PageTransition>
            } />
            <Route path="/activity" element={
              <PageTransition>
                <ActivityPage />
              </PageTransition>
            } />
            <Route path="/settings" element={
              <PageTransition>
                <SettingsPage />
              </PageTransition>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          {/* LazyMotion with domAnimation is the small (~30 KB) bundle
              variant. The whole tree must use `m` from framer-motion
              (not `motion`) for this to actually trim the bundle. */}
          <LazyMotion features={domAnimation}>
            <AnimatedRoutes />
          </LazyMotion>
        </BrowserRouter>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: 'hsl(var(--background))',
              color: 'hsl(var(--foreground))',
              border: '1px solid hsl(var(--border))',
            },
          }}
        />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
