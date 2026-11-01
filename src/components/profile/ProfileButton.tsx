import { useState } from 'react';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button, ListItem, Sheet } from '@/components/ui';
import { useAuth } from '@/state/AuthProvider';

import styles from './profileButton.module.css';

/** First letters of the display name, else the email, else a neutral glyph. */
function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || '';
  if (!source) return '';
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

/**
 * Top-bar account control. Signed out it opens the login flow; signed in it shows the account
 * photo (falling back to token-coloured initials) and opens a menu with account and sign-out.
 * The avatar reads from the authenticated user, so a Google photo appears automatically once
 * Google auth is configured - nothing here depends on Google being present.
 */
export function ProfileButton() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // A picture URL that no longer loads (revoked or offline) falls back to the initials.
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);

  if (!user) {
    // On phones the label is dropped and the control collapses to the icon, so the destination
    // search - the reason anyone opens this screen - keeps the width. The accessible name is
    // carried by aria-label, so nothing is lost for screen readers.
    return (
      <Button
        variant="secondary"
        size="large"
        className={styles.loginButton}
        aria-label={t('profile.login')}
        iconStart={<LogIn size={20} aria-hidden />}
        onClick={() => navigate('/login')}
      >
        <span className={styles.loginLabel}>{t('profile.login')}</span>
      </Button>
    );
  }

  const label = user.displayName?.trim() || user.email || t('profile.guest');

  async function signOut() {
    setMenuOpen(false);
    await logout();
    navigate('/');
  }

  return (
    <>
      <button
        type="button"
        className={styles.avatarButton}
        aria-label={t('profile.openMenu')}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(true)}
      >
        {user.avatarUrl && failedAvatar !== user.avatarUrl ? (
          // Not a drag source: over the map, dragging the avatar out as a ghost image would
          // both look wrong and steal the pan. `-webkit-user-drag` does not cover Firefox.
          <img
            className={styles.avatarImg}
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setFailedAvatar(user.avatarUrl ?? null)}
          />
        ) : (
          <span className={styles.avatarInitials} aria-hidden>
            {initials(user.displayName, user.email) || <UserRound size={20} />}
          </span>
        )}
      </button>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={label}>
        <ListItem
          leading={<UserRound size={20} aria-hidden />}
          title={t('profile.account')}
          onClick={() => {
            setMenuOpen(false);
            navigate('/settings');
          }}
        />
        <ListItem
          leading={<LogOut size={20} aria-hidden />}
          title={t('profile.signOut')}
          onClick={() => void signOut()}
        />
      </Sheet>
    </>
  );
}
