import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { getDatabase, onValue, ref, Unsubscribe } from 'firebase/database';

export interface CalendarRtdbPayload {
  type: string;
  event: string;
  tenantId: string;
  doctorId: string;
  queueId?: string;
  source?: string;
  date?: string;
  visitType?: string;
  at?: string;
}

interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  databaseURL: string;
}

type UpdateHandler = (payload: CalendarRtdbPayload) => void;

class CalendarRtdbService {
  private app: FirebaseApp | null = null;
  private tenantId: string | null = null;
  private started = false;
  private rtdbUnsub: Unsubscribe | null = null;
  private rtdbReady = false;
  private lastPulseAt = 0;
  private handler: UpdateHandler | null = null;

  start(
    tenantId: string,
    config: Record<string, unknown> | null | undefined,
    onUpdate: UpdateHandler,
  ): void {
    if (!tenantId) return;
    if (this.started && this.tenantId === tenantId && this.handler === onUpdate) {
      return;
    }
    if (this.started && this.tenantId !== tenantId) {
      this.stop();
    }

    this.handler = onUpdate;
    try {
      this.init(tenantId, config);
    } catch (err) {
      console.warn('[CalendarRtdb] init failed', err);
    }
  }

  stop(): void {
    this.stopRtdbListener();
    this.started = false;
    this.tenantId = null;
    this.app = null;
    this.rtdbReady = false;
    this.lastPulseAt = 0;
    this.handler = null;
  }

  shouldHandle(
    payload: CalendarRtdbPayload,
    selectedDoctorId: string | null,
  ): boolean {
    if (!this.tenantId || payload.tenantId !== this.tenantId) return false;
    if (!selectedDoctorId) return true;
    return selectedDoctorId === String(payload.doctorId);
  }

  private init(
    tenantId: string,
    rawConfig: Record<string, unknown> | null | undefined,
  ): void {
    const config = this.resolveFirebaseConfig(rawConfig);
    if (!config?.projectId || !config.databaseURL) {
      console.warn('[CalendarRtdb] missing projectId or databaseURL in config');
      return;
    }

    this.app = this.getOrCreateApp(config);
    this.startRtdbListener(tenantId, config);
    this.tenantId = tenantId;
    this.started = true;
  }

  private emitUpdate(payload: CalendarRtdbPayload): void {
    const at = Number(payload.at || 0);
    if (at && at <= this.lastPulseAt) return;
    this.lastPulseAt = at || Date.now();
    this.handler?.(payload);
  }

  private startRtdbListener(
    tenantId: string,
    config: FirebaseWebConfig,
  ): void {
    if (!this.app) return;

    this.stopRtdbListener();
    this.rtdbReady = false;

    const db = getDatabase(this.app, config.databaseURL);
    const pulseRef = ref(
      db,
      `calendar/${this.sanitizeTenantId(tenantId)}/pulse`,
    );

    this.rtdbUnsub = onValue(
      pulseRef,
      snapshot => {
        const val = snapshot.val();
        if (!val?.at) return;

        const at = Number(val.at);
        if (!this.rtdbReady) {
          this.rtdbReady = true;
          this.lastPulseAt = Math.max(this.lastPulseAt, at);
          return;
        }
        if (at <= this.lastPulseAt) return;

        const payload = this.parsePayload(val as Record<string, string>);
        if (payload?.type === 'CONSULTATION_UPDATED') {
          this.emitUpdate(payload);
        }
      },
      err => {
        console.warn('[CalendarRtdb] listener error', err);
      },
    );
  }

  private stopRtdbListener(): void {
    this.rtdbUnsub?.();
    this.rtdbUnsub = null;
  }

  private sanitizeTenantId(tenantId: string): string {
    return String(tenantId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private getOrCreateApp(config: FirebaseWebConfig): FirebaseApp {
    if (getApps().length) {
      return getApp();
    }
    return initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
      ...(config.measurementId ? { measurementId: config.measurementId } : {}),
      databaseURL: config.databaseURL,
    });
  }

  private resolveFirebaseConfig(
    raw: Record<string, unknown> | null | undefined,
  ): FirebaseWebConfig | null {
    const fromApp = (raw?.calendarFcm ?? raw) as Record<string, unknown> | null;
    if (!fromApp?.projectId || !fromApp?.databaseURL) return null;
    return {
      apiKey: String(fromApp.apiKey || ''),
      authDomain: String(fromApp.authDomain || ''),
      projectId: String(fromApp.projectId),
      storageBucket: String(fromApp.storageBucket || ''),
      messagingSenderId: String(fromApp.messagingSenderId || ''),
      appId: String(fromApp.appId || ''),
      measurementId: fromApp.measurementId
        ? String(fromApp.measurementId)
        : undefined,
      databaseURL: String(fromApp.databaseURL),
    };
  }

  private parsePayload(
    data: Record<string, string> | undefined,
  ): CalendarRtdbPayload | null {
    if (!data?.type) return null;
    return {
      type: data.type,
      event: data.event || '',
      tenantId: data.tenantId || '',
      doctorId: data.doctorId || '',
      queueId: data.queueId,
      source: data.source,
      date: data.date,
      visitType: data.visitType,
      at: data.at != null ? String(data.at) : undefined,
    };
  }
}

export default new CalendarRtdbService();
