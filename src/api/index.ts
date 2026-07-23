import { env } from '@/env';

import { httpClient } from './httpClient';
import { mockClient } from './mock/mockClient';
import type { ApiClient } from './types';

export const api: ApiClient = env.mock ? mockClient : httpClient;

export { ApiClientError } from './types';
export type { ApiClient } from './types';
export { tokenStore } from './tokenStore';
