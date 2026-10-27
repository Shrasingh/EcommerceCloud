import { vi, type Mock } from "vitest";

type ModelMock = Record<string, Mock>;

// Auto-creates `prismaMock.<model>.<method>` as vi.fn() on first access, so
// tests only stub the calls they care about.
const models: Record<string, ModelMock> = {};

function model(name: string): ModelMock {
  return (models[name] ??= new Proxy({} as ModelMock, {
    get: (target, method: string) => (target[method] ??= vi.fn()),
  }));
}

export const transactionMock = vi.fn();

export const prismaMock = new Proxy({} as Record<string, ModelMock> & { $transaction: Mock }, {
  get: (_target, key: string) => (key === "$transaction" ? transactionMock : model(key)),
});

export function resetPrismaMock() {
  for (const m of Object.values(models)) for (const fn of Object.values(m)) fn.mockReset();
  transactionMock.mockReset();
}
