import { useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ComputingDialog } from '@/components/trip/ComputingDialog';
import { ToastProvider } from '@/components/ui';
import { DeleteAccount } from '@/screens/DeleteAccount';
import { Home } from '@/screens/Home';
import { Privacy, Terms } from '@/screens/Legal';
import { Login } from '@/screens/Login';
import { Navigation } from '@/screens/Navigation';
import { Onboarding } from '@/screens/Onboarding';
import { Register } from '@/screens/Register';
import { Report } from '@/screens/Report';
import { RouteReview } from '@/screens/RouteReview';
import { SavedPlaces } from '@/screens/SavedPlaces';
import { Settings, SettingsSection } from '@/screens/Settings';
import { AuthProvider, useAuth } from '@/state/AuthProvider';
import { PreferencesProvider } from '@/state/PreferencesProvider';
import { TripProvider } from '@/state/TripProvider';
import { analytics } from '@/lib/analytics';

/** Sends a GA4 page_view (path only) on every route change; inert without a measurement id. */
function AnalyticsRouteTracker() {
  const location = useLocation();
  useEffect(() => {
    analytics.pageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
}

/** Terms acceptance is the one gate. Everything past it works as a guest. */
function RequireOnboarding({ children }: { children: ReactNode }) {
  const { onboarded } = useAuth();
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <PreferencesProvider>
        <TripProvider>
          <ToastProvider>
            <AnalyticsRouteTracker />
            <ComputingDialog />
            <Routes>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              {/* Policy and data-deletion pages are deliberately outside the onboarding gate:
                  they must be readable before the terms are accepted, and reachable by someone
                  who has already signed out or removed the app. */}
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/delete-account" element={<DeleteAccount />} />
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
              <Route path="/report" element={<Report />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/:section" element={<SettingsSection />} />
              <Route
                path="/saved"
                element={<SavedPlaces />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ToastProvider>
        </TripProvider>
      </PreferencesProvider>
    </AuthProvider>
  );
}
