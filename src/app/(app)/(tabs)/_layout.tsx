import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { DesignTokens, resolveThemedColor } from '@/constants/design-tokens';

export default function TabsLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor:
          scheme === 'dark' ? DesignTokens.color.persimmon : DesignTokens.color.persimmonDeep,
        tabBarInactiveTintColor: resolveThemedColor(DesignTokens.color.inkMuted, scheme),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: 'Home',
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="cookbook"
        options={{
          tabBarLabel: 'Cookbook',
          tabBarButtonTestID: 'tab-cookbook',
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'notebook' : 'notebook-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="fridge"
        options={{
          tabBarLabel: 'Fridge',
          tabBarButtonTestID: 'tab-fridge',
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'fridge' : 'fridge-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="shopping"
        options={{
          tabBarLabel: 'Shopping',
          tabBarButtonTestID: 'tab-shopping',
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'cart' : 'cart-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ focused, color, size }) => (
            <MaterialCommunityIcons
              name={focused ? 'cog' : 'cog-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
