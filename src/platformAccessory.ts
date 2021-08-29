import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';

import { AirzoneCloudHomebridgePlatform, DeviceType } from './platform';

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

interface Data {
  current_humidity: number;         // Min Value 0, Max Value 100, Min Step 1
  current_temperature: {celsius: number;fah: number}; // Min Value 0, Max Value 100, Min Step 0.1
  target_temperature: number;       // Min Value 10, Max Value 38, Min Step 0.1
  temperature: number;              // Min Value 10, Max Value 38, Min Step 0.1
  mode: number;                     // 0:STOP, 2:COOL, 3:HEAT, 4:FAN, 5:DRY
  units: number;                    // 0:CELSIUS, 1:FAHRENHEIT
}

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AirzoneCloudPlatformAccessory {
  private service: Service;
  private device: DeviceType;
  private data: Data = {
    current_humidity: 0,
    current_temperature: {
      celsius: 25.0,
      fah: 77.0,
    },
    target_temperature: 25.0,
    temperature: 25.0,
    mode: 0,
    units: 0,
  };

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
    this.service.getCharacteristic(this.platform.Characteristic.TargetHeatingCoolingState)
      .onSet(this.setTargetHeatingCoolingState.bind(this))   // SET - bind to the `setTargetHeatingCoolingState` method below
      .onGet(this.getTargetHeatingCoolingState.bind(this));  // GET - bind to the `getTargetHeatingCoolingState` method below

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

    // register handlers for the TemperatureDisplayUnits CurrentRelativeHumidity
    this.service.getCharacteristic(this.platform.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentRelativeHumidity.bind(this));    // GET - bind to the `getCurrentRelativeHumidity` method below

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

   * If you need to return an error to show the device as "Not Responding" in the Home app
   * you should throw `SERVICE_COMMUNICATION_FAILURE` exception.

   * @example
   * throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
   */
  async getCurrentHeatingCoolingState(): Promise<CharacteristicValue> {
    // CurrentHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL
    const currentHeatingCoolingState = this.data.mode;

    this.platform.log.debug(`${this.device.name}: Get Characteristic CurrentHeatingCoolingState -> ` +
      `${HeatingCoolingState[currentHeatingCoolingState]}[${currentHeatingCoolingState}]`);

    return currentHeatingCoolingState;
  }

  async getTargetHeatingCoolingState(): Promise<CharacteristicValue> {
    // TargetHeatingCoolingState => 0:OFF, 1:HEAT, 2:COOL, 3:AUTO
    const targetHeatingCoolingState = this.data.mode;

    this.platform.log.debug(`${this.device.name}: Get Characteristic TargetHeatingCoolingState -> ` +
      `${HeatingCoolingState[targetHeatingCoolingState]}[${targetHeatingCoolingState}]`);

    return targetHeatingCoolingState;
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    // CurrentTemperature => Min Value 0, Max Value 100, Min Step 0.1
    const currentTemperature = this.data.units ? this.data.current_temperature.fah : this.data.current_temperature.celsius;

    this.platform.log.info(`${this.device.name}: Get Characteristic CurrentTemperature -> ` +
      `${currentTemperature}º${TemperatureDisplayUnits[this.data.units].charAt(0)}`);

    return currentTemperature;
  }

  async getTargetTemperature(): Promise<CharacteristicValue> {
    // TargetTemperature => Min Value 10, Max Value 38, Min Step 0.1
    const targetTemperature = this.data.target_temperature;

    this.platform.log.debug(`${this.device.name}: Get Characteristic TargetTemperature -> ` +
      `${targetTemperature}º${TemperatureDisplayUnits[this.data.units].charAt(0)}`);

    return targetTemperature;
  }

  async getTemperatureDisplayUnits(): Promise<CharacteristicValue> {
    // TemperatureDisplayUnits => 0:CELSIUS, 1:FAHRENHEIT
    const temperatureDisplayUnits = this.data.units;

    this.platform.log.info(`${this.device.name}: Get Characteristic TemperatureDisplayUnits -> ` +
      `${TemperatureDisplayUnits[temperatureDisplayUnits]}[${temperatureDisplayUnits}]`);

    return temperatureDisplayUnits;
  }

  async getCurrentRelativeHumidity(): Promise<CharacteristicValue> {
    // CurrentRelativeHumidity => Min Value 0, Max Value 100, Min Step 1
    const currentRelativeHumidity = this.data.current_humidity;

    this.platform.log.debug(`${this.device.name}: Get Characteristic CurrentRelativeHumidity -> ` +
      `${currentRelativeHumidity}%`);

    return currentRelativeHumidity;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setTargetHeatingCoolingState(value: CharacteristicValue) {
    // TargetHeatingCoolingState => 0:STOP, 2:COOL, 3:HEAT, 4:FAN, 5:DRY
    const targetHeatingCoolingState = value as HeatingCoolingState;
    switch (targetHeatingCoolingState) {
      case HeatingCoolingState.OFF:
        break;
      case HeatingCoolingState.HEAT:
        break;
      case HeatingCoolingState.COOL:
        break;
      case HeatingCoolingState.AUTO:
        if (this.data.current_temperature.celsius < this.data.target_temperature) { // If themperture is lower
        } else if (this.data.current_temperature.celsius > this.data.target_temperature) { // If temperture is higher
        }
        break;
    }
    this.data.mode = targetHeatingCoolingState;

    this.platform.log.info(`${this.device.name}: Set Characteristic TargetHeatingCoolingState -> ` +
      `${HeatingCoolingState[targetHeatingCoolingState]}[${targetHeatingCoolingState}]`);
  }

  async setTargetTemperature(value: CharacteristicValue) {
    // TargetTemperature => Min Value 10, Max Value 38, Min Step 0.1
    const targetTemperature = value as number;

    this.data.temperature = targetTemperature;

    this.platform.log.info(`${this.device.name}: Set Characteristic TargetTemperature -> ` +
      `${targetTemperature}º${TemperatureDisplayUnits[this.data.units].charAt(0)}`);
  }

  async setTemperatureDisplayUnits(value: CharacteristicValue) {
    // TemperatureDisplayUnits => 0:CELSIUS, 1:FAHRENHEIT
    const temperatureDisplayUnits = value as TemperatureDisplayUnits;

    this.data.units =temperatureDisplayUnits;

    this.platform.log.info(`${this.device.name}: Set Characteristic TemperatureDisplayUnits -> ` +
      `${TemperatureDisplayUnits[temperatureDisplayUnits]}[${temperatureDisplayUnits}]`);
  }

}
