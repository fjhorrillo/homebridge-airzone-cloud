/**
 * System: represent your climate equipment (Mitsubishi, Daikin, ...). Contains a list of its zones.
 */

import { AirzoneCloudHomebridgePlatform } from '../platform';

import { Logger } from 'homebridge';

import { MODES_CONVERTER, ECO_CONVERTER, VELOCITIES_CONVERTER, AIRFLOW_CONVERTER } from './contants';
import { AirzoneCloud, Device, Zone } from '.';

/* Manage a AirzoneCloud system */
export class System {
  private log: Logger;
  private _device: Device;
  private _data;
  private _zones: Zone[] = [];

  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly api: AirzoneCloud,
    device: Device,
    data,
  ) {
    this.log = platform.log;
    this._device = device;
    this._data = data;

    // log
    this.log.debug(`Init ${this.str_complete()}`);
    this.log.debug(`System data ${JSON.stringify(data)}`);
  }

  /* This is for syncronice initialization */
  public static async createSystem(
    platform: AirzoneCloudHomebridgePlatform,
    api: AirzoneCloud,
    device: Device,
    data,
  ): Promise<System> {
    // constructor
    const system = new System(platform, api, device, data);

    // load zones
    await system._load_zones();

    return system;
  }

  public toString(): string {
    return `System(name=${this.name}, mode=${this.mode}, eco=${this.eco}` +
      `, velocity=${this.has_velocity?this.velocity:'None'}` +
      `, airflow=${this.has_airflow?this.airflow:'None'}`;
  }

  public str_complete(): string {
    return `System(name=${this.name}, mode=${this.mode}, eco=${this.eco}` +
      `, velocity=${this.has_velocity?this.velocity:'None'}` +
      `, airflow=${this.has_airflow?this.airflow:'None'}` +
      `, id=${this.id}, system_number=${this.system_number}, device_id=${this.device_id})`;
  }

  /*
   * getters
   */

  get name(): string {
    return this._data.name;
  }

  get mode(): string {
    return MODES_CONVERTER[this.mode_raw]['name'];
  }

  get mode_description(): string {
    return MODES_CONVERTER[this.mode_raw]['description'];
  }

  get mode_raw(): string {
    return this._data.mode;
  }

  get eco(): string {
    return ECO_CONVERTER[this.eco_raw]['name'];
  }

  get eco_description(): string {
    return ECO_CONVERTER[this.eco_raw]['description'];
  }

  get eco_raw(): string {
    return this._data.eco;
  }

  get has_velocity(): boolean {
    return this._data.has_velocity;
  }

  get velocity(): string {
    return VELOCITIES_CONVERTER[this.velocity_raw]['name'];
  }

  get velocity_description(): string {
    return VELOCITIES_CONVERTER[this.velocity_raw]['description'];
  }

  get velocity_raw(): string {
    return this._data.velocity;
  }

  get has_airflow(): string {
    return this._data.has_air_flow;
  }

  get airflow(): string {
    return AIRFLOW_CONVERTER[this.airflow_raw]['name'];
  }

  get airflow_description(): string {
    return AIRFLOW_CONVERTER[this.airflow_raw]['description'];
  }

  get airflow_raw(): string {
    return this._data.air_flow;
  }

  get max_temp(): number | undefined {
    if (this._data.max_limit) {
      return parseFloat(this._data.max_limit);
    }
    return;
  }

  get min_temp(): number | undefined {
    if (this._data.min_limit) {
      return parseFloat(this._data.min_limit);
    }
    return;
  }

  get id(): string {
    return this._data.id;
  }

  get class(): string {
    return this._data.class;
  }

  get device_id(): string {
    return this._data.device_id;
  }

  get system_number(): string {
    return this._data.system_number;
  }

  get firmware_ws(): string {
    return this._data.firm_ws;
  }

  get firmware_system(): string {
    return this._data.system_fw;
  }

  /*
   * setters
   */

  /* Set mode of the system */
  public async set_mode(mode_name: string) {
    this.log.debug(`call set_mode(${mode_name}) on ${this.str_complete()}`);
    let mode_id_found;
    for (const mode_id in MODES_CONVERTER) {
      const mode = MODES_CONVERTER[mode_id];
      if (mode.name === mode_name) {
        mode_id_found = mode_id;
        break;
      }
    }
    if (!mode_id_found) {
      this.log.error(`mode name "${mode_name}" not found`);
    }

    // send event
    await this._send_event('mode', mode_id_found);

    // update mode
    this._data['mode'] = mode_id_found;

    // refresh modes on sub-zones (don't refresh because API so slow to update sub-zones, about 5sec...)
    for (const zone of this.zones) {
      zone.set_mode(mode_id_found);
    }

    return true;
  }

  /*
   * children
   */

  /* Get all zones in this system */
  get zones(): Zone[] {
    return this._zones;
  }

  /*
   * parent device
   */

  /* Get parent device */
  get device(): Device {
    return this._device;
  }

  /*
   * Refresh
   */

  /*
  Ask an update to the airzone hardware (airzonecloud don't autopull data like current temperature)
  The update should be available in airzonecloud after 3 to 5 secs in average
  */
  public async ask_airzone_update() {
    await this._ask_airzone_update();
  }

  /* Refresh current system data (call refresh_systems on parent device) */
  public async refresh(refresh_zones=true) {
    // ask airzone to update its data in airzonecloud (there is some delay so current update will be available on next refresh)
    await this.ask_airzone_update();

    // refresh systems (including current) from parent device
    await this.device.refresh_systems();

    // refresh subzones in needed
    if (refresh_zones) {
      await this._load_zones();
    }
  }

  /*
   * private
   */

  /* Load all zones for this system */
  private async _load_zones(): Promise<Zone[]> {
    const current_zones = this._zones;
    this._zones = [];
    try {
      for (const zone_data of await this.api._get_zones(this.id)) {
        let zone: Zone | undefined;
        // search zone in current_zones (if where are refreshing zones)
        for (const current_zone of current_zones) {
          if (current_zone.id === zone_data.id) {
            zone = current_zone;
            zone._set_data_refreshed(zone_data);
            break;
          }
        }
        // zone not found => instance new zone
        if (!zone) {
          zone = await Zone.createZone(this.platform, this.api, this, zone_data);
        }
        this._zones.push(zone);
      }
    } catch(e) {
      this.log.error(`Unable to load zones of system ${this.name} (${this.id}) from AirzoneCloud`, e);
    }

    return this._zones;
  }

  /* Send an event for current system */
  private async _send_event(option, value: number) {
    const payload = {
      'event': {
        'cgi': 'modsistema',
        'device_id': this.device_id,
        'system_number': this.system_number,
        'option': option,
        'value': value,
      },
    };
    return await this.api._send_event(payload);
  }

  /* Ask an update to the airzone hardware (airzonecloud don't autopull data) */
  private async _ask_airzone_update() {
    const payload = {
      'event': {
        'cgi': 'infosistema2',
        'device_id': this.device_id,
        'system_number': this.system_number,
        'option': null,
        'value': null,
      },
    };
    return await this.api._send_event(payload);
  }

  /* Set data refreshed (call by parent device on refresh_systems()) */
  public _set_data_refreshed(data) {
    this._data = data;
    this.log.debug(`Data refreshed for ${this.str_complete()}`);
  }
}