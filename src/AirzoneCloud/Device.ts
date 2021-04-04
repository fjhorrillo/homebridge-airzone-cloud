/**
 * Device: represent one of your Airzone webserver registered. Contains a list of its systems.
 */

import { AirzoneCloudHomebridgePlatform } from '../platform';

import { AirzoneCloud, System } from '.';

/* Manage a AirzoneCloud device */
export class Device {
  private _data;
  private _systems: System[] = [];

  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly api: AirzoneCloud,
    data,
  ) {

    // remove weather (huge array with all translates)
    if (data.data?.data) {
      delete data.data!.data!.weather;
    }

    this._data = data;

    // log
    this.platform.log.trace(`Init: ${this.str_complete()}`);
    this.platform.log.trace(`Device data: ${JSON.stringify(data)}`);
  }


  /* This is for syncronice initialization */
  public static async createDevice(
    platform: AirzoneCloudHomebridgePlatform,
    api: AirzoneCloud,
    data,
  ): Promise<Device> {
    // constructor
    const device = new Device(platform, api, data);

    // load all systems
    await device._load_systems();

    return device;
  }

  public toString(): string {
    return `Device(name=${this.name}, status=${this.status})`;
  }

  public str_complete(): string {
    return `Device(name=${this.name}, status=${this.status}, id=${this.id}, mac=${this.mac})`;
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

  /* Return device location */
  get location(): string {
    return this._data.complete_name;
  }

  /* Return device mac */
  get mac(): string {
    return this._data.mac;
  }

  /* Return device pin code */
  get pin(): string {
    return this._data.pin;
  }

  /* Return device target temperature */
  get target_temperature(): string {
    return this._data.consign;
  }

  /* Return webserver device */
  get firmware_ws(): string {
    return this._data.firm_ws;
  }

  get has_eco(): string {
    return this._data.has_eco;
  }

  get has_velocity(): string {
    return this._data.has_velocity;
  }

  get has_airflow(): string {
    return this._data.has_air_flow;
  }

  get has_farenheit(): string {
    return this._data.has_harenheit;
  }

  /* Return True if device datetime is sync with AirzoneCloud */
  get sync_datetime(): string {
    return this._data.sync_datetime;
  }

  /*
   * children
   */

  get systems(): System[] {
    return this._systems;
  }

  /*
   * Refresh
   */

  /* Refresh current device data (call refresh_devices on parent AirzoneCloud) */
  public async refresh(refresh_systems=true) {
    await this.api.refresh_devices();
    if (refresh_systems) {
      await this.refresh_systems();
    }
  }

  /* Refresh all systems of this device */
  public async refresh_systems() {
    await this._load_systems();
  }

  /*
   * private
   */

  /* Load all systems for this device */
  public async _load_systems(): Promise<System[]> {
    const current_systems = this._systems;
    this._systems = [];
    try {
      for (const system_data of await this.api._get_systems(this.id)) {
        let system: System | undefined;
        // search system in current_systems (if where are refreshing systems)
        for (const current_system of current_systems) {
          if (current_system.id === system_data.id) {
            system = current_system;
            system._set_data_refreshed(system_data);
            break;
          }
        }
        // system not found => instance new system
        if (!system) {
          system = await System.createSystem(this.platform, this.api, this, system_data);
        }
        this._systems.push(system);
      }
    } catch(e) {
      this.platform.log.error(`Unable to load systems of device ${this.name} (${this.id}) from AirzoneCloud`, e);
    }
    return this._systems;
  }

  /* Set data refreshed (call by parent AirzoneCloud on refresh_devices()) */
  public _set_data_refreshed(data) {
    this._data = data;
    this.platform.log.trace(`Data refreshed for: ${this.str_complete()}`);
  }
}