import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { useToast } from '@/components/ui';

import { useAuth } from './AuthProvider';

/** Router state carried into the Login screen so it can return here after a successful sign-in. */
export interface LoginRedirectState {
  returnTo: string;
}

/**
 * Gate for account-only actions. Guests are sent to the Login screen with a return-to pointing
 * back at the current location, so the flow resumes where it left off once they sign in.
 *
 * Returns a `requireAccount(onAllowed)` guard: when signed in it runs the action immediately;
 * otherwise it shows a short message and redirects to /login, and does NOT run the action.
 */
export function useRequireAccount(): (onAllowed: () => void) => void {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { t } = useTranslation();

  return useCallback(
    (onAllowed: () => void) => {
      if (user) {
        onAllowed();
        return;
      }
      toast.show(t('auth.accountRequired'), 'info');
      const state: LoginRedirectState = { returnTo: location.pathname + location.search };
      navigate('/login', { state });
    },
    [user, navigate, location.pathname, location.search, toast, t],
  );
}
