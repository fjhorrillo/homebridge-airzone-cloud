import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { AirzoneCloudHomebridgePlatform, DeviceType, DebugLogger } from './platform';
import { DeviceMode, Power, Units } from './interface/airzonecloud';

/**
 * Internal types
 */
enum HeatingCoolingState {
  OFF = 0,
  HEAT = 1,
  COOL = 2,
  AUTO = 3
}

enum TemperatureDisplayUnits {
  CELSIUS = 0,
  FAHRENHEIT = 1
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirzoneCloudPlatformAccessory {
  private service: Service;
  private device: DeviceType;

  constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    this.platform.log.debug(`Accesory context: ${JSON.stringify(accessory.context)}`);
    this.device = accessory.context.device;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Airzone')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serialNumber)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareRevision);

    // get the Thermostat service if it exists, otherwise create a new Thermostat service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
                   this.accessory.addService(this.platform.Service.Thermostat);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Thermostat

    // register handlers for the CurrentHeatingCoolingState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .onGet(this.getCurrentHeatingCoolingState.bind(this)); // GET - bind to the `getCurrentHeatingCoolingState` method below

    // register handlers for the TargetHeatingCoolingState Characteristic
    const targetHeatingCoolingState = this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onSet(this.setTargetHeatingCoolingState.bind(this))   // SET - bind to the `setTargetHeatingCoolingState` method below
      .onGet(this.getTargetHeatingCoolingState.bind(this));  // GET - bind to the `getTargetHeatingCoolingState` method below
    targetHeatingCoolingState.props.validValues = this.device.status.mode_available.includes(DeviceMode.AUTO) ?
      [HeatingCoolingState.OFF, HeatingCoolingState.HEAT, HeatingCoolingState.COOL, HeatingCoolingState.AUTO] :
      [HeatingCoolingState.OFF, HeatingCoolingState.HEAT, HeatingCoolingState.COOL];

    this.platform.log.debug(`\x1b[90m${this.device.name}: Mode available -> ${JSON.stringify(this.device.status.mode_available)}` +
      `, Valid values -> ${JSON.stringify(targetHeatingCoolingState.props.validValues)}\x1b[0m`);

    // register handlers for the CurrentTemperature Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));         // GET - bind to the `getCurrentTemperature` method below

    // register handlers for the TargetTemperature Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .onSet(this.setTargetTemperature.bind(this))           // SET - bind to the `setTargetTemperature` method below
      .onGet(this.getTargetTemperature.bind(this));          // GET - bind to the `getTargetTemperature` method below

    // register handlers for the TemperatureDisplayUnits Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .onSet(this.setTemperatureDisplayUnits.bind(this))     // SET - bind to the `setTemperatureDisplayUnits` method below
      .onGet(this.getTemperatureDisplayUnits.bind(this));    // GET - bind to the `getTemperatureDisplayUnits` method below

    // register handlers for the  CurrentRelativeHumidity Characteristic
    if (this.device.status.humidity) {
      this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .onGet(this.getCurrentRelativeHumidity.bind(this));    // GET - bind to the `getCurrentRelativeHumidity` method below
    }

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // Example: add two "motion sensor" services to the accessory
    /*const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
      this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
      this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');*/

    /**
     * Here we trace the device status every 10 seconds
     */
    if (DebugLogger.isDebugEnabled()) {
      setInterval(() => {
        this.platform.log.debug(`${this.device.name}: Status -> ${JSON.stringify(this.device.status)}`);
      }, 10000);
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)

   * If you need to return an error to show the device as "Not Responding" in the Home app
   * you should throw `SERVICE_COMMUNICATION_FAILURE` exception.

   * @example
   * throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
   */
  async getCurrentHeatingCoolingState(): Promise<CharacteristicValue> { // Update is async by websocket
    // CurrentHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL
    const currentHeatingCoolingState = this.device.status.power ? (function(mode: DeviceMode) {
      switch(mode) {
        case DeviceMode.STOP:
        case DeviceMode.FAN:
        case DeviceMode.DRY:
          return HeatingCoolingState.OFF;
        case DeviceMode.AUTO:
          return HeatingCoolingState.AUTO;
        case DeviceMode.COOLING:
        case DeviceMode.COOL_AIR:
        case DeviceMode.COOL_RADIANT:
        case DeviceMode.COOL_COMB:
          return HeatingCoolingState.COOL;
        case DeviceMode.HEATING:
        case DeviceMode.EMERGENCY_HEAT:
        case DeviceMode.HEAT_AIR:
        case DeviceMode.HEAT_RADIANT:
        case DeviceMode.HEAT_COMB:
          return HeatingCoolingState.HEAT;
        default:
          return HeatingCoolingState.OFF;
      }
    })(this.device.status.mode) : HeatingCoolingState.OFF;

    this.platform.log.debug(`${this.device.name}: Get Characteristic CurrentHeatingCoolingState -> ` +
    `${HeatingCoolingState[currentHeatingCoolingState]}[${currentHeatingCoolingState}]`);

    return currentHeatingCoolingState;
  }

  async getTargetHeatingCoolingState(): Promise<CharacteristicValue> { // Update is async by websocket
    // TargetHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL, 3:AUTO
    const targetHeatingCoolingState = this.device.status.power ? (function(mode: DeviceMode) {
      switch(mode) {
        case DeviceMode.STOP:
        case DeviceMode.FAN:
        case DeviceMode.DRY:
          return HeatingCoolingState.OFF;
        case DeviceMode.AUTO:
          return HeatingCoolingState.AUTO;
        case DeviceMode.COOLING:
        case DeviceMode.COOL_AIR:
        case DeviceMode.COOL_RADIANT:
        case DeviceMode.COOL_COMB:
          return HeatingCoolingState.COOL;
        case DeviceMode.HEATING:
        case DeviceMode.EMERGENCY_HEAT:
        case DeviceMode.HEAT_AIR:
        case DeviceMode.HEAT_RADIANT:
        case DeviceMode.HEAT_COMB:
          return HeatingCoolingState.HEAT;
        default:
          return HeatingCoolingState.OFF;
      }
    })(this.device.status.mode) : HeatingCoolingState.OFF;

    this.platform.log.debug(`${this.device.name}: Get Characteristic TargetHeatingCoolingState -> ` +
    `${HeatingCoolingState[targetHeatingCoolingState]}[${targetHeatingCoolingState}]`);

    return targetHeatingCoolingState;
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> { // Update is async by websocket
    // CurrentTemperature => Min Value 0, Max Value 100, Min Step 0.1
    const currentTemperature = this.device.status.units ? this.device.status.local_temp.fah : this.device.status.local_temp.celsius;

    this.platform.log.debug(`${this.device.name}: Get Characteristic CurrentTemperature -> ` +
      `${currentTemperature}º${TemperatureDisplayUnits[this.device.status.units].charAt(0)}`);

    return currentTemperature;
  }

  async getTargetTemperature(): Promise<CharacteristicValue> { // Update is async by websocket
    // TargetTemperature => Min Value 10, Max Value 38, Min Step 0.1
    const setpointTemperature = this.device.status.power ?
      this.device.status[this.getTargetTempertureName()] : this.device.status.setpoint_air_stop;
    const targetTemperature = this.device.status.units ? setpointTemperature.fah : setpointTemperature.celsius;

    this.platform.log.debug(`${this.device.name}: Get Characteristic TargetTemperature -> ` +
    `${targetTemperature}º${TemperatureDisplayUnits[this.device.status.units].charAt(0)}`);

    return targetTemperature;
  }

  async getTemperatureDisplayUnits(): Promise<CharacteristicValue> {
    // TemperatureDisplayUnits => 0:CELSIUS, 1:FAHRENHEIT
    this.device.status.units = (await this.platform.airzoneCloudApi.getUser()).config.units;

    // Parse from Units to TemperatureDisplayUnits
    const temperatureDisplayUnits = this.device.status.units as number as TemperatureDisplayUnits;

    this.platform.log.debug(`${this.device.name}: Get Characteristic TemperatureDisplayUnits -> ` +
      `${TemperatureDisplayUnits[temperatureDisplayUnits]}[${temperatureDisplayUnits}]`);

    return temperatureDisplayUnits;
  }

  async getCurrentRelativeHumidity(): Promise<CharacteristicValue> { // Update is async by websocket
    // CurrentRelativeHumidity => Min Value 0, Max Value 100, Min Step 1
    const currentRelativeHumidity = this.device.status.humidity;

    this.platform.log.debug(`${this.device.name}: Get Characteristic CurrentRelativeHumidity -> ` +
      `${currentRelativeHumidity}%`);

    return currentRelativeHumidity;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setTargetHeatingCoolingState(value: CharacteristicValue) {
    // TargetHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL, 3:AUTO
    const targetHeatingCoolingState = value as HeatingCoolingState;

    // transform
    const mode = (function(mode: HeatingCoolingState) {
      switch (mode) {
        case HeatingCoolingState.OFF: return DeviceMode.STOP;
        case HeatingCoolingState.HEAT: return DeviceMode.HEATING;
        case HeatingCoolingState.COOL: return DeviceMode.COOLING;
        case HeatingCoolingState.AUTO: return DeviceMode.AUTO;
        default: return DeviceMode.STOP;
      }
    })(targetHeatingCoolingState);
    const power = mode !== DeviceMode.STOP;

    this.platform.log.info(`${this.device.name}: Set Characteristic TargetHeatingCoolingState -> ` +
      `Mode from ${DeviceMode[this.device.status.mode]}[${this.device.status.mode}] to ${DeviceMode[mode]}[${mode}] and ` +
      `Power from ${Power[this.device.status.power?1:0]}[${Boolean(this.device.status.power)}] to ${Power[power?1:0]}[${Boolean(power)}]`);

    if (this.device.status.mode_available.includes(mode)) {
      this.platform.airzoneCloudApi.setDeviceMode(this.device.installationId, this.device.id, mode);
    } else {
      // the device does not have this mode it is changed through group
      this.platform.airzoneCloudApi.setGroupMode(this.device.installationId, this.device.groupId, mode);
    }
    this.platform.airzoneCloudApi.setDevicePower(this.device.installationId, this.device.id, power);

    this.platform.log.info(`${this.device.name}: Set Characteristic TargetHeatingCoolingState -> ` +
      `${HeatingCoolingState[targetHeatingCoolingState]}[${targetHeatingCoolingState}]`);
  }

  async setTargetTemperature(value: CharacteristicValue) {
    // TargetTemperature => Min Value 10, Max Value 38, Min Step 0.1
    const targetTemperature = value as number;

    this.platform.airzoneCloudApi.setTemperature(
      this.device.installationId, this.device.id, this.device.status.mode, targetTemperature, this.device.status.units,
    );

    this.platform.log.info(`${this.device.name}: Set Characteristic TargetTemperature -> ` +
      `${targetTemperature}º${TemperatureDisplayUnits[this.device.status.units].charAt(0)}`);
  }

  async setTemperatureDisplayUnits(value: CharacteristicValue) {
    // TemperatureDisplayUnits => 0:CELSIUS, 1:FAHRENHEIT
    const temperatureDisplayUnits = value as TemperatureDisplayUnits;
    const units = temperatureDisplayUnits as number as Units;

    this.platform.airzoneCloudApi.setUnits(units);

    this.platform.log.info(`${this.device.name}: Set Characteristic TemperatureDisplayUnits -> ` +
      `${TemperatureDisplayUnits[temperatureDisplayUnits]}[${temperatureDisplayUnits}]`);
  }

  /**
   * Gets target temperature name according to device mode
   */
  private getTargetTempertureName(mode?: DeviceMode): string {
    switch(mode || this.device.status.mode) {
      case DeviceMode.STOP:
        return 'setpoint_air_stop';
      case DeviceMode.FAN:
        return 'setpoint_air_vent';
      case DeviceMode.DRY:
        return 'setpoint_air_dry';
      case DeviceMode.AUTO:
        return 'setpoint_air_auto';
      case DeviceMode.COOLING:
      case DeviceMode.COOL_AIR:
      case DeviceMode.COOL_RADIANT:
      case DeviceMode.COOL_COMB:
        return 'setpoint_air_cool';
      case DeviceMode.HEATING:
      case DeviceMode.EMERGENCY_HEAT:
      case DeviceMode.HEAT_AIR:
      case DeviceMode.HEAT_RADIANT:
      case DeviceMode.HEAT_COMB:
        return 'setpoint_air_heat';
      default:
        return 'setpoint_air_stop';
    }
  }

}
