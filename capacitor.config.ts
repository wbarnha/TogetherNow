import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.togethernow",
  appName: "Together Now",
  webDir: ".output/public",
  ios: { contentInset: "always" },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
    },
  },
};

export default config;
