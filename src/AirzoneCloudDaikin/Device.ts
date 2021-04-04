/**
 * Device: represent your climate equipement to control
 */

import { AirzoneCloudHomebridgePlatform } from '../platform';

import { MODES_CONVERTER } from './contants';
import { AirzoneCloudDaikin, Installation } from '.';

/* Manage a AirzoneCloud device */
export class Device {
  private _installation:Installation;
  private _data;

  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly api: AirzoneCloudDaikin,
    installation: Installation,
    data,
  ) {
    this._installation = installation;
    this._data = data;

    // log
    this.platform.log.trace(`Init: ${this.str_complete()}`);
    this.platform.log.trace(`Device data: ${JSON.stringify(data)}`);
  }

  /* This is for syncronice initialization */
  public static async createDevice(
    platform: AirzoneCloudHomebridgePlatform,
    api: AirzoneCloudDaikin,
    installation: Installation,
    data,
  ): Promise<Device> {
    // constructor
    const device = new Device(platform, api, installation, data);

    return device;
  }

  public toString(): string {
    return `Device(name=${this.name}, is_on=${this.is_on}, mode=${this.mode}, ´ +
      ´current_temp=${this.current_temperature}, target_temp=${this.target_temperature})`;
  }

  public str_complete(): string {
    return `Device(name=${this.name}, is_on=${this.is_on}, mode=${this.mode}, ´ +
      ´current_temp=${this.current_temperature}, target_temp=${this.target_temperature}, id=${this.id}, mac=${this.mac})`;
  }

  /*
   * getters
   */


  /* Return device id */
  get id(): string {
    return this._data.id;
  }

  /* Return device name */
  get name(): string {
    return this._data.name;
  }

  /* Return device status */
  get status(): string {
    return this._data.status;
  }

  /* Return device mac */
  get mac(): string {
    return this._data.mac;
  }

  /* Return device pin code */
  get pin(): string {
    return this._data.pin;
  }

  get is_on(): boolean {
    return Boolean(parseInt(this._data.power || 0));
  }

  /* Return device current mode name */
  get mode(): string {
    return MODES_CONVERTER[this.mode_raw]['name'];
  }

  /* Return device current mode description */
  get mode_description(): string {
    return MODES_CONVERTER[this.mode_raw]['description'];
  }

  /* Return device current raw mode (from API) */
  get mode_raw(): string {
    return this._data.mode;
  }

  /* Return device current heat/cold mode */
  get heat_cold_mode(): string {
    return MODES_CONVERTER[this.mode_raw]['type'];
  }

  /* Return device current temperature */
  get current_temperature(): number {
    return parseFloat(this._data.local_temp);
  }

  /* Return device target temperature */
  get target_temperature(): number {
    return this.heat_cold_mode === 'heat' ? this.target_temperature_heat : this.target_temperature_cold;
  }

  /* Return device target temperature in heat mode */
  get target_temperature_heat(): number {
    return parseFloat(this._data.heat_consign);
  }

  /* Return device target temperature in cold mode */
  get target_temperature_cold(): number {
    return parseFloat(this._data.cold_consign);
  }

  /* Return device minimal temperature */
  get min_temperature(): number | undefined {
    return this.heat_cold_mode === 'heat' ? this.min_temperature_heat : this.min_temperature_cold;
  }

  /* Return device min temperature limit in heat mode */
  get min_temperature_heat(): number | undefined {
    if (this._data.min_limit_heat) {
      return parseFloat(this._data.min_limit_heat);
    }
    return;
  }

  /* Return device min temperature limit in cold mode */
  get min_temperature_cold(): number | undefined {
    if (this._data.min_limit_cold) {
      return parseFloat(this._data.min_limit_cold);
    }
    return;
  }

  /* Return device maximal temperature */
  get max_temperature(): number | undefined {
    return this.heat_cold_mode === 'heat' ? this.max_temperature_heat : this.max_temperature_cold;
  }

  /* Return device max temperature limit in heat mode */
  get max_temperature_heat(): number | undefined {
    if (this._data.max_limit_heat) {
      return parseFloat(this._data.max_limit_heat);
    }
    return;
  }

  /* Return device max temperature limit in cold mode */
  get max_temperature_cold(): number | undefined {
    if (this._data.max_limit_cold) {
      return parseFloat(this._data.max_limit_cold);
    }
    return;
  }

  /* Return webserver firmware */
  get firmware(): string {
    return this._data.firmware;
  }

  /* Return webserver brand */
  get brand(): string {
    return this._data.brand;
  }

  /*
   * setters
   */
  /* Turn device on */
  public async turn_on() {
    this.platform.log.trace(`call turn_on() on ${this.str_complete()}`);
    await this._send_event('P1', 1);
    this._data['power'] = '1';
  }

  /* Turn device off */
  public async turn_off() {
    this.platform.log.trace(`call turn_off() on ${this.str_complete()}`);
    await this._send_event('P1', 0);
    this._data['power'] = '0';
  }

  /* Set mode of the device */
  public async set_mode(mode_name: string) {
    this.platform.log.trace(`call set_mode(${mode_name}) on ${this.str_complete()}`);
    let mode_id_found;
    for (const mode_id in MODES_CONVERTER) {
      const mode = MODES_CONVERTER[mode_id];
      if (mode.name === mode_name) {
        mode_id_found = mode_id;
        break;
      }
    }
    if (!mode_id_found) {
      this.platform.log.error(`mode name "${mode_name}" not found`);
    }

    // send event
    await this._send_event('P2', mode_id_found);

    // update mode
    this._data['mode'] = mode_id_found;
  }

  /* Set target_temperature for current heat/cold mode on this device */
  public async set_temperature(temperature) {
    temperature = parseFloat(temperature);
    // Limit with min and max
    if (this.min_temperature && temperature < this.min_temperature!) {
      temperature = this.min_temperature;
    }
    if (this.max_temperature && temperature > this.max_temperature!) {
      temperature = this.max_temperature;
    }
    this.platform.log.trace(`call set_temperature(${temperature}) on ${this.str_complete()} ` +
      `(min: ${this.min_temperature} & max: ${this.max_temperature})`);
    if (this.heat_cold_mode === 'heat') {
      await this._send_event('P8', temperature.toFixed(1));
      this._data['heat_consign'] = String(temperature.toFixed(1));
    } else {
      await this._send_event('P7', temperature);
      this._data['cold_consign'] = String(temperature.toFixed(1));
    }
  }

  /*
   * parent installation
   */

  /* Get parent installation */
  get installation(): Installation {
    return this._installation;
  }

  /*
   * Refresh
   */

  /*
  Ask an update to the airzone hardware (airzone cloud don't autopull data like current temperature)
  The update should be available in airzone cloud after 3 to 10 secs in average
  */
  public async ask_airzone_update() {
    await this._send_event('', 0);
  }

  /* Refresh current device data (call refresh_devices on parent AirzoneCloudDaikin) */
  public async refresh() {
    // ask airzone to update its data in airzone cloud (there is some delay so current update will be available on next refresh)
    await this.ask_airzone_update();

    // refresh all devices (including current) from parent installation
    await this.installation.refresh_devices();
  }

  /*
   * private
   */

  /* Send an event for current device */
  private async _send_event(option, value: number) {
    const payload = {
      'event': {
        'cgi': 'modmaquina',
        'device_id': this.id,
        'option': option,
        'value': value,
      },
    };
    return await this.api._send_event(payload);
  }

  /* Set data refreshed (call by parent AirzoneCloudDaikin on refresh_devices()) */
  public _set_data_refreshed(data) {
    this._data = data;
    this.platform.log.trace(`Data refreshed for: ${this.str_complete()}`);
  }
}