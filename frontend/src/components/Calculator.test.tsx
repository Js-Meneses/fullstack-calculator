import { render, screen, waitFor } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Calculator } from './Calculator'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

const OPERATOR_NAMES = ['Add', 'Subtract', 'Multiply', 'Divide', 'Power', 'Percentage']

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

function stubFetch(implementation: typeof fetch): FetchMock {
  const fetchMock = vi.fn<typeof fetch>(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function requests(fetchMock: FetchMock): unknown[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(init?.body as string))
}

function setup(): UserEvent {
  const user = userEvent.setup()
  render(<Calculator />)
  return user
}

function key(name: string): HTMLElement {
  return screen.getByRole('button', { name })
}

function display(): string | null {
  return screen.getByRole('status').textContent
}

// Clicks each key by accessible name, waiting for any request to finish.
async function click(user: UserEvent, ...names: string[]) {
  for (const name of names) {
    await user.click(key(name))
    await waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false'))
  }
}

describe('Calculator', () => {
  it('renders a heading and 22 buttons', () => {
    setup()

    expect(screen.getByRole('heading', { level: 1, name: 'Calculator' })).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(22)
    for (const button of buttons) {
      expect(button).toHaveAttribute('type', 'button')
    }
    expect(display()).toBe('0')
  })

  it('chains 2 + 3 × 4 = with one request per step', async () => {
    const fetchMock = answerWith(5, 20)
    const user = setup()

    await click(user, '2', 'Add', '3')
    expect(screen.getByText('2 +')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await click(user, 'Multiply', '4', 'Equals')

    expect(requests(fetchMock)).toEqual([
      { operation: 'add', operands: [2, 3] },
      { operation: 'multiply', operands: [5, 4] },
    ])
    expect(display()).toBe('20')
  })

  it('calculates 10 % 200 = with one percentage request', async () => {
    const fetchMock = answerWith(20)
    const user = setup()

    await click(user, '1', '0', 'Percentage', '2', '0', '0', 'Equals')

    expect(requests(fetchMock)).toEqual([{ operation: 'percentage', operands: [10, 200] }])
    expect(display()).toBe('20')
  })

  it('sends the square root at once, before any operator or equals', async () => {
    const fetchMock = answerWith(3)
    const user = setup()

    await click(user, '9', 'Square root')

    expect(requests(fetchMock)).toEqual([{ operation: 'sqrt', operands: [9] }])
    expect(display()).toBe('3')
  })

  it('shows a rounded result and keeps full precision for the next step', async () => {
    const fetchMock = answerWith(0.30000000000000004, 3.0000000000000004)
    const user = setup()

    await click(user, '0', 'Decimal point', '1', 'Add', '0', 'Decimal point', '2', 'Equals')
    expect(display()).toBe('0.3')

    await click(user, 'Multiply', '1', '0', 'Equals')

    expect(requests(fetchMock)[1]).toEqual({
      operation: 'multiply',
      operands: [0.30000000000000004, 10],
    })
    expect(display()).toBe('3')
  })

  it('shows the longest result in full and flips its sign without a request', async () => {
    const fetchMock = answerWith(9.332636185032189e-302)
    const user = setup()

    await click(user, '2', 'Power', '1', '0', '0', '0', 'Toggle sign', 'Equals', 'Toggle sign')

    expect(requests(fetchMock)).toEqual([{ operation: 'power', operands: [2, -1000] }])
    expect(display()).toBe('-9.33263618503e-302')
  })

  it('keeps only the first twelve digits', async () => {
    const user = setup()

    await click(user, '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2', '3')

    expect(display()).toBe('123456789012')
  })

  it('shows an API error and recovers with a digit', async () => {
    stubFetch(async () => json(422, { error: { code: 'division_by_zero', message: 'x' } }))
    const user = setup()

    await click(user, '1', 'Divide', '0', 'Equals')
    expect(display()).toBe('Cannot divide by zero')

    await click(user, '7')
    expect(display()).toBe('7')
  })

  it('shows the network message when fetch rejects', async () => {
    stubFetch(async () => Promise.reject(new TypeError('Failed to fetch')))
    const user = setup()

    await click(user, '1', 'Add', '1', 'Equals')

    expect(display()).toBe('Cannot reach the server, try again')
  })

  it('ignores keys while a request is pending and aborts it on Clear', async () => {
    const fetchMock = stubFetch(() => new Promise<Response>(() => {}))
    const user = setup()

    await user.click(key('2'))
    await user.click(key('Add'))
    await user.click(key('3'))
    await user.click(key('Equals'))

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
    for (const button of screen.getAllByRole('button')) {
      if (button === key('Clear')) {
        expect(button).not.toHaveAttribute('aria-disabled')
      } else {
        expect(button).toHaveAttribute('aria-disabled', 'true')
      }
    }

    await user.click(key('5'))
    expect(display()).toBe('3')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await user.click(key('Clear'))

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(display()).toBe('0')
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false')
    expect(key('5')).not.toHaveAttribute('aria-disabled')
  })

  it('marks the pending operator key as pressed', async () => {
    answerWith(5, 20)
    const user = setup()

    for (const name of OPERATOR_NAMES) {
      expect(key(name)).toHaveAttribute('aria-pressed', 'false')
    }

    await click(user, '2', 'Add', '3')
    for (const name of OPERATOR_NAMES) {
      expect(key(name)).toHaveAttribute('aria-pressed', name === 'Add' ? 'true' : 'false')
    }

    await click(user, 'Multiply')
    expect(key('Multiply')).toHaveAttribute('aria-pressed', 'true')
    expect(key('Add')).toHaveAttribute('aria-pressed', 'false')

    await click(user, '4', 'Equals')
    for (const name of OPERATOR_NAMES) {
      expect(key(name)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('does not mark non-operator keys as toggle buttons', () => {
    setup()

    expect(key('Equals')).not.toHaveAttribute('aria-pressed')
    expect(key('7')).not.toHaveAttribute('aria-pressed')
  })
})
