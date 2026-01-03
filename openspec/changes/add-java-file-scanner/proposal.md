# Change: Add Java File Scanner Script

## Why
需要创建一个 Node.js 脚本来扫描 Java 源文件，根据配置的注解和接口规则识别符合条件的服务类，支持入口服务发现等场景。

## What Changes
- 在 `scripts/` 目录下创建 `scan-java-files.js` 扫描脚本
- 创建配套的 JSON 配置文件 `scripts/scan-config.json` 定义扫描规则
- 使用 `java-parser` 包解析 Java 源文件 AST
- 支持注解扫描和接口实现扫描（包括间接实现）
- 排除抽象类
- 输出扫描结果：文件数量和列表

## Impact
- Affected specs: java-file-scanner (new capability)
- Affected code: 新增 `scripts/scan-java-files.js` 和 `scripts/scan-config.json`
