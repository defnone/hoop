import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import Login from './login';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type SessionState = {
  data: { session: { id: string } } | null;
  isPending: boolean;
};

const { getHealthMock, signInEmailMock, useSessionMock } = vi.hoisted(() => ({
  getHealthMock: vi.fn<() => Promise<{ message: string }>>(),
  signInEmailMock:
    vi.fn<
      (credentials: {
        email: string;
        password: string;
      }) => Promise<{ error: null }>
    >(),
  useSessionMock: vi.fn<() => SessionState>(),
}));

vi.mock('@/components/CustomSonner', () => ({
  default: vi.fn(),
}));

vi.mock('@/components/Login/LoginForm', () => ({
  default: () => <div>Login form</div>,
}));

vi.mock('@/lib/auth-client', () => ({
  signIn: { email: signInEmailMock },
  useSession: useSessionMock,
}));

vi.mock('@/lib/utils', () => ({
  getHealth: getHealthMock,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  useSessionMock.mockReturnValue({
    data: { session: { id: 'session-1' } },
    isPending: false,
  });
  getHealthMock.mockResolvedValue({ message: 'First run' });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('Login', () => {
  it('keeps an authenticated user on home when health reports first run', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path='/login' element={<Login />} />
            <Route path='/' element={<div>Home page</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Home page');
    });
    expect(getHealthMock).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="location"]')?.textContent,
    ).toBe('/');
  });

  it('redirects a settled unauthenticated user to sign-up on first run', async () => {
    useSessionMock.mockReturnValue({ data: null, isPending: false });

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path='/login' element={<Login />} />
            <Route path='/sign-up' element={<div>Sign-up page</div>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Sign-up page');
    });
    expect(getHealthMock).toHaveBeenCalledOnce();
    expect(
      container.querySelector('[data-testid="location"]')?.textContent,
    ).toBe('/sign-up');
  });
});

function LocationProbe() {
  const { pathname } = useLocation();
  return <span data-testid='location'>{pathname}</span>;
}
