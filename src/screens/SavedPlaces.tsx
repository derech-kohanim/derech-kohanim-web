import { useEffect, useState, type ReactNode } from 'react';
import type { SavedPlace } from '@dk/shared';
import { Briefcase, Home as HomeIcon, Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { DestinationSearch } from '@/components/search/DestinationSearch';
import { Button, Card, CardTitle, IconButton, ListItem, useToast } from '@/components/ui';
import { formatCoordinates } from '@/lib/coordinates';
import { useAuth } from '@/state/AuthProvider';
import { useTrip } from '@/state/TripProvider';
import { useRequireAccount } from '@/state/useRequireAccount';

import styles from './screens.module.css';

const ICONS = { home: HomeIcon, work: Briefcase } as const;

export function SavedPlaces() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { origin, compute } = useTrip();
  const requireAccount = useRequireAccount();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const others = places.filter((place) => place.category !== 'home' && place.category !== 'work');

  useEffect(() => {
    if (!user) return;
    void api
      .savedPlaces()
      .then(setPlaces)
      .catch(() => undefined);
  }, [user]);

  async function remove(place: SavedPlace) {
    await api.removeSavedPlace(place.id);
    setPlaces((current) => current.filter((item) => item.id !== place.id));
    toast.show(t('saved.removeConfirm', { label: place.label }), 'info');
  }

  return (
    <div className="dk-screen">
      <ScreenHeader title={t('saved.title')} backTo="/settings" />
      <div className="dk-screen__body">
        {!user ? (
          <EmptyCard
            title={t('saved.guestTitle')}
            body={t('saved.guestBody')}
            actions={
              <>
                <Button onClick={() => navigate('/login', { state: { returnTo: '/saved' } })}>
                  {t('auth.login')}
                </Button>
                <Button variant="outline" onClick={() => navigate('/settings')}>
                  {t('saved.continueAsGuest')}
                </Button>
              </>
            }
          />
        ) : (
        <>
        <Card>
          <CardTitle>{t('settings.savedPlaces')}</CardTitle>
          {(['home', 'work'] as const).map((slot) => {
            const place = places.find((item) => item.category === slot);
            const Icon = ICONS[slot];
            return (
              <ListItem
                key={slot}
                leading={<Icon size={20} aria-hidden />}
                title={t(`category.${slot}`)}
                subtitle={
                  place ? place.address ?? formatCoordinates(place.location) : t('saved.slotEmpty')
                }
                onClick={
                  place
                    ? () => {
                        void compute({
                          id: place.id,
                          title: place.label,
                          subtitle: place.address,
                          location: place.location,
                        });
                        navigate('/route');
                      }
                    : undefined
                }
                asStatic={!place}
              />
            );
          })}
          <p className={styles.choiceHint}>{t('saved.homeWorkHint')}</p>
        </Card>

        <Card>
          <CardTitle>{t('saved.addTitle')}</CardTitle>
          <DestinationSearch
            size="medium"
            near={origin}
            onSelect={(destination) =>
              requireAccount(async () => {
                const created = await api.addSavedPlace({
                  label: destination.title,
                  category: 'other',
                  location: destination.location,
                  address: destination.subtitle,
                });
                setPlaces((current) => [...current, created]);
              })
            }
          />
        </Card>

        {others.length === 0 ? (
          <EmptyCard title={t('saved.empty')} body={t('saved.emptyHint')} />
        ) : (
          <Card>
            {others.map((place) => {
              const Icon = ICONS[place.category as keyof typeof ICONS] ?? Star;
              return (
                <div key={place.id} className={styles.savedRow}>
                  <ListItem
                    className={styles.savedRowMain}
                    leading={<Icon size={20} aria-hidden />}
                    title={place.label}
                    subtitle={place.address ?? undefined}
                    onClick={() => {
                      void compute({
                        id: place.id,
                        title: place.label,
                        subtitle: place.address,
                        location: place.location,
                      });
                      navigate('/route');
                    }}
                  />
                  <IconButton
                    label={t('common.delete')}
                    icon={<Trash2 size={20} />}
                    onClick={() => void remove(place)}
                  />
                </div>
              );
            })}
          </Card>
        )}
        </>
        )}
      </div>
    </div>
  );
}

/** The illustrated card shown when there is nothing to list. */
function EmptyCard({ title, body, actions }: { title: string; body: string; actions?: ReactNode }) {
  return (
    <div className={styles.emptyCard}>
      <svg className={styles.emptyArt} viewBox="0 0 160 120" aria-hidden>
        <rect x="8" y="20" width="144" height="92" rx="16" className={styles.emptyArtMap} />
        <path d="M8 74 C44 62 70 92 104 76 S140 58 152 66" className={styles.emptyArtRoad} />
        <path d="M40 20 L52 112" className={styles.emptyArtStreet} />
        <path d="M80 6 C66 6 56 17 56 30 C56 48 80 70 80 70 C80 70 104 48 104 30 C104 17 94 6 80 6 Z"
          className={styles.emptyArtPin} />
        <path d="M80 18 L83.5 25.5 L91.5 26.3 L85.5 31.6 L87.3 39.5 L80 35.4 L72.7 39.5 L74.5 31.6 L68.5 26.3 L76.5 25.5 Z"
          className={styles.emptyArtStar} />
      </svg>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyBody}>{body}</p>
      {actions && <div className={styles.emptyActions}>{actions}</div>}
    </div>
  );
}
