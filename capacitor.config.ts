import type { CapacitorConfig } from "@capacitor/cli";

// Store identity lives in native/app.json so the Capacitor config, the
// generated native projects and the store submission checklist cannot drift
// apart. See scripts/apply-native-config.mjs.
import app from "./native/app.json";

const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.appName,
  webDir: ".output/public",
  ios: { contentInset: "always" },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
    },
  },
};

export default config;
