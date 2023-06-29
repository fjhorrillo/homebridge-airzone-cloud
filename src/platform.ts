import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Categories } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AirzoneCloudPlatformAccessory, AirzoneDrySwitchCloudPlatformAccessory, AirzoneFanSwitchCloudPlatformAccessory, AirzoneFanCloudPlatformAccessory } from './platformAccessory';
import { AirzoneCloudPlatformAccessoryAirzone } from './platformAccessoryAirzone';
import { AirzoneCloudPlatformAccessoryDaikin } from './platformAccessoryDaikin';

import { AirzoneCloudPlatformConfig } from './interface/config';
import { AirzoneCloud, Zone } from './AirzoneCloud';
import { AirzoneCloudDaikin, Device } from './AirzoneCloudDaikin';
import { AirzoneCloudApi } from './AirzoneCloudApi';
import { DeviceStatus, FanSpeed } from './interface/airzonecloud';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */

export interface DeviceType {
  id: string;
  groupId: string;
  installationId: string;
  name: string;
  serialNumber: string;
  model: string;
  firmwareRevision: string;
  status: DeviceStatus;
}

export class AirzoneCloudHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly log!: DebugLogger;
  public airzoneCloud!: AirzoneCloud;
  public airzoneCloudDaikin!: AirzoneCloudDaikin;
  public airzoneCloudApi!: AirzoneCloudApi;

  constructor(
    public readonly _log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Initialize logger
    this.log = new DebugLogger(_log);

    // We can't start without being configured.
    if (!config) {
      _log.error('No config defined.');
      return;
    }

    if (!AirzoneCloudPlatformConfig.isValid(this)) {
      _log.error(`Invalid config.json: ${AirzoneCloudPlatformConfig.toString(this)}`);
      return;
    }

    // Init debug logger
    if ((this.config as AirzoneCloudPlatformConfig).debug) {
      DebugLogger.setDebugEnabled(true);
    }

    this.log.debug(`config.json: ${AirzoneCloudPlatformConfig.toString(this)}`);

    // We need login credentials or we're not starting.
    if (!(this.config as AirzoneCloudPlatformConfig).login.email || !(this.config as AirzoneCloudPlatformConfig).login.password) {
      this.log.error('No Airzone Cloud login credentials configured.');
      return;
    }

    this.log.debug(`Finished initializing platform: ${this.config.name}`);

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      this.log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      if (!AirzoneCloudPlatformConfig.isDaikin(this)) {
        if (!AirzoneCloudPlatformConfig.isOldAirzone(this)) {
          this.discoverDevices();
        } else {
          this.discoverAirzoneDevices();
        }
      } else {
        this.discoverDaikinDevices();
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  /* Discovered accessories from Airzone Cloud. */
  async discoverDevices() {
    /**
     * Airzone Cloud API implementation.
     *
     * AirzoneCloud : represent your AirzoneCloud account. Contains a list of your installations :
     *   Installation: represent one of your installation (like your home, an office, ...). Contains a list of its devices :
     *     Device : represent your climate equipement (Systems: Mitsubishi, Daikin, ...) and Zones to control
     */
    // Initialice Airzone Cloud connection
    this.log.info('Initialice conection to Airzone Cloud');
    const airzoneCloudApi = await AirzoneCloudApi.createAirzoneCloudApi(
      this,
      (this.config as AirzoneCloudPlatformConfig).login.email,
      (this.config as AirzoneCloudPlatformConfig).login.password,
      (this.config as AirzoneCloudPlatformConfig).user_agent,
      (this.config as AirzoneCloudPlatformConfig).custom_base_url ?
        (this.config as AirzoneCloudPlatformConfig).custom_base_url : (this.config as AirzoneCloudPlatformConfig).system,
    );

    if (airzoneCloudApi) {
      this.airzoneCloudApi = airzoneCloudApi;
      // loop over the discovered devices and register each one if it has not already been registered
      for (const installationId of await this.airzoneCloudApi.getInstallations() || []) {
        this.log.debug(`Installation: ${installationId.name}<${installationId.installation_id}>`);
        // get all webservers
        const webservers = {};
        for (const ws_id of installationId.ws_ids || []) {
          webservers[ws_id] = await this.airzoneCloudApi.getWebserverStatus(installationId.installation_id, ws_id);
        }
        // get installation detail
        const installation = await this.airzoneCloudApi.getInstallation(installationId.installation_id);
        for (const group of installation!.groups || []) {
          this.log.debug(`Group: ${group.name}<${group.group_id}>`);
          for (const device of group.devices || []) {
            if (device.type === 'az_zone' || device.type === 'aidoo' || device.type === 'aidoo_it') {
              this.log.debug(`AirZone Device: ${device.name}<${device.device_id}>`);
              const webserverStatus = webservers[device.ws_id] ||
                await this.airzoneCloudApi.getWebserverStatus(installation!.installation_id, device.ws_id);
              this.registerDevice({
                id: device.device_id,
                groupId: group.group_id,
                installationId: installation!.installation_id,
                name: device.name || group.name || installation!.name,
                serialNumber: device.ws_id,
                model: device.type,
                firmwareRevision: webserverStatus.config.ws_fw,
                status: device.status,
              });
            }
          }
        }
      }
    }
  }

  async discoverAirzoneDevices() {
    /**
     * Airzone Cloud API implementation.
     *
     * AirzoneCloud : represent your AirzoneCloud account. Contains a list of your devices :
     *   Device : represent one of your Airzone webserver registered. Contains a list of its systems :
     *     System : represent your climate equipment (Mitsubishi, Daikin, ...). Contains a list of its zones :
     *       Zone : represent a zone to control
     */
    // Initialice Airzone Cloud connection
    this.log.info('Initialice conection to Airzone Cloud');
    this.airzoneCloud = await AirzoneCloud.createAirzoneCloud(
      this,
      (this.config as AirzoneCloudPlatformConfig).login.email,
      (this.config as AirzoneCloudPlatformConfig).login.password,
      (this.config as AirzoneCloudPlatformConfig).user_agent,
      (this.config as AirzoneCloudPlatformConfig).custom_base_url ?
        (this.config as AirzoneCloudPlatformConfig).custom_base_url : (this.config as AirzoneCloudPlatformConfig).system,
    );

    // loop over the discovered devices and register each one if it has not already been registered
    for (const system of this.airzoneCloud.all_systems) {
      for (const zone of system.zones) {
        this.registerDevice({
          id: zone.id,
          groupId: zone.system.id,
          installationId: zone.system.device.id,
          name: zone.name,
          serialNumber: zone.system.device.mac,
          model: zone.class,
          firmwareRevision: zone.system.firmware_system,
          status: {
            // Only for type compatibility
            // eslint-disable-next-line max-len
            power: false, humidity: 0, local_temp: { celsius: 0, fah: 0 }, setpoint_air_stop: { celsius: 0, fah: 0 }, setpoint_air_auto: { celsius: 0, fah: 0 }, setpoint_air_cool: { celsius: 0, fah: 0 }, setpoint_air_heat: { celsius: 0, fah: 0 }, setpoint_air_vent: { celsius: 0, fah: 0 }, setpoint_air_dry: { celsius: 0, fah: 0 }, step: { celsius: 0, fah: 0 }, mode: 0, mode_available: [],
            units: 0, speed_conf: FanSpeed.LOW // 0:CELSIUS, 1:FAHRENHEIT
          },
        }, zone);
      }
    }
  }

  /* Discovered accessories from Daikin Airzone Cloud. */
  async discoverDaikinDevices() {
    /**
     * Daikin Airzone Cloud API implementation.
     *
     * AirzoneCloudDaikin : represent your Daikin AirzoneCloud account. Contains a list of your installations :
     *   Installation: represent one of your installation (like your home, an office, ...). Contains a list of its devices :
     *     Device : represent your climate equipement to control
     */
    // Initialice Dikin Airzone Cloud connection
    this.log.info('Initialice conection to Daikin Airzone Cloud');
    this.airzoneCloudDaikin = await AirzoneCloudDaikin.createAirzoneCloudDaikin(
      this,
      (this.config as AirzoneCloudPlatformConfig).login.email,
      (this.config as AirzoneCloudPlatformConfig).login.password,
      (this.config as AirzoneCloudPlatformConfig).user_agent,
      (this.config as AirzoneCloudPlatformConfig).custom_base_url ?
        (this.config as AirzoneCloudPlatformConfig).custom_base_url : (this.config as AirzoneCloudPlatformConfig).system,
    );

    // loop over the discovered devices and register each one if it has not already been registered
    for (const device of this.airzoneCloudDaikin.all_devices) {
      this.registerDevice({
        id: device.id,
        groupId: device.installation.id,
        installationId: device.installation.id,
        name: device.name,
        serialNumber: device.mac,
        model: device.brand,
        firmwareRevision: device.firmware,
        status: {
          // Only for type compatibility
          // eslint-disable-next-line max-len
          power: false, humidity: 0, local_temp: { celsius: 0, fah: 0 }, setpoint_air_stop: { celsius: 0, fah: 0 }, setpoint_air_auto: { celsius: 0, fah: 0 }, setpoint_air_cool: { celsius: 0, fah: 0 }, setpoint_air_heat: { celsius: 0, fah: 0 }, setpoint_air_vent: { celsius: 0, fah: 0 }, setpoint_air_dry: { celsius: 0, fah: 0 }, step: { celsius: 0, fah: 0 }, mode: 0, mode_available: [],
          units: 0, speed_conf: FanSpeed.LOW// 0:CELSIUS, 1:FAHRENHEIT
        },
      }, device);
    }
  }

  registerDevice(device: DeviceType, zone?: Zone | Device) {
    // generate a unique id for the accessory this should be generated from
    // something globally unique, but constant, for example, the device serial
    // number or MAC address
    const uuid = this.api.hap.uuid.generate(device.id);
    const fanUuid = this.api.hap.uuid.generate(device.id + "fan");
    const fanSwitchUuid = this.api.hap.uuid.generate(device.id + "fan-switch");
    const drySwitchUuid = this.api.hap.uuid.generate(device.id + "dry-switch");

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
    const existingFanAccessory = this.accessories.find(accessory => accessory.UUID === fanUuid);
    const existingFanSwitchAccessory = this.accessories.find(accessory => accessory.UUID === fanSwitchUuid);
    const existingDrySwitchAccessory = this.accessories.find(accessory => accessory.UUID === drySwitchUuid);

    if (existingAccessory) {
      // the accessory already exists
      if (device) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} (UUID: ${existingAccessory.UUID})`);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        existingAccessory.context.device = device;

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (zone) {
          if ((zone as Zone).class === 'Zone') {
            new AirzoneCloudPlatformAccessoryAirzone(this, existingAccessory, zone as Zone);
          } else {
            new AirzoneCloudPlatformAccessoryDaikin(this, existingAccessory, zone as Device);
          }
        } else {
          new AirzoneCloudPlatformAccessory(this, existingAccessory);
        }

        // update accessory cache with any changes to the accessory details and information
        this.api.updatePlatformAccessories([existingAccessory]);
      } else if (!device) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
        this.log.info(`Removing existing accessory from cache: ${existingAccessory.displayName} (UUID: ${existingAccessory.UUID})`);
      }
    } else {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory ${device.name} (UUID: ${uuid})`);

      // create a new accessory
      const accessory = new this.api.platformAccessory(device.name, uuid, Categories.AIR_CONDITIONER);

      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      accessory.context.device = device;

      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      if (zone) {
        if ((zone as Zone).class === 'Zone') {
          new AirzoneCloudPlatformAccessoryAirzone(this, accessory, zone as Zone);
        } else {
          new AirzoneCloudPlatformAccessoryDaikin(this, accessory, zone as Device);
        }
      } else {
        new AirzoneCloudPlatformAccessory(this, accessory);
      }

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
    if (existingFanAccessory) {
      // the accessory already exists
      if (device) {
        this.log.info(`Restoring existing accessory from cache: ${existingFanAccessory.displayName} (UUID: ${existingFanAccessory.UUID})`);
        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        existingFanAccessory.context.device = device;
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (!zone) {
          new AirzoneFanCloudPlatformAccessory(this, existingFanAccessory);
        }
        // update accessory cache with any changes to the accessory details and information
        this.api.updatePlatformAccessories([existingFanAccessory]);
      }
      else if (!device) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingFanAccessory]);
        this.log.info(`Removing existing accessory from cache: ${existingFanAccessory.displayName} (UUID: ${existingFanAccessory.UUID})`);
      }
    }
    else {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory ${device.name} (UUID: ${fanUuid})`);
      // create a new accessory
      const fanAccessory = new this.api.platformAccessory(device.name, fanUuid, 8 /* Categories.SWITCH */);
      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      fanAccessory.context.device = device;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      if (!zone) {
        new AirzoneFanCloudPlatformAccessory(this, fanAccessory);
      }
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [fanAccessory]);
    }
    if (existingFanSwitchAccessory) {
      // the accessory already exists
      if (device) {
        this.log.info(`Restoring existing accessory from cache: ${existingFanSwitchAccessory.displayName} (UUID: ${existingFanSwitchAccessory.UUID})`);
        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        existingFanSwitchAccessory.context.device = device;
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (!zone) {
          new AirzoneFanSwitchCloudPlatformAccessory(this, existingFanSwitchAccessory);
        }
        // update accessory cache with any changes to the accessory details and information
        this.api.updatePlatformAccessories([existingFanSwitchAccessory]);
      }
      else if (!device) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingFanSwitchAccessory]);
        this.log.info(`Removing existing accessory from cache: ${existingFanSwitchAccessory.displayName} (UUID: ${existingFanSwitchAccessory.UUID})`);
      }
    }
    else {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory ${device.name} (UUID: ${fanSwitchUuid})`);
      // create a new accessory
      const fanSwitchAccessory = new this.api.platformAccessory(device.name, fanSwitchUuid, 8 /* Categories.SWITCH */);
      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      fanSwitchAccessory.context.device = device;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      if (!zone) {
        new AirzoneFanSwitchCloudPlatformAccessory(this, fanSwitchAccessory);
      }
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [fanSwitchAccessory]);
    }
    if (existingDrySwitchAccessory) {
      // the accessory already exists
      if (device) {
        this.log.info(`Restoring existing accessory from cache: ${existingDrySwitchAccessory.displayName} (UUID: ${existingDrySwitchAccessory.UUID})`);
        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        existingDrySwitchAccessory.context.device = device;
        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        if (!zone) {
          new AirzoneDrySwitchCloudPlatformAccessory(this, existingDrySwitchAccessory);
        }
        // update accessory cache with any changes to the accessory details and information
        this.api.updatePlatformAccessories([existingDrySwitchAccessory]);
      }
      else if (!device) {
        // remove platform accessories when no longer present
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingDrySwitchAccessory]);
        this.log.info(`Removing existing accessory from cache: ${existingDrySwitchAccessory.displayName} (UUID: ${existingDrySwitchAccessory.UUID})`);
      }
    }
    else {
      // the accessory does not yet exist, so we need to create it
      this.log.info(`Adding new accessory ${device.name} (UUID: ${drySwitchUuid})`);
      // create a new accessory
      const drySwitchAccessory = new this.api.platformAccessory(device.name, drySwitchUuid, 8 /* Categories.SWITCH */);
      // store a copy of the device object in the `accessory.context`
      // the `context` property can be used to store any data about the accessory you may need
      drySwitchAccessory.context.device = device;
      // create the accessory handler for the newly create accessory
      // this is imported from `platformAccessory.ts`
      if (!zone) {
        new AirzoneDrySwitchCloudPlatformAccessory(this, drySwitchAccessory);
      }
      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [drySwitchAccessory]);
    }
  }
}

