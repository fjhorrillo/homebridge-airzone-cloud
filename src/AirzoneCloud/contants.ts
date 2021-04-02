/**
 * There are the name of the enpoints for Airzone Cloud API.
 */
export const API_LOGIN = '/users/sign_in';
export const API_DEVICE_RELATIONS = '/device_relations';
export const API_SYSTEMS = '/systems';
export const API_ZONES = '/zones';
export const API_EVENTS = '/events';

// 2020-04-18: extracted from https://airzonecloud.com/assets/application-506494af86e686bf472b872d02048b42.js

export const MODES_CONVERTER = {
  '0': {'name': 'stop', 'type': 'none', 'description': 'Stop'},
  '1': {'name': 'cool-air', 'type': 'cold', 'description': 'Air cooling'},
  '2': {'name': 'heat-radiant', 'type': 'heat', 'description': 'Radiant heating'},
  '3': {'name': 'ventilate', 'type': 'cold', 'description': 'Ventilate'},
  '4': {'name': 'heat-air', 'type': 'heat', 'description': 'Air heating'},
  '5': {'name': 'heat-both', 'type': 'heat', 'description': 'Combined heating'},
  '6': {'name': 'dehumidify', 'type': 'heat', 'description': 'Dry'},
  '7': {'name': 'not_exit', 'type': 'none', 'description': ''},
  '8': {'name': 'cool-radiant', 'type': 'cold', 'description': 'Radiant cooling'},
  '9': {'name': 'cool-both', 'type': 'cold', 'description': 'Combined cooling'},
};

export const SCHEDULE_MODES_CONVERTER = {
  '0': {'name': '', 'description': ''},
  '1': {'name': 'stop', 'description': 'Stop'},
  '2': {'name': 'ventilate', 'description': 'Ventilate'},
  '3': {'name': 'cool-air', 'description': 'Air cooling'},
  '4': {'name': 'heat-air', 'description': 'Air heating'},
  '5': {'name': 'heat-radiant', 'description': 'Radiant heating'},
  '6': {'name': 'heat-both', 'description': 'Combined heating'},
  '7': {'name': 'dehumidify', 'description': 'Dry'},
  '8': {'name': 'cool-radiant', 'description': 'Radiant cooling'},
  '9': {'name': 'cool-both', 'description': 'Combined cooling'},
};

export const VELOCITIES_CONVERTER = {
  '0': {'name': 'auto', 'description': 'Auto'},
  '1': {'name': 'velocity-1', 'description': 'Low speed'},
  '2': {'name': 'velocity-2', 'description': 'Medium speed'},
  '3': {'name': 'velocity-3', 'description': 'High speed'},
};

export const AIRFLOW_CONVERTER = {
  '0': {'name': 'airflow-0', 'description': 'Silence'},
  '1': {'name': 'airflow-1', 'description': 'Standard'},
  '2': {'name': 'airflow-2', 'description': 'Power'},
};

export const ECO_CONVERTER = {
  '0': {'name': 'eco-off', 'description': 'Eco off'},
  '1': {'name': 'eco-m', 'description': 'Eco manual'},
  '2': {'name': 'eco-a', 'description': 'Eco A'},
  '3': {'name': 'eco-aa', 'description': 'Eco A+'},
  '4': {'name': 'eco-aaa', 'description': 'Eco A++'},
};

export const SCENES_CONVERTER = {
  '0': {
    'name': 'stop',
    'description': 'The air-conditioning system will remain switched off regardless of the demand status of any zone, all the motorized \
    dampers will remain opened',
  },
  '1': {
    'name': 'confort',
    'description': 'Default and standard user mode. The desired set point temperature can be selected using the predefined temperature \
    ranges',
  },
  '2': {
    'name': 'unocupied',
    'description': 'To be used when there is no presence detected for short periods of time. A more efficient set point temperature will \
    be set. If the thermostat is activated, the zone will start running in comfort mode',
  },
  '3': {
    'name': 'night',
    'description': 'The system automatically changes the set point temperature 0.5\xba C/1\xba F every 30 minutes in up to 4 increments of \
    2\xba C/4\xba F in 2 hours. When cooling, the system increases the set point temperature; when heating, the system decreases the set \
    point temperature',
  },
  '4': {
    'name': 'eco',
    'description': 'The range of available set point temperatures change for more efficient operation',
  },
  '5': {
    'name': 'vacation',
    'description': 'This mode feature saves energy while the user is away for extended periods of time',
  },
};