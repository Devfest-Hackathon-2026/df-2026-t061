export default {
  devIndicators: false,
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@google-cloud/firestore", "google-auth-library"],
  outputFileTracingExcludes: {
    "/*": [".workday-local/**/*", ".workday-experiment/**/*", ".env*"],
  },
};
