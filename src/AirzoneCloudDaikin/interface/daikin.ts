/**
 * Types for Daikin
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

export interface Location {
  latitude: number;
  longitude: number;
}

export interface Installation {
  id: string;
  name: string;
  icon: number;
  spot_name: string;
  installer_name?: string;
  installer_phone?: string;
  installer_email?: string;
  scenary: string;
  type: string;
  postal_code: string;
  time_zone: string;
  owner_id: string;
  role: string;
  complete_name: string;
  location: Location;
  device_ids: string[];
}

export interface InstallationRelation {
  id: string;
  type: string;
  permitted_devices: string[];
  installation: Installation;
  installation_id: string;
  user: User;
}

export interface InstallationRelations {
  installation_relations: InstallationRelation[];
}

export interface Device {
  id: string;
  mac: string;
  pin: string;
  name: string;
  status: string;
  mode: string;
  state?: string;
  power: string;
  units: string;
  availables_speeds: string;
  local_temp: string;
  ver_state_slats: string;
  ver_position_slats: string;
  hor_state_slats: string;
  hor_position_slats: string;
  max_limit_cold: string;
  min_limit_cold: string;
  max_limit_heat: string;
  min_limit_heat: string;
  update_date?: Date;
  progs_enabled?: boolean;
  scenary: string;
  sleep_time: number;
  min_temp_unoccupied: string;
  max_temp_unoccupied: string;
  connection_date: Date;
  last_event_id: string;
  firmware: string;
  brand: string;
  cold_consign: string;
  heat_consign: string;
  cold_speed: string;
  heat_speed: string;
  machine_errors?: string;
  ver_cold_slats: string;
  ver_heat_slats: string;
  hor_cold_slats: string;
  hor_heat_slats: string;
  modes: string;
  installation_id: string;
  time_zone: string;
  installation: Installation;
  spot_name: string;
  complete_name: string;
  location: Location;
}

export interface Devices {
  devices: Device[];
}
