/* eslint-disable @typescript-eslint/no-explicit-any */
import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { generate } from "astring";
import globals from "./p5-globals";
import main from "./p5-main";

/*
https://gist.github.com/tangert/cd4ce84e0e7a4d240694d0e0536db27d
This is for use in a project that allows users to write p5.js scripts without needing to convert to instance mode.
The transpiler automatically converts global mode p5.js code to instance mode code.

The main idea is to do two main things:
1. prepend all variables with an underscore so that there are no naming conflicts with any native p5 methods
2. convert all function calls to use the p5 instance

Usage: 
const transpiledInstanceCode = transpileGlobalToInstance(globalCode) 
new p5((_p) => {
  eval(transpiledInstanceCode);
})

-------------------------

/*
Example input:
```
let circle = {
  x: 300,
  y: 300,
  diameter: 50,
  speed: {
    x: random(-2, 2),
    y: random(-2, 2)
  },
  color: color(255, 0, 0)
};

function setup() {
  createCanvas(600, 600);
}

function draw() {
  background(220);

  circle.x += circle.speed.x;
  circle.y += circle.speed.y;

  // Bounce off the walls
  if (circle.x - circle.diameter / 2 < 0 || circle.x + circle.diameter / 2 > width) {
    circle.speed.x *= -1;
  }

  if (circle.y - circle.diameter / 2 < 0 || circle.y + circle.diameter / 2 > height) {
    circle.speed.y *= -1;
  }

  fill(circle.color);
  noStroke();
  circle(circle.x, circle.y, circle.diameter);
}
```

Example output:
```
let _circle = {
  x: 300,
  y: 300,
  diameter: 50,
  speed: {
    x: _p.random(-2, 2),
    y: _p.random(-2, 2)
  },
  color: _p.color(255, 0, 0)
};
_p.setup = function () {
  _p.createCanvas(600, 600);
}
_p.draw = function () {
  _p.background(220);
  _circle.x += _circle.speed.x;
  _circle.y += _circle.speed.y;
  if (_circle.x - _circle.diameter / 2 < 0 || _circle.x + _circle.diameter / 2 > _p.width) {
    _circle.speed.x *= -1;
  }
  if (_circle.y - _circle.diameter / 2 < 0 || _circle.y + _circle.diameter / 2 > _p.height) {
    _circle.speed.y *= -1;
  }
  _p.fill(_circle.color);
  _p.noStroke();
  _p.circle(_circle.x, _circle.y, _circle.diameter);
}
```
*/

/**
 * p5 instance namespace used in transpiled code
 * All p5 functions are prefixed with this to avoid global namespace pollution
 * @example
 * // User writes: createCanvas(400, 400)
 * // Transpiled: _p.createCanvas(400, 400)
 */
export const P5_NAMESPACE = "_p";

/**
 * Transpile p5.js global mode code to instance mode
 *
 * Transforms global p5 functions to use instance mode syntax:
 * - Prefixes user variables with `_` to avoid p5 namespace conflicts
 * - Converts `setup()` to `_p.setup = function() { ... }`
 * - Converts `createCanvas(...)` to `_p.createCanvas(...)`
 * - Maintains function scope and variable bindings
 *
 * @param globalCode - p5.js code written in global mode
 * @returns Transpiled instance mode code, or null if parsing fails
 *
 * @example
 * const code = `
 *   function setup() { createCanvas(400, 400); }
 *   function draw() { background(220); }
 * `;
 * const transpiled = transpileGlobalToInstance(code);
 * // Returns: _p.setup = function() { _p.createCanvas(400, 400); }
 * //          _p.draw = function() { _p.background(220); }
 */
