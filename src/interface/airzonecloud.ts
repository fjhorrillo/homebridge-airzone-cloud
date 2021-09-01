/**
 * Types
 */
export enum Units {
  CELSIUS = 0,
  FARENHEIT = 1
}

export enum DeviceMode {
  STOP = 0,
  AUTO = 1,
  COOLING = 2,
  HEATING = 3,
  FAN = 4, // vent
  DRY = 5, // deshum
  EMERGENCY_HEAT = 6,
  HEAT_AIR = 7,
  HEAT_RADIANT = 8,
  HEAT_COMB = 9,
  COOL_AIR = 10,
  COOL_RADIANT = 11,
  COOL_COMB = 12
}

export enum SetpointAir {
  STOP = 'setpoint_air_stop',
  AUTO = 'setpoint_air_auto',
  COOL = 'setpoint_air_cool',
  HEAT = 'setpoint_air_heat',
  VENT = 'setpoint_air_vent',
  DRY = 'setpoint_air_dry',
}

/**
 * User
 */
export interface UserData {
  name: string;
  lastName: string;
  commercial: boolean;
  toc?: boolean;
}

export interface UserConfig {
  lang: string;
  ampm: boolean;
  notification: boolean;
  units: Units;
  noHaptic: boolean;
  sundayFirst: boolean;
}

export interface User {
  _id: string;
  email: string;
  data: UserData;
  config: UserConfig;
  created_at: Date;
  confirmation_date: Date;
}

export interface LogedUser extends User {
  token: string;
  refreshToken: string;
}

/**
 * Installation
 */
export interface Schedules {
  activated: boolean;
  calendar_ws_ids: string[];
  week_ws_ids: string[];
  acs_ws_ids: string[];
}

export interface Plugins {
  schedules: Schedules;
}

export interface I18n {
  de: string;
  en: string;
  es: string;
  fr: string;
  it: string;
  pt: string;
}

export interface LocationText {
  city: I18n;
  country: I18n;
}

export interface Coords {
  lat: number;
  lng: number;
}

export interface Location {
  _id: string;
  google_place_id: string;
  coords: Coords;
  country_code: string;
  text: LocationText;
  timezoneId: string;
}

export interface DeviceMeta {
  system_number: number;
  units?: number;
  zone_number?: number;
}

export interface Device {
  device_id: string;
  meta: DeviceMeta;
  type: string;
  ws_id: string;
  name: string;
}

export interface Group {
  name: string;
  devices: Device[];
  group_id: string;
}

export interface Installation {
  _id: string;
  plugins?: Plugins;
  installation_id: string;
  location_id: string;
  location_text?: LocationText;
  name: string;
  ws_ids?: string[];
  groups?: Group[];
  migrated_at?: Date;
  scenes?: string[];
  added_at?: Date;
  access_type: string;
  user_id?: string;
}

/**
 * DeviceConfig
 */
export interface Temperature {
  celsius: number;
  fah: number;
}

export interface DeviceConfig {
  system_number: number;
  zone_number: number;
  basic_mode: boolean;
  device_cooling_stages_values: string[];
  device_cooling_stages_conf: string;
  device_heat_stages_values: string[];
  device_heat_stages_conf: string;
  master_conf: boolean;
  replicated_zones: string[];
  thermostat_fw: string;
  name: string;
  local_temp: Temperature;
  warnings: string[];
  system_type?: string;
  antifreeze: boolean;
  grille_cooling_angle: number;
  grille_cooling_angle_values: number[];
  user_device_cooling_stages_conf?: unknown;
  user_device_cooling_stages_values: unknown[];
  grille_heating_angle: number;
  grille_heating_angle_values: number[];
  user_device_heat_stages_conf?: unknown;
  user_device_heat_stages_values: unknown[];
  sleep: number;
  sleep_values: number[];
}

/**
 * Webserver
 */
export interface WebserverStatus {
  isConnected: boolean;
  connection_date: Date;
  pending_ws_schedules_update: boolean;
  disconnection_date: Date;
}

export interface WebserverConfig {
  mac: string;
  pin: number;
  units: number;
  ws_fw: string;
  ws_sched_available: boolean;
  server_sched_active?: boolean;
  country_code: string;
}

export interface WebserverDevice {
  config: DeviceMeta;
  device_type: string;
  device_id: string;
  isConnected: boolean;
  name: string;
}

export interface Webserver {
  _id: string;
  ws_type: string;
  status: WebserverStatus;
  config: WebserverConfig;
  devices?: WebserverDevice[];
}
