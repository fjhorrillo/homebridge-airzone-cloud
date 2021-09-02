/**
 * AirzoneCloud: represent the AirzoneCloud API.
 */

import { AirzoneCloudHomebridgePlatform } from './platform';

import fetch = require('node-fetch');
import { AirzoneCloudSocket } from './AirzoneCloudSocket';

import { API_LOGIN, API_REFRESH_TOKEN, API_INSTALLATIONS, API_DEVICES, API_USER } from './constants';
import { URL, URLSearchParams } from 'url';
import { Installation, Webserver, Units, DeviceConfig, User, LogedUser, DeviceMode, SetpointAir } from './interface/airzonecloud';

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
  private _token!: string;
  private _refreshToken!: string;
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
  ): Promise<AirzoneCloudApi> {
    // constructor
    const airzoneCloudApi = new AirzoneCloudApi(platform, username, password, user_agent, base_url);

    // login
    await airzoneCloudApi._login();

    return airzoneCloudApi;
  }

  /*
   * private
   */

  /* Login to AirzoneCloud and return token */
  private async _login(): Promise<LogedUser> {
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
      this.platform.log.error(`Error in login ${error}`);
      throw new Error(`Error in login ${error}`);
    }
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
    this.platform.log.debug(`Request: ${options.method} ${options.url}` +
      `${json?` body=${JSON.stringify(JSON.parse(options.body), this.obfusked)}`:''}`);
    const response = await fetch(options.url, options);
    if (response && response.ok) {
      if (response.status !== 204) {
        const data = await response.json();
        this.platform.log.debug(`Response: ${JSON.stringify(data)}`);
        return data;
      }
    } else if (response.status === 401 && this._refreshToken) {
      const data = await this._get(`${API_REFRESH_TOKEN}/${this._refreshToken!}`);
      if (data.token) {
        this._token = data.token;
        this._refreshToken = data.refreshToken;
        this.platform.log.info('Refreshed token successfully');

        // reconect websocket
        this._airzoneCloudSocket.disconnectSocket();
        await this._airzoneCloudSocket.connectUserSocket(data.token);
        this.platform.log.info('Websocket reconnected');

        return await this._request(method, api_endpoint, params, headers, json);
      }
    } else {
      this.platform.log.error(`Error calling to AirzoneCloud. Status: ${response.status} ${response.statusText} ` +
        `${response.status === 400?` Response: ${JSON.stringify(await response.json())}`:''}`);
      this.platform.log.debug(`Response: ${JSON.stringify(response)} for Request: ${JSON.stringify(options, this.obfusked)}`);
      throw new Error(`Status: ${response.status} ${response.statusText}`);
    }
  }

  /* Allow obfusk sensitive data */
  private obfusked(key, value): string {
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
  async getInstallations(filterParam?: string, filterValue?: string, items?: number, page?: number): Promise<Installation[]> {
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
      this.platform.log.error(`Error in getInstallations ${error}`);
      throw new Error(`Error in getInstallations ${error}`);
    }
  }

  /**
   * Gets the data and structure of an installation
   *
   * @param installationId - Identificador de la installación
   * @return {Installation} - Datos de la estructura de la instalación y sus zonas parseados y validados
   */
  async getInstallation(installationId: string): Promise<Installation> {
    try {
      await this._airzoneCloudSocket.listenInstallation(installationId);
      return await this._get(`${API_INSTALLATIONS}/${installationId}`);
    } catch (error) {
      this.platform.log.error(`Error in getInstallation ${error}`);
      throw new Error(`Error in getInstallation ${error}`);
    }
  }

  /**
   * Gets all the webservers belonging to an installation
   *
   * @param {String} installationId - id de la instalación
   * @return {Webserver[]} - lista de webservers
   */
  async getWebservers(installationId): Promise<Webserver[]> {
    const params = {
      'installation_id': installationId,
    };

    try {
      return await this._get(`${API_DEVICES}/wwss`, params);
    } catch (error) {
      this.platform.log.error(`Error in getWebservers ${error}`);
      throw new Error(`Error in getWebservers ${error}`);
    }
  }

  /**
   * Gets the status of a webserver, to display in the Settings window within a zone
   *
   * @param {String} installationId - id de la instalación
   * @param {String} webserverId - id del webserver
   * @return {Webserver} - webservers
   */
  async getWebserverStatus(installationId, webserverId, devices = false): Promise<Webserver> {
    const params = {
      'installation_id': installationId,
    };
    if(devices) {
      params['devices'] = 1;
    }

    try {
      const webserver = await this._get(`${API_DEVICES}/ws/${webserverId}/status`, params);
      webserver._id = webserverId;
      return webserver;
    } catch (error) {
      this.platform.log.error(`Error in getWebserverStatus ${error}`);
      throw new Error(`Error in getWebserverStatus ${error}`);
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
  async getDeviceConfig(deviceId: string, installationId: string, userUnits: Units, type = 'advanced'): Promise<DeviceConfig> {
    const params = {
      'installation_id': installationId,
    };
    if(type) {
      params['type'] = type;
    }

    try {
      return await this._get(`${API_DEVICES}/${deviceId}/config`, params);
    } catch (error) {
      this.platform.log.error(`Error in getDeviceConfig ${error}`);
      throw new Error(`Error in getDeviceConfig ${error}`);
    }
  }

  public async getUser(): Promise<User> {
    return (await this._get(API_USER));
  }

  public async setUnits(units: Units) {
    const payload = {
      'units': units.valueOf(),
    };

    return await this._patch(`${API_USER}/config`, payload);
  }

  public async setDeviceMode(installationId: string, deviceId: string, mode: DeviceMode) {
    const payload = {
      'param': 'mode',
      'value': mode.valueOf(),
      'installation_id': installationId,
    };

    return await this._patch(`${API_DEVICES}/${deviceId}`, payload);
  }

  public async setTemperature(installationId: string, deviceId: string, mode: DeviceMode, temperature: number, units: Units) {
    let setpoint_air = SetpointAir.STOP;
    switch (mode) {
      case DeviceMode.STOP:
        setpoint_air = SetpointAir.STOP;
        break;
      case DeviceMode.AUTO:
        setpoint_air = SetpointAir.AUTO;
        break;
      case DeviceMode.COOLING:
        setpoint_air = SetpointAir.COOL;
        break;
      case DeviceMode.HEATING:
        setpoint_air = SetpointAir.HEAT;
        break;
      case DeviceMode.FAN:
        setpoint_air = SetpointAir.VENT;
        break;
      case DeviceMode.DRY:
        setpoint_air = SetpointAir.DRY;
        break;
    }
    const payload = {
      'param': setpoint_air,
      'value': temperature,
      'installation_id': installationId,
      'opts': {
        'units': units,
      },
    };

    return await this._patch(`${API_DEVICES}/${deviceId}`, payload);
  }

}
