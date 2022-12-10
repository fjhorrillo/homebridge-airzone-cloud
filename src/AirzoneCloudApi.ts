/**
 * AirzoneCloud: represent the AirzoneCloud API.
 */

import { AirzoneCloudHomebridgePlatform } from './platform';

import fetch from 'node-fetch';
import { AirzoneCloudSocket } from './AirzoneCloudSocket';

import { API_LOGIN, API_REFRESH_TOKEN, API_INSTALLATIONS, API_DEVICES, API_USER } from './constants';
import { URL, URLSearchParams } from 'url';
import { Installation, Webserver, Units, User, LogedUser, SetpointAir } from './interface/airzonecloud';
import { DeviceConfig, DeviceMode, DeviceStatus, Error } from './interface/airzonecloud';

enum HTTPMethod {
  POST = 'POST',
  GET = 'GET',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE'
}

/* Allow to connect to AirzoneCloud API */
export class AirzoneCloudApi {
  private _username: string;
  private _password: string;
  private _user_agent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile';
  private _base_url = 'https://m.airzonecloud.com';
  private _token?: string;
  private _refreshToken?: string;
  private _airzoneCloudSocket!: AirzoneCloudSocket;

  /* Initialize API connection */
  private constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    username: string,
    password: string,
    user_agent: string,
    base_url: string,
  ) {
    this._username = username;
    this._password = password;
    if (user_agent) {
      this._user_agent = user_agent!;
    }
    if (base_url) {
      this._base_url = base_url!;
    }
  }

  /* This is for syncronice initialization */
  public static async createAirzoneCloudApi(
    platform: AirzoneCloudHomebridgePlatform,
    username: string,
    password: string,
    user_agent: string,
    base_url: string,
  ): Promise<AirzoneCloudApi | undefined> {
    // constructor
    const airzoneCloudApi = new AirzoneCloudApi(platform, username, password, user_agent, base_url);

    // login
    if (await airzoneCloudApi._login()) {
      return airzoneCloudApi;
    }
  }

  /*
   * private
   */

  /* Login to AirzoneCloud and return token */
  private async _login(): Promise<LogedUser | undefined> {
    const payload = {
      'email': this._username,
      'password': this._password,
    };

    try {
      const user = await this._post(API_LOGIN, payload);
      this._token = user.token;
      this._refreshToken = user.refreshToken;
      this.platform.log.info(`Logged in successfully as ${user.email}`);

      // initialize websocket
      this._airzoneCloudSocket = new AirzoneCloudSocket(this.platform, this._base_url, user.token);
      await this._airzoneCloudSocket.connectUserSocket();

      return user;
    } catch (error) {
      this.platform.log.error(`Error in login. ${error}`);
      //throw new Error('Error in login');
    }
  }

  public async refreshToken(): Promise<string | undefined> {
    if (this._refreshToken) {
      const data = await this._get(`${API_REFRESH_TOKEN}/${this._refreshToken}`);
      if (data.token) {
        this._token = data.token;
        this._refreshToken = data.refreshToken;
        this.platform.log.info('Refreshed token successfully');

        return data.token;
      } else {
        this.platform.log.error(`Refreshed token failed. ${JSON.stringify(data)}`);
      }
    }
    return this._token = undefined;
  }

  /* Do a http GET request on an api endpoint */
  private async _get(api_endpoint: string, params={}) {
    return await this._request(HTTPMethod.GET, api_endpoint, params);
  }

  /* Do a http POST request on an api endpoint */
  private async _post(api_endpoint: string, payload={}) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json, text/plain, */*',
    };

    return await this._request(HTTPMethod.POST, api_endpoint, {}, headers, payload);
  }

  /* Do a http PATCH request on an api endpoint */
  private async _patch(api_endpoint: string, payload={}) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json, text/plain, */*',
    };

    return await this._request(HTTPMethod.PATCH, api_endpoint, {}, headers, payload);
  }

  /* Do a http PUT request on an api endpoint */
  private async _put(api_endpoint: string, payload={}) {
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json;charset=utf-8',
      'Accept': 'application/json, text/plain, */*',
    };

    return await this._request(HTTPMethod.PUT, api_endpoint, {}, headers, payload);
  }

  /* Do a http request on an api endpoint */
  private async _request(method: string, api_endpoint: string, params={}, headers={}, json?) {
    const url = new URL(`${api_endpoint}${Object.keys(params).length > 0?`/?${new URLSearchParams(params)}`:''}`, this._base_url);

    // set body length
    if (json) {
      json = JSON.stringify(json);
      headers['Content-Length'] = json.length.toString();
    }

    // set host
    headers['Host'] = url.host;

    // set user agent
    headers['User-Agent'] = this._user_agent;

    // add jwt authentication
    if (this._token) {
      headers['Authorization'] = `Bearer ${this._token}`;
    }

    const options = {
      url: url,
      method: method,
      headers: headers,
      body: json,
    };
    this.platform.log.debug(`\x1b[32m[Fetch]\x1b[0m \x1b[34m⬆\x1b[0m \x1b[33mRequest: ${options.method} ${options.url}` +
      `${json?` body=${JSON.stringify(JSON.parse(options.body), this._obfusked)}`:''}\x1b[0m`);
    const response = await fetch(options.url.toString(), options);
    if (response && response.ok) {
      if (response.status !== 204) {
        const data = await response.json();
        this.platform.log.debug(`\x1b[32m[Fetch]\x1b[0m \x1b[31m⬇\x1b[0m \x1b[33mResponse: ${JSON.stringify(data)}\x1b[0m`);
        return data;
      }
    } else if (response.status === 401 && this._refreshToken && (await this.refreshToken() || await this._login())) {
      // reconect websocket
      this._airzoneCloudSocket.disconnectSocket();
      await this._airzoneCloudSocket.connectUserSocket(this._token);
      this.platform.log.info('Websocket reconnected');

      return await this._request(method, api_endpoint, params, headers, json);
    } else {
      const data = await response.json() as Error;
      this.platform.log.error(`Error calling to AirzoneCloud. Status: ${response.status} ${response.statusText} ` +
        `${response.status === 400?` Response: ${JSON.stringify(data)}`:''}`);
      this.platform.log.debug(`\x1b[32m[Fetch]\x1b[0m \x1b[33m\x1b[31m⬇\x1b[0m \x1b[33mResponse: ${JSON.stringify(data)} for \x1b[0m` +
        `\x1b[34m⬆\x1b[0m \x1b[33mRequest: ${options.method} ${options.url}` +
        `${json?` body=${JSON.stringify(JSON.parse(options.body), this._obfusked)}`:''}\x1b[0m`);
      throw new Error(data.msg);
    }
  }

  /* Allow obfusk sensitive data */
  private _obfusked(key, value): string {
    if (key === 'password' && typeof value === 'string') {
      return value.replace(/./g, '*');
    }
    return value;
  }

  /*
   * public api
   */

  /**
   * Gets all installations
   *
   * @param {string} filterParam - Opcional: filtro a aplicar por 'city', 'country', 'mac' o 'name'
   * @param {string} filterValue - Req filterParam: El valor del filtro aplicado en el parámentro filterParam
   * @param {string} items - Opcional: Número de items a retornar (min: 1, max: 10)
   * @param {string} page - Opcional: Page to return of items
   * @return {Installation[]} - Datos de la instalación parseados y validados
   */
  async getInstallations(filterParam?: string, filterValue?: string, items?: number, page?: number): Promise<Installation[] | undefined> {
    const params = {};
    if (filterParam && filterValue) {
      params['filterParam'] = filterParam;
      params['filterValue'] = filterValue;
    }
    if (items) {
      params['items'] = items;
    }
    if (page) {
      params['page'] = page;
    }

    try {
      return (await this._get(API_INSTALLATIONS, params)).installations;
    } catch (error) {
      this.platform.log.error(`Error in getInstallations. ${error}`);
      //throw new Error('Error in getInstallations');
    }
  }

  /**
   * Gets the data and structure of an installation
   *
   * @param installationId - Identificador de la installación
   * @return {Installation} - Datos de la estructura de la instalación y sus zonas parseados y validados
   */
  async getInstallation(installationId: string): Promise<Installation | undefined> {
    try {
      const deviceStatus = await this._airzoneCloudSocket.listenInstallation(installationId);
      const installation = await this._get(`${API_INSTALLATIONS}/${installationId}`);
      for (const group of installation.groups || []) {
        for (const device of group.devices || []) {
          device.status = deviceStatus[device.device_id];
        }
      }
      return installation;
    } catch (error) {
      this.platform.log.error(`Error in getInstallation. ${error}`);
      //throw new Error('Error in getInstallation');
    }
  }

  /**
   * Gets all the webservers belonging to an installation
   *
   * @param {String} installationId - id de la instalación
   * @return {Webserver[]} - lista de webservers
   */
  async getWebservers(installationId): Promise<Webserver[] | undefined> {
    const params = {
      'installation_id': installationId,
    };

    try {
      return await this._get(`${API_DEVICES}/wwss`, params);
    } catch (error) {
      this.platform.log.error(`Error in getWebservers. ${error}`);
      //throw new Error('Error in getWebservers');
    }
  }

  /**
   * Gets the status of a webserver, to display in the Settings window within a zone
   *
   * @param {String} installationId - id de la instalación
   * @param {String} webserverId - id del webserver
   * @return {Webserver} - webservers
   */
  async getWebserverStatus(installationId, webserverId, devices = false): Promise<Webserver | undefined> {
    const params = {
      'installation_id': installationId,
    };
    if(devices) {
      params['devices'] = 1;
    }

    try {
      //await this._airzoneCloudSocket.listenWebserver(webserverId);
      const webserver = await this._get(`${API_DEVICES}/ws/${webserverId}/status`, params);
      webserver._id = webserverId;
      return webserver;
    } catch (error) {
      this.platform.log.error(`Error in getWebserverStatus. ${error}`);
      //throw new Error('Error in getWebserverStatus');
    }
  }

  /**
   * Gets the configuration information of a device
   *
   * @param {string} deviceId - ID del dispositivo
   * @param {string} installationId - ID de la instalación a la que pertenece
   * @param {string} type - Typo de configuración. Puede ser 'all', 'user' o 'advanced'. Por defecto es 'user'
   * @return {DeviceConfig} - configuracion del dispositivo
   */
  async getDeviceConfig(deviceId: string, installationId: string, type = 'advanced'): Promise<DeviceConfig | undefined> {
    const params = {
      'installation_id': installationId,
    };
    if(type) {
      params['type'] = type;
    }

    try {
      return await this._get(`${API_DEVICES}/${deviceId}/config`, params);
    } catch (error) {
      this.platform.log.error(`Error in getDeviceConfig. ${error}`);
      //throw new Error('Error in getDeviceConfig');
    }
  }

  /**
   * Gets the status of a device
   *
   * @param {string} deviceId - ID del dispositivo
   * @param {string} installationId - ID de la instalación a la que pertenece
   * @return {DeviceStatus} - status del dispositivo
   */
  async getDeviceStatus(deviceId: string, installationId: string): Promise<DeviceStatus | undefined> {
    const params = {
      'installation_id': installationId,
    };

    try {
      return await this._get(`${API_DEVICES}/${deviceId}/status`, params);
    } catch (error) {
      this.platform.log.error(`Error in getDeviceStatus. ${error}`);
      //throw new Error('Error in getDeviceStatus');
    }
  }

  public async getUser(): Promise<User | undefined> {
    try {
      return (await this._get(API_USER));
    } catch (error) {
      this.platform.log.error(`Error in getUser. ${error}`);
      //throw new Error('Error in getUser');
    }
  }

  public async setUnits(units: Units) {
    const payload = {
      'units': units.valueOf(),
    };

    try {
      return await this._patch(`${API_USER}/config`, payload);
    } catch (error) {
      this.platform.log.error(`Error in setUnits. ${error}`);
      //throw new Error('Error in setUnits');
    }
  }

  public async setDevicePower(installationId: string, deviceId: string, power: boolean) {
    const payload = {
      'param': 'power',
      'value': power,
      'installation_id': installationId,
    };

    try {
      return await this._patch(`${API_DEVICES}/${deviceId}`, payload);
    } catch (error) {
      this.platform.log.error(`Error in setDevicePower. ${error}`);
      //throw new Error('Error in setDevicePower');
    }
  }

  public async setDeviceMode(installationId: string, deviceId: string, mode: DeviceMode) {
    const payload = {
      'param': 'mode',
      'value': mode.valueOf(),
      'installation_id': installationId,
    };

    try {
      return await this._patch(`${API_DEVICES}/${deviceId}`, payload);
    } catch (error) {
      this.platform.log.error(`Error in setDeviceMode. ${error}`);
      //throw new Error('Error in setDeviceMode');
    }
  }

  public async setGroupMode(installationId: string, groupId: string, mode: DeviceMode) {
    const payload = {
      'params': {
        'mode': mode.valueOf(),
      },
    };

    try {
      return await this._put(`${API_INSTALLATIONS}/${installationId}/group/${groupId}`, payload);
    } catch (error) {
      this.platform.log.error(`Error in setGroupMode. ${error}`);
      //throw new Error('Error in setGroupMode');
    }
  }

  public async setTemperature(installationId: string, deviceId: string, mode: DeviceMode, temperature: number, units: Units) {
    const payload = {
      'param': (function(mode: DeviceMode): string {
        switch (mode) {
          case DeviceMode.STOP: return SetpointAir.STOP;
          case DeviceMode.AUTO: return SetpointAir.AUTO;
          case DeviceMode.COOLING: return SetpointAir.COOL;
          case DeviceMode.HEATING: return SetpointAir.HEAT;
          case DeviceMode.FAN: return SetpointAir.VENT;
          case DeviceMode.DRY: return SetpointAir.DRY;
          default: return SetpointAir.STOP;
        }
      })(mode),
      'value': temperature,
      'installation_id': installationId,
      'opts': {
        'units': units,
      },
    };

    try {
      return await this._patch(`${API_DEVICES}/${deviceId}`, payload);
    } catch (error) {
      this.platform.log.error(`Error in setTemperature. ${error}`);
      //throw new Error('Error in setTemperature');
    }
  }

  public allOtherOff(deviceId: string): boolean {
    return this._airzoneCloudSocket.allOtherOff(deviceId);
  }

}
