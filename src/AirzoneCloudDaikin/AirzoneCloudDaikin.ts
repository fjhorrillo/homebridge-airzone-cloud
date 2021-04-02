/**
 * AirzoneCloud: represent your AirzoneCloud account. Contains a list of your devices.
 */

import { AirzoneCloudHomebridgePlatform } from '../platform';

import { Logger } from 'homebridge';
import fetch = require('node-fetch');

import { API_LOGIN, API_INSTALLATION_RELATIONS, API_DEVICES, API_EVENTS } from './contants';
import { Installation, Device } from '.';
import { URL, URLSearchParams } from 'url';

/* Allow to connect to AirzoneCloudDaikin API */
export class AirzoneCloudDaikin {
  private log: Logger;
  private _username: string;
  private _password: string;
  private _user_agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile';
  private _base_url = new URL('https://dkn.airzonecloud.com');
  private _token?: string;
  private _installations: Installation[] = [];

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
  public static async createAirzoneCloudDaikin(
    platform: AirzoneCloudHomebridgePlatform,
    username: string,
    password: string,
    user_agent: string,
    base_url: string,
  ): Promise<AirzoneCloudDaikin> {
    // constructor
    const airzoneCloudDaikin = new AirzoneCloudDaikin(platform, username, password, user_agent, base_url);

    // login
    await airzoneCloudDaikin._login();
    // load devices
    await airzoneCloudDaikin._load_installations();

    return airzoneCloudDaikin;
  }

  /*
   * getters
   */

  /* Get installations list (same order as in app) */
  get installations(): Installation[] {
    return this._installations;
  }

  /* Get all devices from all installations (same order as in app) */
  get all_devices(): Device[] {
    const result: Device[] = [];
    for (const installation of this.installations) {
      for (const device of installation.devices) {
        result.push(device);
      }
    }
    return result;
  }

  /*
   * Refresh
   */

  /* Refresh installations */
  public async refresh_installations() {
    await this._load_installations();
  }

  /*
   * private
   */

  /* Login to Daikin AirzoneCloud and return token */
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
      this.log.error(`Unable to login to Daikin AirzoneCloud. Request ${JSON.stringify(options)} ${JSON.stringify(response)}`);
    }
  }

  /* Load all installations for this account */
  public async _load_installations(): Promise<Installation[]> {
    const current_installations = this._installations;
    this._installations = [];
    try {
      for (const installation_relation of await this._get_installation_relations()) {
        this.log.debug(`installation_relations ${JSON.stringify(installation_relation)}`);
        const installation_data = installation_relation.installation;
        let installation: Installation | undefined;
        // search installation in current_installations (if where are refreshing installations)
        for (const current_installation of current_installations) {
          if (current_installation.id === installation_data.id) {
            installation = current_installation;
            installation._set_data_refreshed(installation_data);
            break;
          }
        }
        // installation not found => instance new installation
        if (!installation) {
          installation = await Installation.createInstallation(this.platform, this, installation_data);
        }
        this._installations.push(installation);
      }
    } catch(e) {
      this.log.error('Unable to load installations from AirzoneCloud', e);
    }
    return this._installations;
  }

  /* Http GET to load installations relations */
  public async _get_installation_relations() {
    this.log.debug('get_installation_relations()');
    const response = await this._get(API_INSTALLATION_RELATIONS);
    return response.installation_relations;
  }

  /* Http GET to load devices */
  public async _get_devices(installation_id) {
    this.log.debug(`get_devices(installation_id=${installation_id})`);
    return (await this._get(API_DEVICES, {'installation_id': installation_id})).devices;
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