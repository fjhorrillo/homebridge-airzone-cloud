import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic, Categories } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { AirzoneCloudPlatformAccessory } from './platformAccessory';

import { AirzoneCloudPlatformConfig } from './interface/config';
import { AirzoneCloud, Zone } from './AirzoneCloud';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */

export interface DeviceType {
  id: string;
  name: string;
  serialNumber: string;
  model: string;
  firmwareRevision: string;
  softwareRevision: string;
  displayUnits: number;
}

export class AirzoneCloudHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  public airzoneCloud: AirzoneCloud | undefined;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {

    // We can't start without being configured.
    if(!config) {
      this.log.error('No config defined.');
      return;
    }

    if(!AirzoneCloudPlatformConfig.isValid(this)) {
      this.log.error(`Invalid config.json: ${AirzoneCloudPlatformConfig.toString(this)}`);
      return;
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
      log.debug('Executed didFinishLaunching callback');
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
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  async discoverDevices() {
    /**
     *  Airzone Cloud API implementation.
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
      (this.config as AirzoneCloudPlatformConfig).base_url,
    );

    // loop over the discovered devices and register each one if it has not already been registered
    for (const system of this.airzoneCloud.all_systems) {
      /*this.log.info(`System ${system.system_number}: ${system.str_complete()}`);
      this.registerDevice({
        uniqueId:system.id,
        displayName: system.name,
        serialNumber: system.device.mac,
        model: system.class,
        firmwareRevision: system.firmware_system,
        softwareRevision: system.firmware_ws,
      });*/
      for (const zone of system.zones) {
        this.registerDevice({
          id:zone.id,
          name: zone.name,
          serialNumber: zone.system.device.mac,
          model: zone.class,
          firmwareRevision: zone.system.firmware_system,
          softwareRevision: zone.system.firmware_ws,
          displayUnits: 0, // 0:CELSIUS, 1:FAHRENHEIT
        }, zone);
      }
    }
  }

  registerDevice(device: DeviceType, zone: Zone) {
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

        // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
        // existingAccessory.context.device = device;
        // this.api.updatePlatformAccessories([existingAccessory]);

        // create the accessory handler for the restored accessory
        // this is imported from `platformAccessory.ts`
        new AirzoneCloudPlatformAccessory(this, existingAccessory, zone);

        // update accessory cache with any changes to the accessory details and information
        this.api.updatePlatformAccessories([existingAccessory]);
      } else if (!device) {
        // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
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
      new AirzoneCloudPlatformAccessory(this, accessory, zone);

      // link the accessory to your platform
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}