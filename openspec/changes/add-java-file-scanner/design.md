# Design: Java File Scanner Script

## Overview
使用 Node.js 和 java-parser 库实现 Java 源文件扫描工具。

## Technical Decisions

### Dependencies
- **java-parser@3.0.1**: 用于解析 Java 源代码为 AST，支持注解和类型检查
- **Node.js built-in modules**: `fs`, `path`, `glob` (或手写递归遍历)

### Configuration File Structure (`scan-config.json`)
```json
{
  "scanDir": "./src/main/java",
  "annotations": [
    "org.springframework.stereotype.Service",
    "org.springframework.web.bind.annotation.RestController"
  ],
  "interfaces": [
    "com.example.service.MyInterface"
  ],
  "excludeAbstract": true
}
```

### Scanning Logic
1. **文件发现**: 递归遍历扫描目录，收集所有 `.java` 文件
2. **AST 解析**: 使用 java-parser 解析每个 Java 文件
3. **注解检测**: 遍历 Class/Interface 声明上的注解
4. **接口检测**:
   - 直接实现：检查 `implements` 子句
   - 间接实现：递归检查父类/父接口实现的接口
5. **排除抽象类**: 检查 `abstract` 修饰符
6. **结果输出**: 返回匹配的 Java 文件路径列表和数量

### Interface Inheritance Traversal
```javascript
// 伪代码：间接接口检测
function implementsInterface(node, targetInterface, allFiles) {
  const direct = node.implementsInterfaces
    .some(i => i.name.toString() === targetInterface);

  if (direct) return true;

  // 检查父接口是否实现目标接口
  for (const iface of node.implementsInterfaces) {
    const ifaceNode = findClassDeclaration(iface.name.toString(), allFiles);
    if (ifaceNode && implementsInterface(ifaceNode, targetInterface, allFiles)) {
      return true;
    }
  }
  return false;
}
```

### Output Format
```javascript
{
  "count": 5,
  "files": [
    "/path/to/File1.java",
    "/path/to/File2.java"
  ]
}
```
