import { Tabs } from 'expo-router';
import { useColorScheme } from 'react-native';

import { TabBarIcon } from '@/components/tab-bar-icon';
import { DesignTokens, resolveThemedColor } from '@/constants/design-tokens';

export default function TabsLayout() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: DesignTokens.color.accent,
        tabBarInactiveTintColor: resolveThemedColor(DesignTokens.color.inkBody, scheme),
        tabBarStyle: {
          backgroundColor: 'rgba(255,248,249,0.95)',
          borderTopColor: DesignTokens.color.inkPlaceholder,
          borderTopWidth: 1,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarLabel: 'Recipes',
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ focused, color, size }) => (
            <TabBarIcon
              name={focused ? 'home' : 'home-outline'}
              focused={focused}
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
            <TabBarIcon
              name={focused ? 'notebook' : 'notebook-outline'}
              focused={focused}
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
            <TabBarIcon
              name={focused ? 'fridge' : 'fridge-outline'}
              focused={focused}
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
            <TabBarIcon
              name={focused ? 'cart' : 'cart-outline'}
              focused={focused}
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
            <TabBarIcon
              name={focused ? 'cog' : 'cog-outline'}
              focused={focused}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