export const transpileGlobalToInstance = (
  globalCode: string
): string | null => {
  try {
    const ast = acorn.parse(globalCode, { ecmaVersion: 2020 });
    const varMap = new Map();

    walk.ancestor(ast, {
      VariableDeclaration(node: any) {
        // Transform lifecycle arrow/function assignments into instance mode
        if (node.declarations && node.declarations.length === 1) {
          const declaration = node.declarations[0];
          const id = declaration.id;
          const init = declaration.init;
          const isLifecycle =
            id &&
            id.type === "Identifier" &&
            (globals.functions.includes(id.name) || main.functions.includes(id.name));
          const isFnInit =
            init &&
            (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression");
          if (isLifecycle && isFnInit) {
            // Replace the entire declaration with `_p.<name> = <fn>`
            Object.assign(node, {
              type: "ExpressionStatement",
              expression: {
                type: "AssignmentExpression",
                operator: "=",
                left: {
                  type: "MemberExpression",
                  computed: false,
                  object: { type: "Identifier", name: P5_NAMESPACE },
                  property: { type: "Identifier", name: id.name },
                },
                right: init,
              },
            });
            return;
          }
        }

        node.declarations.forEach((declaration: any) => {
          const varName: string = declaration.id.name;
          if (!varMap.has(varName)) {
            varMap.set(
              varName,
              varName.startsWith("_") ? varName : `_${varName}`
            );
          }
          declaration.id.name = varMap.get(varName);
        });
      },
      AssignmentExpression(node: any) {
        // Handle both left and right sides of assignments
        if (node.left.type === "Identifier") {
          const lhsName = node.left.name;
          if (varMap.has(lhsName)) {
            node.left.name = varMap.get(lhsName);
          }
        }
        if (node.right.type === "Identifier") {
          const rhsName = node.right.name;
          if (varMap.has(rhsName)) {
            node.right.name = varMap.get(rhsName);
          }
        }
      },
      Property(node: any) {
        // Expand shorthand properties so we can safely rename values without mutating keys
        if (node && node.shorthand && node.key && node.value && node.key.type === "Identifier" && node.value.type === "Identifier") {
          const keyName = node.key.name;
          if (varMap.has(keyName)) {
            node.shorthand = false;
            node.value.name = varMap.get(keyName);
          }
        }
      },
      Identifier(node: any, ancestors: any[]) {
        // Determine if the identifier is part of a function call
        const isFunctionCall = ancestors.some((ancestor) => {
          if (
            ancestor.type === "CallExpression" &&
            ancestor.callee.type === "Identifier" &&
            ancestor.callee.name === node.name
          ) {
            return true;
          }
          return false;
        });
        // acorn-walk `ancestor` includes the current node as the last entry.
        // Parent is the previous element.
        const parent = ancestors[ancestors.length - 2];
        const isKeyPosition =
          (parent &&
            (
              (parent.type === "Property" && parent.key === node && !parent.computed) ||
              (parent.type === "PropertyDefinition" && parent.key === node && !parent.computed) ||
              (parent.type === "MethodDefinition" && parent.key === node && !parent.computed) ||
              (parent.type === "MemberExpression" && parent.property === node && !parent.computed) ||
              (parent.type === "ImportSpecifier" && parent.imported === node) ||
              (parent.type === "ExportSpecifier" && parent.exported === node)
            ));
        if (
          !isKeyPosition &&
          ((isFunctionCall && globals.functions.includes(node.name)) ||
            globals.constants.includes(node.name))
        ) {
          node.name = `${P5_NAMESPACE}.${node.name}`;
        } else if (!isFunctionCall && !isKeyPosition && varMap.has(node.name)) {
          node.name = varMap.get(node.name);
        }
      },
      FunctionDeclaration(node: any) {
        if (
          node.id &&
          (globals.functions.includes(node.id.name) ||
            main.functions.includes(node.id.name))
        ) {
          node.id.name = varMap.get(node.id.name) || node.id.name;
          const assignment = {
            type: "AssignmentExpression",
            operator: "=",
            left: {
              type: "MemberExpression",
              computed: false,
              object: { type: "Identifier", name: P5_NAMESPACE },
              property: { type: "Identifier", name: node.id.name },
            },
            right: {
              type: "FunctionExpression",
              params: node.params,
              body: node.body,
              async: node.async,
              generator: node.generator,
              expression: false,
              id: null,
            },
          };
          Object.assign(node, assignment);
        }
      },
    });

    return generate(ast);
  } catch (error) {
    console.error("Error parsing code:", error);
    return null;
  }
};
