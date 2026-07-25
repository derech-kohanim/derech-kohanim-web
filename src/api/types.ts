import type {
  AuthResponse,
  CreateReportRequest,
  DangerZoneCollection,
  GoogleAuthRequest,
  LatLng,
  Language,
  LoginRequest,
  NavFeedback,
  NavFeedbackRequest,
  NavigationProgressRequest,
  NavigationProgressResponse,
  NavigationSession,
  PlaceDetailsRequest,
  PlaceSearchRequest,
  PlaceSearchResponse,
  PlaceSuggestion,
  ProviderInfo,
  RecentPlace,
  RegisterRequest,
  RouteEvent,
  RouteEventBundle,
  RoutePlan,
  RouteRequest,
  SavedPlace,
  Stringency,
  TermsDocument,
  User,
  UserPreferences,
  VoicePackManifest,
  VoiceResolveRequest,
  VoiceResolveResponse,
  ZoneCollection,
} from '@dk/shared';

/** What the recent-places history stores. The server keys on `externalId`, not the row id. */
export interface RecordRecentInput {
  title: string;
  subtitle: string | null;
  location: LatLng;
  externalId?: string | null;
}

/** Errors thrown by the client always carry the stable code, never a display string. */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  register(body: RegisterRequest): Promise<AuthResponse>;
  login(body: LoginRequest): Promise<AuthResponse>;
  loginWithGoogle(body: GoogleAuthRequest): Promise<AuthResponse>;
  /** Development shortcut: signs in by email with no password. Clearly labelled in the UI. */
  devLogin(email: string): Promise<AuthResponse>;
  logout(): Promise<void>;
  currentUser(): Promise<User>;
  updateProfile(displayName: string): Promise<User>;
  updatePreferences(preferences: UserPreferences): Promise<User>;
  terms(language: Language): Promise<TermsDocument>;
  acceptTerms(version: string): Promise<User>;

  searchPlaces(body: PlaceSearchRequest, options?: RequestOptions): Promise<PlaceSearchResponse>;
  placeDetails(body: PlaceDetailsRequest): Promise<PlaceSuggestion>;
  savedPlaces(): Promise<SavedPlace[]>;
  addSavedPlace(place: Omit<SavedPlace, 'id' | 'createdAt'>): Promise<SavedPlace>;
  removeSavedPlace(id: string): Promise<void>;
  recentPlaces(): Promise<RecentPlace[]>;
  recordRecentPlace(place: RecordRecentInput): Promise<void>;

  zones(stringency: Stringency): Promise<ZoneCollection>;
  /** Danger zones (Area A). Independent of the stringency layers. */
  dangerZones(): Promise<DangerZoneCollection>;
  providers(): Promise<ProviderInfo[]>;
  computeRoute(body: RouteRequest, options?: RequestOptions): Promise<RoutePlan>;
  routeEvents(routeId: string): Promise<RouteEventBundle>;
  createReport(body: CreateReportRequest): Promise<RouteEvent>;

  startNavigation(routeId: string, simulated: boolean): Promise<NavigationSession>;
  reportProgress(body: NavigationProgressRequest): Promise<NavigationProgressResponse>;
  endNavigation(sessionId: string, arrived: boolean): Promise<void>;
  /** Anonymous for guests; associated with the signed-in user server-side. */
  submitNavFeedback(body: NavFeedbackRequest): Promise<NavFeedback>;

  voiceManifest(language: Language, voiceId: string): Promise<VoicePackManifest>;
  resolveVoiceClips(body: VoiceResolveRequest): Promise<VoiceResolveResponse>;
}
