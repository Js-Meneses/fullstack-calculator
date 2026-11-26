import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UserAction } from './reducer'
import { useCalculator } from './useCalculator'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

// Answers each request with the next result, in order.
function answerWith(...results: number[]): FetchMock {
  const fetchMock = vi.fn<typeof fetch>()
  for (const result of results) {
    fetchMock.mockImplementationOnce(async () => json(200, { result }))
  }
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Holds every request until `release` is called. Ignores the abort signal,
// so a response can arrive after the request was cancelled.
function holdRequests() {
  let release: (response: Response) => void = () => {}
  const fetchMock = vi.fn<typeof fetch>(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, release: (response: Response) => release(response) }
}

function requestBody(fetchMock: FetchMock, call: number): unknown {
  return JSON.parse(fetchMock.mock.calls[call][1]?.body as string)
}

function requestSignal(fetchMock: FetchMock, call: number): AbortSignal {
  return fetchMock.mock.calls[call][1]!.signal!
}

const ACTIONS: Record<string, UserAction> = {
  '+': { type: 'operator', operator: 'add' },
  '*': { type: 'operator', operator: 'multiply' },
  '=': { type: 'equals' },
  c: { type: 'clear' },
}

function press(result: { current: ReturnType<typeof useCalculator> }, sequence: string) {
  for (const key of sequence) {
    act(() => {
      result.current.press(/^[0-9]$/.test(key) ? { type: 'digit', digit: key } : ACTIONS[key])
    })
  }
}

describe('useCalculator', () => {
  it('sends one request per step and shows the result', async () => {
    const fetchMock = answerWith(5, 20)
    const { result } = renderHook(() => useCalculator())

    press(result, '2+3')
    expect(fetchMock).not.toHaveBeenCalled()

    press(result, '*')
    await waitFor(() => expect(result.current.view.expression).toBe('5 ×'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody(fetchMock, 0)).toEqual({ operation: 'add', operands: [2, 3] })

    press(result, '4=')
    await waitFor(() => expect(result.current.view.main).toBe('20'))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requestBody(fetchMock, 1)).toEqual({ operation: 'multiply', operands: [5, 4] })
  })

  it('shows an API error message', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json(422, { error: { code: 'division_by_zero', message: 'x' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useCalculator())

    press(result, '1')
    act(() => result.current.press({ type: 'operator', operator: 'divide' }))
    press(result, '0=')

    await waitFor(() => expect(result.current.view.main).toBe('Cannot divide by zero'))
    expect(result.current.view.isError).toBe(true)
  })

  it('is busy while the request is pending', async () => {
    const { release } = holdRequests()
    const { result } = renderHook(() => useCalculator())

    press(result, '2+3=')
    expect(result.current.view.busy).toBe(true)

    await act(async () => release(json(200, { result: 5 })))

    expect(result.current.view.busy).toBe(false)
    expect(result.current.view.main).toBe('5')
  })

  it('aborts the request on clear', () => {
    const { fetchMock } = holdRequests()
    const { result } = renderHook(() => useCalculator())

    press(result, '2+3=')
    const signal = requestSignal(fetchMock, 0)
    expect(signal.aborted).toBe(false)

    press(result, 'c')

    expect(signal.aborted).toBe(true)
    expect(result.current.view).toMatchObject({ main: '0', busy: false })
  })

  it('ignores a response that arrives after clear', async () => {
    const { release } = holdRequests()
    const { result } = renderHook(() => useCalculator())

    press(result, '2+3=')
    press(result, 'c7')
    const before = result.current.view

    await act(async () => release(json(200, { result: 5 })))

    expect(result.current.view).toEqual(before)
    expect(result.current.view.main).toBe('7')
  })

  it('aborts the request on unmount', () => {
    const { fetchMock } = holdRequests()
    const { result, unmount } = renderHook(() => useCalculator())

    press(result, '2+3=')
    unmount()

    expect(requestSignal(fetchMock, 0).aborted).toBe(true)
  })
})
