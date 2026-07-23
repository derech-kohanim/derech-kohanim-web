import { lazy, Suspense } from 'react';

import { env } from '@/env';

import { SchematicMap } from './SchematicMap';
import type { MapCanvasProps } from './types';

const GoogleMapCanvas = lazy(() =>
  import('./GoogleMapCanvas').then((module) => ({ default: module.GoogleMapCanvas })),
);

/** One entry point: the Google map when a key exists, the schematic map otherwise. */
export function MapCanvas(props: MapCanvasProps) {
  if (!env.googleMapsKey) return <SchematicMap {...props} />;

  return (
    <Suspense fallback={<SchematicMap {...props} />}>
      <GoogleMapCanvas {...props} />
    </Suspense>
  );
}

export type { MapCanvasProps };
