
export default ({ config }) => {
  const IS_DEV = process.env.APP_VARIANT === "development";

  return {
    ...config,

    name: IS_DEV ? "RouteX Dev" : config.name,

    android: {
      ...config.android,

      package: IS_DEV
        ? `${config.android.package}.dev`
        : config.android.package,
    },
  };
};
