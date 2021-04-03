import { Service, PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback } from 'homebridge';
import { Device } from './AirzoneCloudDaikin';

import { AirzoneCloudHomebridgePlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirzoneCloudPlatformAccessoryDaikin {
  private service: Service;
  private displayUnits: number; // 0:CELSIUS, 1:FAHRENHEIT

  constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: Device,
  ) {

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Airzone')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.serialNumber)
      .setCharacteristic(this.platform.Characteristic.Model, accessory.context.device.model)
      .updateCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.firmwareRevision);
    this.displayUnits = accessory.context.device.displayUnits;

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
    await this.device.refresh();
    const system = this.device;

    // CurrentHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL
    let currentHeatingCoolingState = 0;
    switch (system.heat_cold_mode) {
      case 'none':
        currentHeatingCoolingState = 0;
        break;
      case 'cold':
        currentHeatingCoolingState = 2;
        break;
      case 'heat':
        currentHeatingCoolingState = 1;
        break;
      default:
        this.platform.log.error(`Unknown state [${system.mode_raw}]${system.mode}: ${system.mode_description}`);
        break;
    }

    this.platform.log.debug(`${this.device.name}: Get Characteristic CurrentHeatingCoolingState -> ` +
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
    await this.device.refresh();
    const system = this.device;

    // TargetHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL, 3:AUTO
    let targetHeatingCoolingState = 'none';
    switch (value) {
      case 0: // STOP
        targetHeatingCoolingState = 'none';
        await this.device.turn_off();
        break;
      case 1: // HEAT
        targetHeatingCoolingState = 'heat';
        await this.device.turn_on();
        break;
      case 2: // COOL
        targetHeatingCoolingState = 'cold';
        await this.device.turn_on();
        break;
      case 3: // AUTO
        targetHeatingCoolingState = 'heat-cold-auto';
        await this.device.turn_on();
        break;
      default:
        this.platform.log.error(`Unknown state [${system.mode_raw}]${system.mode}: ${system.mode_description}`);
        break;
    }
    await this.device.set_mode(targetHeatingCoolingState);

    this.platform.log.info(`${this.device.name}: Set Characteristic TargetHeatingCoolingState -> ${targetHeatingCoolingState}`);

    // you must call the callback function
    callback(null);
  }

  async getTargetHeatingCoolingState(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.device.refresh();

    // TargetHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL, 3:AUTO
    let targetHeatingCoolingState = 0;
    switch (this.device.heat_cold_mode) {
      case 'none':
        targetHeatingCoolingState = 0;
        break;
      case 'cold':
        targetHeatingCoolingState = 2;
        break;
      case 'heat':
        targetHeatingCoolingState = 1;
        break;
      default:
        this.platform.log.error(`Unknown state [${this.device.mode_raw}]${this.device.mode}: ${this.device.mode_description}`);
        break;
    }
    if (!this.device.is_on) {
      targetHeatingCoolingState = 0;
    }

    this.platform.log.debug(`${this.device.name}: Get Characteristic TargetHeatingCoolingState -> ` +
      `${targetHeatingCoolingState} ([${this.device.mode_raw}]${this.device.mode}: ${this.device.mode_description})`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, targetHeatingCoolingState);
  }

  async getCurrentTemperature(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.device.refresh();

    // CurrentTemperature => Min Value 0, Max Value 100, Min Step 0.1
    const currentTemperature = this.displayUnits ? this.toFahrenheit(this.device.current_temperature!) : this.device.current_temperature;

    this.platform.log.debug(`${this.device.name}: Get Characteristic CurrentTemperature -> ` +
      `${currentTemperature}º${this.displayUnits?'F':'C'}`);

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
    await this.device.refresh();

    // Convert to Celsius if it is Fahrenheit
    if (this.displayUnits) {
      value = this.toCelsius(value as number);
    }
    // Min Value 10, Max Value 38, Min Step 0.1
    await this.device.set_temperature(value);

    this.platform.log.info(`${this.device.name}: Set Characteristic TargetTemperature -> ${value}º${this.displayUnits?'F':'C'}`);

    // you must call the callback function
    callback(null);
  }

  async getTargetTemperature(callback: CharacteristicGetCallback) {
    // Refres data from Airzone Cloud
    await this.device.refresh();

    // TargetTemperature => Min Value 10, Max Value 38, Min Step 0.1
    const targetTemperature = this.displayUnits ? this.toFahrenheit(this.device.target_temperature!) : this.device.target_temperature;

    this.platform.log.debug(`${this.device.name}: Get Characteristic TargetTemperature -> ` +
      `${targetTemperature}º${this.displayUnits?'F':'C'}`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, targetTemperature);
  }

  setTemperatureDisplayUnits(value: CharacteristicValue, callback: CharacteristicSetCallback) {

    // implement your own code to set the TemperatureDisplayUnits
    this.displayUnits = value as number;

    this.platform.log.info(`${this.device.name}: Set Characteristic TemperatureDisplayUnits -> ${value} (º${this.displayUnits?'F':'C'})`);

    // you must call the callback function
    callback(null);
  }

  getTemperatureDisplayUnits(callback: CharacteristicGetCallback) {
    const temperatureDisplayUnits = this.displayUnits;

    this.platform.log.debug(`${this.device.name}: Get Characteristic TemperatureDisplayUnits -> ` +
      `${temperatureDisplayUnits} (º${this.displayUnits?'F':'C'})`);

    // you must call the callback function
    // the first argument should be null if there were no errors
    // the second argument should be the value to return
    callback(null, temperatureDisplayUnits);
  }

  toFahrenheit(temperature: number): number {
    // Convert from Celsius to Fahrenheit
    const fahrenheit = (temperature * 9 / 5) + 32;
    return Math.round(fahrenheit * 10) / 10;
  }

  toCelsius(temperature: number): number {
    // Convert from Fahrenheit to Celsius
    const celsius = (temperature - 32) * 5 / 9;
    return Math.round(celsius * 10) / 10;
  }
}