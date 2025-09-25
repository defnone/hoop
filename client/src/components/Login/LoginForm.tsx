import { Input } from '../ui/input';
import { Button } from '../ui/button';

export default function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  handleLogin,
}: {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  handleLogin: () => void;
}) {
  return (
    <div className='flex flex-col gap-3 w-80 items-center'>
      <img src='/hoop.png' className='w-20 mb-5' />
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder='Email'
        className='h-11 border-2'
        autoFocus
      />
      <Input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder='Password'
        type='password'
        className='h-11 border-2'
        onKeyDown={(e) => {
          if (e.key === 'Enter' && email && password) {
            handleLogin();
          }
        }}
      />
      <Button
        className='cursor-pointer w-full font-bold mt-5'
        onClick={handleLogin}
        disabled={!email || !password}>
        Login
      </Button>
    </div>
  );
}
