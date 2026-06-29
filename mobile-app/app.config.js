require("dotenv").config();

const app = require("./app.json");

module.exports = {
  expo: {
    ...app.expo,
    extra: {
      apiUrl: process.env.EXPO_PUBLIC_API_URL || null,
      apiHost: process.env.EXPO_PUBLIC_API_HOST || null,
      apiPort: process.env.EXPO_PUBLIC_API_PORT || null,
    },
  },
};