/**
 * DebugLogger
 * Extend loging to manage debug mode
 */
export class DebugLogger implements Logger {
  private static debugEnabled;

  constructor(private readonly _log: Logger) {
    this.debug('Debug mode on');
  }

  info(message: string, ...parameters: unknown[]): void {
    this._log.info(message, ...parameters);
  }

  warn(message: string, ...parameters: unknown[]): void {
    this._log.warn(message, ...parameters);
  }

  error(message: string, ...parameters: unknown[]): void {
    this._log.error(message, ...parameters);
  }

  debug(message: string, ...parameters: unknown[]): void {
    if (DebugLogger.debugEnabled) {
      this.log('info', `\x1b[90m${message}\x1b[0m`, ...parameters);
    } else {
      this._log.debug(message, ...parameters);
    }
  }

  trace(message: string, ...parameters: unknown[]): void {
    this._log.debug(message, ...parameters);
  }

  log(level, message: string, ...parameters: unknown[]): void {
    this._log.log(level, message, ...parameters);
  }

  get prefix(): string | undefined {
    return this._log.prefix;
  }

  /**
   * Turns on debug level logging. Off by default.
   *
   * @param enabled {boolean}
   */
  static setDebugEnabled(enabled = true) {
    DebugLogger.debugEnabled = enabled;
  }

  static isDebugEnabled() {
    return DebugLogger.debugEnabled;
  }

}
