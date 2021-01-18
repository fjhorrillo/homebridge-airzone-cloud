/**
 * AirzoneCloud: represent your AirzoneCloud account. Contains a list of your devices.
 */

import { AirzoneCloudHomebridgePlatform } from '../platform';

import { Logger } from 'homebridge';
import fetch = require('node-fetch');

import { API_LOGIN, API_DEVICE_RELATIONS, API_SYSTEMS, API_ZONES, API_EVENTS } from './contants';
import {Device, System, Zone} from '.';
import { URL, URLSearchParams } from 'url';

/* Allow to connect to AirzoneCloud API */
export class AirzoneCloud {
  private log: Logger;
  private _username: string;
  private _password: string;
  private _user_agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile';
  private _base_url = new URL('https://www.airzonecloud.com');
  private _token?: string;
  private _devices: Device[] = [];

  /* Initialize API connection */
  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    username: string,
    password: string,
    user_agent: string,
    base_url: string,
  ) {
    this.log = platform.log;
    this._username = username;
    this._password = password;
    if (user_agent) {
      this._user_agent = user_agent!;
    }
    if (base_url) {
      this._base_url = new URL(base_url!);
    }
  }

  /* This is for syncronice initialization */
  public static async createAirzoneCloud(
    platform: AirzoneCloudHomebridgePlatform,
    username: string,
    password: string,
    user_agent: string,
    base_url: string,
  ): Promise<AirzoneCloud> {
    // constructor
    const airzoneCloud = new AirzoneCloud(platform, username, password, user_agent, base_url);

    // login
    await airzoneCloud._login();
    // load devices
    await airzoneCloud._load_devices();

    return airzoneCloud;
  }

  /*
   * getters
   */

  /* Get devices list (same order as in app) */
  get devices(): Device[] {
    return this._devices;
  }

  /* Get all systems from all devices (same order as in app) */
  get all_systems(): System[] {
    const result: System[] = [];
    for (const device of this.devices) {
      for (const system of device.systems) {
        result.push(system);
      }
    }
    return result;
  }

  /* Get all zones from all devices (same order as in app) */
  get all_zones(): Zone[] {
    const result: Zone[] = [];
    for (const device of this.devices) {
      for (const system of device.systems) {
        for (const zone of system.zones) {
          result.push(zone);
        }
      }
    }
    return result;
  }

  /*
   * Refresh
   */

  /* Refresh devices */
  public async refresh_devices() {
    await this._load_devices();
  }

  /*
   * private
   */

  /* Login to AirzoneCloud and return token */
  public async _login(): Promise<string | undefined> {
    const options = {
      url: new URL(API_LOGIN, this._base_url),
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'User-Agent': this._user_agent,
      },
      body: JSON.stringify({
        email: this._username,
        password: this._password,
      }),
    };
    this.log.debug(`Request: ${options.method} ${options.url}`);
    const response = await fetch( options.url, options);
    if (response && response.ok) {
      const data = await response.json();
      this.log.debug(`Response ${JSON.stringify(data)}`);
      this._token = data.user.authentication_token;
      this.log.info(`Login success as ${this._username}`);
      return this._token;
    } else {
      this.log.error(`Unable to login to AirzoneCloud. Request ${JSON.stringify(options)} ${JSON.stringify(response)}`);
    }
  }

  /* Load all devices for this account */
  public async _load_devices(): Promise<Device[]> {
    const current_devices = this._devices;
    this._devices = [];
    try {
      for (const device_relation of await this._get_device_relations()) {
        this.log.debug(`device_relations ${JSON.stringify(device_relation)}`);
        const device_data = device_relation.device;
        let device: Device | undefined;
        // search device in current_devices (if where are refreshing devices)
        for (const current_device of current_devices) {
          if (current_device.id === device_data.id) {
            device = current_device;
            device._set_data_refreshed(device_data);
            break;
          }
        }
        // device not found => instance new device
        if (!device) {
          device = await Device.createDevice(this.platform, this, device_data);
        }
        this._devices.push(device);
      }
    } catch(e) {
      this.log.error('Unable to load devices from AirzoneCloud', e);
    }
    return this._devices;
  }

  /* Http GET to load devices */
  public async _get_device_relations() {
    this.log.debug('get_device_relations()');
    const response = await this._get(API_DEVICE_RELATIONS);
    return response.device_relations;
  }

  /* Http GET to load systems */
  public async _get_systems(device_id) {
    this.log.debug(`get_systems(device_id=${device_id})`);
    return (await this._get(API_SYSTEMS, {'device_id': device_id})).systems;
  }

  /* Http GET to load zones */
  public async _get_zones(system_id) {
    this.log.debug(`get_zones(system_id=${system_id})`);
    return (await this._get(API_ZONES, {'system_id': system_id})).zones;
  }

  /* Http POST to send an event */
  public async _send_event(payload) {
    this.log.debug(`Send event with payload: ${JSON.stringify(payload)}`);
    try {
      const result = await this._post(API_EVENTS, payload);
      this.log.debug(`Result event: ${JSON.stringify(result)}`);
      return result;
    } catch(e) {
      this.log.error('Unable to send event to AirzoneCloud');
    }
  }

  /* Do a http GET request on an api endpoint */
  private async _get(api_endpoint: string, params={}) {
    params['format'] = 'json';

    return await this._request('GET', api_endpoint, params);
  }

  /* Do a http POST request on an api endpoint */
  private async _post (api_endpoint: string, payload={}) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json, text/plain, */*',
    };

    return await this._request('POST', api_endpoint, {}, headers, payload);
  }

  private async _request(method: string, api_endpoint: string, params={}, headers={}, json?) {
    // generate url with auth
    params['user_email'] = this._username;
    params['user_token'] = this._token ? this._token : await this._login();
    const url = new URL(`${api_endpoint}/?${new URLSearchParams(params)}`, this._base_url);

    // set body length and host
    if (method === 'POST' && json) {
      json = JSON.stringify(json!);
      headers['Content-Length'] = json!.length.toString();
      headers['Host'] = url.host;
    }

    // set user agent
    headers['User-Agent'] = this._user_agent;

    const options = {
      url: url,
      method: method,
      headers: headers,
      body: json,
    };
    this.log.debug(`Request: ${options.method} ${options.url}`);
    const response = await fetch(options.url, options);
    if (response && response.ok) {
      const data = await response.json();
      this.log.debug(`Response: ${JSON.stringify(data)}`);
      return data;
    } else {
      this.log.error(`Error calling to AirzoneCloud. Status: ${response.status} ${response.statusText}`);
      this.log.debug(`Response ${JSON.stringify(response)} for Request ${JSON.stringify(options)}`);//debug
    }
  }
}