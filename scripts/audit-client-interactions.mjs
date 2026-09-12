import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(process.cwd(), "client/src");
const pageRoot = path.join(root, "pages");
const interactiveTags = new Set([
  "a",
  "button",
  "form",
  "input",
  "select",
  "textarea",
  "Button",
  "Input",
  "Select",
  "Textarea",
  "AlertDialog",
]);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return /\.[jt]sx$/.test(entry.name) ? [absolute] : [];
  });
}

function jsxName(node) {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return node.getText();
}

function attributeValue(attribute) {
  if (!attribute.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text;
  if (ts.isJsxExpression(attribute.initializer)) {
    return attribute.initializer.expression?.getText() ?? true;
  }
  return attribute.initializer.getText();
}

function enclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionExpression(current) ||
      ts.isArrowFunction(current) ||
      ts.isMethodDeclaration(current)
    ) {
      if ("name" in current && current.name) return current.name.getText();
      if (ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
        return current.parent.name.text;
      }
      return "(anonymous)";
    }
    current = current.parent;
  }
  return "(module)";
}

const inventory = [];
for (const file of [...sourceFiles(pageRoot), path.join(root, "App.tsx")]) {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = jsxName(node.tagName);
      if (interactiveTags.has(tag)) {
        const attributes = Object.fromEntries(
          node.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((attribute) => [attribute.name.text, attributeValue(attribute)]),
        );
        const fn = enclosingFunction(node);
        let fnNode = node.parent;
        while (
          fnNode &&
          !ts.isFunctionDeclaration(fnNode) &&
          !ts.isFunctionExpression(fnNode) &&
          !ts.isArrowFunction(fnNode)
        ) {
          fnNode = fnNode.parent;
        }
        const functionText = fnNode?.getText() ?? "";
        const apiCalls = [...functionText.matchAll(/["'`]((?:\/api\/)[^"'`?${}\s]*)/g)]
          .map((match) => match[1])
          .filter((value, index, all) => all.indexOf(value) === index);
        const position = ast.getLineAndCharacterOfPosition(node.getStart(ast));

        inventory.push({
          file: path.relative(process.cwd(), file),
          line: position.line + 1,
          component: fn,
          element: tag,
          testId: attributes["data-testid"] ?? null,
          handlers: ["onClick", "onSubmit", "onChange", "onKeyDown", "onBlur"]
            .filter((name) => name in attributes),
          href: attributes.href ?? null,
          disabled: attributes.disabled ?? null,
          apiCalls,
          action:
            apiCalls.length > 0
              ? "api"
              : attributes.href || String(attributes.onClick || "").includes("setLocation")
                ? "navigation"
                : "local",
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(ast);
}

const routes = fs
  .readFileSync(path.join(root, "App.tsx"), "utf8")
  .matchAll(/<Route(?:\s+path="([^"]+)")?/g);
const routePaths = [...routes].map((match) => match[1] ?? "(not-found)");
const counts = inventory.reduce((result, item) => {
  result[item.element] = (result[item.element] ?? 0) + 1;
  return result;
}, {});

console.log(JSON.stringify({
  routes: routePaths,
  totalInteractiveElements: inventory.length,
  counts,
  inventory,
}, null, 2));
