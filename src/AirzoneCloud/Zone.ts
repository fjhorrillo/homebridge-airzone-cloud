/**
 * Zone: represent a zone to control.
 */

import { AirzoneCloudHomebridgePlatform } from '../platform';

import { MODES_CONVERTER } from './contants';
import { AirzoneCloud, System } from '.';

/* Manage a Airzonecloud zone */
export class Zone {
  private _system: System;
  private _data;

  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly api: AirzoneCloud,
    system: System,
    data,
  ) {
    this._system = system;
    this._data = data;

    // log
    this.platform.log.trace(`Init: ${this.str_complete()}`);
    this.platform.log.trace(`Zone data: ${JSON.stringify(data)}`);
  }

  /* This is for syncronice initialization */
  public static async createZone(
    platform: AirzoneCloudHomebridgePlatform,
    api: AirzoneCloud,
    system: System,
    data,
  ): Promise<Zone> {
    // constructor
    const zone = new Zone(platform, api, system, data);

    return zone;
  }

  public toString(): string {
    return `Zone(name=${this.name}, is_on=${this.is_on}, mode=${this.mode}, ` +
      `current_temp=${this.current_temperature} target_temp=${this.target_temperature})`;
  }

  public str_complete(): string {
    return `Zone(name=${this.name}, is_on=${this.is_on}, mode=${this.mode}, ` +
      `current_temperature=${this.current_temperature} target_temperature=${this.target_temperature}, ` +
      `id=${this.id}, system_number=${this.system_number}, zone_number=${this.zone_number})`;
  }

  /*
   * getters
   */

  get name(): string {
    return this._data.name;
  }

  get current_temperature(): number | undefined {
    if (this._data.temp) {
      return parseFloat(this._data.temp);
    }
    return;
  }

  get current_humidity(): number | undefined {
    if (this._data.humidity) {
      return parseFloat(this._data.humidity);
    }
    return;
  }

  get target_temperature(): number | undefined {
    if (this._data.consign) {
      return parseFloat(this._data.consign);
    }
    return;
  }

  get max_temp(): number | undefined {
    if (this._data.upper_conf_limit) {
      return parseFloat(this._data.upper_conf_limit);
    }
    return;
  }

  get min_temp(): number | undefined {
    if (this._data.lower_conf_limit) {
      return parseFloat(this._data.lower_conf_limit);
    }
    return;
  }

  get is_on(): boolean {
    return Boolean(~~this._data.state);
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

  get zone_number(): string {
    return this._data.zone_number;
  }

  /*
   * setters
   */

  /* Turn zone on */
  public async turn_on() {
    this.platform.log.trace(`call turn_on() on ${this.str_complete()}`);
    await this._send_event('state', 1);
    this._data['state'] = '1';
  }

  /* Turn zone off */
  public async turn_off() {
    this.platform.log.trace(`call turn_off() on ${this.str_complete()}`);
    await this._send_event('state', 0);
    this._data['state'] = '0';
  }

  /* Set target_temperature for this zone */
  public async set_temperature(temperature) {
    temperature = parseFloat(temperature);
    // Limit with min and max
    if (temperature < this.min_temp!) {
      temperature = this.min_temp;
    }
    if (temperature > this.max_temp!) {
      temperature = this.max_temp;
    }
    this.platform.log.trace(`call set_temperature(${temperature}) on ${this.str_complete()} (min: ${this.min_temp}/max: ${this.max_temp})`);
    await this._send_event('consign', temperature.toFixed(1));
    this._data['consign'] = temperature.toFixed(1);
  }

  /* Set mode of the system */
  public set_mode(mode_name: string) {
    this._data['mode'] = mode_name;
  }

  /*
   * parent system
   */

  /* Get parent system */
  get system(): System {
    return this._system;
  }

  /*
   * Refresh zone data
   */

  /* Refresh current zone data (call refresh on parent system) */
  public async refresh() {
    await this.system.refresh();

    // search zone in system zones (if where are refreshing zones)
    for (const current_zone of this.system.zones) {
      if (current_zone.id === this.id) {
        this._set_data_refreshed(current_zone._data);
        break;
      }
    }
  }

  /*
   * private
   */

  /* Send an event for current zone */
  private async _send_event(option, value: number) {
    const payload = {
      'event': {
        'cgi': 'modzona',
        'device_id': this.device_id,
        'system_number': this.system_number,
        'zone_number': this.zone_number,
        'option': option,
        'value': value,
      },
    };
    return await this.api._send_event(payload);
  }

  /* Set data refreshed (call by parent system on refresh_zones()) */
  public _set_data_refreshed(data) {
    this._data = data;
    this.platform.log.trace(`Data refreshed for: ${this.str_complete()}`);
  }
}