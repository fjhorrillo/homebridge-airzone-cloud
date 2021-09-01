/**
 * AirzoneCloud: represent the AirzoneCloud Socket.
 */

import { AirzoneCloudHomebridgePlatform } from './platform';

import { io, Socket } from 'socket.io-client';

import { API_WEBSOCKETS } from './constants';

/* Allow to connect to AirzoneCloud Socket */
export class AirzoneCloudSocket {
  private userSocket: Socket;
  private static reconnectAttemps = 0;

  /* Create websocket to AirzoneCloud */
  constructor(
    private readonly platform: AirzoneCloudHomebridgePlatform,
    private readonly base_url: string,
    private jwt: string,
  ) {
    // Create socket
    this.userSocket = io(this.base_url, {
      path: API_WEBSOCKETS,
      secure: true,
      query: {
        jwt,
      },
      transports: ['websocket'],
      transportOptions: {
        polling: {
          extraHeaders: {
            'Authorization': `Bearer ${jwt}`,
          },
        },
      },
      autoConnect: false,
    });
    this.platform.log.debug(`Websocket: ${JSON.stringify(this.userSocket.io.opts)}`);
  }

  /* Starting to listen to the events of an installation */
  public async listenInstallation(installationId: string) {
    await this.clearListeners();
    return new Promise ((resolve, reject) => {
      this.platform.log.info(`\x1b[35m[Websocket]\x1b[0m \x1b[34m⬆\x1b[0m \x1b[33m["listen_installation", "${installationId}"]\x1b[0m`);
      this.userSocket.emit('listen_installation', installationId, async error => {
        // error is the response callback, it will be null if everything went well or an error in another case
        if(error !== null) {
          switch(error._id) {
            case 'tooManyConnections':
              this.platform.log.error('Error in listenInstallation');
              return reject(new Error('tooManyConnections'));
            case 'notAuthorized':
              return reject(new Error('notAuthorized'));
            default:
              this.platform.log.error(`Error in listenInstallation ${error}`);
              AirzoneCloudSocket.reconnectAttemps++;
              if(AirzoneCloudSocket.reconnectAttemps <= 5) {
                this.platform.log.info(`Reconnection attempt ${AirzoneCloudSocket.reconnectAttemps}`);

                this.disconnectSocket();
                await this.connectUserSocket(this.jwt);
                await this.listenInstallation(installationId);
              } else {
                AirzoneCloudSocket.reconnectAttemps = 0; // The attempt counter is reset
                this.platform.log.error('Error trying to reconnect from listenInstallation');
              }
          }
        } else {
          AirzoneCloudSocket.reconnectAttemps = 0; // If no error is obtained, the attempt counter is reset
        }
        return resolve(true);
      });
    });
  }

  /* Stop listening for events from an installation (free socket traffic) */
  public async clearListeners() {
    return new Promise ((resolve, reject) => {
      this.platform.log.info('\x1b[35m[Websocket]\x1b[0m \x1b[34m⬆\x1b[0m \x1b[33m["clear_listeners"]\x1b[0m');
      this.userSocket.emit('clear_listeners', error => {
        if(error !== null) {
          this.platform.log.error(`Error sending 'clear_listeners' message. ${error}`);
          return reject(new Error(error));
        }
        return resolve(true);
      });
    });
  }

  /* Connect from user socket */
  public async connectUserSocket(jwt?: string) {
    return new Promise( (resolve) => {
      // update jwt token
      if (jwt) {
        this.jwt = jwt;
        this.userSocket.io.opts.query = { jwt };
        this.userSocket.io.opts.transportOptions = {
          polling: {
            extraHeaders: {
              'Authorization': `Bearer ${jwt}`,
            },
          },
        };
        this.platform.log.debug(`Websocket: ${JSON.stringify(this.userSocket.io.opts)}`);
      }
      // connect to the socket
      this.userSocket.connect();

      // register a catch-all listener
      this.userSocket.onAny(async (event, ...args) => {
        this.platform.log.info('\x1b[35m[Websocket]\x1b[0m \x1b[31m⬇\x1b[0m ' +
          `\x1b[33m${args?JSON.stringify([event].concat(args)):[event]}\x1b[0m`);
      });

      this.userSocket.on('connect', async () => {
        this.platform.log.info('Websocket connected');
        resolve(true);
      });
    });
  }

  /* Disconnect from user socket */
  public disconnectSocket() {
    this.platform.log.info('Disconnect socket lanzado', this.userSocket);
    this.userSocket.close();
  }

}
