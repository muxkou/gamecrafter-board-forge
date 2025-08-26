import type { InterpreterCtx } from '../effects/types';

/**
 * DSL 表达式 AST 的类型定义
 * 
 * 基于实际使用场景和 schema 定义，AST 可以是：
 * 1. 基础类型：字符串、数字、布尔值
 * 2. 常量节点：{ const: any }
 * 3. 变量节点：{ var: string }  
 * 4. 操作节点：{ op: string, args?: ExprAST[] }
 * 5. 数组：ExprAST[]
 */
export type ExprAST = 
  | string
  | number 
  | boolean
  | null
  | undefined
  | { const: unknown }
  | { var: string }
  | { op: string; args?: ExprAST[] }
  | ExprAST[];

/**
 * 操作节点的具体类型定义（用于更精确的类型检查）
 */
export type ExprOpNode = {
  op: string;
  args?: ExprAST[];
};

/**
 * 常用操作符的枚举（便于 IDE 提示和类型检查）
 */
export const ExprOperators = {
  // 算术运算
  ADD: '+' as const,
  SUB: '-' as const, 
  MUL: '*' as const,
  DIV: '/' as const,
  MOD: '%' as const,
  
  // 比较运算
  EQ: '==' as const,
  NEQ: '!=' as const,
  GT: '>' as const,
  GTE: '>=' as const,
  LT: '<' as const,
  LTE: '<=' as const,
  
  // 逻辑运算
  AND: 'and' as const,
  OR: 'or' as const,
  NOT: 'not' as const,
  
  // 特殊操作
  GET: 'get' as const,
  ANY: 'any' as const,
} as const;

/**
 * 安全地解析点号分隔的路径，从执行上下文中获取数据
 * 
 * 支持的路径格式：
 * - state.xxx: 从游戏状态中获取
 * - payload.xxx: 从动作参数中获取  
 * - call.payload.xxx: 同上，显式指定
 * - xxx: 先尝试从 payload 获取，再从 state 获取
 * 
 * 特殊处理：
 * - 路径中的 'by' 会被动态替换为当前玩家的 ID
 *   例如：state.zones.hand.instances.by.items -> state.zones.hand.instances.A.items
 */
function resolve_path(path: string, ctx: InterpreterCtx): unknown {
  const parts = path.split('.');
  if (!parts.length) return undefined;
  
  let base: any;
  const first = parts.shift()!;
  
  // 根据路径前缀确定数据源
  if (first === 'state') {
    base = ctx.state as any;
  } else if (first === 'payload') {
    base = ctx.call.payload as any;
  } else if (first === 'call' && parts[0] === 'payload') {
    parts.shift(); // 跳过 'payload' 部分
    base = ctx.call.payload as any;
  } else {
    // 无显式前缀时，先尝试从 payload 获取，再从 state 获取
    const try_payload = path.split('.').reduce((o: any, k: string) => o?.[k], ctx.call.payload as any);
    if (try_payload !== undefined) return try_payload;
    return path.split('.').reduce((o: any, k: string) => o?.[k], ctx.state as any);
  }
  
  // 遍历剩余路径，特殊处理 'by' 占位符
  return parts.reduce((o: any, k: string) => {
    if (k === 'by') {
      // 将 'by' 动态替换为当前操作者的 ID
      const player_id = ctx.call.by;
      return player_id ? o?.[player_id] : undefined;
    }
    return o?.[k];
  }, base);
}

/**
 * DSL 表达式求值器 - 递归解析和执行表达式 AST
 * 
 * 表达式类型：
 * 1. 字面量: 数字、字符串、布尔值直接返回
 * 2. 数组: 递归处理每个元素
 * 3. 对象节点:
 *    - { const: value }: 常量值
 *    - { var: "path" }: 变量引用，通过 resolve_path 解析
 *    - { op: "操作符", args: [...] }: 操作表达式
 * 
 * 支持的操作符：
 * - 算术: +, -, *, /, %
 * - 比较: ==, !=, >, >=, <, <=  
 * - 逻辑: and, or, not
 * - 访问: get (安全的嵌套属性访问)
 * - 数组: any (存在性检查)
 */
