import ts from "typescript"
import { expect, it } from "vitest"

const attributes = new Set(["aria-label", "title", "placeholder", "alt"])
// These are literal syntax examples, not sentences. Keep exceptions specific.
const technical = new Set(["localhost", "127.0.0.1"])

function violations(source: string, file: string): string[] {
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const found: string[] = []
  const check = (text: string, node: ts.Node) => {
    if (!/\p{L}/u.test(text) || technical.has(text.trim())) return
    const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast))
    found.push(`${file}:${line + 1}: ${text.trim()}`)
  }
  const inspect = (child: ts.Node) => {
    // Nested elements get their own JSX pass; their classes and prop IDs are data.
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    )
      return
    if (ts.isConditionalExpression(child)) {
      inspect(child.whenTrue)
      inspect(child.whenFalse)
      return
    }
    if (ts.isBinaryExpression(child)) {
      if (
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(child.operatorToken.kind)
      )
        inspect(child.left)
      if (
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(child.operatorToken.kind)
      )
        inspect(child.right)
      return
    }
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === "t"
    )
      return
    // RoomView's tile IDs select layout/state; tileKeys translates their headings.
    if (
      file.endsWith("/room-view.tsx") &&
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === "tile"
    ) {
      const id = child.arguments[0]
      if (
        id &&
        ts.isStringLiteral(id) &&
        ["Files", "People", "Chat", "Transfers", "Apps"].includes(id.text)
      ) {
        for (const argument of child.arguments.slice(1)) inspect(argument)
        return
      }
    }
    if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child))
      check(child.text, child)
    if (ts.isTemplateExpression(child)) {
      check(child.head.text, child.head)
      for (const span of child.templateSpans)
        check(span.literal.text, span.literal)
    }
    ts.forEachChild(child, inspect)
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) check(node.text, node)
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    )
      inspect(node.expression)
    if (ts.isJsxAttribute(node) && attributes.has(node.name.getText(ast))) {
      const value = node.initializer
      if (value && ts.isStringLiteral(value)) check(value.text, value)
      if (value && ts.isJsxExpression(value) && value.expression) {
        // Include conditional and template literals, but skip t() arguments.
        inspect(value.expression)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return found
}

it("catches JSX text and user-facing attributes, including expression literals", () => {
  expect(
    violations('<p title={ready ? "Ready" : "Wait"}>Hello</p>', "fixture.tsx")
  ).toHaveLength(3)
  expect(violations('<p title={t("key")}>{name}</p>', "fixture.tsx")).toEqual(
    []
  )
  expect(violations('<p>{"Hello"}</p>', "fixture.tsx")).toHaveLength(1)
})

it("keeps production JSX text and accessible strings in catalogs", () => {
  const found: string[] = []
  const sources = import.meta.glob<string>("../**/*.tsx", {
    query: "?raw",
    import: "default",
    eager: true,
  })
  for (const [file, source] of Object.entries(sources)) {
    if (!/\.(test|spec)\.tsx$/.test(file))
      found.push(...violations(source, file))
  }
  expect(found).toEqual([])
})
