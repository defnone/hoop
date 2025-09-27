import App from './App';
import { Route, Routes } from 'react-router';
import NotFound from './routes/404';
import { DashboardLayout } from './routes/dashboard/layout';
import { lazy } from 'react';

const Dashboard = lazy(() => import('./routes/dashboard'));
const Discover = lazy(() => import('./routes/dashboard/discover'));
const Search = lazy(() => import('./routes/dashboard/search'));
const Settings = lazy(() => import('./routes/dashboard/settings'));
const SignUp = lazy(() => import('./routes/sign-up'));
const Login = lazy(() => import('./routes/login'));
const CredentialsSettings = lazy(
  () => import('./routes/dashboard/settings.credentials')
);

// eslint-disable-next-line react-refresh/only-export-components
export const routes = [
  {
    path: '/',
    meta: { title: 'Hoop', description: '' },
  },
  {
    path: '/discover',
    meta: { title: 'Discover', description: '' },
  },
  {
    path: '/login',
    meta: { title: 'Login', description: '' },
  },
  {
    path: '/search',
    meta: { title: 'Search', description: '' },
  },
  {
    path: '/settings',
    meta: { title: 'Settings', description: '' },
  },
  {
    path: '/sign-up',
    meta: { title: 'Sign Up', description: '' },
  },
  {
    path: '/settings/credentials',
    meta: { title: 'Trackers Credentials', description: '' },
  },
];

export default function Router() {
  return (
    <Routes>
      <Route element={<App />}>
        <Route path='/' element={<DashboardLayout />}>
          <Route index element={<Dashboard />} />
          <Route path='/discover' element={<Discover />} />
          <Route path='/search' element={<Search />} />
          <Route path='/settings' element={<Settings />} />
          <Route
            path='/settings/credentials'
            element={<CredentialsSettings />}
          />
        </Route>
        <Route path='/login' element={<Login />} />
        <Route path='/sign-up' element={<SignUp />} />
        <Route path='*' element={<NotFound />} />
      </Route>
    </Routes>
  );
}
