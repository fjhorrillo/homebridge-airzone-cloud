/**
 * Types
 */
export interface UserData {
  id: string;
  name: string;
  surname: string;
  language: string;
  email: string;
  role: string;
  advanced_adjust: boolean;
  unit_format: string;
  authentication_token?: string;
}

export interface User {
  user: UserData;
}

export interface Zone {
  id: string;
  system_id: string;
  device_id: string;
  modes: string;
  warning: string;
  name: string;
  system_number: string;
  zone_number: string;
  state: string;
  consign: string;
  temp: string;
  mode: string;
  velocity: string;
  show_velocity: boolean;
  sleep: string;
  lower_conf_limit: string;
  upper_conf_limit: string;
  master: string;
  velMax: string;
  eco: string;
  prog_enabled: string;
  speed_prog_mode: string;
  show_ventilation: string;
  updated_at: number;
  setup_type: string;
  class: string;
  last_update: number;
  next_schedule_number: number;
  humidity: string;
  coldConsign: string;
  heatConsign: string;
}

export interface Zones {
  zones: Zone[];
}

export interface System {
  id: string;
  device_id: string;
  name: string;
  eco: string;
  eco_color: string;
  velocity: string;
  air_flow: string;
  VMC_mode: string;
  VMC_state: string;
  has_velocity: boolean;
  has_air_flow: boolean;
  mode: string;
  modes: string;
  master_setup: boolean;
  setup_type: string;
  max_limit: string;
  min_limit: string;
  zones_ids: string[];
  class: string;
  updated_at: number;
  system_number: string;
  last_update: number;
  firm_ws: string;
  system_fw: number;
  heat_stages: string;
  cold_stages: string;
  auto_index_prog: boolean;
  system_errors: string;
  auto_mode_battery_temperature: boolean;
  machine_error_code: string;
}

export interface Systems {
  systems: System[];
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface TimeZone {
    localtime: string;
    utcOffset: string;
    zone: string;
}

export interface DataTime {
    time_zone: TimeZone[];
}

export interface Data {
    data: DataTime;
}

export interface Device {
  id: string;
  mac: string;
  pin: string;
  name: string;
  icon: number;
  consign: string;
  sync_datetime: boolean;
  remote_control: boolean;
  firm_ws: string;
  status: string;
  connection_date: Date;
  has_eco: boolean;
  has_velocity: boolean;
  spot_name: string;
  complete_name: string;
  country_code: string;
  location: Location;
  data: Data;
  modes: string;
  has_air_flow: boolean;
  has_scene: boolean;
  has_farenheit: boolean;
}

export interface DeviceRelation {
  id: string;
  type: string;
  permitted_devices: string[];
  device: Device;
  device_id: string;
  user: User;
}

export interface DeviceRelations {
  device_relations: DeviceRelation[];
}
