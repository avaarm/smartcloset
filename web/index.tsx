/**
 * Web entry point — mounts the React Native app into the DOM via
 * react-native-web's AppRegistry.
 */

import { AppRegistry } from 'react-native';
import App from '../App';

AppRegistry.registerComponent('smartcloset', () => App);
AppRegistry.runApplication('smartcloset', {
  rootTag: document.getElementById('root'),
});
