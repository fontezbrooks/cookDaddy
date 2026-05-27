import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
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
