/**
 * Installation: represent one of your installation (like your home, an office, ...). Contains a list of its devices.
 */

import { AirzoneCloudHomebridgePlatform } from '../platform';

import { Logger } from 'homebridge';

import { AirzoneCloudDaikin, Device } from '.';

/* Manage a AirzoneCloud system */
export class Installation {
  private log: Logger;
  private _data;
  private _devices: Device[] = [];

  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly api: AirzoneCloudDaikin,
    data,
  ) {
    this.log = platform.log;
    this._data = data;

    // log
    this.log.debug(`Init ${this.str_complete()}`);
    this.log.debug(`Installation data ${JSON.stringify(data)}`);
  }

  /* This is for syncronice initialization */
  public static async createInstallation(
    platform: AirzoneCloudHomebridgePlatform,
    api: AirzoneCloudDaikin,
    data,
  ): Promise<Installation> {
    // constructor
    const system = new Installation(platform, api, data);

    // load all devices
    await system._load_devices();

    return system;
  }

  public toString(): string {
    return `Installation(name=${this.name}, type=${this.type})`;
  }

  public str_complete(): string {
    return `Installation(name=${this.name}, type=${this.type}, scenary=${this.scenary}, id=${this.id})`;
  }

  /*
   * getters
   */

  /* Return installation id */
  get id(): string {
    return this._data.id;
  }

  /* Return installation name */
  get name(): string {
    return this._data.name;
  }

  /* Return installation type */
  get type(): string {
    return this._data.type;
  }

  /* Return installation scenary */
  get scenary(): string {
    return this._data.scenary;
  }

  /* Return installation location */
  get location(): string {
    return this._data.complete_name;
  }

  /* Return installation gps location : { latitude: ..., longitude: ... } */
  get gps_location(): string {
    return this._data.location;
  }

  /* Return the timezone */
  get time_zone(): string {
    return this._data.time_zone;
  }

  /*
   * children
   */

  get devices(): Device[] {
    return this._devices;
  }

  /*
   * Refresh
   */

  /* Refresh current installation data (call refresh_installations on parent AirzoneCloudDaikin) */
  public async refresh(refresh_devices=true) {
    await this.api.refresh_installations();
    if (refresh_devices) {
      await this.refresh_devices();
    }
  }

  /* Refresh all devices of this installation */
  public async refresh_devices() {
    await this._load_devices();
  }

  /*
   * private
   */

  /* Load all devices for this installation */
  private async _load_devices(): Promise<Device[]> {
    const current_devices = this._devices;
    this._devices = [];
    try {
      for (const device_data of await this.api._get_devices(this.id)) {
        let device: Device | undefined;
        // search device in current_devices (if where are refreshing devices)
        for (const current_device of current_devices) {
          if (current_device.id === device_data.id) {
            device = current_device;
            device._set_data_refreshed(device_data);
            break;
          }
        }
        // zone not found => instance new zone
        if (!device) {
          device = await Device.createDevice(this.platform, this.api, this, device_data);
        }
        this._devices.push(device);
      }
    } catch(e) {
      this.log.error(`Unable to load devices of installation ${this.name} (${this.id}) from AirzoneCloudDaikin`, e);
    }

    return this._devices;
  }

  /* Set data refreshed (call by parent AirzoneCloudDaikin on refresh_installations()) */
  public _set_data_refreshed(data) {
    this._data = data;
    this.log.debug(`Data refreshed for ${this.str_complete()}`);
  }
}