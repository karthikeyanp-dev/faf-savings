import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider } from '@/providers/AuthProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/Login';
import { DashboardPage } from '@/pages/Dashboard';
import { MembersPage } from '@/pages/Members';
import { MemberDetailPage } from '@/pages/MemberDetail';
import { ActivityPage } from '@/pages/Activity';
import { SettingsPage } from '@/pages/Settings';
import { PageTransition } from '@/components/animations/PageTransition';
import { Toaster } from 'sonner';

// Animated routes wrapper
function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
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
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <BrowserRouter>
          <AnimatedRoutes />
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
