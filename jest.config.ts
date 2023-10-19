import type { Config } from "@jest/types"
import config from "config";

const jestconfig: Config.InitialOptions = {
  preset: "ts-jest",
  testEnvironment: "node",
  verbose: true,
  automock: false,
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  transform: { "^.+\\.(ts|tsx)$": "ts-jest"},
  testMatch: [ "**/test/*.+(ts|tsx)"],
  moduleDirectories: ["node_modules", "src"],
  moduleNameMapper: {
    "^(\\.\\.?\\/.+)\\.js$": "$1",
  },
  testEnvironmentOptions: {
    "jest-environment-node": {
      "NODE_ENV": config.get('environment')
    }
  },
}
export default jestconfig