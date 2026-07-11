const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm 워크스페이스: packages/tokens, packages/shared 를 Metro가 감시·해석할 수 있게 한다.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// pnpm은 각 패키지가 자기 전용 node_modules(심링크)로 의존성을 갖는 구조라, 계층적 탐색을
// 꺼두면(disableHierarchicalLookup) nativewind 내부의 react-native-css-interop 같은
// 중첩 의존성을 못 찾는다. 심링크 추적만 켜고 계층적 탐색은 그대로 둔다.
config.resolver.unstable_enableSymlinks = true;

module.exports = withNativeWind(config, { input: "./src/global.css" });
