import * as acorn from 'acorn'
import { generate } from 'astring'

type AstNode = {
  type: string
  [key: string]: unknown
}

type VisitContext = {
  node: AstNode
  parent: AstNode | null
  key: string | null
  index: number | null
}

type LoopGuardOptions = {
  timeoutMs?: number
  sketchId?: string
}

const LOOP_NODE_TYPES = new Set<string>([
  'WhileStatement',
  'ForStatement',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
])

const DEFAULT_LOOP_TIMEOUT_MS = 100

const isAstNode = (value: unknown): value is AstNode =>
  typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'

const parseProgram = (code: string): AstNode | null => {
  for (const sourceType of ['script', 'module'] as const) {
    try {
      return acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType,
        allowHashBang: true,
        locations: true,
      }) as unknown as AstNode
    } catch (e) {
      void e
    }
  }
  return null
}

const replaceNode = (
  parent: AstNode | null,
  key: string | null,
  index: number | null,
  nextNode: AstNode
): void => {
  if (!parent || !key) return
  const container = parent[key]
  if (Array.isArray(container) && typeof index === 'number') {
    container[index] = nextNode
    return
  }
  parent[key] = nextNode
}

const ensureLoopBodyBlock = (loopNode: AstNode): AstNode => {
  const body = loopNode.body
  if (isAstNode(body) && body.type === 'BlockStatement') {
    return body
  }
  const wrappedBody: AstNode = {
    type: 'BlockStatement',
    body: isAstNode(body) ? [body] : [],
  }
  loopNode.body = wrappedBody
  return wrappedBody
}

const createStartDeclaration = (startVarName: string): AstNode => ({
  type: 'VariableDeclaration',
  kind: 'const',
  declarations: [
    {
      type: 'VariableDeclarator',
      id: { type: 'Identifier', name: startVarName },
      init: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'Date' },
          property: { type: 'Identifier', name: 'now' },
          computed: false,
          optional: false,
        },
        arguments: [],
        optional: false,
      },
    },
  ],
})

const createLoopGuardStatement = (
  startVarName: string,
  timeoutMs: number,
  message: string
): AstNode => ({
  type: 'IfStatement',
  test: {
    type: 'BinaryExpression',
    operator: '>',
    left: {
      type: 'BinaryExpression',
      operator: '-',
      left: {
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'Date' },
          property: { type: 'Identifier', name: 'now' },
          computed: false,
          optional: false,
        },
        arguments: [],
        optional: false,
      },
      right: { type: 'Identifier', name: startVarName },
    },
    right: { type: 'Literal', value: timeoutMs, raw: String(timeoutMs) },
  },
  consequent: {
    type: 'BlockStatement',
    body: [
      {
        type: 'ThrowStatement',
        argument: {
          type: 'NewExpression',
          callee: { type: 'Identifier', name: 'Error' },
          arguments: [{ type: 'Literal', value: message, raw: JSON.stringify(message) }],
        },
      },
    ],
  },
  alternate: null,
})

const getLoopErrorMessage = (loopNode: AstNode, sketchId?: string): string => {
  const loc = (loopNode.loc as { start?: { line?: number; column?: number } } | undefined)?.start
  const line = typeof loc?.line === 'number' ? loc.line : 0
  const column = typeof loc?.column === 'number' ? loc.column : 0
  const sketchSuffix = sketchId ? ` (sketch: ${sketchId})` : ''
  return `Infinite loop protection triggered at line ${line}, column ${column}${sketchSuffix}.`
}

const visitAst = (
  node: AstNode,
  visitor: (ctx: VisitContext, ancestors: VisitContext[]) => void,
  ctx: VisitContext,
  ancestors: VisitContext[] = []
): void => {
  const nextAncestors = [...ancestors, ctx]

  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const child = value[i]
        if (!isAstNode(child)) continue
        const childCtx: VisitContext = { node: child, parent: node, key, index: i }
        visitAst(child, visitor, childCtx, nextAncestors)
      }
      continue
    }
    if (!isAstNode(value)) continue
    const childCtx: VisitContext = { node: value, parent: node, key, index: null }
    visitAst(value, visitor, childCtx, nextAncestors)
  }

  visitor(ctx, ancestors)
}

export const instrumentLoops = (code: string, opts: LoopGuardOptions = {}): string => {
  const timeoutMs =
    typeof opts.timeoutMs === 'number' && Number.isFinite(opts.timeoutMs) && opts.timeoutMs > 0
      ? Math.floor(opts.timeoutMs)
      : DEFAULT_LOOP_TIMEOUT_MS
  const program = parseProgram(code)
  if (!program) return code

  let guardIndex = 0
  let didInstrument = false

  try {
    visitAst(
      program,
      (ctx, ancestors) => {
        const loopNode = ctx.node
        if (!LOOP_NODE_TYPES.has(loopNode.type)) return

        const bodyBlock = ensureLoopBodyBlock(loopNode)
        const startVarName = `__lpStart${guardIndex}`
        guardIndex += 1

        const message = getLoopErrorMessage(loopNode, opts.sketchId)
        const guardStatement = createLoopGuardStatement(startVarName, timeoutMs, message)
        const blockBody = Array.isArray(bodyBlock.body) ? bodyBlock.body : []
        bodyBlock.body = [guardStatement, ...blockBody]

        let targetCtx = ctx
        const parentCtx = ancestors[ancestors.length - 1]
        if (parentCtx && parentCtx.node.type === 'LabeledStatement' && parentCtx.node.body === loopNode) {
          targetCtx = parentCtx
        }

        const wrapperBlock: AstNode = {
          type: 'BlockStatement',
          body: [createStartDeclaration(startVarName), targetCtx.node],
        }
        replaceNode(targetCtx.parent, targetCtx.key, targetCtx.index, wrapperBlock)
        didInstrument = true
      },
      { node: program, parent: null, key: null, index: null }
    )
  } catch {
    return code
  }

  if (!didInstrument) return code

  try {
    return generate(program as never)
  } catch {
    return code
  }
}
