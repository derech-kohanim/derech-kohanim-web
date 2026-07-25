import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ComputingDialog } from '@/components/trip/ComputingDialog';
import { ToastProvider } from '@/components/ui';
import { Home } from '@/screens/Home';
import { Login } from '@/screens/Login';
import { Navigation } from '@/screens/Navigation';
import { Onboarding } from '@/screens/Onboarding';
import { Register } from '@/screens/Register';
import { RouteReview } from '@/screens/RouteReview';
import { SavedPlaces } from '@/screens/SavedPlaces';
import { Settings } from '@/screens/Settings';
import { AuthProvider, useAuth } from '@/state/AuthProvider';
import { PreferencesProvider } from '@/state/PreferencesProvider';
import { TripProvider } from '@/state/TripProvider';

/** Terms acceptance is the one gate. Everything past it works as a guest. */
function RequireOnboarding({ children }: { children: ReactNode }) {
  const { onboarded } = useAuth();
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

/** Account-only routes: guests are bounced to Login with a return-to back to here. */
function RequireAccount({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  // Wait for the session restore so a signed-in user is never flashed to the login screen.
  if (!ready) return null;
  if (!user) {
    return (
      <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />
    );
  }
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <TripProvider>
          <ToastProvider>
            <ComputingDialog />
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/"
                element={
                  <RequireOnboarding>
                    <Home />
                  </RequireOnboarding>
                }
              />
              <Route
                path="/route"
                element={
                  <RequireOnboarding>
                    <RouteReview />
                  </RequireOnboarding>
                }
              />
              <Route
                path="/navigate"
                element={
                  <RequireOnboarding>
                    <Navigation />
                  </RequireOnboarding>
                }
              />
              <Route path="/settings" element={<Settings />} />
              <Route
                path="/saved"
                element={
                  <RequireAccount>
                    <SavedPlaces />
                  </RequireAccount>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </TripProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
}
