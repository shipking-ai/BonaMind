// Regression guard for the bug class closed in PR #12.
//
// Reads each guarded source file, parses it with the TS Compiler API,
// walks every JSXOpeningElement whose tag name is "DashboardWorkspaceProvider",
// and asserts each opening element supplies every required prop on
// DashboardWorkspaceProviderProps (user, decks, cards, createDeck, deleteDeck,
// addCardsToDeck, updateProfile, onLogout).
//
// If a future commit drops or forgets any of those required props on any
// site, this test fails with a precise file:line message before the
// regression can land on main.
//
// Mirrors the required-prop set on DashboardWorkspaceProviderProps in
// bonamind-web/src/contexts/DashboardWorkspaceContext.tsx. Update this
// list if the provider contract grows.

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, it, expect } from 'vitest';

const REQUIRED_PROPS = [
  'user',
  'decks',
  'cards',
  'createDeck',
  'deleteDeck',
  'addCardsToDeck',
  'updateProfile',
  'onLogout',
] as const;

// Legacy guarded files (ComponentVerification.tsx, DashboardTest.tsx, App.tsx)
// were removed or stopped owning the provider when specialized /dashboard
// routes moved into NovaHub. NovaHub is now the single source of truth that
// distributes workspace props to every dashboard surface.
const FILES_TO_GUARD = [
  'src/pages/dashboard/NovaHub.tsx',
] as const;

type SiteReport = {
  file: string;
  line: number;
  presentProps: ReadonlySet<string>;
};

function resolveSpreadProps(node: ts.JsxSpreadAttribute, source: string, sourceFile: ts.SourceFile): Set<string> {
  const result = new Set<string>();
  if (!ts.isIdentifier(node.expression)) return result;
  const varName = node.expression.text;

  // Find the variable declaration and extract property names from the object literal.
  // Handles both:
  //   const foo = { user: ..., decks: ... };
  //   const foo = useMemo(() => ({ user: ..., decks: ... }), [...]);
  function findObjectLiterals(n: ts.Node): ts.ObjectLiteralExpression[] {
    const results: ts.ObjectLiteralExpression[] = [];

    if (
      ts.isVariableDeclaration(n) &&
      n.name &&
      ts.isIdentifier(n.name) &&
      n.name.text === varName &&
      n.initializer
    ) {
      // Case 1: direct object literal — const foo = { ... }
      if (ts.isObjectLiteralExpression(n.initializer)) {
        results.push(n.initializer);
      }
      // Case 2: useMemo(() => ({ ... }), [...]) — walk the arrow/function body
      else if (ts.isCallExpression(n.initializer)) {
        for (const arg of n.initializer.arguments) {
          if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
            // Concise body: () => expr or () => { return expr; }
            if (ts.isBlock(arg.body)) {
              collectObjectLiteralsFromBlock(arg.body, results);
            } else if (ts.isExpression(arg.body)) {
              extractObjectLiteralsFromExpr(arg.body, results);
            }
          }
        }
      }
    }

    ts.forEachChild(n, (child) => {
      results.push(...findObjectLiterals(child));
    });
    return results;
  }

  function collectObjectLiteralsFromBlock(block: ts.Block, out: ts.ObjectLiteralExpression[]): void {
    for (const stmt of block.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        extractObjectLiteralsFromExpr(stmt.expression, out);
      }
    }
  }

  function extractObjectLiteralsFromExpr(expr: ts.Expression, out: ts.ObjectLiteralExpression[]): void {
    if (ts.isObjectLiteralExpression(expr)) {
      out.push(expr);
    } else if (ts.isConditionalExpression(expr)) {
      // Ternary: currentUser ? { ... } : null
      extractObjectLiteralsFromExpr(expr.whenTrue, out);
      extractObjectLiteralsFromExpr(expr.whenFalse, out);
    }
  }

  const objLits = findObjectLiterals(sourceFile);
  for (const objLit of objLits) {
    for (const prop of objLit.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        result.add(prop.name.text);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        result.add(prop.name.text);
      }
    }
  }
  return result;
}

function findDashboardWorkspaceProviderSites(file: string): SiteReport[] {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `[dashboardWorkspaceProviderProps] guarded file missing: ${file} (cwd=${process.cwd()})`,
    );
  }
  const source = fs.readFileSync(absolute, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    { languageVersion: ts.ScriptTarget.ES2022 },
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  );

  const found: SiteReport[] = [];

  function walk(node: ts.Node): void {
    if (
      ts.isJsxOpeningElement(node) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === 'DashboardWorkspaceProvider'
    ) {
      const present = new Set<string>();
      for (const attr of node.attributes.properties) {
        if (ts.isJsxAttribute(attr) && ts.isIdentifier(attr.name)) {
          present.add(attr.name.text);
        } else if (ts.isJsxSpreadAttribute(attr)) {
          // Resolve spread: { ...workspaceProps } → look up variable's properties
          const spreadProps = resolveSpreadProps(attr, source, sourceFile);
          for (const p of spreadProps) present.add(p);
        }
      }
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      found.push({ file, line: line + 1, presentProps: present });
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
  return found;
}

describe('DashboardWorkspaceProvider prop completeness — regression guard', () => {
  for (const file of FILES_TO_GUARD) {
    describe(file, () => {
      it('every <DashboardWorkspaceProvider> site supplies all 8 required props', () => {
        const sites = findDashboardWorkspaceProviderSites(file);
        expect(sites.length, `no <DashboardWorkspaceProvider> found in ${file}`).toBeGreaterThan(0);

        for (const site of sites) {
          for (const required of REQUIRED_PROPS) {
            expect(
              site.presentProps.has(required),
              `${site.file}:${site.line} — <DashboardWorkspaceProvider> is missing required prop "${required}". ` +
                `(present: { ${Array.from(site.presentProps).sort().join(', ') || '∅'} })`,
            ).toBe(true);
          }
        }
      });
    });
  }
});