export function eval_expr(ast: ExprAST, ctx: InterpreterCtx): any {
  // 处理基础类型
  if (ast === null || ast === undefined) return undefined;
  if (typeof ast === 'number' || typeof ast === 'string' || typeof ast === 'boolean') {
    return ast;
  }
  
  // 处理数组：递归求值每个元素
  if (Array.isArray(ast)) return ast.map(a => eval_expr(a, ctx));
  
  // 处理对象节点
  if (typeof ast === 'object') {
    const node = ast as any;
    
    // 常量节点：直接返回值
    if ('const' in node) return node.const;
    
    // 变量节点：通过路径解析获取值
    if ('var' in node && typeof node.var === 'string') {
      return resolve_path(node.var, ctx);
    }
    
    // 操作节点：根据操作符执行相应逻辑
    if ('op' in node) {
      const op = node.op as string;
      const args = (node.args ?? []).map((a: any) => eval_expr(a, ctx));
      
      switch (op) {
        case ExprOperators.GET:
        case 'get': {
          // 安全的嵌套属性访问：get(base, key1, key2, ...)
          const [base, ...path] = args;
          let cur: any = base;
          for (const k of path) {
            if (cur == null) return undefined;
            const key = typeof k === 'number' ? k : String(k);
            cur = cur[key as any];
          }
          return cur;
        }
        
        // 算术运算符
        case '+':
        case 'add':
          return args[0] + args[1];
        case '-':
        case 'sub':
          return args[0] - args[1];
        case '*':
        case 'mul':
          return args[0] * args[1];
        case '/':
        case 'div':
          return args[0] / args[1];
        case '%':
        case 'mod':
          return args[0] % args[1];
          
        // 比较运算符
        case '==':
        case 'eq':
          return args[0] === args[1];
        case '!=':
        case 'neq':
          return args[0] !== args[1];
        case '>':
        case 'gt':
          return args[0] > args[1];
        case '>=':
        case 'gte':
        case 'ge':
          return args[0] >= args[1];
        case '<':
        case 'lt':
          return args[0] < args[1];
        case '<=':
        case 'lte':
        case 'le':
          return args[0] <= args[1];
          
        // 逻辑运算符
        case 'and':
        case '&&':
          return args.every(Boolean);
        case 'or':
        case '||':
          return args.some(Boolean);
        case 'not':
        case '!':
          return !Boolean(args[0]);
          
        case 'any':
          // 数组存在性检查：any(array, condition)
          // 检查数组中是否存在满足条件的元素
          if (!Array.isArray(args[0])) return false;
          const array = args[0];
          const condition = node.args?.[1]; // 使用原始 AST，不是求值后的结果
          if (!condition) return false;
          
          return array.some((item: any) => {
            // 为每个数组元素创建新的执行上下文
            // 将当前遍历的元素暴露为 'item' 变量
            const itemCtx: InterpreterCtx = {
              ...ctx,
              call: {
                ...ctx.call,
                payload: {
                  ...ctx.call.payload,
                  item // 通过 { "var": "item" } 可以访问当前元素
                }
              }
            };
            return eval_condition(condition, itemCtx);
          });
          
        default:
          throw new Error(`不支持的操作符: ${op}`);
      }
    }
  }
  return undefined;
}

/**
 * 条件表达式求值器 - 将表达式结果转换为布尔值
 * 
 * 主要用于 require 条件的判断：
 * - undefined 被视为 true（无条件限制）
 * - 其他值通过 !! 转换为布尔值
 * 
 * 这是 eval_expr 的便捷包装器，专门用于条件判断场景
 */
export function eval_condition(ast: ExprAST, ctx: InterpreterCtx): boolean {
  if (ast === undefined) return true;
  return !!eval_expr(ast, ctx);
}
