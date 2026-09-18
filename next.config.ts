import type { NextConfig } from "next";
import CopyWebpackPlugin from "copy-webpack-plugin";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      const cesiumSource = path.join(
        process.cwd(),
        "node_modules/cesium/Build/Cesium"
      );

      config.plugins.push(
        new CopyWebpackPlugin({
          patterns: [
            {
              from: path.join(cesiumSource, "Workers"),
              to: "static/cesium/Workers",
            },
            {
              from: path.join(cesiumSource, "ThirdParty"),
              to: "static/cesium/ThirdParty",
            },
            {
              from: path.join(cesiumSource, "Assets"),
              to: "static/cesium/Assets",
            },
            {
              from: path.join(cesiumSource, "Widgets"),
              to: "static/cesium/Widgets",
            },
          ],
        })
      );
    }

    return config;
  },
};

export default nextConfig;