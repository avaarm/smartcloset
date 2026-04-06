/**
 * Web shim for react-native-pager-view.
 * Used by @react-navigation/material-top-tabs.
 * On web, tabs render children directly (no swiping).
 */

import React from 'react';
import { View, ScrollView } from 'react-native';

const PagerView: React.FC<any> = ({ children, style, ...rest }) => (
  <View style={[{ flex: 1 }, style]} {...rest}>
    {children}
  </View>
);

export default PagerView;
