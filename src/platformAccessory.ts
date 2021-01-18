import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';
import { Zone } from './AirzoneCloud';

import { AirzoneCloudHomebridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirzoneCloudPlatformAccessory {
  private service: Service;

  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private initStates = {
    TemperatureDisplayUnits: 0,    // 0:CELSIUS, 1:FAHRENHEIT
  };

  constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly zone: Zone,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Airzone')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serialNumber)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareRevision)
      .setCharacteristic(this.platform.Characteristic.SoftwareRevision, accessory.context.device.softwareRevision);

    // get the Thermostat service if it exists, otherwise create a new Thermostat service
    // you can create multiple services for each accessory
    this.service = this.accessory.getService(this.platform.Service.Thermostat) ||
                   this.accessory.addService(this.platform.Service.Thermostat);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.displayName);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Thermostat

    // register handlers for the CurrentHeatingCoolingState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeatingCoolingState)
      .on('get', this.getCurrentHeatingCoolingState.bind(this)); // GET - bind to the `getCurrentHeatingCoolingState` method below

    // register handlers for the TargetHeatingCoolingState Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .on('set', this.setTargetHeatingCoolingState.bind(this))   // SET - bind to the `setTargetHeatingCoolingState` method below
      .on('get', this.getTargetHeatingCoolingState.bind(this));  // GET - bind to the `getTargetHeatingCoolingState` method below

    // register handlers for the CurrentTemperature Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));         // GET - bind to the `getCurrentTemperature` method below

    // register handlers for the TargetTemperature Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.TargetTemperature)
      .on('set', this.setTargetTemperature.bind(this))             // SET - bind to the `setTargetTemperature` method below
      .on('get', this.getTargetTemperature.bind(this));            // GET - bind to the `getTargetTemperature` method below

    // register handlers for the TemperatureDisplayUnits Characteristic
    this.service.getCharacteristic(this.platform.Characteristic.TemperatureDisplayUnits)
      .on('set', this.setTemperatureDisplayUnits.bind(this))       // SET - bind to the `setTemperatureDisplayUnits` method below
      .on('get', this.getTemperatureDisplayUnits.bind(this));      // GET - bind to the `getTemperatureDisplayUnits` method below

    // register handlers for the TemperatureDisplayUnits CurrentRelativeHumidity
    if (this.zone.current_humidity) {
      this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
        .on('get', this.getCurrentRelativeHumidity.bind(this));      // GET - bind to the `getCurrentRelativeHumidity` method below
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
    //const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //  this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    //const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //  this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    /*let motionDetected = false;
    setInterval(() => {
      // EXAMPLE - inverse the trigger
      motionDetected = !motionDetected;

      // push the new value to HomeKit
      motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
      motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

      this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
      this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
    }, 10000);*/
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
   */
  async getCurrentHeatingCoolingState(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.zone.refresh();
    const system = this.zone.system;

    // CurrentHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL
    let currentHeatingCoolingState = 0;
    switch (Number(system.mode_raw)) {
      case 0:
        currentHeatingCoolingState = 0;
        break;
      case 1: case 8: case 9:
        currentHeatingCoolingState = 2;
        break;
      case 2: case 4: case 5:
        currentHeatingCoolingState = 1;
        break;
      default:
        this.platform.log.error(`Unknown state [${system.mode_raw}]${system.mode}: ${system.mode_description}`);
        break;
    }

    this.platform.log.info(`${this.zone.name}: Get Characteristic CurrentHeatingCoolingState -> ` +
      `${currentHeatingCoolingState} ([${system.mode_raw}]${system.mode}: ${system.mode_description})`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, currentHeatingCoolingState);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setTargetHeatingCoolingState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // Refres data from Airzone Cloud
    await this.zone.refresh();
    const system = this.zone.system;
    let allOtherOff: boolean;

    // TargetHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL, 3:AUTO
    let targetHeatingCoolingState = 'stop';
    switch (value) {
      case 0: // STOP
        // Switch mode to stop only if all zones are off
        allOtherOff = true;
        for (const zone of system.zones) {
          if (zone.id !== this.zone.id) {
            allOtherOff &&= !zone.is_on;
          }
        }
        targetHeatingCoolingState = allOtherOff ? 'stop' : system.mode;
        await this.zone.turn_off();
        break;
      case 1: // HEAT
        targetHeatingCoolingState = 'heat-radiant';
        await this.zone.turn_on();
        break;
      case 2: // COOL
        targetHeatingCoolingState = 'cool-air';
        await this.zone.turn_on();
        break;
      case 3: // AUTO
        targetHeatingCoolingState = system.mode;
        if (this.zone.current_temperature! < this.zone.target_temperature!) { // If themperture is lower
          targetHeatingCoolingState = 'heat-radiant';
          await this.zone.turn_on();
        } else if (this.zone.current_temperature! > this.zone.target_temperature!) { // If temperture is higher
          targetHeatingCoolingState = 'cool-air';
          await this.zone.turn_on();
        }
        break;
      default:
        this.platform.log.error(`Unknown state [${system.mode_raw}]${system.mode}: ${system.mode_description}`);
        break;
    }
    await this.zone.system.set_mode(targetHeatingCoolingState);

    this.platform.log.info(`${this.zone.name}: Set Characteristic TargetHeatingCoolingState -> ${targetHeatingCoolingState}`);

    // you must call the callback function
    callback(null);
  }

  async getTargetHeatingCoolingState(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.zone.refresh();

    // TargetHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL, 3:AUTO
    let targetHeatingCoolingState = 0;
    switch (Number(this.zone.system.mode_raw)) {
      case 0:
        targetHeatingCoolingState = 0;
        break;
      case 1: case 8: case 9:
        targetHeatingCoolingState = 2;
        break;
      case 2: case 4: case 5:
        targetHeatingCoolingState = 1;
        break;
      default:
        this.platform.log.error(`Unknown state [${this.zone.mode_raw}]${this.zone.mode}: ${this.zone.mode_description}`);
        break;
    }
    if (!this.zone.is_on) {
      targetHeatingCoolingState = 0;
    }

    this.platform.log.info(`${this.zone.name}: Get Characteristic TargetHeatingCoolingState -> ` +
      `${targetHeatingCoolingState} ([${this.zone.mode_raw}]${this.zone.mode}: ${this.zone.mode_description})`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, targetHeatingCoolingState);
  }

  async getCurrentTemperature(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.zone.refresh();

    // CurrentTemperature => Min Value 0, Max Value 100, Min Step 0.1
    const currentTemperature = this.zone.current_temperature;

    this.platform.log.debug(`${this.zone.name}: Get Characteristic CurrentTemperature -> ${currentTemperature}`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, currentTemperature);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  async setTargetTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // Refres data from Airzone Cloud
    await this.zone.refresh();

    // Min Value 10, Max Value 38, Min Step 0.1
    await this.zone.set_temperature(value);

    this.platform.log.info(`${this.zone.name}: Set Characteristic TargetTemperature -> ${value}`);

    // you must call the callback function
    callback(null);
  }

  async getTargetTemperature(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.zone.refresh();

    // TargetTemperature => Min Value 10, Max Value 38, Min Step 0.1
    const targetTemperature = this.zone.target_temperature;

    this.platform.log.debug(`${this.zone.name}: Get Characteristic TargetTemperature -> ${targetTemperature}`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, targetTemperature);
  }

  setTemperatureDisplayUnits(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    // implement your own code to set the TemperatureDisplayUnits
    this.initStates.TemperatureDisplayUnits = value as number;

    this.platform.log.info(`${this.zone.name}: Set Characteristic TemperatureDisplayUnits -> ${value}`);

    // you must call the callback function
    callback(null);
  }

  getTemperatureDisplayUnits(callback: CharacteristicGetCallback) {
    const temperatureDisplayUnits = this.initStates.TemperatureDisplayUnits;

    this.platform.log.debug(`${this.zone.name}: Get Characteristic TemperatureDisplayUnits -> ${temperatureDisplayUnits}`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, temperatureDisplayUnits);
  }

  async getCurrentRelativeHumidity(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.zone.refresh();

    // CurrentRelativeHumidity => Min Value 0, Max Value 100, Min Step 1
    const currentRelativeHumidity = this.zone.current_humidity;

    this.platform.log.debug(`${this.zone.name}: Get Characteristic CurrentRelativeHumidity -> ${currentRelativeHumidity}`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, currentRelativeHumidity);
  }
}