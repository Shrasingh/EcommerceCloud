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
/** `$queryRaw` (used by the rate limiter). Reset to "first request in the window" before each test. */
export const queryRawMock = vi.fn();

const clientMethods: Record<string, Mock> = { $transaction: transactionMock, $queryRaw: queryRawMock };

export const prismaMock = new Proxy(
  {} as Record<string, ModelMock> & { $transaction: Mock; $queryRaw: Mock },
  { get: (_target, key: string) => clientMethods[key] ?? model(key) }
);

export function resetPrismaMock() {
  for (const m of Object.values(models)) for (const fn of Object.values(m)) fn.mockReset();
  transactionMock.mockReset();
  queryRawMock.mockReset();
  queryRawMock.mockResolvedValue([{ count: 1 }]);
}
