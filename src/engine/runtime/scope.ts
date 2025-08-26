export class Scope {
  private stack: Record<string, unknown>[] = [{}];

  /**
   * 入栈一个新作用域，可带初始变量
   */
  push_scope(vars: Record<string, unknown> = {}): void {
    this.stack.push({ ...vars });
  }

  /**
   * 弹出当前作用域；全局作用域不可弹出
   */
  pop_scope(): void {
    if (this.stack.length === 1) {
      throw new Error('cannot pop global scope');
    }
    this.stack.pop();
  }

  /**
   * 在当前作用域设置变量
   */
  set_var(name: string, value: unknown): void {
    this.stack[this.stack.length - 1][name] = value;
  }

  /**
   * 从内到外查找变量值
   */
  get_var(name: string): unknown {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (name in this.stack[i]) return this.stack[i][name];
    }
    return undefined;
  }
}
