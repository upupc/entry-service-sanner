#!/usr/bin/env node

/**
 * Java File Scanner
 *
 * Scans Java source files in a directory based on configured annotations and interfaces.
 * Outputs matched file count and list.
 *
 * Usage: node scan-java-files.js [--config <path>] [--dir <path>]
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('java-parser');

class JavaFileScanner {
  constructor(config) {
    this.config = config;
    this.annotations = config.annotations || [];
    this.interfaces = config.interfaces || [];
    this.excludeAbstract = config.excludeAbstract !== false;
    this.scanDir = config.scanDir || './src/main/java';
    this.parsedFiles = new Map(); // Cache parsed AST
  }

  /**
   * Recursively find all .java files in directory
   */
  findJavaFiles(dir) {
    const javaFiles = [];
    const walkDir = (currentPath) => {
      if (!fs.existsSync(currentPath)) return;
      const stats = fs.statSync(currentPath);
      if (stats.isDirectory()) {
        const entries = fs.readdirSync(currentPath);
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry);
          if (fs.statSync(fullPath).isDirectory()) {
            if (entry !== 'target' && entry !== 'build' && !entry.startsWith('.')) {
              walkDir(fullPath);
            }
          } else if (entry.endsWith('.java')) {
            javaFiles.push(fullPath);
          }
        }
      } else if (stats.isFile() && currentPath.endsWith('.java')) {
        javaFiles.push(currentPath);
      }
    };
    walkDir(dir);
    return javaFiles;
  }

  /**
   * Parse Java file and return AST
   */
  parseJavaFile(filePath) {
    if (this.parsedFiles.has(filePath)) {
      return this.parsedFiles.get(filePath);
    }
    try {
      const code = fs.readFileSync(filePath, 'utf-8');
      const ast = parse(code);
      this.parsedFiles.set(filePath, ast);
      return ast;
    } catch (error) {
      console.error(`Error parsing ${filePath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get class/interface name from AST
   */
  getTypeName(node) {
    // Try different paths for class/interface name
    if (node.children?.normalClassDeclaration?.[0]?.children?.typeIdentifier?.[0]?.children?.Identifier?.[0]?.image) {
      return node.children.normalClassDeclaration[0].children.typeIdentifier[0].children.Identifier[0].image;
    }
    if (node.children?.normalInterfaceDeclaration?.[0]?.children?.typeIdentifier?.[0]?.children?.Identifier?.[0]?.image) {
      return node.children.normalInterfaceDeclaration[0].children.typeIdentifier[0].children.Identifier[0].image;
    }
    return null;
  }

  /**
   * Check if node has abstract modifier
   */
  isAbstract(node) {
    if (!node.children?.classModifier) return false;
    for (const mod of node.children.classModifier) {
      if (mod.children?.abstractKeyword?.[0]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extract annotation names from node
   */
  getAnnotations(node) {
    const result = [];
    if (!node.children?.classModifier) return result;

    for (const mod of node.children.classModifier) {
      if (mod.children?.annotation) {
        for (const ann of mod.children.annotation) {
          // Get annotation name
          const typeName = ann.children?.typeName?.[0];
          if (typeName) {
            // Get simple name
            if (typeName.children?.Identifier?.[0]?.image) {
              result.push(typeName.children.Identifier[0].image);
            }
            // Get qualified name (handle nested identifiers and dots)
            if (typeName.children?.packageOrTypeName?.[0]) {
              const ptn = typeName.children.packageOrTypeName[0];
              if (ptn.children?.Identifier) {
                const parts = ptn.children.Identifier.map(id => id.image);
                result.push(parts.join('.'));
              }
            }
          }
        }
      }
    }
    return result;
  }

  /**
   * Get all interfaces directly implemented by a class
   */
  getImplementedInterfaces(node) {
    const result = [];
    const classBody = node.children?.normalClassDeclaration?.[0]?.children?.classImplements?.[0];
    if (!classBody) return result;

    const interfaceList = classBody.children?.interfaceTypeList?.[0];
    if (!interfaceList) return result;

    for (const iface of interfaceList.children?.interfaceType || []) {
      // Get interface name
      const typeName = iface.children?.typeName?.[0];
      if (typeName) {
        if (typeName.children?.Identifier?.[0]?.image) {
          result.push(typeName.children.Identifier[0].image);
        }
        if (typeName.children?.packageOrTypeName?.[0]) {
          const ptn = typeName.children.packageOrTypeName[0];
          if (ptn.children?.Identifier) {
            const parts = ptn.children.Identifier.map(id => id.image);
            result.push(parts.join('.'));
          }
        }
      }
    }
    return result;
  }

  /**
   * Get all interfaces an interface extends
   */
  getExtendedInterfaces(node) {
    const result = [];
    const interfaceBody = node.children?.normalInterfaceDeclaration?.[0]?.children?.interfaceExtends?.[0];
    if (!interfaceBody) return result;

    const interfaceList = interfaceBody.children?.interfaceTypeList?.[0];
    if (!interfaceList) return result;

    for (const iface of interfaceList.children?.interfaceType || []) {
      const typeName = iface.children?.typeName?.[0];
      if (typeName) {
        if (typeName.children?.Identifier?.[0]?.image) {
          result.push(typeName.children.Identifier[0].image);
        }
        if (typeName.children?.packageOrTypeName?.[0]) {
          const ptn = typeName.children.packageOrTypeName[0];
          if (ptn.children?.Identifier) {
            const parts = ptn.children.Identifier.map(id => id.image);
            result.push(parts.join('.'));
          }
        }
      }
    }
    return result;
  }

  /**
   * Get type declaration (class or interface) from AST
   */
  getTypeDeclaration(ast) {
    const unit = ast?.children?.ordinaryCompilationUnit?.[0];
    if (!unit) return null;
    const typeDecl = unit.children?.typeDeclaration?.[0];
    if (!typeDecl) return null;
    // Returns classDeclaration or interfaceDeclaration
    return typeDecl.children?.classDeclaration?.[0] ||
           typeDecl.children?.interfaceDeclaration?.[0];
  }

  /**
   * Find class/interface declaration by simple name
   */
  findClassDeclaration(className, javaFiles) {
    for (const filePath of javaFiles) {
      const ast = this.parseJavaFile(filePath);
      if (!ast) continue;

      const typeNode = this.getTypeDeclaration(ast);
      if (!typeNode) continue;

      const typeName = this.getTypeName(typeNode);
      if (typeName === className) {
        return { node: typeNode, filePath };
      }
    }
    return null;
  }

  /**
   * Check if a class directly or indirectly implements a target interface
   */
  implementsTargetInterface(node, targetInterface, javaFiles, visited = new Set()) {
    const typeName = this.getTypeName(node);
    const nodeKey = `${typeName || 'unknown'}`;
    if (visited.has(nodeKey)) {
      return false;
    }
    visited.add(nodeKey);

    // Check direct implementation
    const implemented = this.getImplementedInterfaces(node);
    if (implemented.includes(targetInterface)) {
      return true;
    }

    // Check if any parent interface extends the target
    for (const ifaceName of implemented) {
      const ifaceDecl = this.findClassDeclaration(ifaceName, javaFiles);
      if (ifaceDecl) {
        if (this.implementsTargetInterface(ifaceDecl.node, targetInterface, javaFiles, visited)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if node has any of the configured annotations
   */
  hasConfiguredAnnotation(node) {
    if (this.annotations.length === 0) {
      return false;
    }
    const nodeAnnotations = this.getAnnotations(node);

    // Check for simple name match
    const simpleAnnotationNames = this.annotations.map(a => {
      const parts = a.split('.');
      return parts[parts.length - 1];
    });

    return nodeAnnotations.some(ann => {
      // Direct simple name match
      if (simpleAnnotationNames.includes(ann)) {
        return true;
      }
      // Full qualified name match
      if (this.annotations.includes(ann)) {
        return true;
      }
      return false;
    });
  }

  /**
   * Check if node implements any configured interface
   */
  hasConfiguredInterface(node, javaFiles) {
    if (this.interfaces.length === 0) {
      return false;
    }

    for (const targetInterface of this.interfaces) {
      if (this.implementsTargetInterface(node, targetInterface, javaFiles)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Main scan logic
   */
  scan() {
    const javaFiles = this.findJavaFiles(this.scanDir);
    const matchedFiles = [];

    for (const filePath of javaFiles) {
      const ast = this.parseJavaFile(filePath);
      if (!ast) continue;

      const typeNode = this.getTypeDeclaration(ast);
      if (!typeNode) continue;

      // Skip abstract classes if configured
      if (this.excludeAbstract && this.isAbstract(typeNode)) {
        continue;
      }

      // Check for configured annotations
      const hasAnnotationMatch = this.hasConfiguredAnnotation(typeNode);

      // Check for configured interfaces
      const hasInterfaceMatch = this.hasConfiguredInterface(typeNode, javaFiles);

      // Match if either condition is met
      if (hasAnnotationMatch || hasInterfaceMatch) {
        matchedFiles.push(filePath);
      }
    }

    return {
      count: matchedFiles.length,
      files: matchedFiles.sort()
    };
  }
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  let configPath = path.join(__dirname, 'scan-config.json');
  let scanDir = null;

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    } else if (args[i] === '--dir' && i + 1 < args.length) {
      scanDir = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Java File Scanner

Usage: node scan-java-files.js [options]

Options:
  --config <path>  Path to config file (default: scan-config.json)
  --dir <path>     Directory to scan (overrides config)
  --help, -h       Show this help message

Config file format (JSON):
{
  "scanDir": "./src/main/java",
  "annotations": ["org.springframework.stereotype.Service", ...],
  "interfaces": ["com.example.MyInterface", ...],
  "excludeAbstract": true
}
`);
      process.exit(0);
    }
  }

  // Load configuration
  let config;
  try {
    const configContent = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configContent);
  } catch (error) {
    console.error(`Error loading config from ${configPath}: ${error.message}`);
    process.exit(1);
  }

  // Override scan directory if provided
  if (scanDir) {
    config.scanDir = scanDir;
  }

  // Run scanner
  const scanner = new JavaFileScanner(config);
  const result = scanner.scan();

  // Output result
  console.log(JSON.stringify(result, null, 2));
}

// Export for programmatic use
module.exports = { JavaFileScanner };

// Run if executed directly
if (require.main === module) {
  main();
}
