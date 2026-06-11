import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { DesignTokens, resolveThemedColor } from '@/constants/design-tokens';

export default function TabsLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: DesignTokens.color.persimmonDeep,
        tabBarInactiveTintColor: resolveThemedColor(DesignTokens.color.inkMuted, scheme),
      }}
    >
      <Tabs.Screen name="home" options={{ tabBarLabel: 'Home', tabBarButtonTestID: 'tab-home' }} />
      <Tabs.Screen
        name="cookbook"
        options={{ tabBarLabel: 'Cookbook', tabBarButtonTestID: 'tab-cookbook' }}
      />
      <Tabs.Screen
        name="fridge"
        options={{ tabBarLabel: 'Fridge', tabBarButtonTestID: 'tab-fridge' }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ tabBarLabel: 'Shopping', tabBarButtonTestID: 'tab-shopping' }}
      />
      <Tabs.Screen
        name="settings"
        options={{ tabBarLabel: 'Settings', tabBarButtonTestID: 'tab-settings' }}
      />
    </Tabs>
  );
}
