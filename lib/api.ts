import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Prisma } from "@prisma/client";
import type { ZodType } from "zod";

import prismadb from "@/lib/prismadb";

/** An error whose message is safe to return to the client. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Ensures the request comes from a signed-in user who owns `storeId`.
 * Throws 401 when signed out and 403 when the store belongs to someone else.
 */
export async function requireStoreOwner(storeId: string): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new ApiError(401, "Unauthenticated");

  const store = await prismadb.store.findFirst({
    where: { id: storeId, userId },
    select: { id: true },
  });
  if (!store) throw new ApiError(403, "Unauthorized");

  return userId;
}

/** Parses and validates a JSON body; invalid input becomes a 400. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
  return validate(json, schema);
}

export function validate<T>(input: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

interface StoreRefs {
  billboardId?: string;
  categoryId?: string;
  sizeId?: string;
  colorId?: string;
}

/**
 * Rejects references to billboards/categories/sizes/colors of another store,
 * so a tenant can't attach their records to someone else's data.
 */
export async function assertRefsInStore(storeId: string, refs: StoreRefs): Promise<void> {
  const checks: [string | undefined, string, () => Promise<number>][] = [
    [refs.billboardId, "Billboard", () => prismadb.billboard.count({ where: { id: refs.billboardId, storeId } })],
    [refs.categoryId, "Category", () => prismadb.category.count({ where: { id: refs.categoryId, storeId } })],
    [refs.sizeId, "Size", () => prismadb.size.count({ where: { id: refs.sizeId, storeId } })],
    [refs.colorId, "Color", () => prismadb.color.count({ where: { id: refs.colorId, storeId } })],
  ];
  for (const [value, label, count] of checks) {
    if (value !== undefined && (await count()) === 0) {
      throw new ApiError(400, `${label} not found in this store`);
    }
  }
}

/** `updateMany`/`deleteMany` scoped by storeId report 0 when the record isn't in this store. */
export function assertFound<T extends { count: number }>(result: T, entity: string): T {
  if (result.count === 0) throw new ApiError(404, `${entity} not found`);
  return result;
}

interface ErrorOptions {
  /** Message for a foreign-key conflict (record still referenced elsewhere). */
  conflictMessage?: string;
  headers?: HeadersInit;
}

/** Maps known failures to HTTP responses and logs everything else as a 500. */
export function handleApiError(tag: string, error: unknown, options: ErrorOptions = {}) {
  const { headers, conflictMessage } = options;

  if (error instanceof ApiError) {
    return new NextResponse(error.message, { status: error.status, headers });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return new NextResponse(
        conflictMessage ?? "This record is still in use by other records and cannot be deleted.",
        { status: 409, headers }
      );
    }
    if (error.code === "P2025") {
      return new NextResponse("Not found", { status: 404, headers });
    }
  }

  console.error(`[${tag}]`, error);
  return new NextResponse("Internal error", { status: 500, headers });
}
