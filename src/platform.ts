import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Categories } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AirzoneCloudPlatformAccessory } from './platformAccessory';

import { AirzoneCloudPlatformConfig } from './interface/config';
import { AirzoneCloudApi } from './AirzoneCloudApi';

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
}

export class AirzoneCloudHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public readonly log!: DebugLogger;
  public airzoneCloudApi!: AirzoneCloudApi;

  constructor(
    public readonly _log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Initialize logger
    this.log = new DebugLogger(_log);

    // We can't start without being configured.
    if(!config) {
      _log.error('No config defined.');
      return;
    }

    if(!AirzoneCloudPlatformConfig.isValid(this)) {
      _log.error(`Invalid config.json: ${AirzoneCloudPlatformConfig.toString(this)}`);
      return;
    }

    // Init debug logger
    if ((this.config as AirzoneCloudPlatformConfig).debug) {
      DebugLogger.setDebugEnabled(true);
    }

    this.log.debug(`config.json: ${AirzoneCloudPlatformConfig.toString(this)}`);

    // We need login credentials or we're not starting.
    if(!(this.config as AirzoneCloudPlatformConfig).login.email || !(this.config as AirzoneCloudPlatformConfig).login.password) {
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
      this.discoverDevices();
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
    this.airzoneCloudApi = await AirzoneCloudApi.createAirzoneCloudApi(
      this,
      (this.config as AirzoneCloudPlatformConfig).login.email,
      (this.config as AirzoneCloudPlatformConfig).login.password,
      (this.config as AirzoneCloudPlatformConfig).user_agent,
      (this.config as AirzoneCloudPlatformConfig).custom_base_url ?
        (this.config as AirzoneCloudPlatformConfig).custom_base_url : (this.config as AirzoneCloudPlatformConfig).system,
    );

    // loop over the discovered devices and register each one if it has not already been registered
    for (let installation of await this.airzoneCloudApi.getInstallations()) {
      this.log.debug(`Installation: ${installation.name}<${installation.installation_id}>`);
      installation = await this.airzoneCloudApi.getInstallation(installation.installation_id);
      for (const group of installation.groups || []) {
        this.log.debug(`Group: ${group.name}<${group.group_id}>`);
        for (const device of group.devices || []) {
          if (device.type === 'az_zone') {
            this.log.debug(`Device: ${device.name}<${device.device_id}>`);
            const webserverStatus = await this.airzoneCloudApi.getWebserverStatus(installation.installation_id, device.ws_id);
            this.registerDevice({
              id: device.device_id,
              groupId: group.group_id,
              installationId: installation.installation_id,
              name: device.name,
              serialNumber: device.ws_id,
              model: device.type,
              firmwareRevision: webserverStatus.config.ws_fw,
            });
          }
        }
      }
    }
  }

  registerDevice(device: DeviceType) {
    // generate a unique id for the accessory this should be generated from
    // something globally unique, but constant, for example, the device serial
    // number or MAC address
    const uuid = this.api.hap.uuid.generate(device.id);

    // see if an accessory with the same uuid has already been registered and restored from
    // the cached devices we stored in the `configureAccessory` method above
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    if (existingAccessory) {
      // the accessory already exists
      if (device) {
        this.log.info(`Restoring existing accessory from cache: ${existingAccessory.displayName} (UUID: ${existingAccessory.UUID})`);

        // store a copy of the device object in the `accessory.context`
        // the `context` property can be used to store any data about the accessory you may need
        existingAccessory.context.device = device;

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirzoneCloudPlatformAccessory(this, existingAccessory);

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
      new AirzoneCloudPlatformAccessory(this, accessory);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}

/**
 * DebugLogger
 * Extend loging to manage debug mode
 */
class DebugLogger implements Logger {
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
}
