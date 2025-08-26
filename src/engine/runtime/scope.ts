export class Scope {
  private stack: Record<string, unknown>[] = [{}];

  /** Push a new scope with optional initial variables */
  pushScope(vars: Record<string, unknown> = {}): void {
    this.stack.push({ ...vars });
  }

  /** Pop the current scope. Cannot pop the global scope. */
  popScope(): void {
    if (this.stack.length === 1) {
      throw new Error('cannot pop global scope');
    }
    this.stack.pop();
  }

  /** Set a variable in the current scope */
  set(name: string, value: unknown): void {
    this.stack[this.stack.length - 1][name] = value;
  }

  /** Retrieve a variable value searching from inner to outer scopes */
  get(name: string): unknown {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (name in this.stack[i]) return this.stack[i][name];
    }
    return undefined;
  }
}
