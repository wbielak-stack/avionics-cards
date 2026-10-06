export type NodeKind = 'source' | 'storage' | 'load' | 'grid';

export interface SynopticNode {
  name: string;
  kind: NodeKind;
  /** szyna: dc albo ac (domyslnie: z falownikiem zrodla i magazyn - dc, reszta - ac) */
  bus?: 'dc' | 'ac';
  /** moc ze znakiem: + produkcja (zrodlo) / ladowanie (magazyn) / pobor (odbiornik) / import (siec) */
  entity?: string;
  /**
   * druga encja dla kierunku ujemnego (zawsze dodatnia): eksport dla sieci, rozladowanie dla magazynu;
   * moc = entity - entity_negative (dla integracji z osobnymi encjami importu i eksportu)
   */
  entity_negative?: string;
  multiplier?: number;
  /** odwrocenie znaku mocy */
  invert?: boolean;
  /** magazyn: SoC */
  soc_entity?: string;
  /** napiecie i prad (np. string PV) - mala linia pod wartoscia */
  voltage_entity?: string;
  current_entity?: string;
  /** odbiornik: dostepnosc (stan off / unavailable = odlaczony) */
  available_entity?: string;
  /** siec: obecnosc (stan rowny connected_state, domyslnie on) */
  connected_entity?: string;
  connected_state?: string;
}

export interface SynopticCardConfig {
  type: string;
  title?: string;
  nodes: SynopticNode[];
  /** falownik (opcjonalny): moc AC (+ DC -> AC), temperatura */
  inverter?: {
    name?: string;
    model?: string;
    entity?: string;
    multiplier?: number;
    temp_entity?: string;
    /** stan pracy (np. run_mode) i sprawnosc (np. dzienna z pakietu) */
    status_entity?: string;
    efficiency_entity?: string;
  };
  /** suma PV nad szyna DC: moc teraz i energia dzis */
  pv_power_entity?: string;
  pv_energy_entity?: string;
  /** pod szyna DC: napiecie i prad (np. baterii) */
  dc_voltage_entity?: string;
  dc_current_entity?: string;
  dc_power_entity?: string;
  /** pod szyna AC: napiecia i prady faz L1-L3 */
  ac_voltage_entities?: string[];
  ac_current_entities?: string[];
  ac_power_entities?: string[];
  unit?: string;
  deadband?: number;
  /** napisy kierunku magazynu */
  status_positive?: string;
  status_negative?: string;
  /** ENDUR pod schematem przy braku sieci (encja / atrybut prognozy, w godzinach) */
  endurance_entity?: string;
  endurance_attribute?: string;
}
