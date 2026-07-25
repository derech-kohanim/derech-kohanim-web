import { useEffect, useState } from 'react';
import type { SavedPlace } from '@dk/shared';
import { Briefcase, Home as HomeIcon, MapPinOff, Star, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { api } from '@/api';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { DestinationSearch } from '@/components/search/DestinationSearch';
import { Card, CardTitle, IconButton, ListItem, useToast } from '@/components/ui';
import { formatCoordinates } from '@/lib/coordinates';
import { useTrip } from '@/state/TripProvider';
import { useRequireAccount } from '@/state/useRequireAccount';

import styles from './screens.module.css';

const ICONS = { home: HomeIcon, work: Briefcase } as const;

export function SavedPlaces() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { origin, compute } = useTrip();
  const requireAccount = useRequireAccount();
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const others = places.filter((place) => place.category !== 'home' && place.category !== 'work');

  useEffect(() => {
    void api
      .savedPlaces()
      .then(setPlaces)
      .catch(() => undefined);
  }, []);

  async function remove(place: SavedPlace) {
    await api.removeSavedPlace(place.id);
    setPlaces((current) => current.filter((item) => item.id !== place.id));
    toast.show(t('saved.removeConfirm', { label: place.label }), 'info');
  }

  return (
    <div className="dk-screen">
      <ScreenHeader title={t('saved.title')} backTo="/settings" />
      <div className="dk-screen__body">
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
          <div className={styles.emptyState}>
            <MapPinOff size={32} aria-hidden />
            <span>{t('saved.empty')}</span>
            <span className={styles.choiceHint}>{t('saved.emptyHint')}</span>
          </div>
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
      </div>
    </div>
  );
}
