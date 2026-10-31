import { createClient } from '@/lib/supabase/client'
import { DatabaseError, mapSupabaseError } from '@/lib/errors'

export function unwrapSupabaseResult<T>({
  data,
  error,
}: {
  data: T | null
  error: unknown
}): T {
  if (error) throw mapSupabaseError(error)
  if (data === null || data === undefined)
    throw new DatabaseError('No data returned from the database')
  return data
}

export function unwrapSupabaseVoid({ error }: { error: unknown }): void {
  if (error) throw mapSupabaseError(error)
}

export interface Repository<
  Entity,
  CreateDTO = Partial<Entity>,
  UpdateDTO = Partial<Entity>,
> {
  getAll(...args: unknown[]): Promise<Entity[]>
  getById(id: string): Promise<Entity>
  create(input: CreateDTO): Promise<Entity>
  update(id: string, input: UpdateDTO): Promise<Entity>
  delete(id: string): Promise<void>
}

export abstract class SupabaseRepository {
  protected readonly supabase = createClient()

  protected async handle<T>(
    operation: PromiseLike<{ data: T | null; error: any }>,
  ): Promise<T> {
    return unwrapSupabaseResult(await operation)
  }

  protected async handleVoid(
    operation: PromiseLike<{ error: any }>,
  ): Promise<void> {
    unwrapSupabaseVoid(await operation)
  }

  /** Like `handle`, but allows `null` as a legitimate result (e.g. `maybeSingle()` lookups). */
  protected async query<T>(
    operation: PromiseLike<{ data: T | null; error: any }>,
  ): Promise<T | null> {
    const { data, error } = await operation

    if (error) {
      throw mapSupabaseError(error)
    }

    return data
  }
}
