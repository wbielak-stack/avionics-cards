// Minimalne typy HA uzywane przez karty (bez zaleznosci od custom-card-helpers).

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_updated: string;
  last_changed: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  language: string;
  locale?: { language: string };
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
  callWS<T>(msg: Record<string, unknown>): Promise<T>;
  callApi?<T>(method: 'GET' | 'POST', path: string, data?: Record<string, unknown>): Promise<T>;
  config?: { latitude?: number; longitude?: number; time_zone?: string };
}

export interface CustomCardEntry {
  type: string;
  name: string;
  description?: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
}
